export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return this.cors(request, new Response(null, { status: 204 }));

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.endsWith("/reddit-facts") || path.endsWith("/showerthoughts")) {
        return this.cors(request, await this.showerthoughts(ctx));
      }
      if (path.endsWith("/hn-week") || path.endsWith("/hackernews")) {
        return this.cors(request, await this.hnWeek(url, ctx));
      }
      // default: HN week top 10
      return this.cors(request, await this.hnWeek(url, ctx));
    } catch (e) {
      return this.cors(
        request,
        new Response(JSON.stringify({ error: e.message }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        })
      );
    }
  },

  async hnWeek(url, ctx) {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), 10);
    const api =
      "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=50&numericFilters=" +
      encodeURIComponent("created_at_i>" + weekAgo);

    const cache = caches.default;
    const key = new Request("https://cache.ecys.xyz/hn-week-top10");
    let hit = await cache.match(key);
    if (hit) return hit;

    const res = await fetch(api);
    if (!res.ok) throw new Error("HN " + res.status);
    const data = await res.json();
    const children = (data.hits || [])
      .filter((h) => h && h.title && typeof h.points === "number")
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((h) => ({
        data: {
          id: String(h.objectID),
          title: h.title,
          score: h.points,
          url: h.url || null,
          permalink: "https://news.ycombinator.com/item?id=" + h.objectID
        }
      }));

    const body = JSON.stringify({ kind: "Listing", data: { children, source: "hacker-news-week" } });
    const out = new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }
    });
    ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  },

  async showerthoughts(ctx) {
    const cache = caches.default;
    const key = new Request("https://cache.ecys.xyz/showerthoughts-top10");
    let hit = await cache.match(key);
    if (hit) return hit;

    // PullPush archive (live reddit.com often 403 from cloud)
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    let api =
      "https://api.pullpush.io/reddit/search/submission/?subreddit=showerthoughts&sort=desc&sort_type=score&size=10&after=" +
      weekAgo;
    let res = await fetch(api, { headers: { "User-Agent": "ecys.xyz-worker/1.0" } });
    let data = res.ok ? await res.json() : { data: [] };
    if (!data.data || !data.data.length) {
      api =
        "https://api.pullpush.io/reddit/search/submission/?subreddit=showerthoughts&sort=desc&sort_type=score&size=10";
      res = await fetch(api, { headers: { "User-Agent": "ecys.xyz-worker/1.0" } });
      if (!res.ok) throw new Error("PullPush " + res.status);
      data = await res.json();
    }

    const thoughts = (data.data || []).slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      score: p.score,
      url: "https://www.reddit.com" + (p.permalink || ""),
      created_utc: p.created_utc
    }));

    const body = JSON.stringify({
      source: "r/showerthoughts",
      cached_at: new Date().toISOString(),
      thoughts
    });
    const out = new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" }
    });
    // long cache so we keep showerthoughts even when upstream fails later
    ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  },

  cors(request, response) {
    const headers = new Headers(response.headers);
    const origin = request.headers.get("Origin") || "*";
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};