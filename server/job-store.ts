import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Job } from "./render";

export function jobWriter(folder: string, job: Job) {
  let queue = Promise.resolve();
  return () => {
    job.updatedAt = new Date().toISOString();
    const content = JSON.stringify(job, null, 2);
    // A failed write must be reported, but must not prevent a later error
    // status from being saved if the filesystem becomes available again.
    queue = queue
      .catch(() => {})
      .then(async () => {
        await mkdir(folder, { recursive: true });
        const target = path.join(folder, "job.json");
        await writeFile(target + ".tmp", content);
        await rename(target + ".tmp", target);
      });
    return queue;
  };
}

export async function restoreJobs(output: string) {
  await mkdir(output, { recursive: true });
  const jobs = new Map<string, Job>();
  for (const dir of await readdir(output)) {
    const folder = path.join(output, dir);
    let job: Job;
    try {
      job = JSON.parse(await readFile(path.join(folder, "job.json"), "utf8"));
    } catch {
      continue;
    }
    if (!["done", "error"].includes(job.status)) {
      job.status = "error";
      job.error = "上次后台服务已退出，生成已中断。设置已保留，请重新生成。";
      job.message = job.error;
      await jobWriter(folder, job)();
      console.warn(
        `[${new Date().toISOString()}] [job:${job.id}] ${job.message}`,
      );
    }
    jobs.set(job.id, job);
  }
  return jobs;
}
