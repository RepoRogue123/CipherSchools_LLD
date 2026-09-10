import type { DatabaseSync } from 'node:sqlite';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE learners (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE attempts (
        id                      TEXT PRIMARY KEY,
        learner_id              TEXT NOT NULL REFERENCES learners(id),
        problem_id              TEXT NOT NULL,
        number                  INTEGER NOT NULL,
        status                  TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'CURVEBALL_REVEALED', 'SUBMITTED')),
        curveball_id            TEXT NOT NULL,
        design_json             TEXT NOT NULL,
        change_impact_json      TEXT,
        focus_goals_json        TEXT NOT NULL,
        seeded_from_attempt_id  TEXT REFERENCES attempts(id),
        version                 INTEGER NOT NULL,
        started_at              TEXT NOT NULL,
        curveball_revealed_at   TEXT,
        submitted_at            TEXT,
        updated_at              TEXT NOT NULL,
        UNIQUE (learner_id, problem_id, number)
      );
      -- Backs up the domain rule "resume the open attempt, never create a second one".
      CREATE UNIQUE INDEX attempts_one_open ON attempts (learner_id, problem_id) WHERE status <> 'SUBMITTED';

      CREATE TABLE submissions (
        id                  TEXT PRIMARY KEY,
        attempt_id          TEXT NOT NULL UNIQUE REFERENCES attempts(id),
        learner_id          TEXT NOT NULL REFERENCES learners(id),
        problem_id          TEXT NOT NULL,
        curveball_id        TEXT NOT NULL,
        format              TEXT NOT NULL,
        design_json         TEXT NOT NULL,
        change_impact_json  TEXT NOT NULL,
        content_hash        TEXT NOT NULL,
        submitted_at        TEXT NOT NULL
      );

      CREATE TABLE evaluations (
        id                TEXT PRIMARY KEY,
        submission_id     TEXT NOT NULL UNIQUE REFERENCES submissions(id),
        status            TEXT NOT NULL CHECK (status IN ('QUEUED', 'EVALUATING', 'COMPLETED', 'FAILED')),
        rubric_version    TEXT NOT NULL,
        prompt_version    TEXT NOT NULL,
        run_count         INTEGER NOT NULL,
        auto_retry_count  INTEGER NOT NULL,
        not_before        TEXT NOT NULL,
        lease_until       TEXT,
        last_error        TEXT,
        report_json       TEXT,
        queued_at         TEXT NOT NULL,
        started_at        TEXT,
        completed_at      TEXT,
        version           INTEGER NOT NULL
      );
      CREATE INDEX evaluations_queue ON evaluations (status, not_before);

      CREATE TABLE evaluation_steps (
        evaluation_id  TEXT NOT NULL REFERENCES evaluations(id),
        evaluator_id   TEXT NOT NULL,
        status         TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED')),
        output_json    TEXT,
        detail         TEXT,
        updated_at     TEXT NOT NULL,
        PRIMARY KEY (evaluation_id, evaluator_id)
      );
    `,
  },
];

/** Applies pending migrations in order, each in its own transaction. Safe to run on every boot. */
export function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number((row as { version: number }).version)),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
