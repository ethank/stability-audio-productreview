const fs = require("fs/promises");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const DB_CONNECTION_TIMEOUT_MS = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000);

function databaseSslConfig() {
  if (process.env.PGSSLMODE === "disable") return false;
  if (process.env.PGSSLMODE === "require") return { rejectUnauthorized: false };
  if (/sslmode=require/.test(process.env.DATABASE_URL || "")) return { rejectUnauthorized: false };
  return false;
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      checksum text not null,
      executed_at timestamptz not null default now()
    )
  `);
}

async function migrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
}

async function checksum(contents) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function runMigrations(pool) {
  await ensureMigrationsTable(pool);

  for (const filename of await migrationFiles()) {
    const fullPath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(fullPath, "utf8");
    const hash = await checksum(sql);
    const applied = await pool.query("select checksum from schema_migrations where filename = $1", [filename]);

    if (applied.rows.length) {
      if (applied.rows[0].checksum !== hash) {
        throw new Error(`Migration checksum changed after apply: ${filename}`);
      }
      continue;
    }

    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [filename, hash]);
      await pool.query("commit");
      console.log(`Applied migration ${filename}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    ssl: databaseSslConfig(),
  });

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runMigrations };
