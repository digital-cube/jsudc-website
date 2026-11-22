import { type SchemaDoc, UdcError, type ViewConfig } from "@jsudc/core";
import {
  type CollectionRegistry,
  type Db,
  type OnMutateHook,
  PostgresTableSource,
} from "@jsudc/server";
import { sql } from "drizzle-orm";

declare const db: Db;
declare const registry: CollectionRegistry;
declare const asset: { schema: SchemaDoc; view: ViewConfig };
// The host's own IMAP client.
declare const imap: {
  setFlag(
    user: string,
    mailbox: string | undefined,
    uid: number | undefined,
    flag: string,
    on: boolean,
    opts: { timeoutMs: number },
  ): Promise<void>;
};

type Ctx = { tenant: string; user: string };

const mirrorSeen: OnMutateHook<Ctx> = async (ctx, change, tx) => {
  // Only a change of `seen` goes to the mail server.
  if (change.op !== "update" || !change.patch || !("seen" in change.patch)) return;
  const seen = change.after?.seen === true;
  const res = await tx.execute<{ mailbox: string; uid: number }>(
    sql`SELECT mailbox, imap_uid AS uid FROM message WHERE id = ${change.id}::uuid`,
  );
  const { mailbox, uid } = res.rows[0] ?? {};
  try {
    // Idempotent: sets or clears the flag, never toggles it. Bounded: 5 s.
    await imap.setFlag(ctx.user, mailbox, uid, "\\Seen", seen, { timeoutMs: 5000 });
  } catch {
    // Answered to the user as it is; the row keeps its old `seen`.
    throw new UdcError("forbidden", "the mail server did not accept the change, try again", {
      reason: "imap",
    });
  }
  // The host's own bookkeeping, in the same transaction as the row.
  await tx.execute(sql`UPDATE message SET imap_synced_at = now() WHERE id = ${change.id}::uuid`);
};

registry.register({
  name: "message",
  view: asset.view,
  source: new PostgresTableSource({
    db,
    schema: asset.schema,
    table: "message",
    versionColumn: "row_version",
    onMutate: mirrorSeen, // ctx: what the plugin's `context` returned
  }),
});
