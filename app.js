const DEFAULT_TEAMS = [
  {
    id: "research",
    name: "Research",
    initials: "RS",
    northStar: "Turn model progress into audible product advantages that creators can reliably feel.",
    owner: "Zach",
    members: "Zach + research team",
    did: [
      ["Audio quality eval pass", "Reviewed latest generation set and tagged recurring artifacts.", "ZK"],
      ["Prompt guard experiments", "Validated stronger instrumental-only behavior across edge genres.", "RS"],
      ["Model comparison notes", "Summarized tradeoffs for latency, coherence, and mix quality.", "ZK"],
    ],
    doing: [
      ["Weekly quality bar", "Define the minimum audible standard before a feature enters beta.", "ZK"],
      ["Regression suite refresh", "Add cases for vocals, noisy endings, and structure drift.", "RS"],
      ["Research-to-product readout", "Convert experiments into decisions Product and Eng can execute.", "ZK"],
    ],
    blocked: [["Eval sample coverage", "Need final list of product-critical genres and use cases.", "ZK"]],
    mvps: [
      ["Instrumental regression set", "First version ready for team review.", "RS"],
      ["Quality taxonomy", "Shared language for evaluating output defects.", "ZK"],
    ],
  },
  {
    id: "engineering",
    name: "Engineering",
    initials: "EN",
    northStar: "Make Stability audio workflows fast, dependable, observable, and easy to ship.",
    owner: "Matt",
    members: "Matt, Shawn, Anna",
    did: [
      ["Generation reliability sweep", "Closed the highest-frequency timeout and retry issues.", "MT"],
      ["Export path cleanup", "Reduced ambiguity between preview, final render, and download states.", "SW"],
      ["Observability hooks", "Added better traces around generation and asset handoff.", "AN"],
    ],
    doing: [
      ["Presentation review app", "Turn weekly review into a canonical product surface.", "AN"],
      ["Queue health dashboard", "Make stalls and provider failures visible before review.", "SW"],
      ["Beta hardening list", "Prioritize blockers that affect creator-facing demos.", "MT"],
    ],
    blocked: [
      ["Provider SLA assumptions", "Need decision on acceptable failover behavior.", "MT"],
      ["Analytics event names", "Waiting on Product's final naming pass.", "AN"],
    ],
    mvps: [
      ["Retry behavior v2", "Better recovery from transient provider failures.", "SW"],
      ["Trace links in review notes", "Faster diagnosis during Monday walkthrough.", "AN"],
      ["Export state cleanup", "Cleaner handoff between generate and download.", "MT"],
    ],
  },
  {
    id: "product",
    name: "Product",
    initials: "PD",
    northStar: "Keep the team oriented around the few audio bets that create the most creator value.",
    owner: "Ethan",
    members: "Ethan",
    did: [
      ["Review ritual clarified", "Moved Monday review away from decks and toward a canonical record.", "EK"],
      ["Dept structure mapped", "Research, Engineering, and Product are the top-level review units.", "EK"],
      ["North star format drafted", "Each department now has a durable orientation statement.", "EK"],
    ],
    doing: [
      ["Weekly MVP definition", "Clarify what counts as an MVP for product review.", "EK"],
      ["Decision log shape", "Make open decisions and blockers visible in the record.", "EK"],
      ["Team update standards", "Tighten update format so review stays fast.", "EK"],
    ],
    blocked: [],
    mvps: [["Canonical review app MVP", "Usable first version for Monday product review.", "EK"]],
  },
];

const DEFAULT_HISTORY = [
  ["May 5, 2025", "Faster dependable audio workflows", "Reliability sweep, eval taxonomy, review ritual clarified", 6, 2, "Ethan", "Fri 4:18 PM"],
  ["Apr 28, 2025", "Clearer creator value bets", "Export cleanup, no-vocal guardrails, beta hardening", 5, 3, "Ethan", "Mon 5:43 PM"],
  ["Apr 21, 2025", "Audible model quality gains", "Research readout, observability hooks, MVP language", 4, 1, "Ethan", "Mon 4:56 PM"],
];

const STORAGE_KEY = "stability-product-review-current";

let review = createDefaultReview();
let selectedTeamId = "research";
let weekStart = parseDateOnly(review.weekStart);
let currentSlide = 0;
let saveTimer = null;
let saveState = "Local fallback";

