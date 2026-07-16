document.addEventListener("DOMContentLoaded", function () {
  // Primary: same-origin static facts (reliable on GitHub Pages).
  // Secondary: Cloudflare worker proxy (may fail if Reddit blocks datacenter IPs).
  const endpoints = [
    "/facts.json",
    "https://api.ecys.xyz/api/reddit-facts?limit=100&t=all",
  ];
  const factElement = document.getElementById("randomFact");
  const factLink = document.getElementById("randomFactLink");
  let lastPosts = [];
  let pool = [];

  const updateFact = (randomFact, postUrl) => {
    const words = randomFact.split(" ");
    if (words.length > 16) {
      factElement.innerHTML = words
        .join(" ")
        .replace(/(.{48}\S*)\s+/g, "$1<br />");
    } else {
      factElement.innerText = randomFact;
    }
    if (postUrl) {
      factLink.href = postUrl;
      factLink.removeAttribute("aria-disabled");
    }
  };

  const normalizePosts = (data) => {
    if (Array.isArray(data)) {
      return data.map((item, i) => ({
        id: item.id || String(i),
        title: item.title || item.fact || String(item),
        permalink: item.permalink || item.url || null,
      }));
    }
    if (data && data.data && Array.isArray(data.data.children)) {
      return data.data.children.map((child) => child.data);
    }
    if (data && Array.isArray(data.facts)) {
      return data.facts.map((item, i) => ({
        id: item.id || String(i),
        title: item.title || item.fact || String(item),
        permalink: item.permalink || item.url || null,
      }));
    }
    return [];
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error("Endpoint returned HTML instead of JSON");
    }
    return response.json();
  };

  const loadPool = async () => {
    let lastError = null;
    for (const url of endpoints) {
      try {
        const data = await fetchJson(url);
        const posts = normalizePosts(data).filter(
          (post) => post && post.title && post.title.split(" ").length <= 30
        );
        if (posts.length) {
          pool = posts;
          return;
        }
      } catch (error) {
        lastError = error;
        console.warn("Fact source failed:", url, error);
      }
    }
    throw lastError || new Error("No fact sources available");
  };

  const displayPost = () => {
    if (!pool.length) {
      factElement.innerText = "No new facts available.";
      return;
    }

    let posts = pool.filter((post) => !lastPosts.includes(post.id));
    if (!posts.length) {
      lastPosts = [];
      posts = pool.slice();
    }

    const post = posts[Math.floor(Math.random() * posts.length)];
    const randomFact = post.title;
    const postUrl = post.permalink
      ? post.permalink.startsWith("http")
        ? post.permalink
        : `https://www.reddit.com${post.permalink}`
      : "https://ecys.xyz/";

    lastPosts.push(post.id);
    if (lastPosts.length > 10) lastPosts.shift();

    factElement.classList.add("fade-out");
    setTimeout(() => {
      updateFact(randomFact, postUrl);
      factElement.classList.remove("fade-out");
      factElement.classList.add("fade-in");
      setTimeout(() => factElement.classList.remove("fade-in"), 1000);
    }, 400);
  };

  loadPool()
    .then(() => {
      displayPost();
      setInterval(displayPost, 15000);
    })
    .catch((error) => {
      console.error("Error loading facts:", error);
      factElement.innerText = "Could not load a fact.";
    });
});
