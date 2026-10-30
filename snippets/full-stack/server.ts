import {
  connect,
  createDispatcher,
  ensureUdcSchema,
  loadRegistry,
  makeSource,
  udcPlugin,
} from "@jsudc/server";
import Fastify from "fastify";

const { db } = connect(process.env.DATABASE_URL ?? "postgresql://localhost/app");
await ensureUdcSchema(db); // the UDC tables: schema revisions; or apply migrations/*.sql yourself
const registry = loadRegistry("./collections", (asset, registry) =>
  makeSource(asset, { db, registry, env: process.env }),
);
const app = Fastify({ logger: true });
const dispatcher = createDispatcher(registry, { log: app.log });
await app.register(udcPlugin, { dispatcher, registry, swagger: false });
await app.listen({ port: 5100 });
