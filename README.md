# Tickets Bot (Discord) + Web Dashboard

A Discord tickets bot built with `discord.js` + `mongoose`, with a built-in web dashboard (Express) to manage the ticket panel and view staff stats.

## Features

- Ticket panel message with a select menu to open tickets
- Automatic ticket channel creation with permissions for owner + staff roles
- Ticket actions:
  - Close ticket (archives transcript and deletes channel after a delay)
  - Ping ticket owner (DM)
  - Claim ticket (staff-only; optional claim log)
- Web dashboard:
  - Create/update panel settings
  - Publish panel message to a selected channel
  - View total tickets counter
  - Staff top stats (claimed count)
- Setup wizard inside Discord (`-setup`) to configure & publish fast
- Optional API protection with `DASHBOARD_TOKEN`

## Requirements

- Node.js 18+ recommended
- MongoDB (local or hosted)
- A Discord bot with the required intents enabled (Server Members + Message Content if you use prefix commands)

## Installation

1. Install dependencies:
   - `npm i`
2. Create your `.env`:
   - Copy `.env.example` to `.env`
   - Fill required vars: `DISCORD_TOKEN`, `MONGO_URI`
3. Run:
   - `npm run dev`

The dashboard runs on `http://localhost:3000` by default (or `PORT`).

## Environment variables

Required:
- `DISCORD_TOKEN`: Discord bot token
- `MONGO_URI`: MongoDB connection string

Recommended:
- `DASHBOARD_TOKEN`: protects `/api/*` endpoints (dashboard will ask for it once and store it in the browser)

Optional:
- `PORT`: dashboard port (default `3000`)
- `HOST`: bind host (default `0.0.0.0`)
- `PREFIX`: bot prefix (default `-`)
- `CORS_ORIGIN`: restrict CORS to a single origin (example: `http://localhost:3000`)
- `TICKET_OPEN_COOLDOWN_MS`: anti-spam cooldown for opening tickets (default `10000`)

## First-time setup (recommended)

Run the setup wizard in your server:

- `-setup`

It will ask you for:
- Panel channel (where the panel message will be published)
- Staff role(s)
- Optional ticket category
- Optional claim/close log channels
- Panel title/description
- Menu options (ticket types)

After saving, it publishes the panel automatically.

## Commands

Prefix is `-` by default (or `PREFIX`).

- `-setup`: interactive wizard to create/update panel and publish it
- `-add @user`: add a user to the current ticket channel (admin-only)
- `-info`: show ticket information in the current ticket channel

## Dashboard security

If `DASHBOARD_TOKEN` is set, all `/api/*` endpoints require:

- Header: `Authorization: Bearer <DASHBOARD_TOKEN>`

The included dashboard UI automatically prompts you for the token if the API returns `401`, then stores it in `localStorage` for subsequent requests.

## Troubleshooting

- “Missing required env var”: make sure `.env` exists and has `DISCORD_TOKEN` and `MONGO_URI`.
- Bot can’t create channels: grant the bot `Manage Channels` permission and ensure the target category/channel permissions allow it.
- Dashboard shows empty guilds: make sure the bot is online and in your server, and your token is correct.

## Notes for hosting

- Use a process manager (PM2/systemd) for production.
- Use a real MongoDB service (Atlas, VPS, etc.).
- Keep `DASHBOARD_TOKEN` long and private.
