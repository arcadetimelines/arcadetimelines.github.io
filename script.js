/* script.js — makes the whole site work.
   It reads data/manifest.json and data/hall_of_fame.json, then handles the tabs,
   the corner numbers, the credits loop, the theme menu, the holiday
   decorations, and swaps the canvas area between the timeline viewer
   and the Hall of Fame.

   Want to change WHEN a holiday decoration shows up? See
   DECORATION_DATES just below.

   The file has two parts:
   1. FUNCTIONS — everything the site knows how to do. Nothing in this
      part runs by itself; it just describes what should happen.
   2. WIRE EVERYTHING UP — the very bottom of the file. This is the
      part that actually runs when the page loads: it hooks the
      functions above up to buttons, and starts things going. */

/* ---- DOM ELEMENTS ---------------------------------------------------- */
const tabs = document.querySelectorAll(".tab[data-tab]");
const hofButtons = document.querySelectorAll(".tab[data-hof]");
const hofToggle = document.getElementById("hof-toggle");
const timelineWrap = document.getElementById("timeline-wrap");
const frame = document.getElementById("timeline-frame");
const placeholder = document.getElementById("timeline-placeholder");
const maximizeBtn = document.getElementById("maximize-btn");
const iconMaximize = document.getElementById("icon-maximize");
const iconMinimize = document.getElementById("icon-minimize");
const hofWrap = document.getElementById("hof-wrap");
const hofList = document.getElementById("hof-list");
const themeMenu = document.getElementById("theme-menu");
const themeToggle = document.getElementById("theme-toggle");
const credits = document.querySelectorAll(".credit");
const hud = document.querySelector(".hud");
const helpToggle = document.getElementById("help-toggle");
const helpOverlay = document.getElementById("help-overlay");
const helpSteps = document.querySelectorAll(".help-step");
const linksToggle = document.getElementById("links-toggle");
const linksOverlay = document.getElementById("links-overlay");
const linksItems = document.querySelectorAll(".links-item");
const frontendToggle = document.getElementById("frontend-toggle");
const frontendOverlay = document.getElementById("frontend-overlay");
const frontendItems = document.querySelectorAll(".frontend-reveal");
const flagCounter = document.getElementById("flag-counter");
const neonLogo = document.querySelector(".neon-logo");
const mameVersion = document.getElementById("mame-version");

/* ---- STATE ------------------------------------------------------------ */
let manifest, hallOfFame;
let view = "70s";       // which main tab is selected
let hofView = "70s";    // which list is selected inside the Hall of Fame
let hofMode = false;    // is the Hall of Fame open?
let revealTimers = [];
let helpTimers = [];
let linksTimers = [];
let frontendTimers = [];
let creditNumber = 0;

/* ---- HOLIDAY DATES (safe to edit) --------------------------------------
   Each decoration switches itself on between these two dates, every year,
   and off again afterwards. Nothing else needs changing.

   - Dates are written "month-day": "12-01" means December 1st.
     Always use two digits ("02-07", not "2-7"). Both days count.
   - A range may run over New Year: "12-29" to "01-02" works fine.
   - Easter moves every year, so it is set as a number of days before and
     after Easter Sunday instead. The site works out Easter Sunday itself.
   - Two decorations may overlap (e.g. Christmas and New Year at the end
     of December): both show at the same time.

   To force a decoration on any day (for testing), set it to true in
   data/manifest.json. That always wins over these dates. */
const DECORATION_DATES = {
  halloween: { from: "10-20", to: "11-01" },  // Oct 20 – Nov 1
  christmas: { from: "12-01", to: "12-31" },  // Dec 1 – Dec 31 (includes snow)
  newYear:   { from: "12-29", to: "01-02" },  // Dec 29 – Jan 2 (fireworks + glasses)
  snow:      { from: "01-03", to: "01-31" },  // Jan 3 – Jan 31 (just the snow)
  valentine: { from: "02-07", to: "02-15" },  // Feb 7 – Feb 15
  easter:    { daysBefore: 7, daysAfter: 1 }  // a week before Easter Sunday – Easter Monday
};

