import { access, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function browserPath(): Promise<string | undefined> {
  if (process.env.MATCHCUT_BROWSER) return process.env.MATCHCUT_BROWSER;
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  try {
    const dirs = (await readdir(base))
      .filter((x) => x.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();
    for (const d of dirs) {
      const p = path.join(
        base,
        d,
        "chrome-headless-shell-mac-arm64/chrome-headless-shell",
      );
      try {
        await access(p);
        return p;
      } catch {}
    }
  } catch {}
  return undefined;
}
