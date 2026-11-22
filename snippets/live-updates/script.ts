import { isUnauthenticated, sourcePushesChanges } from "@jsudc/core";
import { UdcClient } from "@jsudc/core/client";

declare function csrf(): string;
declare function refetch(collection: string, ids?: string[]): void;
declare function refetchEverything(): void;

const udc = new UdcClient({ httpUrl: "", headers: () => ({ "x-csrftoken": csrf() }) });
const { capabilities } = await udc.describe("messages");

if (sourcePushesChanges(capabilities)) {
  const stop = new AbortController();
  udc
    .changes({
      collections: ["messages", "folders"],
      onChange: (e) => refetch(e.collection, e.ids), // ids absent: refetch it all
      onOpen: ({ reconnected }) => reconnected && refetchEverything(), // there is no replay
      signal: stop.signal, // stop.abort() closes the stream
    })
    .catch((err) => {
      if (isUnauthenticated(err)) location.assign("/login");
    });
}
