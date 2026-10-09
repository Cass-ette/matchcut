import { z } from "zod";

export type PhotoCandidate = {
  name: string;
  provider: string;
  pageUrl: string;
  imageUrl: string;
};
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
export function photoPageUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !(
      (url.hostname === "www.hltv.org" &&
        /^\/player\/\d+\/[\w-]+\/?$/.test(url.pathname)) ||
      (url.hostname === "prosettings.net" &&
        /^\/players\/[\w-]+\/$/.test(url.pathname))
    )
  )
    throw new Error("请粘贴 HLTV 或 ProSettings 的选手资料页链接。");
  url.search = "";
  url.hash = "";
  return url;
}
export function photoImageUrl(value: string) {
  const url = new URL(decode(value));
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !(
      (url.hostname === "prosettings.net" &&
        url.pathname.startsWith("/wp-content/uploads/")) ||
      (["img-cdn.hltv.org", "static.hltv.org"].includes(url.hostname) &&
        /^\/(?:playerbodyshot|playerimages|images\/playerprofile)\//.test(
          url.pathname,
        ))
    )
  )
    throw new Error("未找到支持的选手照片地址。");
  return url;
}
export async function limitedFetch(
  url: URL,
  maximum: number,
  request = fetch,
): Promise<Buffer> {
  const response = await request(url, {
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 && url.hostname.includes("hltv")
        ? "HLTV 暂时拒绝访问，请改用 ProSettings 资料页或上传照片。"
        : `素材获取失败（HTTP ${response.status}），请检查链接或稍后重试。`,
    );
  if (Number(response.headers.get("content-length")) > maximum)
    throw new Error("素材文件过大。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body!.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new Error("素材文件过大。");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function parsePhotoPage(html: string, page: URL): PhotoCandidate {
  if (page.hostname === "prosettings.net") {
    for (const match of html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs,
    )) {
      let graph: any[];
      try {
        graph = JSON.parse(match[1])["@graph"] || [];
      } catch {
        continue;
      }
      const person = graph.find(
        (item) => item["@type"] === "Person" && item.url === page.href,
      );
      const image = graph.find(
        (item) => item["@id"] === person?.image?.["@id"],
      );
      if (person?.additionalName && image?.contentUrl)
        return {
          name: person.additionalName,
          provider: "ProSettings",
          pageUrl: page.href,
          imageUrl: photoImageUrl(image.contentUrl).href,
        };
    }
  } else {
    const name = html.match(
      /<[^>]+class=["'][^"']*\bplayerNickname\b[^"']*["'][^>]*>([^<]+)</,
    )?.[1];
    const tag = [...html.matchAll(/<img\b[^>]*>/g)]
      .map((m) => m[0])
      .find((tag) =>
        /class=["'][^"']*\b(?:profile-img|bodyshot-img)\b/.test(tag),
      );
    const image = tag?.match(/\bsrc=["']([^"']+)["']/)?.[1];
    if (name && image)
      return {
        name: decode(name.trim()),
        provider: "HLTV",
        pageUrl: page.href,
        imageUrl: photoImageUrl(image).href,
      };
  }
  throw new Error("资料页没有可用的选手照片，请核对链接或上传照片。");
}
export async function fetchPhotoCandidate(url: string, request = fetch) {
  const page = photoPageUrl(url);
  const html = await limitedFetch(page, 3 * 1024 * 1024, request);
  return parsePhotoPage(html.toString("utf8"), page);
}
export const photoCandidateSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["HLTV", "ProSettings"]),
  pageUrl: z.string(),
  imageUrl: z.string(),
});
