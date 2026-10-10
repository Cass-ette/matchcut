import { makeCancelSignal, type CancelSignal } from "@remotion/renderer";
import type { Job } from "./render";
import { isActiveJob } from "../src/job-status";

export class RenderCancelled extends Error {
  constructor() {
    super("任务已停止，设置已保留");
  }
}

/** Cooperative controls: cancel the current render operation, then wait/retry
 * at a saved chunk boundary. Never suspend the HTTP server or OS processes. */
export class RenderControl {
  private intent: "run" | "pause" | "cancel" = "run";
  private cancelOperation?: () => void;
  private wake?: () => void;
  private previousStatus: "preparing" | "rendering" = "preparing";
  private previousMessage = "准备生成";
  constructor(
    readonly job: Job,
    private update: () => Promise<void>,
  ) {}

  get running() {
    return this.intent === "run";
  }

  async pause() {
    if (
      !["preparing", "rendering", "pausing", "paused"].includes(this.job.status)
    )
      throw new Error("当前任务不能暂停。");
    if (this.intent === "pause") return;
    this.previousStatus = this.job.status as "preparing" | "rendering";
    this.previousMessage = this.job.message;
    this.intent = "pause";
    this.job.status = "pausing";
    this.job.message = "正在暂停，保留已完成片段…";
    this.cancelOperation?.();
    await this.update();
  }

  async resume() {
    if (this.job.status !== "paused") throw new Error("请等任务暂停后再继续。");
    this.intent = "run";
    this.job.status = this.previousStatus;
    this.job.message = this.previousMessage;
    this.wake?.();
    await this.update();
  }

  async cancel() {
    if (!isActiveJob(this.job.status)) throw new Error("任务已结束。");
    this.intent = "cancel";
    this.job.status = "cancelling";
    this.job.message = "正在停止任务…";
    this.cancelOperation?.();
    this.wake?.();
    await this.update();
  }

  async checkpoint(): Promise<void> {
    if (this.intent === "cancel") throw new RenderCancelled();
    if (this.intent === "pause") {
      const resumed = new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.job.status = "paused";
      const saved = this.job.renderProgress?.savedFrames ?? 0;
      this.job.message = saved
        ? `已暂停 · 已保存 ${saved} 帧，继续时从已保存片段接着生成`
        : "已暂停 · 设置已保留，可以继续或停止任务";
      await this.update();
      await resumed;
      this.wake = undefined;
      // Resume and cancel can arrive while the paused snapshot is being saved.
      return this.checkpoint();
    }
  }

  async run<T>(
    operation: (signal: CancelSignal) => Promise<T>,
    interrupted?: () => void,
  ): Promise<T> {
    for (;;) {
      await this.checkpoint();
      const { cancelSignal, cancel } = makeCancelSignal();
      this.cancelOperation = cancel;
      try {
        const result = await operation(cancelSignal);
        if (this.intent === "cancel") throw new RenderCancelled();
        return result;
      } catch (error) {
        if (this.intent === "cancel") throw new RenderCancelled();
        if (this.intent !== "pause") throw error;
        interrupted?.();
        // The interrupted chunk is retried; completed chunks are never replayed.
      } finally {
        this.cancelOperation = undefined;
      }
    }
  }
}
