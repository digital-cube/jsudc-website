// shared/actions.ts — imported by the server and by the browser
import { defineHostAction } from "@jsudc/core";
import { z } from "zod";

export const archiveThread = defineHostAction({
  name: "mail.archive_thread",
  request: z.object({ thread: z.string().min(1) }),
  response: z.object({ archived: z.number().int() }),
});

export const snooze = defineHostAction({
  name: "mail.snooze",
  request: z.object({ ids: z.array(z.string()), until: z.iso.datetime() }),
  response: z.object({ snoozed: z.number().int() }),
});