/* ========================================================================
   1. FUNCTIONS
   ======================================================================== */

/* Load both JSON files, fill in the version line, then open the 70s tab. */
async function start() {
  manifest = await (await fetch("data/manifest.json")).json();
  hallOfFame = await (await fetch("data/hall_of_fame.json")).json();
  document.getElementById("credit-version").textContent = manifest.versionLine;
  showDecorations();
  fillFrontend();
  buildThemeMenu();
  startMameTicker();
  select("70s");
}

/* Holiday decorations. Each one is on when today is inside its dates in
   DECORATION_DATES (above), or when it is set to true in
   data/manifest.json. The decoration's name is put on the <body> as a
   class (e.g. <body class="christmas newYear">), and styles.css only
   shows the decorations whose class is on the <body>. */
const DECORATIONS = ["halloween", "christmas", "snow", "newYear", "easter", "valentine"];

function showDecorations() {
  for (const name of DECORATIONS) {
    document.body.classList.toggle(name, isDecorationOn(name));
  }

  const isOn = name => document.body.classList.contains(name);
  // Christmas always has snow; "snow" on its own gives just the snow.
  if (isOn("christmas") || isOn("snow")) makeSnow();
  if (isOn("newYear")) makeFireworks();
  if (isOn("valentine")) makeHearts();
}

/* Should this decoration show today?
   1. true in data/manifest.json  -> yes, whatever the date.
   2. "decorationsByDate": false  -> no (only forced ones show).
   3. otherwise                   -> yes if today is inside its dates. */
function isDecorationOn(name) {
  if (manifest[name] === true) return true;
  if (manifest.decorationsByDate === false) return false;
  return isInDateRange(DECORATION_DATES[name], new Date());
}

/* Is the given day inside a range from DECORATION_DATES? */
function isInDateRange(range, today) {
  if (!range) return false;

  // Easter: count days around this year's Easter Sunday.
  if (range.daysBefore !== undefined) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const easter = easterSunday(today.getFullYear());
    const from = new Date(easter);
    from.setDate(easter.getDate() - range.daysBefore);
    const to = new Date(easter);
    to.setDate(easter.getDate() + range.daysAfter);
    return day >= from && day <= to;
  }

  // Everything else: compare "month-day" text, e.g. "11-13".
  // Because both are always two digits, "01-31" < "02-07" < "12-01".
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");
  const now = month + "-" + date;

  if (range.from <= range.to) {
    return now >= range.from && now <= range.to;
  }
  // The range runs over New Year (e.g. "12-29" to "01-02").
  return now >= range.from || now <= range.to;
}

/* The date of Easter Sunday in a given year. This is the standard
   church calendar formula (the "Anonymous Gregorian algorithm") —
   safe to skip over, it just works. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/* Drop snowflakes at random spots, sizes and speeds, so the snow
   doesn't fall in a visible pattern. */
function makeSnow() {
  const snow = document.getElementById("decor-snow");
  for (let i = 0; i < 18; i++) {
    const flake = document.createElement("img");
    flake.src = "decorations/snowflake.svg";
    flake.alt = "";
    flake.style.left = Math.random() * 100 + "%";
    flake.style.width = 7 + Math.round(Math.random() * 3) * 2 + "px";
    flake.style.animationDuration = 7 + Math.random() * 6 + "s";
    flake.style.animationDelay = -Math.random() * 13 + "s";
    snow.appendChild(flake);
  }
}

/* New Year's Eve fireworks: a few bursts that pop, fade, and then pop
   again somewhere else, in a random color. Like the snow, each one gets
   its own random speed so they never go off in step. */
function makeFireworks() {
  const sky = document.getElementById("decor-fireworks");
  for (let i = 0; i < 6; i++) {
    const firework = document.createElement("img");
    firework.alt = "";
    firework.style.animationDuration = 2.4 + Math.random() * 1.6 + "s";
    firework.style.animationDelay = -Math.random() * 4 + "s";
    placeFirework(firework);
    // Every time a burst has faded out, move it to a new spot.
    firework.addEventListener("animationiteration", () => placeFirework(firework));
    sky.appendChild(firework);
  }
}

