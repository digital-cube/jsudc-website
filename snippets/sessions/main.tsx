import { UdcClient } from "@jsudc/core/client";
import { createUdcQueryClient, UdcDataView, UdcProvider } from "@jsudc/react";
import { RENDERERS } from "@jsudc/react/all";
import { QueryClientProvider } from "@tanstack/react-query";

// Django-style: the session cookie travels by itself, the CSRF token is a cookie the page
// reads and echoes in a header — read on every call, so a new session (and a new token)
// needs no new client.
const csrfToken = () => document.cookie.match(/(?:^|; )csrftoken=([^;]*)/)?.[1] ?? "";

const client = new UdcClient({
  httpUrl: "https://api.example.com",
  credentials: "include", // cookies to another origin; leave it out on the same origin
  headers: () => ({ "x-csrftoken": csrfToken() }), // a function: called before every request
});

const queryClient = createUdcQueryClient({
  // once, however many queries of the page were refused together
  onUnauthenticated: () => {
    const next = encodeURIComponent(location.pathname + location.search);
    location.assign(`/login?next=${next}`);
  },
});

export const App = () => (
  <UdcProvider client={client} renderers={RENDERERS}>
    <QueryClientProvider client={queryClient}>
      {/* …the other providers of the quick start… */}
      <UdcDataView collection="messages" />
    </QueryClientProvider>
  </UdcProvider>
);
