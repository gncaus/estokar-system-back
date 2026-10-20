# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
The workspace-level `../CLAUDE.md` holds the API contract and cross-repo rules — it takes priority over this file.

## Commands

```bash
cp .env.example .env   # first time: set DATABASE_URL
npm run dev            # nodemon, auto-reload
npm start              # production
```

## Architecture

Single-file Express 5 REST API ([server.js](server.js)) on port `PORT` (default 3001), backed by PostgreSQL via `pg`.

- **Schema** — `initDb()` creates `items`, `movements`, `sales`, `sale_items` with `CREATE TABLE IF NOT EXISTS` on startup. No migration tool: changing an existing table needs a manual `ALTER TABLE`.
- **Mapping** — DB rows are snake_case; `mapItem` / `mapMovement` / `mapSale` convert to the camelCase API shape. `NUMERIC` columns come back as strings and are parsed with `parseFloat`.
- **Validation** — done at the top of each route with `parseId`, `isNonNegativeNumber`, `validateSaleBody`. Errors are `{ error }` with a Portuguese message and status 400/404.
- **Sales** — `POST /sales` runs in a transaction, locks item rows with `FOR UPDATE`, decrements stock and writes `saida` movements.
- **Errors** — unhandled async errors reach the global error handler (500).

## Stack

- Node.js / CommonJS (`require`)
- Express 5, cors, pg
- No TypeScript, no ORM, no tests
- Deploy: Railway (Postgres plugin injects `DATABASE_URL`; SSL is enabled for remote hosts, disabled for localhost)
