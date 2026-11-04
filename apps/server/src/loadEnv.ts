/**
 * @module server/loadEnv
 *
 * Reads a `.env` file into `process.env`, with no dependency. The server and the check scripts
 * call it first, so the settings in `.env.example` actually take effect when you copy it to `.env`.
 *
 * Looks for the repo root `.env` and then `apps/server/.env`. A variable that is already set in
 * the real environment always wins, so hosting dashboards and shell exports override the file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Parses `KEY=value` lines. Supports comments, blank lines, `export`, and single or double quotes. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      // An unquoted value ends at a " #" comment.
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/** Loads the first .env files found. Returns the paths read. Never overrides existing variables. */
export function loadEnv(env: NodeJS.ProcessEnv = process.env, files?: string[]): string[] {
  const candidates =
    files ??
    [
      // apps/server/src/loadEnv.ts (or dist/loadEnv.js) -> repo root, then the server folder
      fileURLToPath(new URL('../../../.env', import.meta.url)),
      fileURLToPath(new URL('../.env', import.meta.url)),
    ];
  const read: string[] = [];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
        if (env[k] === undefined) env[k] = v;
      }
      read.push(file);
    } catch (err) {
      console.warn(`[env] could not read ${file}: ${(err as Error).message}`);
    }
  }
  return read;
}
