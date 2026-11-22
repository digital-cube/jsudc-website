import type { RendererDefinition, RendererProps } from "@jsudc/react";
import { Inbox } from "lucide-react";

/** A mail client's message list: a renderer of the host's, drawn from `RendererProps`. */
function MessageList({ data, filtered, onClearFilters, mode, page, limit, onPage }: RendererProps) {
  if (data.isLoading) return <p>Loading…</p>;
  if (data.rows.length === 0) {
    return filtered ? (
      <button type="button" onClick={onClearFilters}>
        Clear filters
      </button>
    ) : (
      <p>No messages</p>
    );
  }
  return (
    <div>
      <ul>
        {data.rows.map((row) => (
          <li key={row.__meta.id}>
            <b>{String(row.subject)}</b> · {String(row.from)}
          </li>
        ))}
      </ul>
      {mode === "infinite" && data.hasNextPage ? (
        <button type="button" onClick={() => data.fetchNextPage()}>
          More
        </button>
      ) : null}
      {mode === "pages" && data.total !== null && page * limit < data.total ? (
        <button type="button" onClick={() => onPage(page + 1)}>
          Next
        </button>
      ) : null}
    </div>
  );
}

export const messageList: RendererDefinition = {
  name: "messages", // the name a view lists in available_renderers
  component: MessageList,
  icon: Inbox,
  labelKey: "TAB_MESSAGES", // APP.TAB_MESSAGES, through `messages` of UdcI18nProvider
  paging: true, // reads `data`: the list loads, the paging toggle shows
  editMode: false,
};
