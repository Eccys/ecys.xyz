document.addEventListener("DOMContentLoaded", function () {
  var factElement = document.getElementById("randomFact");
  var factLink = document.getElementById("randomFactLink");
  var lastIds = [];
  var pool = [];

  function setFact(text, href) {
    var words = String(text).split(" ");
    if (words.length > 16) {
      factElement.innerHTML = words.join(" ").replace(/(.{48}\S*)\s+/g, "$1<br />");
    } else {
      factElement.innerText = text;
    }
    if (href) factLink.href = href;
  }

  function showNext() {
    if (!pool.length) return;
    var choices = pool.filter(function (f) { return lastIds.indexOf(f.id) === -1; });
    if (!choices.length) {
      lastIds = [];
      choices = pool.slice();
    }
    var fact = choices[Math.floor(Math.random() * choices.length)];
    lastIds.push(fact.id);
    if (lastIds.length > 12) lastIds.shift();

    // same soft filter as before: skip overly long titles in display path
    if (String(fact.title).split(" ").length > 40) {
      showNext();
      return;
    }

    factElement.classList.add("fade-out");
    setTimeout(function () {
      setFact(fact.title, fact.url);
      factElement.classList.remove("fade-out");
      factElement.classList.add("fade-in");
      setTimeout(function () { factElement.classList.remove("fade-in"); }, 800);
    }, 300);
  }

  // Hacker News: top 10 by points, created in the last 7 days (Algolia HN API)
  function loadHackerNewsWeekTop10() {
    var weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    var url =
      "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=50&numericFilters=" +
      encodeURIComponent("created_at_i>" + weekAgo);

    return fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HN HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var hits = (data && data.hits) || [];
        return hits
          .filter(function (h) { return h && h.title && typeof h.points === "number"; })
          .sort(function (a, b) { return b.points - a.points; })
          .slice(0, 10)
          .map(function (h) {
            return {
              id: "hn-" + h.objectID,
              title: h.title + " (" + h.points + " pts)",
              url: h.url || ("https://news.ycombinator.com/item?id=" + h.objectID),
              score: h.points,
              source: "hn"
            };
          });
      });
  }

  // Reddit r/showerthoughts top 10 — served from on-site cache (live Reddit blocked)
  function loadShowerthoughtsCache() {
    return fetch("/showerthoughts-cache.json", { credentials: "omit", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("showerthoughts-cache HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = (data && data.thoughts) || [];
        return list.slice(0, 10).map(function (t, i) {
          return {
            id: "st-" + (t.id || i),
            title: t.title,
            url: t.url || "https://www.reddit.com/r/showerthoughts/",
            score: t.score || 0,
            source: "reddit"
          };
        }).filter(function (f) { return f.title; });
      });
  }

  Promise.all([
    loadHackerNewsWeekTop10().catch(function (e) {
      console.warn("HN week top failed:", e);
      return [];
    }),
    loadShowerthoughtsCache().catch(function (e) {
      console.warn("Showerthoughts cache failed:", e);
      return [];
    })
  ])
    .then(function (parts) {
      var hn = parts[0] || [];
      var st = parts[1] || [];
      // Prefer HN week top 10, then cached showerthoughts top 10 — same cycle/filter loop
      pool = hn.concat(st);
      if (!pool.length) throw new Error("no items in pool");
      console.info("Footer pool: HN=" + hn.length + " showerthoughts=" + st.length);
      showNext();
      setInterval(showNext, 15000);
    })
    .catch(function (err) {
      console.error("Error loading footer items:", err);
    });
});