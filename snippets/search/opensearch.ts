import { loadRegistry, makeSource, withSearchIndex } from "@jsudc/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

declare const db: NodePgDatabase;
// The host's OpenSearch client (@opensearch-project/opensearch); jsudc ships none.
declare const os: {
  search(req: object): Promise<{
    body: { hits: { total: { value: number }; hits: { _id: string }[] } };
  }>;
};

export const registry = loadRegistry("./collections", (asset, reg) => {
  const source = makeSource(asset, { db, registry: reg, env: process.env });
  if (asset.name !== "message" || !source) return source;
  // The wrapper says search: "source"; a list with `search` asks the index for one page of ids,
  // then loads exactly those rows (id in ids, the client's filter, the row scope), in that order.
  return withSearchIndex(source, {
    async search({ text, page, ctx }) {
      const res = await os.search({
        index: "messages",
        from: page.offset,
        size: page.limit,
        _source: false,
        body: {
          query: {
            bool: {
              must: { simple_query_string: { query: text, fields: ["subject^3", "body"] } },
              // jsudc applies the scope regardless; passing the tenant keeps a page from being
              // mostly rows jsudc would drop.
              filter: { term: { tenant_id: (ctx as { tenantId: string }).tenantId } },
            },
          },
        },
      });
      return { ids: res.body.hits.hits.map((h) => h._id), total: res.body.hits.total.value };
    },
  });
});
