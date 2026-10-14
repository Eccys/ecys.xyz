const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const port = Number(process.env.PORT) || 3000;

const ALLOWED_TIMEFRAMES = new Set(['hour', 'day', 'week', 'month', 'year', 'all']);
const SUBREDDIT_REGEX = /^[a-zA-Z0-9_]{1,50}$/;

function loadLocalShowerthoughtsFallback() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'showerthoughts-cache.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const children = ((parsed && parsed.thoughts) || []).map((t) => ({
      data: {
        id: t.id,
        title: t.title,
        score: t.score || 0,
        url: t.url || 'https://www.reddit.com/r/showerthoughts/',
        created_utc: t.created_utc
      }
    }));
    return { kind: 'Listing', data: { children, source: 'local-cache' } };
  } catch (err) {
    return null;
  }
}

// Proxy for Reddit API with input validation and local cache fallback
app.get('/api/reddit-facts', async (req, res) => {
  const rawSubreddit = String(req.query.subreddit || 'showerthoughts');
  if (!SUBREDDIT_REGEX.test(rawSubreddit)) {
    return res.status(400).json({ error: 'Invalid subreddit parameter' });
  }

  const parsedLimit = parseInt(String(req.query.limit || '100'), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 100;

  const rawTimeframe = String(req.query.t || 'all');
  const t = ALLOWED_TIMEFRAMES.has(rawTimeframe) ? rawTimeframe : 'all';

  const apiUrl = `https://www.reddit.com/r/${encodeURIComponent(rawSubreddit)}/top/.json?limit=${limit}&t=${encodeURIComponent(t)}`;

  try {
    const redditResponse = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ecys.xyz-local-proxy/1.0' }
    });
    if (!redditResponse.ok) {
      throw new Error(`Reddit upstream HTTP ${redditResponse.status}`);
    }
    const data = await redditResponse.json();
    return res.json(data);
  } catch (error) {
    const fallback = loadLocalShowerthoughtsFallback();
    if (fallback) {
      return res.json(fallback);
    }
    return res.status(502).json({ error: 'Failed to fetch data from Reddit' });
  }
});

// Prevent exposing server/worker configuration files via static middleware
const BLOCKED_PATHS = new Set(['/server.js', '/wrangler.toml', '/package.json', '/package-lock.json']);
app.use((req, res, next) => {
  if (BLOCKED_PATHS.has(req.path) || req.path.startsWith('/workers/') || req.path.startsWith('/.')) {
    return res.status(404).end();
  }
  return next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

module.exports = app;
