const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
const databaseHost = process.env.SUPABASE_DB_HOST;
const databasePassword = process.env.SUPABASE_DB_PASSWORD;
const databaseUser = process.env.SUPABASE_DB_USER;
const databaseName = process.env.SUPABASE_DB_NAME || 'postgres';
const databasePort = Number.parseInt(process.env.SUPABASE_DB_PORT || '5432', 10);
const hasSplitDatabaseConfig = Boolean(databaseHost && databasePassword && databaseUser);
function getDatabaseSsl() {
  const caPath = process.env.SUPABASE_DB_CA_CERT;
  if (!caPath) return true;
  const fs = require('node:fs');
  const path = require('node:path');
  return { ca: fs.readFileSync(path.resolve(__dirname, caPath), 'utf8'), rejectUnauthorized: true };
}
const pool = new Pool({
  ...(databaseUrl
    ? { connectionString: databaseUrl, ssl: getDatabaseSsl() }
    : hasSplitDatabaseConfig
      ? { host: databaseHost, port: databasePort, user: databaseUser, password: databasePassword, database: databaseName, ssl: getDatabaseSsl() }
      : {}),
  max: Math.max(1, Math.min(3, Number.parseInt(process.env.DB_POOL_SIZE || '3', 10) || 3)),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', error => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

function postgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  if (!databaseUrl && !hasSplitDatabaseConfig) throw new Error('Thiếu cấu hình PostgreSQL. Điền DATABASE_URL hoặc SUPABASE_DB_HOST, SUPABASE_DB_USER và SUPABASE_DB_PASSWORD trong .env.');
  const result = await pool.query(postgresPlaceholders(sql), params);
  return result.rows;
}

async function initDb() {
  if (!databaseUrl && !hasSplitDatabaseConfig) throw new Error('Thiếu cấu hình PostgreSQL. Điền DATABASE_URL hoặc SUPABASE_DB_HOST, SUPABASE_DB_USER và SUPABASE_DB_PASSWORD trong .env.');
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const schema = await fs.readFile(path.join(__dirname, 'sql', 'schema.supabase.sql'), 'utf8');
  await pool.query(schema);
}

module.exports = { pool, query, initDb };