/* Pick a color, a size and a spot for one firework. They stay out to
   the left and right so the logo in the middle stays readable. */
function placeFirework(firework) {
  const color = 1 + Math.floor(Math.random() * 4);          // firework1.svg ... firework4.svg
  firework.src = "decorations/firework" + color + ".svg";
  const onLeft = Math.random() < 0.5;
  firework.style.left = (onLeft ? 1 + Math.random() * 24 : 70 + Math.random() * 24) + "%";
  firework.style.top = 60 + Math.random() * 100 + "px";   // below the corner numbers
  firework.style.width = (2 + Math.floor(Math.random() * 3)) * 17 + "px";  // 34, 51 or 68px
}

/* Valentine's Day: little hearts floating up, at random spots, sizes
   and speeds (the snow in reverse). */
function makeHearts() {
  const hearts = document.getElementById("decor-hearts");
  for (let i = 0; i < 14; i++) {
    const heart = document.createElement("img");
    heart.src = "decorations/heart_small.svg";
    heart.alt = "";
    heart.style.left = Math.random() * 100 + "%";
    heart.style.width = 14 + Math.round(Math.random() * 2) * 7 + "px";  // 14, 21 or 28px
    heart.style.animationDuration = 8 + Math.random() * 6 + "s";
    heart.style.animationDelay = -Math.random() * 14 + "s";
    hearts.appendChild(heart);
  }
}

/* Fill in the two corner numbers for a tab: Manufacturers/Games for a
   decade, Arcade Systems/Games for the systems tab. Pass null to clear
   both corners (used by the Hall of Fame, which never shows stats). */
function showStats(tab) {
  const leftLabel = document.getElementById("stat-left-label");
  const leftValue = document.getElementById("stat-left-value");
  const rightLabel = document.getElementById("stat-right-label");
  const rightValue = document.getElementById("stat-right-value");

  // Hides the little ghosts too whenever the stats are cleared.
  hud.classList.toggle("hud--empty", !tab);

  if (!tab) {
    leftLabel.textContent = "";
    leftValue.textContent = "";
    rightLabel.textContent = "";
    rightValue.textContent = "";
    return;
  }

  const isSystems = tab.systems !== undefined;
  if (isSystems) {
    leftLabel.textContent = "Arcade Systems";
    leftValue.textContent = String(tab.systems).padStart(3, "0");
  } else {
    leftLabel.textContent = "Manufacturers";
    leftValue.textContent = String(tab.manufacturers).padStart(3, "0");
  }

  rightLabel.textContent = "Games";
  rightValue.textContent = String(tab.games).padStart(4, "0");
}

/* Turn a theme file's address into its marketplace name:
   ".../themes/mocha/mocha.json" becomes "mocha". */
function themeId(themeFile) {
  return themeFile.split("/").pop().replace(".json", "");
}

/* Point the frame at a timeline, shown in the same theme as the site.
   The frame can only show links that end in ".timeline". */
function setFrame(url, themeFile) {
  const isTimeline = url.endsWith(".timeline");

  if (isTimeline) {
    frame.src = url + "?theme=" + themeId(themeFile);
  } else {
    frame.src = "about:blank";
  }

  frame.hidden = !isTimeline;
  maximizeBtn.hidden = !isTimeline;
  placeholder.hidden = isTimeline;
}

/* Main tabs: always show that tab's timeline (and close the Hall of Fame). */
function select(name) {
  view = name;
  hofMode = false;
  const tab = manifest.tabs[name];
  showStats(tab);
  applyTheme(tab.theme);

  timelineWrap.hidden = false;
  hofWrap.hidden = true;
  setFrame(tab.url, tab.theme);

  tabs.forEach(button => button.classList.toggle("is-active", button.dataset.tab === name));
  hofToggle.classList.remove("is-active");
}

