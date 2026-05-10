## Goal

In the admin back-office, make every user name in the **Users** table clickable, opening a per-user admin profile page where the admin can edit that user's avatar, display name, and active custom card back.

## 1. New admin route: `/admin/users/$userId`

Create `src/routes/admin.users.$userId.tsx` (admin-gated, like `/admin`).

Layout mirrors `/profile`, but it operates on the targeted user and skips Bimyah!+ gating (admins can edit anyone). Sections:

- **Header**: back link to `/admin`, user's email + UUID, joined date, roles, active plan, founding-member badge.
- **Avatar**: shows current avatar; "Upload avatar" button and "Remove" button. Uploads to `avatars/<userId>/avatar.<ext>` then calls `adminSetAvatar`.
- **Display name**: editable text input (max 14 chars to match `handle_new_user`); "Save" button calls `adminSetDisplayName`. Shows uniqueness error inline.
- **Custom card back**: shows the user's currently active card back; upload to `card-backs/<userId>/<ts>.<ext>` then call `adminSetCardBack`; "Clear" button calls `adminClearCardBack`.

All uploads use the existing public buckets (`avatars`, `card-backs`). Storage RLS already allows the user's own folder; for the admin path, the upload runs through a new server function that uses `supabaseAdmin` to write the storage object and persist the URL.

## 2. New admin server functions (`src/server/admin.functions.ts`)

All gated by `assertAdmin(context.userId)`:

- `getAdminUserDetail({ user_id })` → returns `{ id, display_name, avatar_url, email, roles, active_plan, founding_member, created_at, active_card_back_url }`.
- `adminSetAvatar({ user_id, avatar_url | null })` → updates `profiles.avatar_url`.
- `adminSetDisplayName({ user_id, display_name })` → validates trimmed length 1–14 and unique (case-insensitive) via a `select` against `profiles`, then updates `profiles.display_name`. Uses `supabaseAdmin` so it bypasses RLS; works against the existing `lock_profile_display_name` trigger because that trigger already exempts admins (see Technical Notes for the small change needed).
- `adminSetCardBack({ user_id, image_url })` → deactivates existing active row for that user, inserts new active row.
- `adminClearCardBack({ user_id })` → deactivates active row.
- `adminUploadAsset({ user_id, bucket: "avatars" | "card-backs", path, content_base64, content_type })` → uploads to storage via service role and returns the public URL. (Used so the browser doesn't need its own write permissions on someone else's folder.)

## 3. Admin Users tab — clickable user

In `src/routes/admin.tsx` (`UsersTab`, around line 444–452):

- Wrap `{u.display_name}` in `<Link to="/admin/users/$userId" params={{ userId: u.id }}>` styled as a hover-underlined link.
- Keep the founding-member crown and the email/UUID line as-is.
- Import `Link` from `@tanstack/react-router`.

## 4. Trigger adjustment for admin-driven display name updates

The existing `lock_profile_display_name` trigger uses `auth.uid()` to detect admins. When the new `adminSetDisplayName` server function runs through `supabaseAdmin` (service role), `auth.uid()` is NULL and the trigger would block the update.

Migration: replace the trigger function so it also passes when `auth.role() = 'service_role'`:

```sql
CREATE OR REPLACE FUNCTION public.lock_profile_display_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Display name is locked and cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

This preserves the lock for normal users while letting admin server functions (and any future service-role tooling) update the field.

## Technical Notes

- New route uses the same admin gate pattern as `/admin` (calls `getMyAdminStatus` in `useEffect`, redirects non-admins).
- Display-name uniqueness check is case-insensitive (`ilike`) and excludes the target user's own row.
- File size limits mirror `/profile`: 2 MB for avatars, 5 MB for card backs. Validation runs both client-side and inside `adminUploadAsset`.
- Avatar URL is cache-busted with `?v=<ts>` after upload so the change is visible immediately.
- No changes to public profile visibility; this is a back-office-only view.
