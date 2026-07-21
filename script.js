/* script.js — makes the whole site work.
   It reads data/manifest.json and data/hall_of_fame.json, then handles the tabs,
   the corner numbers, the credits loop, the theme menu, and swaps the
   canvas area between the timeline viewer and the Hall of Fame.

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

/* ---- STATE ------------------------------------------------------------ */
let manifest, hallOfFame;
let view = "70s";       // which main tab is selected
let hofView = "70s";    // which list is selected inside the Hall of Fame
let hofMode = false;    // is the Hall of Fame open?
let revealTimers = [];
let creditNumber = 0;

/* ========================================================================
   1. FUNCTIONS
   ======================================================================== */

/* Load both JSON files, fill in the version line, then open the 70s tab. */
async function start() {
  manifest = await (await fetch("data/manifest.json")).json();
  hallOfFame = await (await fetch("data/hall_of_fame.json")).json();
  document.getElementById("credit-version").textContent = manifest.versionLine;
  buildThemeMenu();
  select("70s");
}

/* Fill in the two corner numbers for a tab: Manufacturers/Games for a
   decade, Arcade Systems/Games for the systems tab. Pass null to clear
   both corners (used by the Hall of Fame, which never shows stats). */
function showStats(tab) {
  const leftLabel = document.getElementById("stat-left-label");
  const leftValue = document.getElementById("stat-left-value");
  const rightLabel = document.getElementById("stat-right-label");
  const rightValue = document.getElementById("stat-right-value");

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
