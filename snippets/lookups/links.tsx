import { UdcClient } from "@jsudc/core/client";
import { UdcDataView, type UdcLinks, UdcProvider } from "@jsudc/react";
import { RENDERERS } from "@jsudc/react/all";
import { UdcReactRouterUrlState } from "@jsudc/react/react-router";
import { BrowserRouter, Route, Routes, useParams } from "react-router";

const client = new UdcClient({ httpUrl: "" });

function CollectionRoute() {
  const { collection = "" } = useParams();
  return <UdcDataView key={collection} collection={collection} />;
}

// Under react-router: lookup links and row_links go to /udc/<collection> through the router.
export const RouterApp = () => (
  <UdcProvider client={client} renderers={RENDERERS}>
    <BrowserRouter>
      <UdcReactRouterUrlState collectionPath={(c) => `/udc/${c}`}>
        <Routes>
          <Route path="udc/:collection" element={<CollectionRoute />} />
        </Routes>
      </UdcReactRouterUrlState>
    </BrowserRouter>
  </UdcProvider>
);

// Any other router: say where a collection's view is and how to get there.
const links: UdcLinks = {
  href: (collection, search) => `/data/${collection}?${search}`,
  navigate: (href) => window.location.assign(href),
};

export const PlainApp = () => (
  <UdcProvider client={client} renderers={RENDERERS} links={links}>
    <UdcDataView collection="tickets" />
  </UdcProvider>
);
