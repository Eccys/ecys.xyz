document.addEventListener("DOMContentLoaded", function () {
  var factElement = document.getElementById("randomFact");
  var factLink = document.getElementById("randomFactLink");
  var lastIds = [];
  var pool = [];
  var busy = false;
  var firstSwap = true;
  var FADE_MS = 1000;

  function setFact(text, href) {
    var words = String(text).split(" ");
    if (words.length > 16) {
      factElement.innerHTML = words.join(" ").replace(/(.{48}\S*)\s+/g, "$1<br />");
    } else {
      // Prefer textContent so we don't rebuild DOM mid-transition unnecessarily
      factElement.textContent = text;
    }
    if (href) factLink.href = href;
  }

  function afterTransition(el, cb) {
    var done = false;
    var timer = setTimeout(finish, FADE_MS + 50);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener("transitionend", onEnd);
      cb();
    }
    function onEnd(e) {
      if (e.target !== el || e.propertyName !== "opacity") return;
      finish();
    }
    el.addEventListener("transitionend", onEnd);
  }

  function showNext() {
    if (busy || !pool.length) return;

    var choices = pool.filter(function (f) { return lastIds.indexOf(f.id) === -1; });
    if (!choices.length) {
      lastIds = [];
      choices = pool.slice();
    }

    // Pick a non-overlong title without recursive re-entry
    var fact = null;
    var guard = 0;
    while (guard++ < choices.length + 5) {
      var candidate = choices[Math.floor(Math.random() * choices.length)];
      if (String(candidate.title).split(" ").length <= 40) {
        fact = candidate;
        break;
      }
      // drop bad picks from this round
      choices = choices.filter(function (c) { return c.id !== candidate.id; });
      if (!choices.length) {
        choices = pool.slice();
      }
    }
    if (!fact) return;

    lastIds.push(fact.id);
    if (lastIds.length > 12) lastIds.shift();

    busy = true;

    // First swap: fade out placeholder once, then show first fact (no double animation)
    factElement.classList.add("is-fading");

    afterTransition(factElement, function () {
      setFact(fact.title, fact.url);
      // Force style flush so the next opacity transition always runs cleanly
      void factElement.offsetWidth;
      factElement.classList.remove("is-fading");
      afterTransition(factElement, function () {
        busy = false;
        firstSwap = false;
      });
    });
  }

  function fetchJson(urls) {
    var i = 0;
    function next() {
      if (i >= urls.length) return Promise.reject(new Error("all sources failed"));
      var url = urls[i++];
      return fetch(url, { credentials: "omit", cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error(url + " HTTP " + res.status);
        return res.json();
      }).catch(function () { return next(); });
    }
    return next();
  }

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
        return ((data && data.hits) || [])
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

  function loadShowerthoughtsCache() {
    return fetchJson([
      "/showerthoughts-cache.json",
      "https://cdn.jsdelivr.net/gh/Eccys/ecys.xyz@main/showerthoughts-cache.json",
      "https://raw.githubusercontent.com/Eccys/ecys.xyz/main/showerthoughts-cache.json"
    ]).then(function (data) {
      return ((data && data.thoughts) || []).slice(0, 10).map(function (t, i) {
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
    loadHackerNewsWeekTop10().catch(function (e) { console.warn("HN failed", e); return []; }),
    loadShowerthoughtsCache().catch(function (e) { console.warn("Showerthoughts failed", e); return []; })
  ]).then(function (parts) {
    var hn = parts[0] || [];
    var st = parts[1] || [];
    pool = hn.concat(st);
    if (!pool.length) throw new Error("empty pool");
    console.info("Footer pool HN=" + hn.length + " showerthoughts=" + st.length);
    showNext();
    setInterval(function () {
      if (!busy) showNext();
    }, 15000);
  }).catch(function (err) {
    console.error("Error loading footer items:", err);
  });
});