/* Buttons inside the Hall of Fame: show a decade's top 10, or the
   manufacturers list. The corner stats are always empty in the Hall
   of Fame, regardless of which decade or list is selected. */
function selectHof(name) {
  hofView = name;
  hofMode = true;
  const isMakers = name === "manufacturers";
  const tab = manifest.tabs[isMakers ? "Arcade Systems" : name];
  showStats(null);
  applyTheme(tab.theme);

  timelineWrap.hidden = true;
  hofWrap.hidden = false;
  fillHallOfFame(name);

  tabs.forEach(button => button.classList.remove("is-active"));
  hofToggle.classList.add("is-active");
  hofButtons.forEach(button => button.classList.toggle("is-active", button.dataset.hof === name));
}

/* The Hall of Fame button opens it, or closes it back to the timeline. */
function toggleHallOfFame() {
  if (hofMode) {
    select(view);
  } else {
    selectHof(hofView);
  }
}

/* Build the Hall of Fame rows, then reveal them one at a time,
   high-score style. */
function fillHallOfFame(name) {
  const isMakers = name === "manufacturers";
  document.getElementById("col-a").textContent = isMakers ? "Manufacturer" : "Game";
  document.getElementById("col-b").textContent = isMakers ? "" : "Manufacturer";
  document.getElementById("col-c").textContent = isMakers ? "Top 10s" : "Year";

  revealTimers.forEach(clearTimeout);
  revealTimers = [];
  hofList.innerHTML = "";
  const rows = isMakers ? manufacturerRows() : hallOfFame[name].top10;
  rows.forEach((entry, i) => {
    const row = document.createElement("li");
    row.className = "hof-row";
    row.innerHTML =
      `<span class="hof-rank">${i + 1}.</span>` +
      `<span class="hof-game">${entry.game}</span>` +
      `<span class="hof-maker">${entry.manufacturer}</span>` +
      `<span class="hof-year">${entry.year}</span>`;
    hofList.appendChild(row);
    revealTimers.push(setTimeout(() => row.classList.add("is-revealed"), 300 + i * 220));
  });
}

/* Count how often each manufacturer appears in the four decade lists,
   then keep the 10 with the biggest counts. */
function manufacturerRows() {
  const counts = {};
  for (const decade of ["70s", "80s", "90s", "2000s"])
    for (const entry of hallOfFame[decade].top10)
      counts[entry.manufacturer] = (counts[entry.manufacturer] || 0) + 1;

  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 10)
    .map(name => ({ game: name, manufacturer: "", year: "x " + counts[name] }));
}

/* The footer's copyright-warning line is red by default, but red is
   unreadable on some theme backgrounds — so it falls back to black
   whenever the current --app-bg doesn't give it enough contrast.
   (This math is the trickiest part of the file — safe to skip over.) */
const WARNING_RED = "#ff3b3b";

function relativeLuminance(hex) {
  const [r, g, b] = hex.replace("#", "").match(/.{2}/g).map(part => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA) + 0.05;
  const b = relativeLuminance(hexB) + 0.05;
  return a > b ? a / b : b / a;
}

function updateWarningColor(appBg) {
  const legible = contrastRatio(WARNING_RED, appBg) >= 4.5;
  document.documentElement.style.setProperty("--footer-warning-color", legible ? WARNING_RED : "#000000");
}

/* Redraw the ghost favicon in the given color (the same shape as the
   CSS ghosts), so the tab icon always matches the current theme. */
function updateFavicon(color) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 24">` +
    `<path fill="${color}" d="M0 24V11a11 11 0 0 1 22 0v13z"/>` +
    `<circle cx="6.5" cy="9.5" r="2.5" fill="#ffffff"/>` +
    `<circle cx="15.5" cy="9.5" r="2.5" fill="#ffffff"/>` +
    `</svg>`;
  document.getElementById("favicon").href = "data:image/svg+xml," + encodeURIComponent(svg);
}

/* Paint the site's colors from a theme file. Each color in the file
   becomes a CSS variable, so "app-bg" becomes --app-bg in styles.css. */
