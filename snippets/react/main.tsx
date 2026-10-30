import "@jsudc/react/styles.css";
import { UdcClient } from "@jsudc/core/client";
import { createUdcQueryClient, UdcDataView, UdcI18nProvider, UdcProvider } from "@jsudc/react";
import { RENDERERS } from "@jsudc/react/all";
import { Toaster, TooltipProvider } from "@jsudc/react/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

const client = new UdcClient({ httpUrl: "" }); // same origin: proxy /udc to the server

createRoot(document.getElementById("root") as HTMLElement).render(
  <UdcProvider client={client} renderers={RENDERERS}>
    <QueryClientProvider client={createUdcQueryClient()}>
      <UdcI18nProvider>
        <TooltipProvider>
          <Toaster>
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
              <UdcDataView collection="books" />
            </div>
          </Toaster>
        </TooltipProvider>
      </UdcI18nProvider>
    </QueryClientProvider>
  </UdcProvider>,
);
