'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function dumpTable(tableName) {
  const cols = await pool.query(
    `SELECT column_name, data_type, udt_name, character_maximum_length,
            numeric_precision, numeric_scale, is_nullable, column_default,
            is_identity, identity_generation
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName]
  );

  const pks = await pool.query(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position`,
    [tableName]
  );

  const fks = await pool.query(
    `SELECT kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column,
            rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'FOREIGN KEY'`,
    [tableName]
  );

  const idxs = await pool.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname`,
    [tableName]
  );

  console.log(`\n=== ${tableName} ===`);
  console.log('PK:', pks.rows.map((r) => r.column_name).join(', ') || '(none)');
  for (const c of cols.rows) {
    const len = c.character_maximum_length ? `(${c.character_maximum_length})` : '';
    const num =
      c.data_type === 'numeric' && c.numeric_precision != null
        ? `(${c.numeric_precision},${c.numeric_scale ?? 0})`
        : '';
    const ident =
      c.is_identity === 'YES' ? ` IDENTITY ${c.identity_generation || ''}` : '';
    console.log(
      `  ${c.column_name} | ${c.udt_name}${len}${num} | null=${c.is_nullable} | def=${c.column_default || ''}${ident}`
    );
  }
  if (fks.rows.length) {
    for (const f of fks.rows) {
      console.log(
        `  FK ${f.column_name} -> ${f.foreign_table}(${f.foreign_column}) ON DELETE ${f.delete_rule}`
      );
    }
  }
  for (const i of idxs.rows) {
    console.log(`  IDX ${i.indexname}: ${i.indexdef}`);
  }
}

async function main() {
  const { rows } = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  console.log('DB:', process.env.PGDATABASE || process.env.DATABASE_URL || '(default)');
  console.log('TABLES:', rows.map((r) => r.table_name).join(', '));
  for (const r of rows) {
    await dumpTable(r.table_name);
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
