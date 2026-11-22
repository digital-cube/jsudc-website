import {
  type ChangeBus,
  type ChangeNotice,
  createChangeFeed,
  createPostgresChangeBus,
} from "@jsudc/server";

// Every process LISTENs on one channel; a change made through one reaches the streams of all.
export const changes = createChangeFeed({
  bus: createPostgresChangeBus({
    connectionString: process.env.DATABASE_URL ?? "postgresql://localhost/app",
    channel: "jsudc_changes", // the default; every process must agree
  }),
});

// Anything else (Redis pub/sub, NATS) is a ChangeBus of your own. A minimal Redis client:
interface Redis {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<unknown>;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
  quit(): Promise<unknown>;
}

export function redisBus(pub: Redis, sub: Redis, channel = "jsudc_changes"): ChangeBus {
  const listeners = new Set<(n: ChangeNotice) => void>();
  void sub.subscribe(channel);
  sub.on("message", (_ch, text) => {
    for (const l of listeners) l(JSON.parse(text) as ChangeNotice);
  });
  return {
    // must reach every process, this one included
    publish: async (notice) => void (await pub.publish(channel, JSON.stringify(notice))),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => void (await sub.quit()),
  };
}
