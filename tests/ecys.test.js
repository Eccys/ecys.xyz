const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

let mockRedditFetch = async () => {
  throw new Error('Simulated upstream Reddit outage');
};
require.cache[require.resolve('node-fetch')] = {
  id: require.resolve('node-fetch'),
  filename: require.resolve('node-fetch'),
  loaded: true,
  exports: (...args) => mockRedditFetch(...args)
};

const app = require('../server.js');
const { isSafeHref, isShortEnough, formatFactLines } = require('../script.js');

async function loadWorker() {
  const workerPath = path.join(__dirname, '..', 'workers', 'redditFactsWorker.js');
  const source = fs.readFileSync(workerPath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64');
  const mod = await import(dataUrl);
  return mod.default;
}

function sendRawRequest(port, rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: rawPath, method },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('ecys.xyz rotator helpers (script.js)', () => {
  it('validates safe hrefs and rejects protocol-relative, javascript:, or hostless URLs', () => {
    assert.equal(isSafeHref('https://ecys.xyz/'), true);
    assert.equal(isSafeHref('  http://news.ycombinator.com/item?id=1  '), true);
    assert.equal(isSafeHref('/showerthoughts-cache.json'), true);

    assert.equal(isSafeHref('//evil.example/xss'), false);
    assert.equal(isSafeHref('///evil.example'), false);
    assert.equal(isSafeHref('javascript:alert(1)'), false);
    assert.equal(isSafeHref('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeHref('https://'), false);
    assert.equal(isSafeHref('http://'), false);
    assert.equal(isSafeHref(''), false);
    assert.equal(isSafeHref(null), false);
  });

  it('checks word count limits in isShortEnough and wraps long facts in formatFactLines', () => {
    assert.equal(isShortEnough({ title: 'Short thought' }), true);
    const fortyOneWords = Array.from({ length: 41 }, (_, i) => `w${i}`).join(' ');
    assert.equal(isShortEnough({ title: fortyOneWords }), false);
    assert.equal(isShortEnough({ title: '' }), false);
    assert.equal(isShortEnough(null), false);

    assert.deepEqual(formatFactLines('   '), []);
    assert.deepEqual(formatFactLines('Hello world'), ['Hello world']);
    const twentyWords = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    const wrapped = formatFactLines(twentyWords);
    assert.ok(wrapped.length >= 2);
  });
});

describe('ecys.xyz Express server (server.js)', () => {
  it('blocks direct, uppercase, URL-encoded, double-slash, and test directory static paths', async () => {
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();

    try {
      const blocked = [
        '/server.js',
        '/SERVER.JS',
        '/%73erver.js',
        '//server.js',
        '/wrangler.toml',
        '/%77rangler.toml',
        '/package.json',
        '/package-lock.json',
        '/workers/redditFactsWorker.js',
        '/%77orkers/redditFactsWorker.js',
        '//workers/redditFactsWorker.js',
        '/tests/ecys.test.js',
        '/.gitignore',
        '/.github/workflows/ci.yml'
      ];
      for (const p of blocked) {
        const res = await sendRawRequest(port, p);
        assert.equal(res.status, 404, `Expected 404 for ${p}, got ${res.status}`);
      }

      const malformed = await sendRawRequest(port, '/%E0%A4%A');
      assert.equal(malformed.status, 400);

      const indexRes = await sendRawRequest(port, '/index.html');
      assert.equal(indexRes.status, 200);
      assert.ok(indexRes.body.includes('<!DOCTYPE html>'));

      const badSub = await sendRawRequest(port, '/api/reddit-facts?subreddit=../../etc/passwd');
      assert.equal(badSub.status, 400);

      // Fallback works for showerthoughts (case-insensitive)
      const stFallback = await sendRawRequest(port, '/api/reddit-facts?subreddit=Showerthoughts&limit=3');
      assert.equal(stFallback.status, 200);
      const stParsed = JSON.parse(stFallback.body);
      assert.equal(stParsed.data.source, 'local-cache');
      assert.equal(stParsed.data.children.length, 3);

      // Non-showerthoughts subreddit returns 502 on upstream failure instead of wrong subreddit cache
      const otherSub = await sendRawRequest(port, '/api/reddit-facts?subreddit=todayilearned&limit=3');
      assert.equal(otherSub.status, 502);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('ecys.xyz Cloudflare Worker (workers/redditFactsWorker.js)', () => {
  it('handles OPTIONS preflight, rejects non-GET/HEAD with 405, and caches non-empty HN & Showerthoughts', async () => {
    const worker = await loadWorker();
    const store = new Map();
    globalThis.caches = {
      default: {
        async match(req) {
          const hit = store.get(req.url);
          return hit ? hit.clone() : undefined;
        },
        async put(req, res) {
          store.set(req.url, res.clone());
        }
      }
    };

    const originalFetch = globalThis.fetch;
    try {
      // 1. OPTIONS preflight
      const optRes = await worker.fetch(
        new Request('https://api.ecys.xyz/api/reddit-facts', {
          method: 'OPTIONS',
          headers: { Origin: 'https://ecys.xyz' }
        }),
        {},
        {}
      );
      assert.equal(optRes.status, 204);
      assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), 'https://ecys.xyz');

      // 2. Reject POST with 405
      const postRes = await worker.fetch(
        new Request('https://api.ecys.xyz/api/reddit-facts', { method: 'POST' }),
        {},
        {}
      );
      assert.equal(postRes.status, 405);

      // 3. /hn-week sorts by points and clamps limit
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            hits: [
              { objectID: '1', title: 'Low', points: 10, url: 'https://example.com/1' },
              { objectID: '2', title: 'High', points: 99, url: 'https://example.com/2' }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const pending = [];
      const ctx = { waitUntil: (p) => pending.push(p) };
      const hnRes = await worker.fetch(
        new Request('https://api.ecys.xyz/api/hn-week?limit=1'),
        {},
        ctx
      );
      await Promise.all(pending);
      assert.equal(hnRes.status, 200);
      const hnJson = await hnRes.json();
      assert.equal(hnJson.data.children.length, 1);
      assert.equal(hnJson.data.children[0].data.id, '2');
      assert.equal(store.size, 1);

      // 4. /reddit-facts falls back when primary PullPush fails and sanitizes protocol-relative permalinks
      let callCount = 0;
      globalThis.fetch = async (url) => {
        callCount++;
        if (String(url).includes('after=')) {
          throw new Error('Primary PullPush timeout');
        }
        return new Response(
          JSON.stringify({
            data: [
              { id: 'a1', title: 'Valid permalink', score: 42, permalink: '/r/showerthoughts/comments/a1' },
              { id: 'a2', title: 'Protocol relative', score: 10, permalink: '//evil.example/hijack' }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const stRes = await worker.fetch(
        new Request('https://api.ecys.xyz/api/reddit-facts'),
        {},
        ctx
      );
      await Promise.all(pending);
      assert.equal(stRes.status, 200);
      assert.equal(callCount, 2);
      const stJson = await stRes.json();
      assert.equal(stJson.thoughts.length, 2);
      assert.equal(stJson.thoughts[0].url, 'https://www.reddit.com/r/showerthoughts/comments/a1');
      assert.equal(stJson.thoughts[1].url, 'https://www.reddit.com/r/showerthoughts/');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
