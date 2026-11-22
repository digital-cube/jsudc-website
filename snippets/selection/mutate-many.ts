import { filter } from "@jsudc/core";
import { UdcClient } from "@jsudc/core/client";

declare const pinnedA: string;
declare const pinnedB: string;
declare const idOfTenantB: string;

// Tenant "a" — the server's `context` reads the header, its `rowScope` holds every request to
// the tenant's own rows.
const client = new UdcClient({ httpUrl: "", headers: { "x-tenant": "a" } });

// Everything in the inbox but two threads, archived in one request and one transaction.
// Tenant "b"'s inbox is not touched, whatever the filter says.
const archived = await client.mutateMany({
  collection: "message",
  op: "update",
  filter: filter.eq("folder", "inbox"),
  except_ids: [pinnedA, pinnedB],
  row: { archived: true },
});
console.log(archived.updated); // how many of a's inbox rows; failed: [] (by filter nothing can be missing)

// By ids: an id outside the caller's scope is reported exactly like a missing one.
const deleted = await client.mutateMany({
  collection: "message",
  op: "delete",
  ids: ["m1", idOfTenantB],
});
// { updated: 1, failed: [{ id: idOfTenantB, code: "not_found", message: "no row with id …" }] }
for (const f of deleted.failed) console.warn(f.id, f.code);
