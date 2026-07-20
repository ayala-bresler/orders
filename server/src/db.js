'use strict';

/**
 * PostgreSQL connection pool.
 *
 * Configure via environment (see .env.example). If DATABASE_URL is set it takes
 * precedence, otherwise discrete PG* vars are used.
 */

const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'hetz_haim',
    });

pool.on('error', (err) => {
  // Keep the process alive on idle client errors; log for visibility.
  console.error('[db] unexpected idle client error:', err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
