const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { runMigrations } = require("./scripts/migrate");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "reviews.json");
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || "";
const REVIEW_USERNAME = process.env.REVIEW_USERNAME || "ethan";
const REVIEW_PASSWORD_HASH = process.env.REVIEW_PASSWORD_HASH || "";
const SESSION_COOKIE = "stability_review_session";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7);
const SESSION_SECRET = process.env.SESSION_SECRET || REVIEW_PASSWORD || REVIEW_PASSWORD_HASH || "local-dev-session-secret";
const DB_CONNECTION_TIMEOUT_MS = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

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

function defaultReview(weekStart = currentMondayISO()) {
  return {
    weekStart,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lockedAt: null,
  };
}

function currentMondayISO() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  const zonedDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offset));
  return zonedDate.toISOString().slice(0, 10);
}

function normalizeReview(payload, weekStart) {
  const fallback = defaultReview(weekStart);
  const next = payload && typeof payload === "object" ? payload : fallback;
  return {
    ...fallback,
    ...next,
    weekStart: weekStart || next.weekStart || fallback.weekStart,
    teams: Array.isArray(next.teams) && next.teams.length ? next.teams : fallback.teams,
    history: Array.isArray(next.history) ? next.history : fallback.history,
    teamWideUpdates: Array.isArray(next.teamWideUpdates) ? next.teamWideUpdates : fallback.teamWideUpdates,
    updatedAt: new Date().toISOString(),
  };
}

function addDaysISO(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
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

function rolloverReview(previousPayload, weekStart) {
  const previous = normalizeReview(previousPayload, previousPayload.weekStart);
  return normalizeReview(
    {
      weekStart,
      title: previous.title || "Stability Monday Product Review",
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
      createdAt: new Date().toISOString(),
    },
    weekStart,
  );
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

function blankReview(weekStart, templatePayload = null) {
  const template = templatePayload ? normalizeReview(templatePayload, templatePayload.weekStart) : defaultReview(weekStart);
  return normalizeReview(
    {
      weekStart,
      title: template.title || "Stability Monday Product Review",
      departmentHeadUpdate: "No review record has been started for this week yet.",
      teamWideUpdates: ["No review record has been started for this week yet."],
      teams: template.teams.map(blankTeam),
      history: template.history || [],
      status: "not_started",
      updatedBy: template.updatedBy || "Ethan",
      lockedAt: null,
      createdAt: new Date().toISOString(),
    },
    weekStart,
  );
}

function isSeededDefaultReview(payload, weekStart) {
  const review = normalizeReview(payload, weekStart);
  const defaultHead = defaultReview(weekStart).departmentHeadUpdate;
  return (
    review.status === "draft" &&
    !review.previousWeekStart &&
    !review.createdFromWeekStart &&
    review.departmentHeadUpdate === defaultHead &&
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

function isValidWeekStart(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function readTextBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw Object.assign(new Error("Request body too large"), { status: 413 });
  }
  return body;
}

async function readJsonBody(req) {
  const body = await readTextBody(req);
  return body ? JSON.parse(body) : {};
}

async function readFormBody(req) {
  const body = await readTextBody(req);
  return Object.fromEntries(new URLSearchParams(body));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(html);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...headers });
  res.end();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadReviewUsers() {
  const users = {};
  if (process.env.REVIEW_USERS) {
    let parsed;
    try {
      parsed = JSON.parse(process.env.REVIEW_USERS);
    } catch {
      throw new Error("REVIEW_USERS must be a JSON object like {\"ethan\":\"password\"}");
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("REVIEW_USERS must be a JSON object like {\"ethan\":\"password\"}");
    }
    Object.entries(parsed).forEach(([username, password]) => {
      if (typeof username === "string" && typeof password === "string" && username && password) {
        users[username] = password;
      }
    });
  }

  if (REVIEW_PASSWORD) users[REVIEW_USERNAME] = REVIEW_PASSWORD;
  if (REVIEW_PASSWORD_HASH) users[REVIEW_USERNAME] = REVIEW_PASSWORD_HASH;
  return users;
}

const REVIEW_USERS = loadReviewUsers();
const AUTH_ENABLED = Object.keys(REVIEW_USERS).length > 0;

function timingSafeEqualString(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyPassword(input, stored) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, expected] = stored.split("$");
    if (!salt || !expected) return false;
    const expectedBuffer = Buffer.from(expected, "base64url");
    const actualBuffer = crypto.scryptSync(input, Buffer.from(salt, "base64url"), expectedBuffer.length);
    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  }
  return timingSafeEqualString(input, stored);
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  header.split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSessionToken(username) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: username,
      exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !timingSafeEqualString(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.sub || !session.exp || session.exp < Date.now()) return null;
    return session.sub;
  } catch {
    return null;
  }
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) parts.push("Secure");
  return parts.join("; ");
}

