import { UdcClient } from "@jsudc/core/client";
import { archiveThread } from "./actions.js";

const client = new UdcClient({ httpUrl: "" });

// The payload is checked against { thread: string } by the compiler; the answer is parsed with
// the response schema (one that does not parse throws UdcError "internal").
const { archived } = await client.call(archiveThread, { thread: "t42" });
console.log(`${archived} messages archived`);

// Without a shared definition: a plain name, typed by hand and not checked.
const { pong } = await client.call<{ pong: boolean }, { at: number }>("ping", { at: Date.now() });
console.log(pong);
