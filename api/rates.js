// =====================================================================
// Vercel Serverless Function : /api/rates
// 3事業の公式トップページから消化率(%)を取得して返す。
// サーバー側で取得するためCORSの制約を受けない。
// CDNキャッシュを効かせるので、何人開いても政府サイトへのアクセスは最小限。
// =====================================================================

const TARGETS = [
  { slug: "window", url: "https://window-renovation2026.env.go.jp/", categories: [{ category: "main" }] },
  { slug: "kyutou", url: "https://kyutou-shoene2026.meti.go.jp/", categories: [{ category: "main" }, { category: "tekkyo", anchor: /撤去加算/ }] },
  { slug: "mirai",  url: "https://mirai-eco2026.mlit.go.jp/", categories: [{ category: "main" }] },
];

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}
function extractPercent(text, anchor) {
  let scope = text;
  if (anchor) {
    const m = anchor.exec(text);
    if (!m) return null;
    scope = text.slice(m.index);
  }
  const near = /割合[^0-9]{0,40}?(\d{1,3})\s*[％%]/.exec(scope);
  if (near) return Number(near[1]);
  const any = /(\d{1,3})\s*[％%]/.exec(scope);
  return any ? Number(any[1]) : null;
}
function extractAsOf(text) {
  const m = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(text);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const out = {};
  await Promise.all(TARGETS.map(async (t) => {
    try {
      const r = await fetch(t.url, { headers: { "User-Agent": "lifedesign-subsidy-bot/1.0" } });
      const text = toText(await r.text());
      const asOf = extractAsOf(text);
      out[t.slug] = {};
      for (const c of t.categories) {
        const rate = extractPercent(text, c.anchor);
        if (rate !== null) out[t.slug][c.category] = { rate, as_of: asOf };
      }
    } catch (e) {
      out[t.slug] = { error: String(e) };
    }
  }));

  // CDNで3時間キャッシュ（この間サイトへは取りに行かない）。以降はバックグラウンド更新
  res.setHeader("Cache-Control", "public, s-maxage=10800, stale-while-revalidate=86400");
  res.status(200).json({ updated: new Date().toISOString(), rates: out });
}
