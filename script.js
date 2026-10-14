document.addEventListener("DOMContentLoaded", function () {
  var factElement = document.getElementById("randomFact");
  var factLink = document.getElementById("randomFactLink");
  if (!factElement || !factLink) return;

  var lastIds = [];
  var pool = [];
  var busy = false;
  var FADE_MS = 5000;

  function isSafeHref(href) {
    if (!href || typeof href !== "string") return false;
    return /^https?:\/\//i.test(href) || /^\/(?!\/)/.test(href);
  }

  function setFact(text, href) {
    var normalized = String(text || "").trim();
    var words = normalized ? normalized.split(/\s+/) : [];
    factElement.textContent = "";

    if (words.length > 16) {
      var lines = words.join(" ").replace(/(.{48}\S*)\s+/g, "$1\n").split("\n");
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) factElement.appendChild(document.createElement("br"));
        factElement.appendChild(document.createTextNode(lines[i]));
      }
    } else {
      factElement.textContent = normalized;
    }

    if (isSafeHref(href)) {
      factLink.href = href;
    } else {
      factLink.href = "https://ecys.xyz/";
    }
  }

  function afterTransition(el, cb) {
    var done = false;
    var timer = setTimeout(finish, FADE_MS + 80);
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

  function isShortEnough(item) {
    return item && item.title && String(item.title).trim().split(/\s+/).length <= 40;
  }

  function showNext() {
    if (busy || !pool.length) return;

    var eligiblePool = pool.filter(isShortEnough);
    if (!eligiblePool.length) eligiblePool = pool.slice();

    var choices = eligiblePool.filter(function (f) { return lastIds.indexOf(f.id) === -1; });
    if (!choices.length) {
      lastIds = [];
      choices = eligiblePool.slice();
    }

    var fact = choices[Math.floor(Math.random() * choices.length)];
    if (!fact) return;

    lastIds.push(fact.id);
    if (lastIds.length > 12) lastIds.shift();

    busy = true;
    factElement.classList.add("is-fading");

    afterTransition(factElement, function () {
      setFact(fact.title, fact.url);
      void factElement.offsetWidth;
      factElement.classList.remove("is-fading");
      afterTransition(factElement, function () {
        busy = false;
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

  function loadFallbackFacts() {
    return fetchJson([
      "/facts.json",
      "https://cdn.jsdelivr.net/gh/Eccys/ecys.xyz@main/facts.json",
      "https://raw.githubusercontent.com/Eccys/ecys.xyz/main/facts.json"
    ]).then(function (data) {
      return ((data && data.facts) || []).map(function (f, i) {
        return {
          id: "fact-" + (f.id || i),
          title: f.title,
          url: f.url || "https://ecys.xyz/",
          score: 0,
          source: "local"
        };
      }).filter(function (f) { return f.title; });
    }).catch(function () { return []; });
  }

  Promise.all([
    loadHackerNewsWeekTop10().catch(function (e) { console.warn("HN failed", e); return []; }),
    loadShowerthoughtsCache().catch(function (e) { console.warn("Showerthoughts failed", e); return []; })
  ]).then(function (parts) {
    var hn = parts[0] || [];
    var st = parts[1] || [];
    var combined = hn.concat(st);
    if (combined.length) return combined;
    return loadFallbackFacts();
  }).then(function (items) {
    pool = items || [];
    if (!pool.length) throw new Error("empty pool");
    console.info("Footer pool loaded: " + pool.length + " items");
    showNext();
    setInterval(function () {
      if (!busy) showNext();
    }, 15000);
  }).catch(function (err) {
    console.error("Error loading footer items:", err);
  });
});