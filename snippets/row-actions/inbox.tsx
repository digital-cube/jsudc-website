import { UdcDataView } from "@jsudc/react";

declare function openMessage(id: string): void;

export function Inbox() {
  return (
    <UdcDataView
      collection="messages"
      filter={{ field: "folder", op: "eq", value: "inbox" }}
      onRowActivate={(row) => openMessage(row.__meta.id)}
      actions={{
        // The same handler serves the bulk bar (`ids` of the selection, or `filter`) and the row
        // ("archive" on one row: `ids: [id]`, `rows: [row]`, `row`).
        archive: async ({ ids, filter, exceptIds, row, clearSelection }) => {
          await fetch("/api/mail/archive", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(ids ? { ids } : { filter, except_ids: exceptIds }),
          });
          if (!row) clearSelection();
        },
      }}
    />
  );
}
