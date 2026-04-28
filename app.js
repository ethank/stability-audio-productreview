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
const LOCAL_WEEKS_KEY = "stability-product-review-weeks";

let review = createDefaultReview();
let selectedTeamId = "research";
let weekStart = parseDateOnly(review.weekStart);
let currentSlide = 0;
let saveTimer = null;
let saveState = "Local fallback";
let activeView = viewFromHash();

const teamList = document.querySelector("#teamList");
const weekLabel = document.querySelector("#weekLabel");
const northStarTeam = document.querySelector("#northStarTeam");
const northStarInput = document.querySelector("#northStarInput");
const historyRows = document.querySelector("#historyRows");
const historyDetailRows = document.querySelector("#historyDetailRows");
const dialog = document.querySelector("#updateDialog");
const presentation = document.querySelector("#presentation");
const presentationStage = document.querySelector("#presentationStage");
const presentationWeek = document.querySelector("#presentationWeek");
const slideCount = document.querySelector("#slideCount");
const headUpdate = document.querySelector("#headUpdate");
const headUpdateLong = document.querySelector("#headUpdateLong");
const saveStateLabel = document.querySelector("#saveState");
const pageTitle = document.querySelector("#pageTitle");
const updatesEditor = document.querySelector("#updatesEditor");
const blockerSummary = document.querySelector("#blockerSummary");
const mvpSummary = document.querySelector("#mvpSummary");
const currentWeekFacts = document.querySelector("#currentWeekFacts");
const departmentSettings = document.querySelector("#departmentSettings");
const reviewTitleInput = document.querySelector("#reviewTitleInput");
const reviewOwnerInput = document.querySelector("#reviewOwnerInput");
const reviewStatusInput = document.querySelector("#reviewStatusInput");
const workflowStatus = document.querySelector("#workflowStatus");
const workflowTitle = document.querySelector("#workflowTitle");
const workflowDescription = document.querySelector("#workflowDescription");
const startBlankWeekButton = document.querySelector("#startBlankWeek");
const startFromPreviousWeekButton = document.querySelector("#startFromPreviousWeek");
const markReadyButton = document.querySelector("#markReady");
const lockWeekFromWorkflowButton = document.querySelector("#lockWeekFromWorkflow");

const VIEW_TITLES = {
  review: "Monday Review",
  updates: "Updates",
  mvps: "MVPs",
  history: "History",
  settings: "Settings",
};

const STATUS_LABELS = {
  not_started: "Not Started",
  draft: "Draft",
  ready: "Ready",
  locked: "Locked",
};

function viewFromHash() {
  const view = window.location.hash.replace("#", "");
  return ["review", "updates", "mvps", "history", "settings"].includes(view) ? view : "review";
}

function setActiveView(view = "review", push = true) {
  activeView = VIEW_TITLES[view] ? view : "review";
  document.querySelectorAll(".app-view").forEach((element) => {
    element.hidden = element.dataset.view !== activeView;
  });
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.classList.toggle("active", link.dataset.viewLink === activeView);
  });
  if (pageTitle) pageTitle.textContent = VIEW_TITLES[activeView];
  if (push && window.location.hash !== `#${activeView}`) {
    const url = new URL(window.location.href);
    url.hash = activeView;
    window.history.replaceState(null, "", url);
  }
}

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

