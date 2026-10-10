import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { isActiveJob } from "../src/job-status";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = path.join(root, ".cache");
const label =
  "local.matchcut." +
  createHash("sha256").update(root).digest("hex").slice(0, 12);
const domain = `gui/${process.getuid?.()}`;
const target = `${domain}/${label}`;
const origin = `http://127.0.0.1:${process.env.PORT || 4317}`;
const action = process.argv[2] || "start";
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

function registered() {
  try {
    execFileSync("/bin/launchctl", ["print", target], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function health() {
  let response: Response;
  try {
    response = await fetch(origin + "/api/health", {
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return false;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.app !== "matchcut")
    throw new Error(`${origin} 已被其他服务占用。`);
  return true;
}

async function main() {
  if (process.platform !== "darwin")
    throw new Error("后台服务脚本仅支持 macOS；其他系统请使用 npm start。");
  if (!["start", "stop", "status"].includes(action))
    throw new Error(
      "用法：npm run service:start / service:stop / service:status",
    );
  const managed = registered();
  const running = await health();
  if (action === "status") {
    console.log(
      running
        ? `Matchcut 正在运行 → ${origin}${managed ? "（独立后台服务）" : "（终端启动）"}`
        : managed
          ? "后台服务已注册，正在启动或重启。"
          : "Matchcut 尚未启动。",
    );
    console.log(`日志：${cache}/service.log 和 service-error.log`);
    return;
  }
  if (action === "stop") {
    if (!managed) {
      if (running)
        throw new Error("当前服务由其他终端启动，请在原终端停止它。");
      console.log("Matchcut 已停止。");
      return;
    }
    // Fail closed if progress cannot be read: a disconnected UI does not
    // prove that a render has stopped.
    const response = await fetch(origin + "/api/jobs", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error("无法确认任务状态，请恢复连接后再停止服务。");
    const jobs = (await response.json()) as { status: string }[];
    if (jobs.some((job) => isActiveJob(job.status))) {
      throw new Error(
        "还有生成或暂停中的任务。请在工作台点「停止任务」，或等生成完成后再关闭服务。",
      );
    }
    execFileSync("/bin/launchctl", ["bootout", target], { stdio: "inherit" });
    console.log("Matchcut 已停止。");
    return;
  }
  if (running) {
    console.log(`Matchcut 已在运行 → ${origin}`);
    if (!managed)
      console.log(
        "当前由终端启动；请保留原终端，等渲染结束后停止旧服务，再用此脚本启动独立后台服务。",
      );
    return;
  }
  if (managed) {
    execFileSync("/bin/launchctl", ["kickstart", target], { stdio: "inherit" });
  } else {
    // Build before starting so the workspace and server use the same version.
    const env = {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || "/usr/bin:/bin"}`,
    };
    execFileSync("npm", ["run", "build"], { cwd: root, env, stdio: "inherit" });
    await mkdir(cache, { recursive: true });
    const variables: Record<string, string> = {
      PATH: env.PATH!,
      MATCHCUT_DEV: "0",
    };
    for (const key of [
      "PORT",
      "MATCHCUT_BROWSER",
      "MATCHCUT_RENDER_CONCURRENCY",
    ]) {
      if (process.env[key]) variables[key] = process.env[key]!;
    }
    const plist = path.join(cache, "service.plist");
    await writeFile(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[process.execPath, "--import", "tsx", path.join(root, "server/index.ts")].map((v) => `<string>${xml(v)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(variables)
        .map(([k, v]) => `<key>${xml(k)}</key><string>${xml(v)}</string>`)
        .join("")}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer>
<key>AbandonProcessGroup</key><false/>
<key>StandardOutPath</key><string>${xml(path.join(cache, "service.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(cache, "service-error.log"))}</string>
</dict></plist>\n`,
    );
    execFileSync("/bin/launchctl", ["bootstrap", domain, plist], {
      stdio: "inherit",
    });
  }
  console.log("正在启动独立后台服务…");
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await health()) {
      console.log(
        `Matchcut 已就绪 → ${origin}\n可以关闭启动窗口；关机或退出 macOS 登录会停止服务。`,
      );
      return;
    }
    await delay(500);
  }
  throw new Error(
    `服务暂未就绪，请查看 ${cache}/service-error.log；再次运行 service:start 可重新检查。`,
  );
}

await main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
