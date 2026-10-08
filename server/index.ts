import express from "express";
import { createServer as createViteServer } from "vite";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  access,
  rename,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DEFAULT_MATCH, defaultSettings, settingsSchema } from "../src/domain";
import {
  initializeData,
  latestMatch,
  loadMatch,
  recentMatches,
} from "./source";
import { Job, runRender } from "./render";

const root = process.cwd(),
  port = Number(process.env.PORT || 4317),
  origin = "http://127.0.0.1:" + port;
await initializeData();
await mkdir(path.join(root, "output"), { recursive: true });
const app = express();
app.use((req, res, next) => {
  if (
    !["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host || "")
  ) {
    res.status(403).json({ error: "只接受本机请求。" });
    return;
  }
  const source = req.headers.origin;
  if (source && source !== origin && source !== "http://localhost:" + port) {
    res.status(403).json({ error: "请求来源不匹配。" });
    return;
  }
  next();
});
app.use(express.json({ limit: "128kb" }));
app.use("/assets", express.static(path.join(root, "public/assets")));
app.use("/output", express.static(path.join(root, "output")));
const jobs = new Map<string, Job>();
for (const dir of await readdir(path.join(root, "output"))) {
  try {
    const job: Job = JSON.parse(
      await readFile(path.join(root, "output", dir, "job.json"), "utf8"),
    );
    if (!["done", "error"].includes(job.status)) {
      job.status = "error";
      job.error = "上次进程已结束，请重新生成。";
      job.message = job.error;
    }
    jobs.set(job.id, job);
  } catch {}
}
const wrap =
  (fn: (req: express.Request, res: express.Response) => Promise<any>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "matchcut", version: "0.1.0" }),
);
app.get(
  "/api/bootstrap",
  wrap(async (_req, res) => {
    const data = await loadMatch(DEFAULT_MATCH);
    let saved = null;
    try {
      saved = JSON.parse(
        await readFile(path.join(root, "data/preferences.json"), "utf8"),
      );
    } catch {}
    res.json({
      match: data.match,
      settings: defaultSettings(data.match),
      preferences: saved,
      jobs: [...jobs.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12),
    });
  }),
);
app.get(
  "/api/matches/:id",
  wrap(async (req, res) => {
    const data = await loadMatch(String(req.params.id));
    res.json({
      match: data.match,
      settings: defaultSettings(data.match),
      cached: data.cached,
    });
  }),
);
app.get(
  "/api/recent",
  wrap(async (_req, res) => {
    res.json(
      (await recentMatches())
        .filter((m) => m.radiant_name && m.dire_name)
        .slice(0, 30),
    );
  }),
);
app.get(
  "/api/latest",
  wrap(async (req, res) => {
    const league = z
      .string()
      .regex(/^\d{1,8}$/)
      .optional()
      .parse(req.query.league || undefined);
    const team = z
      .string()
      .regex(/^\d{1,12}$/)
      .optional()
      .parse(req.query.team || undefined);
    const data = await latestMatch(league, team);
    res.json({
      match: data.match,
      settings: defaultSettings(data.match),
      cached: data.cached,
    });
  }),
);
app.get("/api/jobs", (_req, res) =>
  res.json(
    [...jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12),
  ),
);
app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: "未找到生成任务。" });
    return;
  }
  res.json(job);
});
const prefSchema = z.object({
  settings: settingsSchema,
  source: z.enum(["current", "latest"]),
  leagueId: z
    .string()
    .regex(/^\d{0,8}$/)
    .default(""),
  teamId: z
    .string()
    .regex(/^\d{0,12}$/)
    .default(""),
});
app.put(
  "/api/preferences",
  wrap(async (req, res) => {
    const prefs = prefSchema.parse(req.body);
    await writeFile(
      path.join(root, "data/preferences.json"),
      JSON.stringify(prefs, null, 2),
    );
    res.json({ ok: true });
  }),
);
app.post(
  "/api/jobs",
  wrap(async (req, res) => {
    if (
      [...jobs.values()].some(
        (j) => j.status === "preparing" || j.status === "rendering",
      )
    ) {
      res.status(409).json({ error: "已有视频正在生成，请等待它完成。" });
      return;
    }
    const body = z
      .object({
        matchId: z.string().regex(/^\d{6,15}$/),
        settings: settingsSchema,
        source: z.enum(["current", "latest"]).default("current"),
        leagueId: z
          .string()
          .regex(/^\d{0,8}$/)
          .default(""),
        teamId: z
          .string()
          .regex(/^\d{0,12}$/)
          .default(""),
      })
      .parse(req.body);
    const id =
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomUUID().slice(0, 6);
    const job: Job = {
      id,
      status: "preparing",
      progress: 1,
      message:
        body.source === "latest" ? "寻找最新已解析的职业比赛" : "校验比赛数据",
      createdAt: new Date().toISOString(),
      warnings: [],
    };
    jobs.set(id, job);
    const dir = path.join(root, "output", id);
    await mkdir(dir, { recursive: true });
    let writeQueue = Promise.resolve();
    const update = () => {
      const content = JSON.stringify(job, null, 2);
      writeQueue = writeQueue.then(async () => {
        const target = path.join(dir, "job.json");
        await writeFile(target + ".tmp", content);
        await rename(target + ".tmp", target);
      });
      return writeQueue;
    };
    await update();
    res.status(202).json(job);
    void (async () => {
      try {
        const data =
          body.source === "latest"
            ? await latestMatch(
                body.leagueId || undefined,
                body.teamId || undefined,
              )
            : await loadMatch(body.matchId);
        // Auto mode always recomputes match-specific copy, so a previous match's text cannot leak into the new report.
        const defaults = defaultSettings(data.match);
        const settings =
          body.source === "latest"
            ? {
                ...body.settings,
                headline: defaults.headline,
                scripts: defaults.scripts,
              }
            : body.settings;
        await runRender(job, data.match, data.raw, settings, origin, update);
      } catch (e) {
        job.status = "error";
        job.error = (e as Error).message;
        job.message = "数据暂不可用，未生成误导内容";
        await update();
      }
    })();
  }),
);
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res.status(err instanceof z.ZodError ? 400 : 422).json({
      error:
        err instanceof z.ZodError
          ? "输入格式不正确：" +
            err.issues.map((i) => i.path.join(".") + " " + i.message).join("；")
          : err.message || "操作失败。",
    }),
);
let built = false;
try {
  await access(path.join(root, "dist/index.html"));
  built = process.env.MATCHCUT_DEV !== "1";
} catch {}
if (built) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "127.0.0.1", () =>
  console.log("\n  Matchcut is ready → " + origin + "\n"),
);
server.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