function currentUser(req) {
  if (!AUTH_ENABLED) return { username: "local", authDisabled: true };
  const username = readSessionToken(parseCookies(req)[SESSION_COOKIE]);
  return username && REVIEW_USERS[username] ? { username } : null;
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
}

function loginPage({ error = "", next = "/" } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sign in - Stability Product Review</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f4ef;
        --surface: #fffdf8;
        --ink: #17211f;
        --muted: #68716d;
        --line: #ded8cc;
        --teal: #166a64;
        --red: #b8483b;
        --font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font);
      }
      main {
        width: min(100%, 420px);
        padding: 28px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 14px 34px rgba(38, 31, 19, 0.08);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 28px;
        font-weight: 780;
      }
      svg {
        width: 24px;
        height: 24px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
        color: var(--teal);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 26px;
        line-height: 1.08;
      }
      p {
        margin: 0 0 22px;
        color: var(--muted);
        line-height: 1.45;
      }
      label {
        display: grid;
        gap: 7px;
        margin-top: 14px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 760;
        text-transform: uppercase;
      }
      input {
        width: 100%;
        min-height: 44px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: var(--ink);
        font: inherit;
        padding: 10px 12px;
      }
      button {
        width: 100%;
        min-height: 46px;
        margin-top: 22px;
        border: 1px solid #0f544f;
        border-radius: 7px;
        background: var(--teal);
        color: #fff;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      .error {
        margin: 16px 0 0;
        padding: 10px 12px;
        border: 1px solid #e2afa5;
        border-radius: 7px;
        background: #f8e7e2;
        color: var(--red);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></svg>
        <span>Stability Product Review</span>
      </div>
      <h1>Sign in</h1>
      <p>Use your review account to open the canonical weekly record.</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/login">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <label>Username<input name="username" autocomplete="username" required autofocus /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`;
}

