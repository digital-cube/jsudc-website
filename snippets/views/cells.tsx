import type { UdcClient } from "@jsudc/core/client";
import {
  type CellProps,
  createCellRegistry,
  type RendererRegistry,
  UdcDataView,
  UdcProvider,
} from "@jsudc/react";

declare const client: UdcClient;
declare const renderers: RendererRegistry;

/** The sender as an avatar and a name, the unread ones bold. */
function SenderCell({ value, row, column }: CellProps) {
  const name = String(value ?? "");
  return (
    <span style={{ display: "flex", gap: 6, fontWeight: row.unread ? 600 : 400 }}>
      {column.render_options?.avatar ? (
        <img src={`/avatars/${name}.png`} alt="" width={20} />
      ) : null}
      {name || "—"}
    </span>
  );
}

// A module constant, like the renderer registry.
const cells = createCellRegistry({ name: "sender", component: SenderCell });

export const App = () => (
  <UdcProvider client={client} renderers={renderers} cells={cells}>
    <UdcDataView collection="messages" />
  </UdcProvider>
);

// Or for one view, added to the provider's (this view's names win):
export const OneView = () => <UdcDataView collection="messages" cells={cells} />;
