import type { SchemaDoc, ViewConfig } from "@jsudc/core";
import { type CollectionRegistry, type Db, PostgresTableSource } from "@jsudc/server";

declare const db: Db;
declare const registry: CollectionRegistry;
// The collection's parsed schema.json and view.yaml (readCollectionAssets gives you both).
declare const asset: { schema: SchemaDoc; view: ViewConfig };

registry.register({
  name: "messages",
  view: asset.view,
  source: new PostgresTableSource({
    db,
    schema: asset.schema, // tenant, subject, received_at, unread, labels, attachment_count
    // A FROM with a join: the attachment count, one value per row.
    from: `message m LEFT JOIN LATERAL (
      SELECT count(*)::int AS n FROM attachment a WHERE a.message_id = m.id
    ) ac ON true`,
    writeTable: "message", // insert, update and delete go here
    writeAlias: "m", // the columns m.* are written; any other is read-only
    idColumn: "m.id", // idType: "uuid" is the default
    versionColumn: "m.row_version", // __meta.version, bumped by every update
    where: "m.deleted_at IS NULL", // ANDed into every statement
    fields: {
      tenant: "m.tenant",
      subject: "m.subject",
      received_at: { column: "m.received_at", readOnly: true }, // kept by the mail import
      unread: "m.unread",
      labels: "m.labels", // string_array over text[]
      attachment_count: { sql: "ac.n" }, // computed: lists, sorts, filters; never written
    },
    totalCount: false, // a large mailbox: no count(*), total is null
  }),
});

// mutate {op: "update", id, row: {unread: false}, expected_version: 4}
//   → the row at version 5, attachment_count as it is now
// mutate {op: "update", id, row: {attachment_count: 0}}
//   → validation_error, problems: [{field: "attachment_count", message: "is read-only"}]
