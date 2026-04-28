const { Pool } = require("pg");
const { hashPassword } = require("../lib/passwords");
const { DB_CONNECTION_TIMEOUT_MS, databaseSslConfig, runMigrations } = require("./migrate");

function argsFromCli(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed an admin user");
  }

  const args = argsFromCli(process.argv.slice(2));
  const email = String(args.email || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const name = String(args.name || process.env.ADMIN_NAME || email || "").trim();
  const password = String(args.password || process.env.ADMIN_PASSWORD || "");

  if (!email || !email.includes("@")) {
    throw new Error("Admin email is required. Use --email ethan@example.com or ADMIN_EMAIL.");
  }
  if (!password || password.length < 12) {
    throw new Error("Admin password must be at least 12 characters. Use --password or ADMIN_PASSWORD.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    ssl: databaseSslConfig(),
  });

  try {
    await runMigrations(pool);
    await pool.query(
      `insert into review_users (email, name, role, password_hash, active, updated_at)
       values ($1, $2, 'admin', $3, true, now())
       on conflict (email)
       do update set
         name = excluded.name,
         role = 'admin',
         password_hash = excluded.password_hash,
         active = true,
         updated_at = now()`,
      [email, name || email, hashPassword(password)],
    );
    console.log(`Seeded admin user ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