async function applyTheme(url) {
  try {
    const theme = await (await fetch(url)).json();
    for (const key in theme.colors) {
      document.documentElement.style.setProperty("--" + key, theme.colors[key]);
    }
    document.getElementById("theme-value").textContent = theme.name.toUpperCase();
    updateWarningColor(theme.colors["app-bg"] || "#000000");
    updateFavicon(theme.colors["ui-muted"] || "#1ea0ff");
  } catch (error) {
    console.warn("Could not load theme:", url, error);
  }
}

/* The theme menu: one button per theme listed in data/manifest.json. */
function buildThemeMenu() {
  for (const [name, url] of Object.entries(manifest.themes)) {
    const option = document.createElement("button");
    option.className = "theme-option";
    option.textContent = name;
    option.onclick = () => {
      applyTheme(url);
      themeMenu.hidden = true;
      // Repaint the timeline in the new theme too.
      if (!timelineWrap.hidden) setFrame(manifest.tabs[view].url, url);
    };
    themeMenu.appendChild(option);
  }
}

/* Open or close the theme menu. */
function toggleThemeMenu() {
  themeMenu.hidden = !themeMenu.hidden;
}

/* The help panel: intro shows right away, then the 7 steps reveal one
   at a time, same rhythm as the Hall of Fame rows. */
function openHelp() {
  closeLinks();
  closeFrontend();
  helpOverlay.hidden = false;
  helpToggle.classList.add("is-active");
  helpTimers.forEach(clearTimeout);
  helpTimers = [];
  helpSteps.forEach(step => step.classList.remove("is-revealed"));
  helpSteps.forEach((step, i) => {
    helpTimers.push(setTimeout(() => step.classList.add("is-revealed"), 300 + i * 220));
  });
}

function closeHelp() {
  helpOverlay.hidden = true;
  helpToggle.classList.remove("is-active");
  helpTimers.forEach(clearTimeout);
  helpTimers = [];
}

/* The links panel: same window as the help panel, and the entries
   reveal one at a time the same way. Only one panel is open at a time. */
function openLinks() {
  closeHelp();
  closeFrontend();
  linksOverlay.hidden = false;
  linksToggle.classList.add("is-active");
  linksTimers.forEach(clearTimeout);
  linksTimers = [];
  linksItems.forEach(item => item.classList.remove("is-revealed"));
  linksItems.forEach((item, i) => {
    linksTimers.push(setTimeout(() => item.classList.add("is-revealed"), 300 + i * 220));
  });
}

function closeLinks() {
  linksOverlay.hidden = true;
  linksToggle.classList.remove("is-active");
  linksTimers.forEach(clearTimeout);
  linksTimers = [];
}

/* The MAME frontend panel: fill in its text, download link and
   screenshot from "mameFrontend" in data/manifest.json. */
function fillFrontend() {
  const info = manifest.mameFrontend || {};
  const link = document.getElementById("frontend-link");
  const screenshot = document.getElementById("frontend-screenshot");

  document.getElementById("frontend-text").textContent = info.text || "";

  if (info.downloadUrl) {
    link.href = info.downloadUrl;
    link.textContent = info.downloadText || "Download";
  } else {
    // No address filled in yet: show plain text instead of a dead link.
    link.removeAttribute("href");
    link.textContent = "Download link coming soon";
  }

  // The screenshot only appears once it has loaded, so a missing or
  // misspelled file just leaves it out instead of showing a broken image.
  // The window sizes itself around the picture (see styles.css).
  if (info.screenshot) {
    screenshot.onload = () => { screenshot.hidden = false; };
    screenshot.onerror = () => { screenshot.hidden = true; };
    screenshot.src = info.screenshot;
  }
}

/* Same window and the same one-at-a-time reveal as the links panel.
   Only one panel is open at a time. */
