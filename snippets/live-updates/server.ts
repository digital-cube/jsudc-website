import type { FilterNode } from "@jsudc/core";
import {
  buildApp,
  type CollectionRegistry,
  createChangeFeed,
  createDispatcher,
} from "@jsudc/server";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";

type Ctx = { user: string };

declare const registry: CollectionRegistry;
declare const log: FastifyBaseLogger;
declare function sessionOf(req: FastifyRequest): Promise<Ctx>;
// The host's own mail sync: writes rows owned by `user`, outside jsudc.
declare const imap: { fetchNew(user: string): Promise<{ id: string }[]> };

const rowScope = (ctx: Ctx, collection: string): FilterNode | undefined =>
  collection === "message" ? { field: "owner", op: "eq", value: ctx.user } : undefined;

// One process. With several behind a load balancer, give every one the same bus (below).
const changes = createChangeFeed();
const dispatcher = createDispatcher<Ctx>(registry, { log, rowScope, changes });

// Every collection now says capabilities.changes: true, and GET /udc/changes is served.
export const app = await buildApp({ dispatcher, registry, context: (req) => sessionOf(req) });

// A background job inserts a user's new messages: that user's open tabs refresh, nobody else's.
export async function syncMailbox(user: string): Promise<void> {
  const inserted = await imap.fetchNew(user);
  if (inserted.length === 0) return;
  await changes.notify<Ctx>("message", {
    op: "insert",
    ids: inserted.map((m) => m.id),
    ctx: { user }, // rowScope({ user }) → owner = user: only this user's streams hear it
  });
}
