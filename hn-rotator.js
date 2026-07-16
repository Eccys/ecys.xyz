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

    factElement.classList.add("fade-out");
    setTimeout(function () {
      setFact(fact.title, fact.url);
      factElement.classList.remove("fade-out");
      factElement.classList.add("fade-in");
      setTimeout(function () { factElement.classList.remove("fade-in"); }, 800);
    }, 300);
  }

  function normalizeLocal(data) {
    var list = Array.isArray(data) ? data : (data && data.facts) || [];
    return list.map(function (item, i) {
      return {
        id: item.id || ("local-" + i),
        title: item.title || item.fact || String(item),
        url: item.url || item.permalink || "https://ecys.xyz/",
        score: item.score || 0
      };
    }).filter(function (f) { return f.title && f.title.split(" ").length <= 40; });
  }

  // Hacker News public API (no auth). Top stories by score.
  function loadFromHackerNews() {
    return fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
      credentials: "omit",
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HN topstories HTTP " + res.status);
        return res.json();
      })
      .then(function (ids) {
        var top = (ids || []).slice(0, 30);
        return Promise.all(
          top.map(function (id) {
            return fetch("https://hacker-news.firebaseio.com/v0/item/" + id + ".json", {
              credentials: "omit",
              cache: "no-store"
            }).then(function (r) {
              if (!r.ok) return null;
              return r.json();
            });
          })
        );
      })
      .then(function (items) {
        var stories = (items || [])
          .filter(function (it) {
            return it && it.type === "story" && it.title && typeof it.score === "number";
          })
          .sort(function (a, b) { return b.score - a.score; })
          .slice(0, 20)
          .map(function (it) {
            return {
              id: "hn-" + it.id,
              title: it.title + " (" + it.score + " pts)",
              url: it.url || ("https://news.ycombinator.com/item?id=" + it.id),
              score: it.score
            };
          });
        if (!stories.length) throw new Error("no HN stories");
        return stories;
      });
  }

  function loadFromLocalFacts() {
    return fetch("/facts.json", { credentials: "omit", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("facts.json HTTP " + res.status);
        return res.json();
      })
      .then(normalizeLocal);
  }

  // Prefer live HN top posts; fall back to local facts.json
  loadFromHackerNews()
    .catch(function (err) {
      console.warn("HN failed, using local facts:", err);
      return loadFromLocalFacts();
    })
    .then(function (stories) {
      pool = stories;
      if (!pool.length) throw new Error("empty pool");
      showNext();
      setInterval(showNext, 15000);
    })
    .catch(function (err) {
      console.error("Error loading facts:", err);
    });
});