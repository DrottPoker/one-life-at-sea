import { defineConfig } from "vitest/config";
import testing from "./config/testing.json" with { type: "json" };
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: testing.unitInclude },
});
