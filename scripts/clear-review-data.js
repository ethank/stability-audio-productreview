const { Client } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to clear review data");
}

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to clear review data without --confirm");
}

function sslConfig() {
  if (/sslmode=require/.test(process.env.DATABASE_URL || "")) return { rejectUnauthorized: false };
  return undefined;
}

async function counts(client) {
  const result = await client.query(`
    select
      (select count(*)::int from review_weeks) as review_weeks,
      (select count(*)::int from review_events) as review_events,
      (select count(*)::int from review_users) as review_users
  `);
  return result.rows[0];
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  });

  await client.connect();
  try {
    const before = await counts(client);
    await client.query("begin");
    await client.query("delete from review_weeks");
    const after = await counts(client);
    await client.query("commit");
    console.log(JSON.stringify({ before, after }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
