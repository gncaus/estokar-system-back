# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

## Architecture

This is a single-file Express.js REST API ([server.js](server.js)) running on port 3001.

**Data layer:** In-memory array (`stockList`) with an auto-incrementing `currentId`. All data is lost on server restart — there is no database.

**API surface (`/items`):**
- `GET /items` — returns all items
- `POST /items` — creates item; expects `{ name, description }` in JSON body; returns `201` with the new item
- `DELETE /items/:id` — removes by integer ID; returns `204`

Item shape: `{ id: number, name: string, description: string }`

## Stack

- Node.js / CommonJS (`require`)
- Express 5, cors
- No TypeScript, no database, no environment config
