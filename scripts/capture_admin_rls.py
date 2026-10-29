#!/usr/bin/env python3
"""Capture the 2026-10-16 admin RLS fix as a committed migration file.

The admin-console RLS policies (admin-only has_role(auth.uid(),'admin') policies on
19 tables, user-level policies on bulletins/bulletin_reads/bulletin_hides) were applied
live via the Supabase Management API on 2026-10-16 but were never captured in
supabase/migrations/. This script dumps the live pg_policies for exactly those tables
and writes an idempotent migration file so future environments get the same policies.

Run where the Management API route is available (the main agent context), NOT from a
background preparation run (egress policy denies the query endpoint there):

    cd ~/workspace/bimyah && python3 scripts/capture_admin_rls.py

Then review the generated file and commit it.
"""
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_response_body  # noqa: E402

CRED = "custom.supabase"
# Ronya's own Supabase project. The live app was repointed here on 2026-10-16
# (accounts, game data, purchases, profiles all moved); the Lovable project
# (qorqfqwjmkyosplldovh) is no longer the live database.
REF = "xetlumsehzltnbucexdk"
BASE = "https://api.supabase.com/v1"

TABLES = [
    "bplus_config", "bplus_gifts", "bulletin_hides", "bulletin_reads", "bulletins",
    "card_backs", "founding_members", "friendships", "games", "payments", "profiles",
    "public_matches", "push_subscriptions", "referrals", "share_events",
    "subscriptions", "user_keybinds", "user_presence", "user_roles",
]


def query(sql):
    req = urllib.request.Request(
        f"{BASE}/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    add_surrogate_to_request(req, CRED, allowed_hosts=["api.supabase.com"])
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, read_response_body(resp).decode()
    except urllib.error.HTTPError as exc:
        return exc.code, read_response_body(exc).decode()[:2000]


def qident(s):
    return '"' + s.replace('"', '""') + '"'


def main():
    tables_sql = ",".join("'%s'" % t for t in TABLES)
    status, raw = query(
        "select tablename, policyname, permissive, roles, cmd, qual, with_check "
        "from pg_policies where schemaname='public' and tablename in (%s) "
        "order by tablename, policyname;" % tables_sql
    )
    if status not in (200, 201):
        print("query failed:", status, raw, file=sys.stderr)
        return 1
    rows = json.loads(raw)
    if not rows:
        print("no policies found for the 19 tables", file=sys.stderr)
        return 1

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    lines = [
        "-- Admin RLS capture, 2026-10-16",
        "-- Policies applied live via the Management API during the admin-console fix",
        "-- (client-side tabs + service-role key configured in the Worker). Captured",
        "-- from pg_policies so future environments get identical policies.",
        "-- Idempotent: safe to rerun.",
        "",
    ]
    seen_tables = set()
    for r in rows:
        t, name = r["tablename"], r["policyname"]
        # roles comes back as a Postgres array literal string like "{public}"
        # or "{authenticated}"; parse it into a proper role list.
        raw_roles = r["roles"] or "{public}"
        parsed = [x.strip().strip('"') for x in raw_roles.strip("{}").split(",") if x.strip()]
        roles = ", ".join(parsed) if parsed else "public"
        if t not in seen_tables:
            lines.append("alter table public.%s enable row level security;" % qident(t))
            seen_tables.add(t)
        perm = "permissive" if r["permissive"] else "restrictive"
        stmt = (
            "drop policy if exists %s on public.%s;\n"
            "create policy %s on public.%s as %s for %s to %s"
            % (qident(name), qident(t), qident(name), qident(t), perm, r["cmd"], roles)
        )
        if r["qual"]:
            stmt += "\n  using (%s)" % r["qual"]
        if r["with_check"]:
            stmt += "\n  with check (%s)" % r["with_check"]
        stmt += ";"
        lines.append(stmt)
        lines.append("")

    out = "supabase/migrations/%s_admin_rls_capture.sql" % stamp
    with open(out, "w") as f:
        f.write("\n".join(lines))
    print("wrote %s (%d policies across %d tables)" % (out, len(rows), len(seen_tables)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
