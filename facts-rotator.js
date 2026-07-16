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
    if (lastIds.length > 10) lastIds.shift();
    factElement.classList.add("fade-out");
    setTimeout(function () {
      setFact(fact.title, fact.url || "https://ecys.xyz/");
      factElement.classList.remove("fade-out");
      factElement.classList.add("fade-in");
      setTimeout(function () { factElement.classList.remove("fade-in"); }, 800);
    }, 300);
  }

  // Same-origin only — no Reddit / no api.ecys.xyz
  fetch("/facts.json", { credentials: "omit", cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("facts.json HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      var list = Array.isArray(data) ? data : (data.facts || []);
      pool = list.map(function (item, i) {
        return {
          id: item.id || String(i),
          title: item.title || item.fact || String(item),
          url: item.url || item.permalink || "https://ecys.xyz/"
        };
      }).filter(function (f) {
        return f.title && f.title.split(" ").length <= 40;
      });
      if (!pool.length) throw new Error("empty facts");
      showNext();
      setInterval(showNext, 15000);
    })
    .catch(function (err) {
      console.error("Error loading facts:", err);
      // keep static footer text already in HTML
    });
});