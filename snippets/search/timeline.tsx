import { type RendererProps, useUdcAllRows } from "@jsudc/react";

// A renderer of your own that loads its rows: pass the source's search on.
export function Timeline({ collection, describe, filter, listSearch }: RendererProps) {
  const { rows } = useUdcAllRows({
    collection,
    filter, // no `contains` for the box under the capability
    search: listSearch, // undefined without it, or with an empty box
    capabilities: describe.capabilities,
  });
  return (
    <ol>
      {rows.map((r) => (
        <li key={r.__meta.id}>{String(r.subject)}</li>
      ))}
    </ol>
  );
}
