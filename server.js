const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = 3000;

// Proxy for Reddit API
app.get('/api/reddit-facts', async (req, res) => {
  const subreddit = req.query.subreddit || 'showerthoughts';
  const limit = req.query.limit || '100';
  const t = req.query.t || 'all';
  const apiUrl = `https://www.reddit.com/r/${subreddit}/top/.json?limit=${limit}&t=${t}`;

  try {
    const redditResponse = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ecys.xyz-local-proxy/1.0' }
    });
    const data = await redditResponse.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data from Reddit' });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
