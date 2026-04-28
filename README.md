# Stability Monday Product Review

A lightweight hosted web app for running Monday product reviews without decks.

## What it covers

- Department head overview and team-wide updates
- Team north star goals
- Weekly review lanes: Did Last Week, Doing This Week, Blocked, MVPs Shipped
- Canonical history table for saved weekly snapshots
- Presentation mode for screen sharing the same canonical record without building a deck
- Autosave-backed persistence through an API
- Postgres persistence in production, with a local JSON fallback for development

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

The local server uses `data/reviews.json` when `DATABASE_URL` is not set.

You can still open `index.html` directly from disk for design-only work; it falls back to browser `localStorage`.

## Presentation Mode

- `http://localhost:3000/present`
- `http://localhost:3000/?present=1`

Both views read from the same canonical weekly review payload.

## Railway Deployment

1. Create a Railway project from this repo.
2. Add a Railway Postgres service.
3. Make sure the web service receives `DATABASE_URL`.
4. Optional: set `REVIEW_USERNAME`, `REVIEW_PASSWORD`, and `SESSION_SECRET` to enable sign-in.
5. Deploy with the included `railway.json`.

Railway will run:

```bash
npm start
```

The server runs SQL migrations on startup when `DATABASE_URL` is present. You can also run them manually:

```bash
npm run migrate
```

Health check:

```txt
/healthz
```

## Authentication

When no review users are configured, the app runs open for local development.

For a simple private deployment, set:

```txt
REVIEW_USERNAME=ethan
REVIEW_PASSWORD=your-password
SESSION_SECRET=a-long-random-string
```

For multiple users, set `REVIEW_USERS` to a JSON object:

```json
{"ethan":"password-one","zach":"password-two"}
```

For hashed passwords, generate a hash locally and store it in `REVIEW_PASSWORD_HASH` or as a `REVIEW_USERS` value:

```bash
npm run hash-password -- "your-password"
```

Sessions are signed HTTP-only cookies. `SESSION_TTL_SECONDS` defaults to 7 days.

## API

- `GET /api/reviews/current`
- `GET /api/reviews/:weekStart`
- `PUT /api/reviews/:weekStart`
- `POST /api/reviews/:weekStart/lock`

`weekStart` uses `YYYY-MM-DD`, keyed to the Monday of the review week.

## Database Migrations

Migrations live in `migrations/` and are applied in filename order:

- `001_create_review_weeks.sql`
- `002_create_review_events.sql`

Applied migrations are tracked in `schema_migrations` with a SHA-256 checksum so edited historical migrations fail loudly instead of drifting silently.
