import { isUnauthenticated } from "@jsudc/core";
import { UdcClient } from "@jsudc/core/client";

const udc = new UdcClient({ httpUrl: "https://api.example.com", credentials: "include" });

// Without React: one check covers an HTTP 401 and the server's in-protocol refusal.
try {
  await udc.list({ collection: "message" });
} catch (err) {
  if (isUnauthenticated(err)) location.assign("/login");
  else throw err;
}
