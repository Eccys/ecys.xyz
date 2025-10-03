export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return this.handleOptions(request);
    }

    try {
      const { apiUrl, cacheKey } = this.buildRedditRequest(request);

      const cache = caches.default;
      let response = await cache.match(cacheKey);

      if (!response) {
        const redditResponse = await fetch(apiUrl, {
          headers: {
            'User-Agent': env.REDDIT_USER_AGENT || 'ecys.xyz-worker/1.0 (contact: admin@ecys.xyz)'
          },
          cf: {
            cacheEverything: true,
            cacheTtl: 300
          }
        });

        const body = await redditResponse.text();
        response = new Response(body, {
          status: redditResponse.status,
          statusText: redditResponse.statusText,
          headers: {
            'Content-Type': redditResponse.headers.get('Content-Type') || 'application/json',
            'Cache-Control': 'public, max-age=300'
          }
        });

        if (redditResponse.ok) {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }
      }

      return this.withCors(request, response);
    } catch (error) {
      const response = new Response(
        JSON.stringify({
          error: 'Failed to fetch data from Reddit.',
          details: error.message
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return this.withCors(request, response);
    }
  },

  buildRedditRequest(request) {
    const url = new URL(request.url);
    const subreddit = url.searchParams.get('subreddit') || 'showerthoughts';
    const timeframe = url.searchParams.get('t') || 'all';
    const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10);
    const limit = Number.isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 100);

    const apiUrl = `https://www.reddit.com/r/${encodeURIComponent(
      subreddit
    )}/top/.json?t=${encodeURIComponent(timeframe)}&limit=${limit}`;

    const cacheKey = new Request(apiUrl);
    return { apiUrl, cacheKey };
  },

  handleOptions(request) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': this.resolveAllowedOrigin(request),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  },

  withCors(request, response) {
    const allowedOrigin = this.resolveAllowedOrigin(request);
    const headers = new Headers(response.headers);

    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  },

  resolveAllowedOrigin(request) {
    const origin = request.headers.get('Origin');
    if (origin) {
      return origin;
    }

    return '*';
  }
};
