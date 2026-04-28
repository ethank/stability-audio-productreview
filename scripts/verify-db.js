async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to verify the database");
  }

  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
    ssl:
      process.env.PGSSLMODE === "require" || /sslmode=require/.test(process.env.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    const tables = await pool.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('review_weeks', 'review_events', 'schema_migrations')
      order by table_name
    `);
    const migrations = await pool.query(`
      select filename, executed_at
      from schema_migrations
      order by filename
    `);
    const counts = await pool.query(`
      select
        (select count(*)::int from review_weeks) as review_weeks,
        (select count(*)::int from review_events) as review_events
    `);

    console.log(
      JSON.stringify(
        {
          tables: tables.rows.map((row) => row.table_name),
          migrations: migrations.rows,
          counts: counts.rows[0],
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
