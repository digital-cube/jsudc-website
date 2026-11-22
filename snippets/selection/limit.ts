import {
  type CollectionRegistry,
  createDispatcher,
  DEFAULT_MUTATE_MANY_LIMIT,
} from "@jsudc/server";
import type { FastifyBaseLogger } from "fastify";

declare const registry: CollectionRegistry;
declare const log: FastifyBaseLogger;

// At most 2 000 rows per mutate_many (the default is 10 000). More ids than that, or a filter
// matching more inside the caller's scope, is refused before anything is written:
// validation_error, details { reason: "too_many_rows", limit: 2000, by: "ids" | "filter" }.
export const dispatcher = createDispatcher(registry, {
  log,
  mutateManyLimit: Math.min(2_000, DEFAULT_MUTATE_MANY_LIMIT),
});
