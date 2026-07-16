document.addEventListener("DOMContentLoaded", function () {
  const factElement = document.getElementById("randomFact");
  const factLink = document.getElementById("randomFactLink");
  let lastIds = [];
  let pool = [];

  const setFact = (text, href) => {
    const words = String(text).split(" ");
    if (words.length > 16) {
      factElement.innerHTML = words.join(" ").replace(/(.{48}\S*)\s+/g, "$1<br />");
    } else {
      factElement.innerText = text;
    }
    if (href) factLink.href = href;
  };

  const showNext = () => {
    if (!pool.length) {
      factElement.innerText = "No facts available.";
      return;
    }
    let choices = pool.filter((f) => !lastIds.includes(f.id));
    if (!choices.length) {
      lastIds = [];
      choices = pool.slice();
    }
    const fact = choices[Math.floor(Math.random() * choices.length)];
    lastIds.push(fact.id);
    if (lastIds.length > 10) lastIds.shift();

    const href = fact.url || fact.permalink || "https://ecys.xyz/";
    factElement.classList.add("fade-out");
    setTimeout(() => {
      setFact(fact.title || fact.fact, href);
      factElement.classList.remove("fade-out");
      factElement.classList.add("fade-in");
      setTimeout(() => factElement.classList.remove("fade-in"), 800);
    }, 300);
  };

  fetch("/facts.json", { credentials: "omit", cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error("facts.json HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      const list = Array.isArray(data) ? data : data.facts || [];
      pool = list
        .map((item, i) => ({
          id: item.id || String(i),
          title: item.title || item.fact || String(item),
          url: item.url || item.permalink || "https://ecys.xyz/",
        }))
        .filter((f) => f.title && f.title.split(" ").length <= 40);
      if (!pool.length) throw new Error("empty facts pool");
      showNext();
      setInterval(showNext, 15000);
    })
    .catch((err) => {
      console.error("Error loading facts:", err);
      // Keep the static HTML footer text instead of a hard error if possible
      if (!factElement.innerText || /could not load/i.test(factElement.innerText)) {
        factElement.innerText = "Long Live The Thuzad <3";
      }
    });
});