import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // the data view POSTs to /udc/<action>; the server of the first quick start answers
  server: { proxy: { "/udc": "http://localhost:5100" } },
});
