import { UdcDataView } from "@jsudc/react";

// The view of `messages` declares three bulk actions (view.yaml above): `archive` has no `set`,
// so it needs a handler or a server action; `mark_read` has `set`; `delete` is built in.
export function Inbox() {
  return (
    <UdcDataView
      collection="messages"
      filter={{ field: "folder", op: "eq", value: "inbox" }}
      actions={{
        // Id mode: `ids`. "All that match": `filter` (the host's folder, the search, the chips)
        // and `exceptIds`. `rows` are the selected rows the view has loaded.
        archive: async ({ ids, filter, exceptIds, clearSelection }) => {
          await fetch("/api/mail/archive", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(ids ? { ids } : { filter, except_ids: exceptIds }),
          });
          clearSelection();
        },
        // mark_read has `set`: a mutate_many update, no handler needed.
        // delete is built in: a confirmation, then a mutate_many delete.
      }}
    />
  );
}