function normalizeNextPath(value) {
  if (!value || typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function databaseSslConfig() {
  if (process.env.PGSSLMODE === "disable") return false;
  if (process.env.PGSSLMODE === "require") return { rejectUnauthorized: false };
  if (/sslmode=require/.test(process.env.DATABASE_URL || "")) return { rejectUnauthorized: false };
  return false;
}

async function createStore() {
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
        ssl: databaseSslConfig(),
      });
      await runMigrations(pool);
      return {
        kind: "postgres",
        async get(weekStart) {
          const result = await pool.query("select payload, locked_at from review_weeks where week_start = $1", [weekStart]);
          if (!result.rows.length) return null;
          return { ...result.rows[0].payload, lockedAt: result.rows[0].locked_at };
        },
        async getOrCreate(weekStart, options = {}) {
          const existing = await this.get(weekStart);
          if (existing) {
            if (options.emptyIfSeed && isSeededDefaultReview(existing, weekStart)) {
              return this.put(weekStart, blankReview(weekStart, existing));
            }
            return existing;
          }
          const previous = await this.get(addDaysISO(weekStart, -7));
          if (options.rollover && previous && previous.status !== "not_started") {
            return this.put(weekStart, rolloverReview(previous, weekStart));
          }
          return this.put(weekStart, blankReview(weekStart, previous));
        },
        async put(weekStart, payload) {
          const review = normalizeReview(payload, weekStart);
          await pool.query(
            `insert into review_weeks (week_start, payload, status, locked_at, updated_at)
             values ($1, $2::jsonb, $3, $4, now())
             on conflict (week_start)
             do update set payload = excluded.payload, status = excluded.status, locked_at = excluded.locked_at, updated_at = now()`,
            [weekStart, JSON.stringify(review), review.status || "draft", review.lockedAt || null],
          );
          return review;
        },
        async lock(weekStart) {
          const existing = (await this.get(weekStart)) || defaultReview(weekStart);
          const locked = normalizeReview({ ...existing, status: "locked", lockedAt: new Date().toISOString() }, weekStart);
          return this.put(weekStart, locked);
        },
      };
    } catch (error) {
      console.warn(`Postgres unavailable, falling back to local JSON store: ${error.message}`);
    }
  }

  return {
    kind: "file",
    async readAll() {
      try {
        return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
      } catch {
        return { reviews: {} };
      }
    },
    async writeAll(data) {
      await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
      const tmp = `${DATA_FILE}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, DATA_FILE);
    },
    async get(weekStart) {
      const data = await this.readAll();
      return data.reviews[weekStart] || null;
    },
    async getOrCreate(weekStart, options = {}) {
      const existing = await this.get(weekStart);
      if (existing) {
        if (options.emptyIfSeed && isSeededDefaultReview(existing, weekStart)) {
          return this.put(weekStart, blankReview(weekStart, existing));
        }
        return existing;
      }
      const previous = await this.get(addDaysISO(weekStart, -7));
      if (options.rollover && previous && previous.status !== "not_started") {
        return this.put(weekStart, rolloverReview(previous, weekStart));
      }
      return this.put(weekStart, blankReview(weekStart, previous));
    },
    async put(weekStart, payload) {
      const data = await this.readAll();
      const review = normalizeReview(payload, weekStart);
      data.reviews[weekStart] = review;
      await this.writeAll(data);
      return review;
    },
    async lock(weekStart) {
      const existing = (await this.get(weekStart)) || defaultReview(weekStart);
      const locked = normalizeReview({ ...existing, status: "locked", lockedAt: new Date().toISOString() }, weekStart);
      return this.put(weekStart, locked);
    },
  };
}

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" || pathname === "/present" ? path.join(ROOT, "index.html") : path.join(ROOT, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ROOT)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
    const ext = path.extname(resolved);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    res.end(await fs.readFile(resolved));
  } catch (error) {
    if (!path.extname(pathname)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(await fs.readFile(path.join(ROOT, "index.html")));
      return;
    }
    sendError(res, 404, "Not found");
  }
}

async function main() {
  const store = await createStore();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === "/healthz") {
        sendJson(res, 200, { ok: true, store: store.kind });
        return;
      }

      if (req.method === "GET" && pathname === "/login") {
        const user = currentUser(req);
        const next = normalizeNextPath(url.searchParams.get("next") || "/");
        if (user) {
          redirect(res, next);
          return;
        }
        sendHtml(res, 200, loginPage({ next }));
        return;
      }

      if (req.method === "POST" && pathname === "/login") {
        const form = await readFormBody(req);
        const username = String(form.username || "").trim();
        const password = String(form.password || "");
        const next = normalizeNextPath(form.next || "/");
        if (REVIEW_USERS[username] && verifyPassword(password, REVIEW_USERS[username])) {
          redirect(res, next, { "Set-Cookie": sessionCookie(createSessionToken(username)) });
          return;
        }
        sendHtml(res, 401, loginPage({ error: "Username or password is incorrect.", next }));
        return;
      }

      if (req.method === "POST" && pathname === "/logout") {
        redirect(res, "/login", { "Set-Cookie": sessionCookie("", 0) });
        return;
      }

      const user = currentUser(req);
      if (!user) {
        if (isApiRequest(pathname)) {
          sendError(res, 401, "Authentication required");
          return;
        }
        const next = encodeURIComponent(`${url.pathname}${url.search}`);
        redirect(res, `/login?next=${next}`);
        return;
      }

      if (req.method === "GET" && pathname === "/api/session") {
        sendJson(res, 200, { username: user.username, authDisabled: Boolean(user.authDisabled) });
        return;
      }

      if (req.method === "GET" && pathname === "/api/reviews/current") {
        const weekStart = currentMondayISO();
        const review = await store.getOrCreate(weekStart, { rollover: true });
        sendJson(res, 200, review);
        return;
      }

      const reviewMatch = pathname.match(/^\/api\/reviews\/(\d{4}-\d{2}-\d{2})(\/lock)?$/);
      if (reviewMatch) {
        const [, weekStart, lockPath] = reviewMatch;
        if (!isValidWeekStart(weekStart)) {
          sendError(res, 400, "Invalid week_start");
          return;
        }
        if (req.method === "GET" && !lockPath) {
          const review = await store.getOrCreate(weekStart, {
            rollover: url.searchParams.get("rollover") === "1",
            emptyIfSeed: url.searchParams.get("emptyIfSeed") === "1",
          });
          sendJson(res, 200, review);
          return;
        }
        if (req.method === "PUT" && !lockPath) {
          const payload = await readJsonBody(req);
          sendJson(res, 200, await store.put(weekStart, payload));
          return;
        }
        if (req.method === "POST" && lockPath) {
          sendJson(res, 200, await store.lock(weekStart));
          return;
        }
      }

      if (req.method === "GET") {
        await serveStatic(req, res, pathname);
        return;
      }

      sendError(res, 404, "Not found");
    } catch (error) {
      console.error(error);
      sendError(res, error.status || 500, error.message || "Server error");
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Stability product review listening on http://${HOST}:${PORT} (${store.kind})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
