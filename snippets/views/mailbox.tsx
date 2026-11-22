import type { Row } from "@jsudc/core";
import { UdcDataView } from "@jsudc/react";
import { useState } from "react";

declare function markRead(id: string): Promise<void>; // the host's own action

export function Mailbox() {
  const [open, setOpen] = useState<Row | null>(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <UdcDataView
        collection="messages"
        chrome="embedded"
        pagingMode="infinite"
        // Controlled: the open message is the active row, so the pane and the list agree.
        activeRowId={open?.__meta.id ?? null}
        onActiveRowChange={setOpen} // ArrowDown / j: the pane previews the next message
        onRowActivate={(row) => {
          setOpen(row);
          void markRead(row.__meta.id); // Enter or a click: the host's own action
        }}
      />
      <article aria-live="polite">
        {open ? (
          <>
            <h2>{String(open.subject)}</h2>
            <p>{String(open.from)}</p>
          </>
        ) : (
          <p>No message selected</p>
        )}
      </article>
    </div>
  );
}