const teamList = document.querySelector("#teamList");
const weekLabel = document.querySelector("#weekLabel");
const northStarTeam = document.querySelector("#northStarTeam");
const northStarInput = document.querySelector("#northStarInput");
const historyRows = document.querySelector("#historyRows");
const dialog = document.querySelector("#updateDialog");
const presentation = document.querySelector("#presentation");
const presentationStage = document.querySelector("#presentationStage");
const presentationWeek = document.querySelector("#presentationWeek");
const slideCount = document.querySelector("#slideCount");
const headUpdate = document.querySelector("#headUpdate");
const saveStateLabel = document.querySelector("#saveState");

function createDefaultReview(week = currentMondayISO()) {
  return {
    weekStart: week,
    title: "Stability Monday Product Review",
    departmentHeadUpdate:
      "This week's review is focused on turning Stability Audio progress into a canonical operating record: what moved, what is next, what needs escalation, and which MVPs matter most. Keep updates concrete enough to share live without rebuilding a deck.",
    teamWideUpdates: [
      "Monday review replaces the weekly deck",
      "Each department owns a north star",
      "Blockers should become explicit asks",
    ],
    teams: structuredClone(DEFAULT_TEAMS),
    history: structuredClone(DEFAULT_HISTORY),
    status: "draft",
    updatedBy: "Ethan",
  };
}

function currentMondayISO() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return dateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset));
}

function dateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function selectedTeam() {
  return review.teams.find((team) => team.id === selectedTeamId) || review.teams[0];
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function weekRange() {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return `Week of ${formatDate(weekStart)} - ${formatDate(end)}`;
}

function setWeekLabel() {
  review.weekStart = dateOnly(weekStart);
  weekLabel.textContent = weekRange();
  presentationWeek.textContent = weekRange();
}

function allItems(lane) {
  return review.teams.flatMap((team) => team[lane].map((item) => ({ team: team.name, item })));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeReview(payload) {
  const fallback = createDefaultReview();
  const next = payload && typeof payload === "object" ? payload : fallback;
  return {
    ...fallback,
    ...next,
    teams: Array.isArray(next.teams) && next.teams.length ? next.teams : fallback.teams,
    history: Array.isArray(next.history) ? next.history : fallback.history,
    teamWideUpdates: Array.isArray(next.teamWideUpdates) ? next.teamWideUpdates : fallback.teamWideUpdates,
  };
}

function renderTeamWideUpdates() {
  const list = document.querySelector("#teamWideUpdates");
  list.innerHTML = "";
  review.teamWideUpdates.forEach((text, index) => {
    const li = document.createElement("li");
    const icon =
      index === 0
        ? '<rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" />'
        : index === 1
          ? '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" />'
          : '<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />';
    li.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>${escapeHtml(text)}`;
    list.append(li);
  });
}

function renderTeams() {
  teamList.innerHTML = "";
  review.teams.forEach((team) => {
    const button = document.createElement("button");
    button.className = `team-button${team.id === selectedTeamId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="team-avatar">${escapeHtml(team.initials)}</span>
      <span>
        <strong>${escapeHtml(team.name)}</strong>
        <small>${escapeHtml(team.members)}</small>
      </span>
      <span class="blocker-dot${team.blocked.length ? " has-blocker" : ""}" aria-label="${team.blocked.length ? "Blocked" : "No blockers"}"></span>
    `;
    button.addEventListener("click", () => {
      selectedTeamId = team.id;
      renderApp();
    });
    teamList.append(button);
  });
}

function renderLane(team, lane) {
  const list = document.querySelector(`#${lane}Items`);
  const counter = document.querySelector(`#${lane}Count`);
  list.innerHTML = "";
  counter.textContent = team[lane].length;

  team[lane].forEach(([title, detail, owner]) => {
    const item = document.createElement("article");
    item.className = `review-item${lane === "blocked" ? " blocked-item" : ""}`;
    item.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(title)}</div>
        <div class="item-detail">${escapeHtml(detail)}</div>
      </div>
      <div class="item-meta">
        <span class="item-owner">${escapeHtml(owner)}</span>
        <span class="item-date">Canonical</span>
      </div>
    `;
    list.append(item);
  });
}

function renderMetrics() {
  document.querySelector("#teamsReporting").textContent = review.teams.length;
  document.querySelector("#mvpsShipped").textContent = review.teams.reduce((sum, team) => sum + team.mvps.length, 0);
  document.querySelector("#teamsBlocked").textContent = review.teams.filter((team) => team.blocked.length).length;
}

function renderHistory() {
  historyRows.innerHTML = "";
  review.history.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("");
    historyRows.append(tr);
  });
}

function renderApp() {
  const team = selectedTeam();
  renderTeams();
  renderMetrics();
  renderHistory();
  renderTeamWideUpdates();
  headUpdate.value = review.departmentHeadUpdate;
  northStarTeam.textContent = `${team.name} - North Star Goal`;
  northStarInput.value = team.northStar;
  ["did", "doing", "blocked", "mvps"].forEach((lane) => renderLane(team, lane));
  saveStateLabel.textContent = saveState;
  if (!presentation.hidden) renderPresentation();
}

function listMarkup(items, maxItems = 4) {
  return items
    .slice(0, maxItems)
    .map(({ team, item }) => `
      <li>
        <span>${escapeHtml(team)}</span>
        <strong>${escapeHtml(item[0])}</strong>
        <small>${escapeHtml(item[1])}</small>
      </li>
    `)
    .join("");
}

function teamSlide(team) {
  return `
    <article class="presentation-slide department-slide">
      <div class="slide-kicker">${escapeHtml(team.members)}</div>
      <h2>${escapeHtml(team.name)}</h2>
      <p class="slide-north-star">${escapeHtml(team.northStar)}</p>
      <div class="slide-grid">
        <section>
          <h3>Did</h3>
          <ul>${listMarkup(team.did.map((item) => ({ team: team.name, item })), 3)}</ul>
        </section>
        <section>
          <h3>Doing</h3>
          <ul>${listMarkup(team.doing.map((item) => ({ team: team.name, item })), 3)}</ul>
        </section>
        <section class="blocked-section">
          <h3>Blocked</h3>
          <ul>${team.blocked.length ? listMarkup(team.blocked.map((item) => ({ team: team.name, item })), 3) : "<li><strong>No blockers</strong><small>Nothing requiring dept-head escalation.</small></li>"}</ul>
        </section>
        <section class="mvp-section">
          <h3>MVPs</h3>
          <ul>${listMarkup(team.mvps.map((item) => ({ team: team.name, item })), 3)}</ul>
        </section>
      </div>
    </article>
  `;
}

function slides() {
  return [
    `
      <article class="presentation-slide overview-slide">
        <div class="slide-kicker">Department Head Overview</div>
        <h2>${escapeHtml(review.title)}</h2>
        <p>${escapeHtml(review.departmentHeadUpdate)}</p>
        <div class="presentation-metrics">
          <div><span>${review.teams.length}</span><strong>Departments</strong></div>
          <div><span>${allItems("mvps").length}</span><strong>MVPs</strong></div>
          <div><span>${review.teams.filter((team) => team.blocked.length).length}</span><strong>Blocked</strong></div>
          <div><span>${allItems("doing").length}</span><strong>Active this week</strong></div>
        </div>
        <div class="dept-strip">
          ${review.teams.map((team) => `<section><strong>${escapeHtml(team.name)}</strong><span>${escapeHtml(team.northStar)}</span></section>`).join("")}
        </div>
      </article>
    `,
    ...review.teams.map(teamSlide),
    `
      <article class="presentation-slide mvp-summary-slide">
        <div class="slide-kicker">Weekly MVPs and Escalations</div>
        <h2>What ships, what needs help</h2>
        <div class="slide-grid two-col">
          <section class="mvp-section">
            <h3>MVPs for the week</h3>
            <ul>${listMarkup(allItems("mvps"), 8)}</ul>
          </section>
          <section class="blocked-section">
            <h3>Blocked</h3>
            <ul>${listMarkup(allItems("blocked"), 8)}</ul>
          </section>
        </div>
      </article>
    `,
  ];
}

function renderPresentation() {
  const deck = slides();
  currentSlide = Math.max(0, Math.min(currentSlide, deck.length - 1));
  presentationStage.innerHTML = deck[currentSlide];
  slideCount.textContent = `${currentSlide + 1} / ${deck.length}`;
  presentationWeek.textContent = weekRange();
}

function openPresentation() {
  currentSlide = 0;
  presentation.hidden = false;
  document.body.classList.add("is-presenting");
  renderPresentation();
  if (!new URLSearchParams(window.location.search).has("present")) {
    window.history.replaceState(null, "", `${window.location.pathname}?present=1`);
  }
}

function closePresentation() {
  presentation.hidden = true;
  document.body.classList.remove("is-presenting");
  window.history.replaceState(null, "", window.location.pathname);
}

function changeSlide(direction) {
  currentSlide += direction;
  renderPresentation();
}

async function loadReview() {
  if (window.location.protocol === "file:") {
    const local = localStorage.getItem(STORAGE_KEY);
    review = normalizeReview(local ? JSON.parse(local) : createDefaultReview());
    weekStart = parseDateOnly(review.weekStart);
    saveState = "Local file fallback";
    return;
  }

  const response = await fetch("/api/reviews/current");
  if (!response.ok) throw new Error(`Could not load review: ${response.status}`);
  review = normalizeReview(await response.json());
  weekStart = parseDateOnly(review.weekStart);
  saveState = "Saved";
}

function scheduleSave() {
  saveState = "Saving...";
  saveStateLabel.textContent = saveState;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveReview, 450);
}

async function saveReview() {
  review.departmentHeadUpdate = headUpdate.value;
  review.weekStart = dateOnly(weekStart);
  review.updatedBy = "Ethan";

  if (window.location.protocol === "file:") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
    saveState = "Saved locally";
    saveStateLabel.textContent = saveState;
    return;
  }

  const response = await fetch(`/api/reviews/${review.weekStart}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review),
  });
  if (!response.ok) throw new Error(`Could not save review: ${response.status}`);
  review = normalizeReview(await response.json());
  saveState = "Saved";
  saveStateLabel.textContent = saveState;
}

function mutateReview(callback) {
  callback();
  renderApp();
  scheduleSave();
}

document.querySelector("#prevWeek").addEventListener("click", () => {
  mutateReview(() => {
    weekStart.setDate(weekStart.getDate() - 7);
    setWeekLabel();
  });
});

document.querySelector("#nextWeek").addEventListener("click", () => {
  mutateReview(() => {
    weekStart.setDate(weekStart.getDate() + 7);
    setWeekLabel();
  });
});

document.querySelector("#todayButton").addEventListener("click", () => {
  mutateReview(() => {
    weekStart = parseDateOnly(currentMondayISO());
    setWeekLabel();
  });
});

northStarInput.addEventListener("input", () => {
  mutateReview(() => {
    selectedTeam().northStar = northStarInput.value;
  });
});

headUpdate.addEventListener("input", () => {
  review.departmentHeadUpdate = headUpdate.value;
  scheduleSave();
});

document.querySelector("#openUpdate").addEventListener("click", () => dialog.showModal());
document.querySelector("#presentMode").addEventListener("click", openPresentation);
document.querySelector("#exitPresentation").addEventListener("click", closePresentation);
document.querySelector("#prevSlide").addEventListener("click", () => changeSlide(-1));
document.querySelector("#nextSlide").addEventListener("click", () => changeSlide(1));

document.addEventListener("keydown", (event) => {
  if (presentation.hidden) return;
  if (event.key === "Escape") closePresentation();
  if (event.key === "ArrowLeft") changeSlide(-1);
  if (event.key === "ArrowRight") changeSlide(1);
});

document.querySelectorAll(".add-row").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#newSection").value = button.dataset.add;
    dialog.showModal();
  });
});

