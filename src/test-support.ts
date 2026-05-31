import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function ensureGeneratedStylesheet(): void {
  mkdirSync(".generated", { recursive: true });
  writeFileSync(join(".generated", "styles.css"), ":root{--color-app-canvas:#fff;}", "utf8");
  writeFileSync(join(".generated", "panel-live.client.js"), "export {};\n", "utf8");
}
