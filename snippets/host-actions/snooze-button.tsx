import { useUdcAction } from "@jsudc/react";
import { snooze } from "./actions";

export function SnoozeButton({ ids }: { ids: string[] }) {
  // After it succeeds, the lists of `messages` refetch.
  const run = useUdcAction(snooze, { invalidates: ["messages"] });
  return (
    <button
      type="button"
      disabled={run.isPending}
      // The payload is typed { ids: string[]; until: string }; data is { snoozed: number }.
      onClick={() => run.mutate({ ids, until: new Date(Date.now() + 3_600_000).toISOString() })}
    >
      {run.data ? `Snoozed ${run.data.snoozed}` : "Snooze an hour"}
    </button>
  );
}
