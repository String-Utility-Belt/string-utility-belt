/**
 * A D1 stand-in for tests, backed by Node's built-in SQLite (D1 is SQLite) with the real
 * migrations applied, so the SQL the worker sends is the SQL that is tested. Every statement
 * yields to the event loop first, so concurrent requests interleave the way they would on D1.
 * Not part of the Worker bundle.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

export interface TestD1 {
  db: D1Database
  sqlite: DatabaseSync
  /** Every statement prepared, in order. */
  log: string[]
}

export function sqliteD1(): TestD1 {
  const sqlite = new DatabaseSync(':memory:')
  for (const f of readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  }
  const log: string[] = []
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
  const db: D1Database = {
    prepare(sql) {
      log.push(sql)
      const statement = (values: unknown[]): D1PreparedStatement => ({
        bind: (...more) => statement([...values, ...more]),
        run: async () => {
          await tick()
          const r = sqlite.prepare(sql).run(...(values as never[]))
          return { meta: { changes: Number(r.changes) } }
        },
        first: async <T>() => {
          await tick()
          return (sqlite.prepare(sql).get(...(values as never[])) ?? null) as T | null
        },
      })
      return statement([])
    },
  }
  return { db, sqlite, log }
}
