import { sourceAnswersSearch } from "@jsudc/core";
import { UdcClient } from "@jsudc/core/client";

const client = new UdcClient({ httpUrl: "" });
const { capabilities } = await client.describe("message");

const page = sourceAnswersSearch(capabilities)
  ? // The source matches and ranks, inside the caller's own rows; `filter` keeps the chips only.
    await client.list({ collection: "message", search: "invoice -draft", page: { limit: 50 } })
  : // Without the capability: the text becomes `contains` in the filter, as before 0.5.0.
    await client.list({
      collection: "message",
      filter: { field: "subject", op: "contains", value: "invoice" },
      page: { limit: 50 },
    });
console.log(page.rows.length, page.total);
