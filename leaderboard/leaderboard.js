// The Fewest Steps board, read from the leaderboard API. Every name and number
// is set with textContent: a display name is data, never markup.
//
// Add ?demo to the address to see the page with made-up rows, for checking
// the layout without the API (it only answers this site's own origin).

(function () {
  "use strict";

  var API = "https://api.pawsmonaut.games";
  var TOP = 50;
  var demo = /[?&]demo\b/.test(location.search);

  var tabs = document.getElementById("tabs");
  var statusLine = document.getElementById("status");
  var table = document.getElementById("table");
  var rows = document.getElementById("rows");
  var count = document.getElementById("count");

  function label(board) {
    if (board === "standard") return "Standard";
    var id = board.replace(/^season:/, "").replace(/_/g, " ");
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

  function say(text) {
    statusLine.textContent = text;
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

  function show(board) {
    for (var i = 0; i < tabs.children.length; i++) {
      var b = tabs.children[i];
      b.setAttribute("aria-selected", b.dataset.board === board ? "true" : "false");
    }
    say("Loading...");
    fetchJson("/v1/boards/" + encodeURIComponent(board) + "?top=" + TOP).then(function (data) {
      if (!data.top || !data.top.length) {
        say("No runs on this board yet. Be the first.");
        return;
      }
      rows.textContent = "";
      data.top.forEach(function (r) {
        var tr = document.createElement("tr");
        if (r.rank <= 3) tr.className = "r" + r.rank;
        cell(tr, r.rank, "rank");
        cell(tr, r.name, "name");
        cell(tr, r.steps.toLocaleString(), "num");
        cell(tr, clock(r.seconds), "num");
        cell(tr, r.spells.toLocaleString(), "num hide-narrow");
        rows.appendChild(tr);
      });
      statusLine.hidden = true;
      table.hidden = false;
      count.textContent = data.of > data.top.length
        ? "Showing the top " + data.top.length + " of " + data.of.toLocaleString() + " players."
        : data.of === 1 ? "1 player." : data.of.toLocaleString() + " players.";
    }).catch(function () {
      say("The board could not be reached. Try again in a moment.");
    });
  }

  function start() {
    fetchJson("/v1/boards").then(function (data) {
      var boards = (data.boards || []).map(function (b) { return b.board; });
      if (boards.indexOf("standard") < 0) boards.unshift("standard");
      tabs.textContent = "";
      boards.forEach(function (board) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = label(board);
        b.dataset.board = board;
        b.setAttribute("role", "tab");
        b.addEventListener("click", function () { show(board); });
        tabs.appendChild(b);
      });
      tabs.setAttribute("role", "tablist");
      tabs.hidden = boards.length < 2;
      show(boards[0]);
    }).catch(function () {
      say("The leaderboard could not be reached. Try again in a moment.");
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
        seconds: 2400 + i * 311, spells: 40 - i * 2 };
    });
    return { board: "x", of: season ? 6 : 214, rank: null, top: top, around: [] };
  }

  start();
})();
