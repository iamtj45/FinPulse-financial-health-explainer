import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Next.js loads .env* automatically; standalone scripts (build-kb-index,
 * the MCP server) run outside Next and need this instead. */
export function loadEnvForScripts(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      const isQuoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (isQuoted) value = value.slice(1, -1);

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