function updateWeekUrl() {
  if (window.location.protocol === "file:") return;
  const url = new URL(window.location.href);
  url.searchParams.set("week", review.weekStart);
  url.hash = activeView;
  window.history.replaceState(null, "", url);
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

function addDaysISO(value, days) {
  return dateOnly(new Date(parseDateOnly(value).getFullYear(), parseDateOnly(value).getMonth(), parseDateOnly(value).getDate() + days));
}

function summarizePreviousWeek(previous) {
  const mvpCount = previous.teams.reduce((sum, team) => sum + team.mvps.length, 0);
  const blockerCount = previous.teams.reduce((sum, team) => sum + team.blocked.length, 0);
  return `${previous.teams.length} departments reported, ${mvpCount} MVPs logged, ${blockerCount} blockers carried into review.`;
}

function rolloverItem(prefix, item) {
  const [title, detail, owner] = item;
  return [title, `${prefix}: ${detail}`, owner];
}

function rolloverReview(previousPayload, nextWeekStart) {
  const previous = normalizeReview(previousPayload);
  return normalizeReview({
    weekStart: nextWeekStart,
    title: previous.title,
    departmentHeadUpdate: `Update from last week: ${summarizePreviousWeek(previous)} Add this week's department-head readout here.`,
    teamWideUpdates: [
      `Update from last week: ${summarizePreviousWeek(previous)}`,
      "This week's priorities: add the cross-team decisions and asks before review.",
    ],
    teams: previous.teams.map((team) => ({
      ...team,
      did: team.doing.map((item) => rolloverItem("Update from last week", item)),
      doing: [],
      blocked: team.blocked.map((item) => rolloverItem("Still blocked from last week", item)),
      mvps: [],
    })),
    history: previous.history,
    status: "draft",
    updatedBy: previous.updatedBy || "Ethan",
    previousWeekStart: previous.weekStart,
    createdFromWeekStart: previous.weekStart,
    lockedAt: null,
  });
}

function blankTeam(team) {
  return {
    ...team,
    did: [],
    doing: [],
    blocked: [],
    mvps: [],
  };
}

function blankReview(targetWeekStart, templatePayload = null) {
  const template = templatePayload ? normalizeReview(templatePayload) : createDefaultReview(targetWeekStart);
  return normalizeReview({
    weekStart: targetWeekStart,
    title: template.title,
    departmentHeadUpdate: "No review record has been started for this week yet.",
    teamWideUpdates: ["No review record has been started for this week yet."],
    teams: template.teams.map(blankTeam),
    history: template.history || [],
    status: "not_started",
    updatedBy: template.updatedBy || "Ethan",
    lockedAt: null,
  });
}

function draftBlankReview(targetWeekStart, templatePayload = null) {
  return {
    ...blankReview(targetWeekStart, templatePayload),
    status: "draft",
    departmentHeadUpdate: "Add this week's department-head update here.",
    teamWideUpdates: [],
  };
}

function ensureDraftStatus() {
  if (review.status === "not_started") review.status = "draft";
}

function isSeededDefaultReview(payload) {
  const review = normalizeReview(payload);
  const fallback = createDefaultReview(review.weekStart);
  return (
    review.status === "draft" &&
    !review.previousWeekStart &&
    !review.createdFromWeekStart &&
    review.departmentHeadUpdate === fallback.departmentHeadUpdate &&
    review.teams.length === DEFAULT_TEAMS.length &&
    review.teams.every((team, index) => {
      const seed = DEFAULT_TEAMS[index];
      return (
        team.id === seed.id &&
        team.did?.length === seed.did.length &&
        team.doing?.length === seed.doing.length &&
        team.blocked?.length === seed.blocked.length &&
        team.mvps?.length === seed.mvps.length
      );
    })
  );
}

function localWeeks() {
  const stored = localStorage.getItem(LOCAL_WEEKS_KEY);
  if (stored) return JSON.parse(stored);
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (!legacy) return {};
  const legacyReview = normalizeReview(JSON.parse(legacy));
  return { [legacyReview.weekStart]: legacyReview };
}

function saveLocalWeek(payload) {
  const weeks = localWeeks();
  weeks[payload.weekStart] = payload;
  localStorage.setItem(LOCAL_WEEKS_KEY, JSON.stringify(weeks));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function localReviewForWeek(targetWeekStart, options = {}) {
  const weeks = localWeeks();
  if (weeks[targetWeekStart]) {
    if (options.emptyIfSeed && isSeededDefaultReview(weeks[targetWeekStart])) {
      weeks[targetWeekStart] = blankReview(targetWeekStart, weeks[targetWeekStart]);
      localStorage.setItem(LOCAL_WEEKS_KEY, JSON.stringify(weeks));
    }
    return normalizeReview(weeks[targetWeekStart]);
  }
  const previousWeekStart = addDaysISO(targetWeekStart, -7);
  const created =
    options.rollover && weeks[previousWeekStart] && weeks[previousWeekStart].status !== "not_started"
      ? rolloverReview(weeks[previousWeekStart], targetWeekStart)
      : blankReview(targetWeekStart, weeks[previousWeekStart]);
  weeks[targetWeekStart] = created;
  localStorage.setItem(LOCAL_WEEKS_KEY, JSON.stringify(weeks));
  return created;
}

function teamReadiness(team) {
  const itemCount = team.did.length + team.doing.length + team.blocked.length + team.mvps.length;
  if (itemCount === 0) return { label: "Missing", className: "missing" };
  if (team.blocked.length) return { label: "Blocked", className: "blocked" };
  return { label: "Updated", className: "updated" };
}

function workflowCopy() {
  const status = review.status || "draft";
  if (status === "not_started") {
    return {
      title: "Start this week",
      description: "Create a blank record or roll last week's commitments forward before teams update.",
    };
  }
  if (status === "ready") {
    return {
      title: "Ready for review",
      description: "Use presentation mode for the meeting, then lock the week as the canonical record.",
    };
  }
  if (status === "locked") {
    return {
      title: "Canonical record locked",
      description: "This week has been locked after review. Export or browse history from here.",
    };
  }
  return {
    title: "Prepare this week",
    description: "Update teams, confirm blockers and MVPs, then mark the record ready for review.",
  };
}

function renderWorkflow() {
  const status = review.status || "draft";
  const copy = workflowCopy();
  workflowStatus.textContent = STATUS_LABELS[status] || status;
  workflowStatus.dataset.status = status;
  workflowTitle.textContent = copy.title;
  workflowDescription.textContent = copy.description;
  startBlankWeekButton.hidden = status !== "not_started";
  startFromPreviousWeekButton.hidden = status !== "not_started";
  markReadyButton.hidden = status !== "draft";
  lockWeekFromWorkflowButton.hidden = status !== "draft" && status !== "ready";
  document.querySelector("#commitmentsStatus").textContent = STATUS_LABELS[status] || status;
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
    const readiness = teamReadiness(team);
    const button = document.createElement("button");
    button.className = `team-button${team.id === selectedTeamId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="team-avatar">${escapeHtml(team.initials)}</span>
      <span>
        <strong>${escapeHtml(team.name)}</strong>
        <small>${escapeHtml(team.members)}</small>
        <em>${escapeHtml(readiness.label)}</em>
      </span>
      <span class="blocker-dot ${readiness.className}" aria-label="${readiness.label}"></span>
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

  team[lane].forEach(([title, detail, owner], index) => {
    const item = document.createElement("article");
    item.className = `review-item${lane === "blocked" ? " blocked-item" : ""}`;
    item.dataset.lane = lane;
    item.dataset.itemIndex = index;
    item.innerHTML = `
      <div class="item-fields">
        <input class="item-title-input" type="text" value="${escapeHtml(title)}" data-item-field="0" aria-label="${lane} title" />
        <textarea class="item-detail-input" data-item-field="1" aria-label="${lane} detail">${escapeHtml(detail)}</textarea>
      </div>
      <div class="item-meta">
        <input class="item-owner-input" type="text" maxlength="4" value="${escapeHtml(owner)}" data-item-field="2" aria-label="${lane} owner" />
        <span class="item-date">Canonical</span>
        <button class="item-delete" type="button" data-delete-item aria-label="Delete item">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    `;
    list.append(item);
  });
}

function renderMetrics() {
  document.querySelector("#teamsReporting").textContent = review.teams.filter((team) => teamReadiness(team).className !== "missing").length;
  document.querySelector("#mvpsShipped").textContent = review.teams.reduce((sum, team) => sum + team.mvps.length, 0);
  document.querySelector("#teamsBlocked").textContent = review.teams.filter((team) => team.blocked.length).length;
  document.querySelector("#commitmentsStatus").textContent = STATUS_LABELS[review.status || "draft"] || review.status || "Draft";
}

function renderHistory() {
  historyRows.innerHTML = "";
  review.history.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("");
    historyRows.append(tr);
  });
}

function renderUpdatesPage() {
  headUpdateLong.value = review.departmentHeadUpdate;
  updatesEditor.innerHTML = "";
  review.teamWideUpdates.forEach((text, index) => {
    const row = document.createElement("div");
    row.className = "editable-row";
    row.innerHTML = `
      <span>${index + 1}</span>
      <input type="text" value="${escapeHtml(text)}" data-update-index="${index}" aria-label="Team-wide update ${index + 1}" />
      <button type="button" data-remove-update="${index}" aria-label="Remove update">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    `;
    updatesEditor.append(row);
  });

  const blockers = allItems("blocked");
  blockerSummary.innerHTML = blockers.length
    ? blockers
        .map(
          ({ team, item }) => `
            <article class="summary-row blocked-summary">
              <span>${escapeHtml(team)}</span>
              <strong>${escapeHtml(item[0])}</strong>
              <small>${escapeHtml(item[1])}</small>
            </article>
          `,
        )
        .join("")
    : '<article class="summary-row"><strong>No open blockers</strong><small>Status is clear for this record.</small></article>';
}

function renderMvpPage() {
  mvpSummary.innerHTML = review.teams
    .map((team) => {
      const rows = team.mvps.length
        ? team.mvps
            .map(
              ([title, detail, owner]) => `
                <article class="mvp-card">
                  <div>
                    <span>${escapeHtml(owner)}</span>
                    <strong>${escapeHtml(title)}</strong>
                    <small>${escapeHtml(detail)}</small>
                  </div>
                  <button type="button" data-select-team="${escapeHtml(team.id)}">Open</button>
                </article>
              `,
            )
            .join("")
        : '<article class="mvp-card empty"><strong>No MVPs logged</strong><small>Add one before the weekly review closes.</small></article>';
      return `
        <section class="mvp-team">
          <header>
            <div>
              <h3>${escapeHtml(team.name)}</h3>
              <p>${escapeHtml(team.northStar)}</p>
            </div>
            <span>${team.mvps.length}</span>
          </header>
          <div>${rows}</div>
        </section>
      `;
    })
    .join("");
}

function renderHistoryPage() {
  const mvpCount = allItems("mvps").length;
  const blockerCount = allItems("blocked").length;
  currentWeekFacts.innerHTML = `
    <div><dt>Week</dt><dd>${escapeHtml(formatDate(weekStart))}</dd></div>
    <div><dt>Status</dt><dd>${escapeHtml(STATUS_LABELS[review.status || "draft"] || review.status || "Draft")}</dd></div>
    <div><dt>Departments</dt><dd>${review.teams.length}</dd></div>
    <div><dt>MVPs</dt><dd>${mvpCount}</dd></div>
    <div><dt>Blockers</dt><dd>${blockerCount}</dd></div>
    <div><dt>Owner</dt><dd>${escapeHtml(review.updatedBy || "Ethan")}</dd></div>
  `;

  historyDetailRows.innerHTML = "";
  review.history.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("");
    historyDetailRows.append(tr);
  });
}

function renderSettingsPage() {
  reviewTitleInput.value = review.title;
  reviewOwnerInput.value = review.updatedBy || "Ethan";
  reviewStatusInput.value = STATUS_LABELS[review.status || "draft"] || review.status || "Draft";
  departmentSettings.innerHTML = review.teams
    .map(
      (team, index) => `
        <section class="department-editor">
          <div class="department-editor-title">
            <span class="team-avatar">${escapeHtml(team.initials)}</span>
            <strong>${escapeHtml(team.name)}</strong>
          </div>
          <label>Name<input type="text" value="${escapeHtml(team.name)}" data-team-index="${index}" data-team-field="name" /></label>
          <label>Initials<input type="text" value="${escapeHtml(team.initials)}" maxlength="4" data-team-index="${index}" data-team-field="initials" /></label>
          <label>Owner<input type="text" value="${escapeHtml(team.owner)}" data-team-index="${index}" data-team-field="owner" /></label>
          <label>Members<input type="text" value="${escapeHtml(team.members)}" data-team-index="${index}" data-team-field="members" /></label>
          <label class="wide-field">North star<textarea data-team-index="${index}" data-team-field="northStar">${escapeHtml(team.northStar)}</textarea></label>
        </section>
      `,
    )
    .join("");
}

function renderApp() {
  const team = selectedTeam();
  renderTeams();
  renderMetrics();
  renderWorkflow();
  renderHistory();
  renderTeamWideUpdates();
  headUpdate.value = review.departmentHeadUpdate;
  headUpdateLong.value = review.departmentHeadUpdate;
  northStarTeam.textContent = `${team.name} - North Star Goal`;
  northStarInput.value = team.northStar;
  ["did", "doing", "blocked", "mvps"].forEach((lane) => renderLane(team, lane));
  renderUpdatesPage();
  renderMvpPage();
  renderHistoryPage();
  renderSettingsPage();
  setActiveView(activeView, false);
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
          <h3>Last week follow-up</h3>
          <ul>${listMarkup(team.did.map((item) => ({ team: team.name, item })), 3)}</ul>
        </section>
        <section>
          <h3>This week commitments</h3>
          <ul>${listMarkup(team.doing.map((item) => ({ team: team.name, item })), 3)}</ul>
        </section>
        <section class="blocked-section">
          <h3>Blockers / asks</h3>
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
            <h3>MVPs / shipped</h3>
            <ul>${listMarkup(allItems("mvps"), 8)}</ul>
          </section>
          <section class="blocked-section">
            <h3>Blockers / asks</h3>
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
    const url = new URL(window.location.href);
    url.searchParams.set("present", "1");
    window.history.replaceState(null, "", url);
  }
}

function closePresentation() {
  presentation.hidden = true;
  document.body.classList.remove("is-presenting");
  const url = new URL(window.location.href);
  url.searchParams.delete("present");
  window.history.replaceState(null, "", url);
}

function changeSlide(direction) {
  currentSlide += direction;
  renderPresentation();
}

async function loadReview(targetWeekStart = null, options = {}) {
  if (window.location.protocol === "file:") {
    review = targetWeekStart ? localReviewForWeek(targetWeekStart, options) : localReviewForWeek(currentMondayISO(), { rollover: true });
    weekStart = parseDateOnly(review.weekStart);
    saveState = "Local file fallback";
    return;
  }

  const params = new URLSearchParams();
  if (options.rollover) params.set("rollover", "1");
  if (options.emptyIfSeed) params.set("emptyIfSeed", "1");
  const query = params.toString();
  const response = await fetch(targetWeekStart ? `/api/reviews/${targetWeekStart}${query ? `?${query}` : ""}` : "/api/reviews/current");
  if (!response.ok) throw new Error(`Could not load review: ${response.status}`);
  review = normalizeReview(await response.json());
  weekStart = parseDateOnly(review.weekStart);
  saveState = "Saved";
}

async function loadWeek(targetWeekStart, options = {}) {
  clearTimeout(saveTimer);
  saveState = "Loading...";
  saveStateLabel.textContent = saveState;
  await loadReview(targetWeekStart, options);
  if (!review.teams.some((team) => team.id === selectedTeamId)) {
    selectedTeamId = review.teams[0]?.id || "research";
  }
  setWeekLabel();
  updateWeekUrl();
  renderApp();
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
  review.updatedBy = review.updatedBy || "Ethan";

  if (window.location.protocol === "file:") {
    saveLocalWeek(review);
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
  ensureDraftStatus();
  callback();
  renderApp();
  scheduleSave();
}

function saveSnapshot() {
  const team = selectedTeam();
  mutateReview(() => {
    review.status = review.status === "locked" ? "locked" : "ready";
    review.history.unshift([
      formatDate(weekStart),
      team.northStar,
      `${team.did.length} completed, ${team.doing.length} active`,
      team.mvps.length,
      team.blocked.length,
      review.updatedBy || "Ethan",
      "Just now",
    ]);
  });
}

async function startBlankWeek() {
  review = draftBlankReview(review.weekStart, review);
  weekStart = parseDateOnly(review.weekStart);
  setWeekLabel();
  renderApp();
  await saveReview();
}

async function previousWeekReview() {
  const previousWeekStart = addDaysISO(review.weekStart, -7);
  if (window.location.protocol === "file:") return localReviewForWeek(previousWeekStart, { emptyIfSeed: true });
  const response = await fetch(`/api/reviews/${previousWeekStart}?emptyIfSeed=1`);
  if (!response.ok) throw new Error(`Could not load previous week: ${response.status}`);
  return normalizeReview(await response.json());
}

async function startFromPreviousWeek() {
  const previous = await previousWeekReview();
  review =
    previous.status && previous.status !== "not_started"
      ? rolloverReview(previous, review.weekStart)
      : draftBlankReview(review.weekStart, previous);
  review.status = "draft";
  weekStart = parseDateOnly(review.weekStart);
  setWeekLabel();
  renderApp();
  await saveReview();
}

function markWeekReady() {
  mutateReview(() => {
    review.status = "ready";
  });
}

async function lockReview() {
  review.status = "locked";
  review.lockedAt = new Date().toISOString();
  renderApp();
  saveState = "Locking...";
  saveStateLabel.textContent = saveState;

  if (window.location.protocol === "file:") {
    saveLocalWeek(review);
    saveState = "Locked locally";
    saveStateLabel.textContent = saveState;
    renderApp();
    return;
  }

  const response = await fetch(`/api/reviews/${review.weekStart}/lock`, { method: "POST" });
  if (!response.ok) throw new Error(`Could not lock review: ${response.status}`);
  review = normalizeReview(await response.json());
  saveState = "Locked";
  saveStateLabel.textContent = saveState;
  renderApp();
}

function exportReview() {
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stability-review-${review.weekStart}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.querySelectorAll("[data-view-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(link.dataset.viewLink);
  });
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.openView));
});

window.addEventListener("hashchange", () => setActiveView(viewFromHash(), false));

document.querySelector("#prevWeek").addEventListener("click", () => {
  loadWeek(addDaysISO(review.weekStart, -7), { rollover: false, emptyIfSeed: true }).catch((error) => {
    console.error(error);
    saveState = "Load failed";
    saveStateLabel.textContent = saveState;
  });
});

document.querySelector("#nextWeek").addEventListener("click", () => {
  loadWeek(addDaysISO(review.weekStart, 7), { rollover: true }).catch((error) => {
    console.error(error);
    saveState = "Load failed";
    saveStateLabel.textContent = saveState;
  });
});

document.querySelector("#todayButton").addEventListener("click", () => {
  loadWeek(currentMondayISO(), { rollover: true }).catch((error) => {
    console.error(error);
    saveState = "Load failed";
    saveStateLabel.textContent = saveState;
  });
});

northStarInput.addEventListener("input", () => {
  mutateReview(() => {
    selectedTeam().northStar = northStarInput.value;
  });
});

headUpdate.addEventListener("input", () => {
  review.departmentHeadUpdate = headUpdate.value;
  headUpdateLong.value = review.departmentHeadUpdate;
  scheduleSave();
});

headUpdateLong.addEventListener("input", () => {
  review.departmentHeadUpdate = headUpdateLong.value;
  headUpdate.value = review.departmentHeadUpdate;
  scheduleSave();
});

document.querySelector("#openUpdate").addEventListener("click", () => dialog.showModal());
document.querySelector("#presentMode").addEventListener("click", openPresentation);
document.querySelector("#exportReview").addEventListener("click", exportReview);
document.querySelector("#exitPresentation").addEventListener("click", closePresentation);
document.querySelector("#prevSlide").addEventListener("click", () => changeSlide(-1));
document.querySelector("#nextSlide").addEventListener("click", () => changeSlide(1));
document.querySelector("#addTeamWideUpdate").addEventListener("click", () => {
  mutateReview(() => review.teamWideUpdates.push("New team-wide update"));
});
document.querySelector("#addMvpFromView").addEventListener("click", () => {
  document.querySelector("#newSection").value = "mvps";
  dialog.showModal();
});
document.querySelector("#saveSnapshotFromHistory").addEventListener("click", saveSnapshot);
document.querySelector("#lockReview").addEventListener("click", () => {
  lockReview().catch((error) => {
    console.error(error);
    saveState = "Lock failed";
    saveStateLabel.textContent = saveState;
  });
});
startBlankWeekButton.addEventListener("click", () => {
  startBlankWeek().catch((error) => {
    console.error(error);
    saveState = "Start failed";
    saveStateLabel.textContent = saveState;
  });
});
startFromPreviousWeekButton.addEventListener("click", () => {
  startFromPreviousWeek().catch((error) => {
    console.error(error);
    saveState = "Start failed";
    saveStateLabel.textContent = saveState;
  });
});
markReadyButton.addEventListener("click", markWeekReady);
lockWeekFromWorkflowButton.addEventListener("click", () => {
  lockReview().catch((error) => {
    console.error(error);
    saveState = "Lock failed";
    saveStateLabel.textContent = saveState;
  });
});
document.querySelector("#addDepartment").addEventListener("click", () => {
  const id = `department-${Date.now()}`;
  mutateReview(() => {
    review.teams.push({
      id,
      name: "New Department",
      initials: "ND",
      northStar: "Define the orientation goal for this department.",
      owner: review.updatedBy || "Ethan",
      members: "Unassigned",
      did: [],
      doing: [],
      blocked: [],
      mvps: [],
    });
    selectedTeamId = id;
  });
});

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

document.querySelector("#saveSnapshot").addEventListener("click", saveSnapshot);

document.querySelectorAll(".items").forEach((list) => {
  list.addEventListener("input", (event) => {
    const field = Number(event.target.dataset.itemField);
    const card = event.target.closest(".review-item");
    if (!card || !Number.isInteger(field)) return;
    const team = selectedTeam();
    const lane = card.dataset.lane;
    const index = Number(card.dataset.itemIndex);
    if (!team[lane]?.[index]) return;
    team[lane][index][field] = field === 2 ? event.target.value.toUpperCase() : event.target.value;
    if (field === 2 && event.target.value !== team[lane][index][field]) {
      event.target.value = team[lane][index][field];
    }
    renderMetrics();
    renderMvpPage();
    renderUpdatesPage();
    renderPresentation();
    scheduleSave();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-item]");
    if (!button) return;
    const card = button.closest(".review-item");
    const team = selectedTeam();
    const lane = card.dataset.lane;
    const index = Number(card.dataset.itemIndex);
    if (!team[lane]?.[index]) return;
    mutateReview(() => team[lane].splice(index, 1));
  });
});

updatesEditor.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.updateIndex);
  if (!Number.isInteger(index)) return;
  review.teamWideUpdates[index] = event.target.value;
  renderTeamWideUpdates();
  scheduleSave();
});

updatesEditor.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-update]");
  if (!button) return;
  mutateReview(() => review.teamWideUpdates.splice(Number(button.dataset.removeUpdate), 1));
});

mvpSummary.addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-team]");
  if (!button) return;
  selectedTeamId = button.dataset.selectTeam;
  setActiveView("review");
  renderApp();
});

reviewTitleInput.addEventListener("input", () => {
  review.title = reviewTitleInput.value;
  scheduleSave();
});

reviewOwnerInput.addEventListener("input", () => {
  review.updatedBy = reviewOwnerInput.value;
  scheduleSave();
});

departmentSettings.addEventListener("input", (event) => {
  const index = Number(event.target.dataset.teamIndex);
  const field = event.target.dataset.teamField;
  if (!Number.isInteger(index) || !field || !review.teams[index]) return;
  review.teams[index][field] = event.target.value;
  if (field === "name" || field === "initials" || field === "members" || field === "northStar") {
    renderTeams();
    const team = selectedTeam();
    northStarTeam.textContent = `${team.name} - North Star Goal`;
    northStarInput.value = team.northStar;
  }
  scheduleSave();
});

loadReview(new URLSearchParams(window.location.search).get("week"))
  .catch((error) => {
    console.error(error);
    const local = localStorage.getItem(STORAGE_KEY);
    review = local ? normalizeReview(JSON.parse(local)) : localReviewForWeek(currentMondayISO());
    weekStart = parseDateOnly(review.weekStart);
    saveState = "Offline fallback";
  })
  .finally(() => {
    setWeekLabel();
    updateWeekUrl();
    renderApp();
    if (new URLSearchParams(window.location.search).has("present") || window.location.pathname.endsWith("/present")) {
      openPresentation();
    }
  });
