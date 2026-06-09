import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  private readonly pool = new Pool({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME ?? 'edge_worldcup',
    user: process.env.DATABASE_USER ?? 'edge_user',
    password: process.env.DATABASE_PASSWORD ?? 'edge_password',
  });

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        failed_otp_attempts INTEGER NOT NULL DEFAULT 0,
        otp_locked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS failed_otp_attempts INTEGER NOT NULL DEFAULT 0;
    `);

    await this.pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMPTZ;
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wc_countries (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL UNIQUE,
        group_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wc_matches (
        id SERIAL PRIMARY KEY,
        home_country_id INTEGER NOT NULL REFERENCES wc_countries(id) ON DELETE CASCADE,
        away_country_id INTEGER NOT NULL REFERENCES wc_countries(id) ON DELETE CASCADE,
        kickoff TIMESTAMPTZ NOT NULL,
        stage TEXT NOT NULL,
        venue TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (home_country_id <> away_country_id)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_predictions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        qualified_codes TEXT[] NOT NULL,
        finalist_codes TEXT[] NOT NULL,
        champion_code TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    this.logger.log('Database schema ready');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }
}
