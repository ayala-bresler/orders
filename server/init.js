'use strict';

/**
 * INIT — apply DB schema, then start the HTTP server.
 *
 * Used as the production entry (Railway / Docker):
 *   node init.js
 *
 * Env:
 *   SKIP_DB_INIT=true  — skip schema apply (server only)
 */

require('dotenv').config();

const { initDb } = require('./src/initDb');
const { startServer } = require('./src/index');

async function main() {
  if (process.env.SKIP_DB_INIT === 'true') {
    console.log('[init] SKIP_DB_INIT=true — skipping schema apply.');
  } else {
    await initDb();
  }
  startServer();
}

main().catch((err) => {
  console.error('[init] failed:', err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
