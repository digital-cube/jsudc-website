import type { RendererProps } from "@jsudc/react";
import { useRowActivation } from "@jsudc/react/headless";

/** A host renderer with the table's activation and keys. */
export function MessageList({
  data,
  onRowActivate,
  activeRowId,
  onActiveRowChange,
}: RendererProps) {
  const nav = useRowActivation({
    rows: data.rows,
    onRowActivate,
    activeRowId,
    onActiveRowChange,
    // Infinite mode: moving past the last row loads the next page.
    hasNextPage: data.hasNextPage,
    isFetchingNextPage: data.isFetchingNextPage,
    fetchNextPage: data.fetchNextPage,
  });
  return (
    <ul role={nav.enabled ? "grid" : undefined}>
      {data.rows.map((row) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: rowProps(row) carries the key handlers
        <li
          key={row.__meta.id}
          role={nav.enabled ? "row" : undefined}
          {...nav.rowProps(row)}
          onClick={(e) => nav.handleClick(e, row)}
        >
          {String(row.subject)}
        </li>
      ))}
    </ul>
  );
}
