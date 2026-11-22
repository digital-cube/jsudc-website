import { UdcClient } from "@jsudc/core/client";
import { createUdcQueryClient, UdcDataView, UdcProvider, useUdcChanges } from "@jsudc/react";
import { RENDERERS } from "@jsudc/react/all";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const client = new UdcClient({ httpUrl: "" });
const queryClient = createUdcQueryClient({ onUnauthenticated: () => location.assign("/login") });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* `changes`: one stream for the collections on screen. Off by default. */}
      <UdcProvider client={client} renderers={RENDERERS} changes>
        <InboxBadge />
        {/* Mark a message read in another tab: this list refetches within a moment. */}
        <UdcDataView collection="messages" />
      </UdcProvider>
    </QueryClientProvider>
  );
}

// A host's own counter: every insert the feed reports, as it arrives.
function InboxBadge() {
  const [unseen, setUnseen] = useState(0);
  const { status } = useUdcChanges("messages", (event) => {
    if (event.op === "insert") setUnseen((n) => n + (event.ids?.length ?? 1));
  });
  return (
    <button type="button" onClick={() => setUnseen(0)} title={status}>
      Inbox {unseen > 0 ? `(${unseen})` : null}
    </button>
  );
}
