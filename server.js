const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { runMigrations } = require("./scripts/migrate");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "reviews.json");
const REVIEW_PASSWORD = process.env.REVIEW_PASSWORD || "";

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

function isValidWeekStart(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw Object.assign(new Error("Request body too large"), { status: 413 });
  }
  return body ? JSON.parse(body) : {};
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

function isAuthorized(req) {
  if (!REVIEW_PASSWORD) return true;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const [, password = ""] = decoded.split(":");
  if (Buffer.byteLength(password) !== Buffer.byteLength(REVIEW_PASSWORD)) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(REVIEW_PASSWORD));
}

async function createStore() {
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
      await runMigrations(pool);
      return {
        kind: "postgres",
        async get(weekStart) {
          const result = await pool.query("select payload, locked_at from review_weeks where week_start = $1", [weekStart]);
          if (!result.rows.length) return null;
          return { ...result.rows[0].payload, lockedAt: result.rows[0].locked_at };
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
      if (!isAuthorized(req)) {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Stability Product Review"', "Content-Type": "text/plain; charset=utf-8" });
        res.end("Authentication required");
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === "/healthz") {
        sendJson(res, 200, { ok: true, store: store.kind });
        return;
      }

      if (req.method === "GET" && pathname === "/api/reviews/current") {
        const weekStart = currentMondayISO();
        const review = (await store.get(weekStart)) || (await store.put(weekStart, defaultReview(weekStart)));
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
          const review = (await store.get(weekStart)) || (await store.put(weekStart, defaultReview(weekStart)));
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

  server.listen(PORT, () => {
    console.log(`Stability product review listening on http://localhost:${PORT} (${store.kind})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
