import { UdcError, unauthenticatedError } from "@jsudc/core";
import { connect, createDispatcher, loadRegistry, makeSource, udcPlugin } from "@jsudc/server";
import Fastify from "fastify";

// The host's own: who is signed in. jsudc knows nothing of users, sessions or tenants.
interface Session {
  tenant: string;
  user: string;
  admin: boolean;
}
declare const sessions: { get(sid: string | undefined): Promise<Session | null> };

/** What every action, the scope and every source method get as `ctx`. */
interface Ctx {
  tenant: string;
  user: string;
  admin: boolean;
}

const { db } = connect(process.env.DATABASE_URL ?? "postgresql://localhost/app");
const registry = loadRegistry("./collections", (asset, registry) =>
  makeSource(asset, { db, registry, env: process.env }),
);
const app = Fastify({ logger: true });

const dispatcher = createDispatcher<Ctx>(registry, {
  log: app.log,
  // One rule, stated once: a message belongs to a tenant and a user.
  rowScope: (ctx, collection) =>
    collection === "message"
      ? {
          and: [
            { field: "tenant", op: "eq", value: ctx.tenant },
            { field: "owner", op: "eq", value: ctx.user },
          ],
        }
      : undefined,
  // audit_log is hidden from non-admins; only an admin may add a field to `message`
  // (a schema edit changes it for every tenant).
  access: (ctx, { action, collection }) =>
    collection === "audit_log" && !ctx.admin
      ? false
      : action.startsWith("schema.") && ctx.admin
        ? true
        : undefined,
});

await app.register(udcPlugin, {
  dispatcher,
  registry,
  swagger: false,
  context: async (request): Promise<Ctx> => {
    const tenant = request.hostname.split(".")[0] ?? ""; // acme.example.com → acme
    const sid = request.headers.cookie?.match(/(?:^|; )sid=([^;]*)/)?.[1];
    const session = await sessions.get(sid); // your session store
    if (!session) throw unauthenticatedError(); // forbidden, details.reason "unauthenticated"
    if (session.tenant !== tenant) throw new UdcError("forbidden", "not a member of this tenant");
    return { tenant, user: session.user, admin: session.admin };
  },
});
await app.listen({ port: 5100 });