function openFrontend() {
  closeHelp();
  closeLinks();
  frontendOverlay.hidden = false;
  frontendToggle.classList.add("is-active");
  frontendTimers.forEach(clearTimeout);
  frontendTimers = [];
  frontendItems.forEach(item => item.classList.remove("is-revealed"));
  frontendItems.forEach((item, i) => {
    frontendTimers.push(setTimeout(() => item.classList.add("is-revealed"), 300 + i * 220));
  });
}

function closeFrontend() {
  frontendOverlay.hidden = true;
  frontendToggle.classList.remove("is-active");
  frontendTimers.forEach(clearTimeout);
  frontendTimers = [];
}

/* The MAME version in the bottom-left corner: typed out one character
   at a time ("M", "MA", "MAM", ...), held for 10 seconds, then again.
   The number comes from the same manifest line as the credits loop. */
function startMameTicker() {
  const match = manifest.versionLine.match(/MAME\s+[\d.]+/);
  const text = match ? match[0] : "MAME";
  let shown = 0;

  (function type() {
    shown++;
    mameVersion.textContent = text.slice(0, shown);
    if (shown < text.length) {
      setTimeout(type, 180);
    } else {
      setTimeout(() => { shown = 0; type(); }, 10000);
    }
  })();
}

/* The credits loop: show each .credit item in turn, forever.
   data-hold in the HTML says how long each one stays on screen. */
function nextCredit() {
  const item = credits[creditNumber % credits.length];
  creditNumber++;
  item.classList.add("is-showing");
  setTimeout(() => {
    item.classList.remove("is-showing");
    setTimeout(nextCredit, 500);
  }, item.dataset.hold);
}

/* ========================================================================
   2. WIRE EVERYTHING UP
   This is the part that actually runs when the page loads.
   ======================================================================== */

tabs.forEach(button => {
  button.onclick = () => select(button.dataset.tab);
});

hofButtons.forEach(button => {
  button.onclick = () => selectHof(button.dataset.hof);
});

hofToggle.onclick = toggleHallOfFame;
themeToggle.onclick = toggleThemeMenu;

helpToggle.onclick = () => (helpOverlay.hidden ? openHelp() : closeHelp());

/* Clicking the dark area around the panel closes it. */
helpOverlay.onclick = event => {
  if (event.target === helpOverlay) closeHelp();
};

linksToggle.onclick = () => (linksOverlay.hidden ? openLinks() : closeLinks());

linksOverlay.onclick = event => {
  if (event.target === linksOverlay) closeLinks();
};

frontendToggle.onclick = () => (frontendOverlay.hidden ? openFrontend() : closeFrontend());

frontendOverlay.onclick = event => {
  if (event.target === frontendOverlay) closeFrontend();
};

let cKeyHeld = false;

function isCKey(event) {
  return event.code === "KeyC" || event.key.toLowerCase() === "c";
}

window.addEventListener("keydown", event => {
  if (isCKey(event)) cKeyHeld = true;
});

window.addEventListener("keyup", event => {
  if (isCKey(event)) cKeyHeld = false;
});

window.addEventListener("blur", () => { cKeyHeld = false; });

neonLogo.addEventListener("mouseenter", () => neonLogo.focus({ preventScroll: true }));

neonLogo.addEventListener("click", event => {
  if (event.shiftKey && cKeyHeld) flagCounter.hidden = !flagCounter.hidden;
});

/* Fullscreen the whole timeline area (not just the iframe), so the
   maximize button stays on top of it and can flip into an exit button. */
maximizeBtn.onclick = () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    timelineWrap.requestFullscreen();
  }
};

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = document.fullscreenElement === timelineWrap;
  iconMaximize.hidden = isFullscreen;
  iconMinimize.hidden = !isFullscreen;
  maximizeBtn.title = isFullscreen ? "Exit fullscreen" : "Open timeline in fullscreen";
  maximizeBtn.setAttribute("aria-label", maximizeBtn.title);
});

start().catch(() => alert(
  "Could not load data/manifest.json / data/hall_of_fame.json.\n" +
  "Run 'python -m http.server' in this folder, then open http://localhost:8000"
));

nextCredit();
