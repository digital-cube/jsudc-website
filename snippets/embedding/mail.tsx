import "@jsudc/react/styles.scoped.css";
import type { FilterNode } from "@jsudc/core";
import { createRendererRegistry, UdcDataView } from "@jsudc/react";
import { tableRenderer } from "@jsudc/react/table";
import { useState } from "react";
import { messageList } from "./message-list";

// The host's own actions.
declare function compose(): void;
declare function syncMailbox(): void;

const renderers = createRendererRegistry(tableRenderer, messageList);
const FOLDERS = ["inbox", "sent", "archive"] as const;

export function Mail() {
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]>("inbox");
  const inFolder: FilterNode = { field: "folder", op: "eq", value: folder };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", height: "100vh" }}>
      <nav>
        {FOLDERS.map((f) => (
          <button key={f} type="button" aria-current={f === folder} onClick={() => setFolder(f)}>
            {f}
          </button>
        ))}
      </nav>

      <UdcDataView
        collection="messages"
        renderers={renderers}
        filter={inFolder} // the open folder: ANDed into every list, not a chip, not in the URL
        chrome={{ preset: "embedded", tabs: true }} // toolbar, rows and the tabs; no header, no frame
        pagingMode="infinite"
        urlPrefix="list." // ?list.q=…&list.sort=…; the host's own ?q= is left alone
        toolbarStart={
          <button type="button" onClick={() => compose()}>
            Compose
          </button>
        }
        toolbarEnd={
          <button type="button" onClick={() => syncMailbox()}>
            Sync
          </button>
        }
      />

      <article>{/* the host's reading pane */}</article>
    </div>
  );
}
