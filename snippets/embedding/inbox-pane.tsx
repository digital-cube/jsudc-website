import { prefixUrlStateAdapter, UdcUrlStateProvider, useUrlStateAdapter } from "@jsudc/react";
import { type ReactNode, useMemo } from "react";

/** The host's own controls of the pane share the view's `inbox.` parameters. */
export function InboxPane({ children }: { children: ReactNode }) {
  const inEffect = useUrlStateAdapter();
  const adapter = useMemo(() => prefixUrlStateAdapter(inEffect, "inbox."), [inEffect]);
  // Inside: useUrlSearchParams() sees `q` where the address bar has `inbox.q`.
  return <UdcUrlStateProvider adapter={adapter}>{children}</UdcUrlStateProvider>;
}
