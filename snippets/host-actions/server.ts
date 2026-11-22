import { type FilterNode, UdcError } from "@jsudc/core";
import { buildApp, type CollectionRegistry, createDispatcher } from "@jsudc/server";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { archiveThread } from "./actions.js";

type Ctx = { tenant: string; user: string };

declare const registry: CollectionRegistry;
declare const log: FastifyBaseLogger;
declare function sessionOf(req: FastifyRequest): Promise<Ctx>;

const rowScope = (ctx: Ctx, collection: string): FilterNode | undefined =>
  collection === "message" ? { field: "owner", op: "eq", value: ctx.user } : undefined;

const dispatcher = createDispatcher<Ctx>(registry, { log, rowScope });

// The payload is { thread: string }, the return value must be { archived: number }, and the
// second argument is the request context: the same one every built-in action gets.
dispatcher.register(archiveThread, async ({ thread }, ctx: Ctx) => {
  // The protocol itself, under the same context and scope: only the caller's rows.
  const res = await dispatcher.dispatch(
    {
      kind: "udc.mutate_many",
      id: "",
      payload: {
        collection: "message",
        op: "update",
        filter: { field: "thread", op: "eq", value: thread },
        row: { archived: true },
      },
    },
    ctx,
  );
  if (res.kind.endsWith(".err")) throw new UdcError("internal", "archive failed");
  return { archived: (res.payload as { updated: number }).updated };
});

// POST /udc/mail.archive_thread, in the OpenAPI document with its request and response.
export const app = await buildApp({ dispatcher, context: (req) => sessionOf(req) });
