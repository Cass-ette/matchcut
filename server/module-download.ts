import { z } from "zod";

const releaseSchema = z.object({
  tag_name: z.string().regex(/^v\d+\.\d+\.\d+$/),
  assets: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().max(200),
      }),
    )
    .max(100),
});
const releases = new Map<
  string,
  { expires: number; data: z.infer<typeof releaseSchema> }
>();
const api = "https://api.github.com/repos/Cass-ette/matchcut-data/releases/";

async function request(
  url: string,
  accept: string,
  signal?: AbortSignal | null,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: accept, "User-Agent": "Matchcut" },
        signal,
      });
      if (attempt < 2 && (response.status === 429 || response.status >= 500))
        await response.body?.cancel();
      else return response;
    } catch (error) {
      if (attempt >= 2 || signal?.aborted)
        throw new Error("素材下载连接失败，请检查网络后重试。", {
          cause: error,
        });
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
}

// Resolve public assets through GitHub's API, avoiding the github.com website
// redirect which can time out even when api.github.com and its CDN are reachable.
// No GitHub account or token is required. Cache both latest and the immutable tag
// so the manifest and its archive always refer to the same published release.
export const fetchModuleRelease: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const relative = url.pathname.replace(
    /^\/Cass-ette\/matchcut-data\/releases\//,
    "",
  );
  const match =
    /^(?:latest\/download|download\/(v\d+\.\d+\.\d+))\/(modules\.json|matchcut-(?:dota2|lol|cs2)-\d+\.\d+\.\d+\.pack\.gz)$/.exec(
      relative,
    );
  if (
    url.origin !== "https://github.com" ||
    url.username ||
    url.password ||
    !match
  )
    throw new Error("素材包下载地址无效。");
  const key = match[1] || "latest";
  let cached = releases.get(key);
  if (!cached || cached.expires < Date.now()) {
    const response = await request(
      api + (key === "latest" ? "latest" : "tags/" + key),
      "application/vnd.github+json",
      init?.signal,
    );
    if (!response.ok)
      throw new Error(
        `素材库暂时无法连接（HTTP ${response.status}），请稍后重试。`,
      );
    const data = releaseSchema.parse(await response.json());
    if (key !== "latest" && data.tag_name !== key)
      throw new Error("素材包版本不匹配。");
    cached = { data, expires: Date.now() + 5 * 60_000 };
    releases.set(key, cached);
    releases.set(data.tag_name, cached);
  }
  const asset = cached.data.assets.find((asset) => asset.name === match[2]);
  if (!asset) throw new Error("这个版本尚未提供游戏素材包，请稍后重试。");
  return request(
    api + "assets/" + asset.id,
    "application/octet-stream",
    init?.signal,
  );
};
