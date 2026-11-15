import type { LookupDef, Row } from "@jsudc/core";
import { useUdcLookup } from "@jsudc/react";

// tickets.assignees, as tickets/schema.json declares it
const people: LookupDef = { collection: "org", label_field: "name", extra_fields: ["title"] };

/** Who works on some tickets: one `list` of org (`id in [...]`) for all of them. */
export function Assignees({ tickets }: { tickets: Row[] }) {
  const keys = tickets.flatMap((t) => (t.assignees as string[] | undefined) ?? []);
  const org = useUdcLookup(people, keys);
  if (org.isLoading) return <p>Loading…</p>;
  return (
    <ul>
      {[...new Set(keys)].map((key) => {
        const person = org.row(key); // undefined while loading, or when org has no such row
        return (
          <li key={key} title={String(person?.title ?? "")}>
            {String(person?.name ?? key)}
          </li>
        );
      })}
    </ul>
  );
}

/** A collection name is a lookup by row id: the boards b1 and b2. */
export function useTwoBoards() {
  return useUdcLookup("boards", ["b1", "b2"]);
}
