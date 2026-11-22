import { UdcDataView } from "@jsudc/react";

declare function openMessage(id: string): void;

// The mailbox: always infinite, always windowed (even a short folder), with a deeper overscan
// for fast keyboard scrolling.
export function Mailbox({ folder }: { folder: string }) {
  return (
    <UdcDataView
      collection="messages"
      filter={{ field: "folder", op: "eq", value: folder }}
      pagingMode="infinite"
      virtualize={{ enabled: true, overscan: 20 }}
      onRowActivate={(row) => openMessage(row.__meta.id)}
    />
  );
}
