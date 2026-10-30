import { createRendererRegistry } from "@jsudc/react";
import { cardsRenderer } from "@jsudc/react/cards";
import { tableRenderer } from "@jsudc/react/table";

// Only these two are bundled, and only their peers need installing (@tanstack/react-table).
export const renderers = createRendererRegistry(tableRenderer, cardsRenderer);
