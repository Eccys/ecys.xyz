export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return this.handleOptions(request);
    }

    try {
      const url = new URL(request.url);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 30);

      const cache = caches.default;
      const cacheKey = new Request("https://cache.ecys.xyz/hn-top-" + limit);
      let response = await cache.match(cacheKey);

      if (!response) {
        const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
        if (!idsRes.ok) throw new Error("HN topstories " + idsRes.status);
        const ids = await idsRes.json();
        const topIds = ids.slice(0, Math.max(limit, 30));

        const items = await Promise.all(
          topIds.map(async (id) => {
            const r = await fetch("https://hacker-news.firebaseio.com/v0/item/" + id + ".json");
            if (!r.ok) return null;
            return r.json();
          })
        );

        const children = items
          .filter((it) => it && it.type === "story" && it.title && typeof it.score === "number")
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((it) => ({
            data: {
              id: String(it.id),
              title: it.title,
              score: it.score,
              by: it.by,
              url: it.url || null,
              permalink: "/item?id=" + it.id,
              // keep Reddit-shaped fields for any old clients
            }
          }));

        const body = JSON.stringify({
          kind: "Listing",
          data: { children, source: "hacker-news" }
        });

        response = new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300"
          }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }

      return this.withCors(request, response);
    } catch (error) {
      const response = new Response(
        JSON.stringify({ error: "Failed to fetch Hacker News.", details: error.message }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
      return this.withCors(request, response);
    }
  },

  handleOptions(request) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": this.resolveAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      }
    });
  },

  withCors(request, response) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", this.resolveAllowedOrigin(request));
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  },

  resolveAllowedOrigin(request) {
    const origin = request.headers.get("Origin");
    return origin || "*";
  }
};