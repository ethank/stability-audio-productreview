const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { hashPassword, verifyPassword } = require("./lib/passwords");
const { runMigrations } = require("./scripts/migrate");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "reviews.json");
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || "";
const REVIEW_USERNAME = process.env.REVIEW_USERNAME || "ethan";
const REVIEW_PASSWORD_HASH = process.env.REVIEW_PASSWORD_HASH || "";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 7);
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || REVIEW_PASSWORD || REVIEW_PASSWORD_HASH || "local-dev-auth-secret";
const AUTH_REQUIRED =
  process.env.AUTH_REQUIRED === "0" ? false : process.env.AUTH_REQUIRED === "1" || Boolean(process.env.DATABASE_URL) || Boolean(REVIEW_PASSWORD || REVIEW_PASSWORD_HASH || process.env.REVIEW_USERS);
const DB_CONNECTION_TIMEOUT_MS = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000);

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
        users[username.trim().toLowerCase()] = password;
      }
    });
  }

  if (REVIEW_PASSWORD) users[REVIEW_USERNAME.trim().toLowerCase()] = REVIEW_PASSWORD;
  if (REVIEW_PASSWORD_HASH) users[REVIEW_USERNAME.trim().toLowerCase()] = REVIEW_PASSWORD_HASH;
  return users;
}

const REVIEW_USERS = loadReviewUsers();

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateRole(role) {
  return ["admin", "editor", "viewer"].includes(role) ? role : "editor";
}

function requireAdmin(req, res) {
  if (req.authSession?.user?.role === "admin") return true;
  sendError(res, 403, "Admin access required");
  return false;
}

function requireEditor(req, res) {
  if (["admin", "editor"].includes(req.authSession?.user?.role)) return true;
  sendError(res, 403, "Editor access required");
  return false;
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
      <form method="post" action="/auth/callback/credentials">
        <input type="hidden" name="csrfToken" id="csrfToken" />
        <input type="hidden" name="callbackUrl" value="${escapeHtml(next)}" />
        <label>Email or username<input name="username" autocomplete="username" required autofocus /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>
    </main>
    <script>
      fetch("/auth/csrf", { credentials: "same-origin" })
        .then((response) => response.json())
        .then((data) => {
          document.querySelector("#csrfToken").value = data.csrfToken || "";
        });
    </script>
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
        async getUserByEmail(email) {
          const result = await pool.query(
            `select id, email, name, role, password_hash, active, created_at, updated_at
             from review_users
             where lower(email) = lower($1)
             limit 1`,
            [email],
          );
          return result.rows[0] || null;
        },
        async getUserById(id) {
          const result = await pool.query(
            `select id, email, name, role, active, created_at, updated_at
             from review_users
             where id = $1
             limit 1`,
            [id],
          );
          return publicUser(result.rows[0]);
        },
        async listUsers() {
          const result = await pool.query(
            `select id, email, name, role, active, created_at, updated_at
             from review_users
             order by active desc, role, email`,
          );
          return result.rows.map(publicUser);
        },
        async createUser(payload) {
          const result = await pool.query(
            `insert into review_users (email, name, role, password_hash, active)
             values ($1, $2, $3, $4, $5)
             returning id, email, name, role, active, created_at, updated_at`,
            [payload.email, payload.name, payload.role, payload.passwordHash, payload.active],
          );
          return publicUser(result.rows[0]);
        },
        async updateUser(id, payload) {
          const existing = await pool.query("select * from review_users where id = $1", [id]);
          if (!existing.rows.length) return null;
          const current = existing.rows[0];
          const result = await pool.query(
            `update review_users
             set email = $2,
                 name = $3,
                 role = $4,
                 active = $5,
                 password_hash = $6,
                 updated_at = now()
             where id = $1
             returning id, email, name, role, active, created_at, updated_at`,
            [
              id,
              payload.email ?? current.email,
              payload.name ?? current.name,
              payload.role ?? current.role,
              payload.active ?? current.active,
              payload.passwordHash ?? current.password_hash,
            ],
          );
          return publicUser(result.rows[0]);
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
    async getUserByEmail() {
      return null;
    },
    async getUserById() {
      return null;
    },
    async listUsers() {
      return [];
    },
    async createUser() {
      throw Object.assign(new Error("User management requires DATABASE_URL"), { status: 400 });
    },
    async updateUser() {
      throw Object.assign(new Error("User management requires DATABASE_URL"), { status: 400 });
    },
  };
}

