import { createDispatcher, loadRegistry, makeSource, udcPlugin } from "@jsudc/server";
import Fastify from "fastify";

const registry = loadRegistry("./collections", (asset, registry) =>
  makeSource(asset, { registry, env: process.env }),
);
const app = Fastify({ logger: true });
const dispatcher = createDispatcher(registry, { log: app.log });
await app.register(udcPlugin, { dispatcher, registry, swagger: false });
await app.listen({ port: 5100 });
