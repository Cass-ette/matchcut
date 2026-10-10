export const activeJobStatuses = [
  "preparing",
  "rendering",
  "pausing",
  "paused",
  "cancelling",
] as const;
export type JobStatus =
  (typeof activeJobStatuses)[number] | "done" | "error" | "cancelled";
export const isActiveJob = (status: string) =>
  (activeJobStatuses as readonly string[]).includes(status);