async function main() {
  const { ExpressAuth, getSession } = await import("@auth/express");
  const Credentials = (await import("@auth/express/providers/credentials")).default;
  const store = await createStore();

  const authConfig = {
    trustHost: true,
    secret: AUTH_SECRET,
    session: { strategy: "jwt", maxAge: SESSION_TTL_SECONDS },
    pages: { signIn: "/login" },
    providers: [
      Credentials({
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        authorize: async (credentials) => {
          const username = String(credentials?.username || "").trim().toLowerCase();
          const password = String(credentials?.password || "");
          const dbUser = await store.getUserByEmail(username);
          if (dbUser) {
            if (!dbUser.active || !verifyPassword(password, dbUser.password_hash)) {
              return null;
            }
            return { id: String(dbUser.id), email: dbUser.email, name: dbUser.name, role: dbUser.role };
          }
          if (!REVIEW_USERS[username] || !verifyPassword(password, REVIEW_USERS[username])) {
            return null;
          }
          return { id: username, email: username.includes("@") ? username : undefined, name: username, role: "admin" };
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        if (user) {
          token.username = user.email || user.id;
          token.name = user.name || user.email || user.id;
          token.role = user.role || "editor";
        }
        return token;
      },
      async session({ session, token }) {
        session.user = session.user || {};
        const dbUser = token.sub ? await store.getUserById(token.sub) : null;
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.name = dbUser.name;
          session.user.username = dbUser.email;
          session.user.role = dbUser.role;
          return session;
        }
        session.user.id = token.sub;
        session.user.name = token.name || token.username || token.sub;
        session.user.username = token.username || token.sub;
        session.user.role = token.role || "editor";
        return session;
      },
    },
  };

  const app = express();
  app.set("trust proxy", true);

  app.get("/healthz", (req, res) => {
    sendJson(res, 200, { ok: true, store: store.kind });
  });

  app.get("/login", (req, res) => {
    const next = normalizeNextPath(req.query.next || req.query.callbackUrl || "/");
    const error = req.query.error ? "Username or password is incorrect." : "";
    sendHtml(res, 200, loginPage({ error, next }));
  });

  app.use("/auth", ExpressAuth(authConfig));

  app.use(async (req, res, next) => {
    try {
      if (!AUTH_REQUIRED) {
        req.authSession = { user: { username: "local", role: "admin" }, authDisabled: true };
        next();
        return;
      }
      const session = await getSession(req, authConfig);
      if (session?.user) {
        req.authSession = session;
        next();
        return;
      }
      if (isApiRequest(req.path)) {
        sendError(res, 401, "Authentication required");
        return;
      }
      redirect(res, `/login?next=${encodeURIComponent(`${req.path}${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`)}`);
    } catch (error) {
      next(error);
    }
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/session", (req, res) => {
    sendJson(res, 200, {
      id: req.authSession?.user?.id || null,
      username: req.authSession?.user?.username || req.authSession?.user?.name || "local",
      name: req.authSession?.user?.name || req.authSession?.user?.username || "Local",
      role: req.authSession?.user?.role || "viewer",
      authDisabled: Boolean(req.authSession?.authDisabled),
    });
  });

  app.get("/api/me", async (req, res, next) => {
    try {
      if (req.authSession?.authDisabled) {
        sendJson(res, 200, { username: "local", name: "Local", role: "admin", authDisabled: true });
        return;
      }
      const user = await store.getUserById(req.authSession?.user?.id);
      sendJson(res, 200, user || req.authSession.user);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/me", async (req, res, next) => {
    try {
      if (req.authSession?.authDisabled) {
        sendError(res, 400, "Profile editing requires a signed-in user");
        return;
      }
      const payload = {};
      if (typeof req.body.name === "string") payload.name = req.body.name.trim();
      if (typeof req.body.password === "string" && req.body.password) {
        if (req.body.password.length < 12) {
          sendError(res, 400, "Password must be at least 12 characters");
          return;
        }
        payload.passwordHash = hashPassword(req.body.password);
      }
      const user = await store.updateUser(req.authSession.user.id, payload);
      if (!user) {
        sendError(res, 404, "User not found");
        return;
      }
      sendJson(res, 200, user);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users", async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      sendJson(res, 200, { users: await store.listUsers() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users", async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const email = String(req.body.email || "").trim().toLowerCase();
      const name = String(req.body.name || email).trim();
      const password = String(req.body.password || "");
      if (!email || !email.includes("@")) {
        sendError(res, 400, "Valid email is required");
        return;
      }
      if (!password || password.length < 12) {
        sendError(res, 400, "Password must be at least 12 characters");
        return;
      }
      const user = await store.createUser({
        email,
        name,
        role: validateRole(req.body.role),
        passwordHash: hashPassword(password),
        active: req.body.active !== false,
      });
      sendJson(res, 201, user);
    } catch (error) {
      if (error.code === "23505") {
        sendError(res, 409, "User already exists");
        return;
      }
      next(error);
    }
  });

  app.patch("/api/users/:id", async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const payload = {};
      if (typeof req.body.email === "string") payload.email = req.body.email.trim().toLowerCase();
      if (typeof req.body.name === "string") payload.name = req.body.name.trim();
      if (typeof req.body.role === "string") payload.role = validateRole(req.body.role);
      if (typeof req.body.active === "boolean") payload.active = req.body.active;
      if (typeof req.body.password === "string" && req.body.password) {
        if (req.body.password.length < 12) {
          sendError(res, 400, "Password must be at least 12 characters");
          return;
        }
        payload.passwordHash = hashPassword(req.body.password);
      }
      const user = await store.updateUser(req.params.id, payload);
      if (!user) {
        sendError(res, 404, "User not found");
        return;
      }
      sendJson(res, 200, user);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reviews/current", async (req, res, next) => {
    try {
      const weekStart = currentMondayISO();
      const review = await store.getOrCreate(weekStart, { rollover: true });
      sendJson(res, 200, review);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reviews/:weekStart", async (req, res, next) => {
    try {
      const { weekStart } = req.params;
      if (!isValidWeekStart(weekStart)) {
        sendError(res, 400, "Invalid week_start");
        return;
      }
      const review = await store.getOrCreate(weekStart, {
        rollover: req.query.rollover === "1",
        emptyIfSeed: req.query.emptyIfSeed === "1",
      });
      sendJson(res, 200, review);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/reviews/:weekStart", async (req, res, next) => {
    try {
      if (!requireEditor(req, res)) return;
      const { weekStart } = req.params;
      if (!isValidWeekStart(weekStart)) {
        sendError(res, 400, "Invalid week_start");
        return;
      }
      sendJson(res, 200, await store.put(weekStart, req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reviews/:weekStart/lock", async (req, res, next) => {
    try {
      if (!requireEditor(req, res)) return;
      const { weekStart } = req.params;
      if (!isValidWeekStart(weekStart)) {
        sendError(res, 400, "Invalid week_start");
        return;
      }
      sendJson(res, 200, await store.lock(weekStart));
    } catch (error) {
      next(error);
    }
  });

  app.get("/styles.css", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(ROOT, "styles.css"));
  });

  app.get("/app.js", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.sendFile(path.join(ROOT, "app.js"));
  });

  app.use("/assets", express.static(path.join(ROOT, "assets"), { maxAge: "5m" }));

  app.get(["/", "/present"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(ROOT, "index.html"));
  });

  app.get(/^\/(?!api\/).*/, (req, res) => {
    if (path.extname(req.path)) {
      sendError(res, 404, "Not found");
      return;
    }
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(ROOT, "index.html"));
  });

  app.use((error, req, res, next) => {
    console.error(error);
    sendError(res, error.status || 500, error.message || "Server error");
  });

  app.listen(PORT, HOST, () => {
    console.log(`Stability product review listening on http://${HOST}:${PORT} (${store.kind})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
