export const DEFAULT_SCRAPER_URL = "http://127.0.0.1:18080";

export function normalizeScraperUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) {
    throw new Error("请输入有效的 scraper 地址");
  }

  const input = value.trim();
  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `http://${input}`);
  } catch {
    throw new Error("地址格式不正确，例如 http://127.0.0.1:18080");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname || url.username || url.password || url.search || url.hash
  ) {
    throw new Error("请使用 HTTP 或 HTTPS 服务地址，不要包含账号、密码、查询参数或锚点");
  }

  return url.toString().replace(/\/+$/, "");
}
