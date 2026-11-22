import { loadRegistry, makeSource, PostgresTableSource } from "@jsudc/server";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

declare const db: NodePgDatabase;

export const registry = loadRegistry("./collections", (asset, reg) =>
  asset.name === "message"
    ? new PostgresTableSource({
        db,
        schema: asset.schema,
        table: "inbox.message",
        versionColumn: "row_version",
        // With this option the collection says capabilities.search: "source".
        search: {
          // websearch syntax: quoted phrases, `or`, a minus to exclude. `q` is a bound parameter.
          match: (q) => sql`tsv @@ websearch_to_tsquery('simple', ${q})`,
          rank: (q) => sql`ts_rank(tsv, websearch_to_tsquery('simple', ${q}))`,
        },
      })
    : makeSource(asset, { db, registry: reg, env: process.env }),
);
