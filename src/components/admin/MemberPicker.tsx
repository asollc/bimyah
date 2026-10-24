import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export type MemberOption = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  devices?: number;
};

export function memberName(m: MemberOption): string {
  return m.display_name || (m.email ? m.email.split("@")[0] : null) || "Unknown";
}

/* Recipient picker mirroring Creator Shout's: type to search, click to add
   chips. Empty selection means "everyone". */
export function MemberPicker({
  members,
  selected,
  onChange,
  placeholder,
  emptyHint,
}: {
  members: MemberOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  emptyHint: string;
}) {
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((m) => !selected.includes(m.user_id))
      .filter(
        (m) =>
          memberName(m).toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [members, selected, query]);

  const selectedMembers = selected
    .map((id) => members.find((m) => m.user_id === id))
    .filter(Boolean) as MemberOption[];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropOpen(true);
          }}
          onFocus={() => setDropOpen(true)}
          onBlur={() => setTimeout(() => setDropOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length) {
                onChange([...selected, matches[0].user_id]);
                setQuery("");
              }
            } else if (e.key === "Escape") {
              setDropOpen(false);
            }
          }}
        />
        {dropOpen && query.trim() && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg">
            {matches.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyHint}</div>
            ) : (
              matches.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange([...selected, m.user_id]);
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <span>
                    <span className="font-medium">{memberName(m)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.email || ""}
                      {m.devices && m.devices > 1 ? ` · ${m.devices} devices` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">Add →</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedMembers.map((m) => (
            <span
              key={m.user_id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium"
            >
              {memberName(m)}
              <button
                type="button"
                aria-label={`Remove ${memberName(m)}`}
                onClick={() => onChange(selected.filter((id) => id !== m.user_id))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {selected.length === 0
          ? "Leave blank to send to everyone."
          : `Sending to ${selected.length} ${selected.length === 1 ? "person" : "people"}.`}
      </p>
    </div>
  );
}