document.querySelector("#createUpdate").addEventListener("click", (event) => {
  event.preventDefault();
  const section = document.querySelector("#newSection").value;
  const title = document.querySelector("#newTitle").value.trim();
  const detail = document.querySelector("#newDetail").value.trim();
  const owner = document.querySelector("#newOwner").value.trim().toUpperCase() || "EK";
  if (!title) return;

  mutateReview(() => {
    selectedTeam()[section].unshift([title, detail || "Added during Monday product review.", owner]);
    document.querySelector("#newTitle").value = "";
    document.querySelector("#newDetail").value = "";
    document.querySelector("#newOwner").value = "";
    dialog.close();
  });
});

document.querySelector("#saveSnapshot").addEventListener("click", () => {
  const team = selectedTeam();
  mutateReview(() => {
    review.history.unshift([
      formatDate(weekStart),
      team.northStar,
      `${team.did.length} completed, ${team.doing.length} active`,
      team.mvps.length,
      team.blocked.length,
      "Ethan",
      "Just now",
    ]);
  });
});

loadReview()
  .catch((error) => {
    console.error(error);
    const local = localStorage.getItem(STORAGE_KEY);
    review = normalizeReview(local ? JSON.parse(local) : createDefaultReview());
    weekStart = parseDateOnly(review.weekStart);
    saveState = "Offline fallback";
  })
  .finally(() => {
    setWeekLabel();
    renderApp();
    if (new URLSearchParams(window.location.search).has("present") || window.location.pathname.endsWith("/present")) {
      openPresentation();
    }
  });
