import { readFileSync } from "node:fs";
import {
  connect,
  createCollectionTableSql,
  ensureUdcSchema,
  readCollectionAssets,
  seedCollection,
} from "@jsudc/server";
import { sql } from "drizzle-orm";

const handle = connect(process.env.DATABASE_URL ?? "postgresql://localhost/app");
await ensureUdcSchema(handle.db);
for (const asset of readCollectionAssets("./collections")) {
  if (asset.source.kind !== "postgres_jsonb" || !asset.seedFile) continue;
  await handle.db.execute(sql.raw(createCollectionTableSql(asset.name)));
  const res = await seedCollection(handle.db, {
    table: asset.name,
    schema: asset.schemaJson,
    rows: JSON.parse(readFileSync(asset.seedFile, "utf8")),
  });
  console.log(`${res.table}: ${res.inserted} rows, schema revision 1 ${res.revision}`);
}
await handle.close();
