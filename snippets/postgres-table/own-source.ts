import type { ListRequest, SchemaDoc } from "@jsudc/core";
import {
  codePointOrder,
  compileFilter,
  compileSort,
  cursorPredicate,
  type Db,
  decodeCursor,
  type FieldResolver,
  orderBy,
  sortKeyColumns,
} from "@jsudc/server";
import { sql } from "drizzle-orm";

declare const db: Db;
declare const schema: SchemaDoc; // the collection's schema: the allowlist of fields
declare const req: ListRequest; // the client's list request
const limit = req.page?.limit ?? 50;

// Where each field lives: here a column c_<field> of a table `people` with an integer key.
const col = (field: string) => sql`${sql.identifier(`c_${field}`)}`;
const resolve: FieldResolver = {
  text: (field) => sql`(${col(field)}::text)`, // contains / starts_with / is_null
  // comparisons, ORDER BY, the cursor
  typed: (field, _def, cast) =>
    cast === "text" ? codePointOrder(sql`${col(field)}::text`) : sql`(${col(field)})`,
  array: (field) => ({ expr: col(field), form: "text[]" }), // string_array, lookup_array
  id: sql`pk`,
  idType: "integer",
};

const terms = compileSort(req.sort, schema, resolve); // refuses an unknown field
const after = req.page?.cursor ? decodeCursor(req.page.cursor, terms.length, "integer") : null;
let where = compileFilter(req.filter, schema, resolve); // a validation_error before any SQL runs
if (after) where = sql`${where} AND ${cursorPredicate(terms, after.values, after.id, resolve)}`;
export const rows = await db.execute(sql`
  SELECT pk${terms.length ? sql`, ${sortKeyColumns(terms)}` : sql``} FROM people
  WHERE ${where} ORDER BY ${orderBy(terms, resolve)} LIMIT ${limit + 1}`);
// next cursor: encodeCursor([...terms.map((_, i) => last[`__k${i}`] ?? null), String(last.pk)])
