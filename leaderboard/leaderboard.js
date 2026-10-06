// The Fewest Steps board, read from the leaderboard API, in the player's
// language. Every name and number is set with textContent: a display name is
// data, never markup.
//
// The language is, in order: ?lang= in the address, the one picked last time
// on this browser, the browser's own languages, then English.
//
// Add ?demo to the address to see the page with made-up rows, for checking
// the layout without the API (it only answers this site's own origin).

(function () {
  "use strict";

  var API = "https://api.pawsmonaut.games";
  var TOP = 50;
  var STORE = "leaderboard-lang";
  var I18N = window.LEADERBOARD_I18N;
  var demo = /[?&]demo\b/.test(location.search);

  var tabs = document.getElementById("tabs");
  // Market (every finished game) or Full (those that also restored the hidden
  // part of the market). A Full game is on both.
  var cats = document.getElementById("cats");
  var category = "market";
  var statusLine = document.getElementById("status");
  var table = document.getElementById("table");
  var rows = document.getElementById("rows");
  var count = document.getElementById("count");
  var picker = document.getElementById("lang");

  var lang = "en";
  var boards = [];
  var current = null;
  var lastStatus = "loading_boards";

  // --- language ------------------------------------------------------------

  // A browser language tag to one of ours: zh-TW/zh-HK/zh-Hant are
  // Traditional, any other zh is Simplified, pt-BR is Brazilian, any other pt
  // is European, and everything else goes by its first part.
  function match(tag) {
    var t = String(tag || "").toLowerCase().replace(/_/g, "-");
    if (!t) return null;
    if (t.indexOf("zh") === 0) {
      return /-(tw|hk|mo|hant)\b/.test(t) ? "zh_TW" : "zh_CN";
    }
    if (t.indexOf("pt") === 0) return t === "pt-br" ? "pt_BR" : "pt";
    var base = t.split("-")[0];
    return I18N.strings[base] ? base : null;
  }

  function chooseLang() {
    var asked = (location.search.match(/[?&]lang=([A-Za-z_-]+)/) || [])[1];
    if (asked && (I18N.strings[asked] || match(asked))) return I18N.strings[asked] ? asked : match(asked);
    try {
      var stored = localStorage.getItem(STORE);
      if (stored && I18N.strings[stored]) return stored;
    } catch (e) { /* storage blocked: fall through */ }
    var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < wanted.length; i++) {
      var found = match(wanted[i]);
      if (found) return found;
    }
    return "en";
  }

  function t(key) {
    var table = I18N.strings[lang] || I18N.strings.en;
    return table[key] !== undefined ? table[key] : I18N.strings.en[key];
  }

  function fill(text, values) {
    return text.replace(/\{(\w+)\}/g, function (all, name) {
      return values[name] !== undefined ? String(values[name]) : all;
    });
  }

  function num(n) {
    return Number(n).toLocaleString(I18N.bcp47[lang] || "en");
  }

  // A sentence with {settings} and {policy} in it, built as nodes.
  function buildHow2(into) {
    into.textContent = "";
    var parts = t("how_2").split(/(\{settings\}|\{policy\})/);
    parts.forEach(function (part) {
      if (part === "{settings}") {
        var strong = document.createElement("strong");
        strong.textContent = t("settings");
        into.appendChild(strong);
      } else if (part === "{policy}") {
        var a = document.createElement("a");
        a.href = "/privacypolicy.html#leaderboards";
        a.textContent = t("policy");
        into.appendChild(a);
      } else if (part) {
        into.appendChild(document.createTextNode(part));
      }
    });
  }

  function applyLang() {
    document.documentElement.lang = I18N.bcp47[lang] || "en";
    document.title = t("doc_title");
    var marked = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < marked.length; i++) {
      marked[i].textContent = t(marked[i].getAttribute("data-i18n"));
    }
    buildHow2(document.getElementById("how-2"));
    document.getElementById("copyright").textContent =
      fill(t("copyright"), { year: new Date().getFullYear() });
    renderTabs();
    if (current) show(current);
    else say(lastStatus);
  }

  function buildPicker() {
    I18N.order.forEach(function (code) {
      var option = document.createElement("option");
      option.value = code;
      option.textContent = I18N.names[code];
      picker.appendChild(option);
    });
    picker.value = lang;
    picker.addEventListener("change", function () {
      lang = picker.value;
      try { localStorage.setItem(STORE, lang); } catch (e) { /* not remembered */ }
      applyLang();
    });
  }

  // --- the boards ----------------------------------------------------------

  function label(board) {
    if (board === "standard") return t("standard");
    var id = board.replace(/^season:/, "");
    var known = t(id);
    if (known !== undefined) return known;
    id = id.replace(/_/g, " ");
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  function clock(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor(seconds / 60) % 60;
    var s = seconds % 60;
    var mm = (h ? String(m).padStart(2, "0") : String(m));
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }

  function cell(tr, text, cls) {
    var td = document.createElement("td");
    td.textContent = String(text);
    if (cls) td.className = cls;
    tr.appendChild(td);
  }

  function say(key) {
    lastStatus = key;
    statusLine.textContent = t(key);
    statusLine.hidden = false;
    table.hidden = true;
    count.textContent = "";
  }

  function fetchJson(path) {
    if (demo) return Promise.resolve(fake(path));
    return fetch(API + path, { credentials: "omit" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function renderTabs() {
    tabs.textContent = "";
    boards.forEach(function (board) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label(board);
      b.dataset.board = board;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", board === current ? "true" : "false");
      b.addEventListener("click", function () { show(board); });
      tabs.appendChild(b);
    });
  }

  function show(board) {
    current = board;
    for (var i = 0; i < tabs.children.length; i++) {
      var b = tabs.children[i];
      b.setAttribute("aria-selected", b.dataset.board === board ? "true" : "false");
    }
    say("loading");
    var asked = category;
    fetchJson("/v1/boards/" + encodeURIComponent(board) + "?top=" + TOP
        + (category === "full" ? "&category=full" : "")).then(function (data) {
      if (board !== current || asked !== category) return;
      if (!data.top || !data.top.length) {
        say("empty");
        return;
      }
      rows.textContent = "";
      data.top.forEach(function (r) {
        var tr = document.createElement("tr");
        if (r.rank <= 3) tr.className = "r" + r.rank;
        cell(tr, num(r.rank), "rank");
        cell(tr, r.name, "name");
        cell(tr, num(r.steps), "num");
        cell(tr, clock(r.seconds), "num");
        cell(tr, num(r.spells), "num hide-narrow");
        cell(tr, num(r.quicksteps || 0), "num hide-narrow");
        rows.appendChild(tr);
      });
      statusLine.hidden = true;
      table.hidden = false;
      count.textContent = data.of > data.top.length
        ? fill(t("count_top"), { shown: num(data.top.length), total: num(data.of) })
        : data.of === 1 ? t("count_one") : fill(t("count_many"), { total: num(data.of) });
    }).catch(function () {
      if (board === current && asked === category) say("unreachable_board");
    });
  }

  for (var c = 0; c < cats.children.length; c++) {
    cats.children[c].addEventListener("click", function (event) {
      category = event.currentTarget.dataset.cat;
      for (var i = 0; i < cats.children.length; i++) {
        var b = cats.children[i];
        b.setAttribute("aria-selected", b.dataset.cat === category ? "true" : "false");
      }
      if (current) show(current);
    });
  }

  function start() {
    fetchJson("/v1/boards").then(function (data) {
      boards = (data.boards || []).map(function (b) { return b.board; });
      if (boards.indexOf("standard") < 0) boards.unshift("standard");
      renderTabs();
      tabs.hidden = boards.length < 2;
      show(boards[0]);
    }).catch(function () {
      say("unreachable");
    });
  }

  // --- ?demo only ---------------------------------------------------------

  function fake(path) {
    if (path === "/v1/boards") {
      return { boards: [{ board: "standard", players: 214 }, { board: "season:samhainn", players: 37 }] };
    }
    var names = ["Wren", "Pip the Tidy", "Marlo-7", "Дмитрий", "たろう", "Zoë", "O'Brien",
      "Apprentice 4821", "김민수", "Hazel", "Corin", "Mairen", "Bramble", "Tansy", "Rook"];
    var season = path.indexOf("season") >= 0;
    var top = names.slice(0, season ? 6 : names.length).map(function (name, i) {
      return { rank: i + 1, name: name, steps: 611 + i * 37 + (i * i) % 13,
        seconds: 2400 + i * 311, spells: 40 - i * 2, quicksteps: 31 - i * 2 };
    });
    return { board: "x", of: season ? 6 : 1214, rank: null, top: top, around: [] };
  }

  lang = chooseLang();
  buildPicker();
  applyLang();
  start();
})();
