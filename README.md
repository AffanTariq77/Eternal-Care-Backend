# Eternal Care — Backend (Node.js + TypeScript)

Simple scaffold for the backend service.

Quick start:

1. Copy `.env.example` to `.env` and edit values (set `DATABASE_URL` to your Supabase DB and `JWT_SECRET`).
2. Install deps: `npm install` (in `Eternal-Care-Backend/`).
3. Start dev server: `npm run dev`.

Routes:
- GET /health
- POST /auth/signup
- POST /auth/login
- GET/PUT /profile/:id (requires Authorization: Bearer <token>)
- POST /bookings (requires Authorization)
- GET /bookings/:id (requires Authorization)
- GET /bookings?userId= (requires Authorization)

Database:
- If `DATABASE_URL` is configured correctly and reachable, the server will create the tables automatically on startup (users, bookings, payments) and run in DB-backed mode.
- If direct Postgres connectivity is not available, the server can use the Supabase REST API as an alternative. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` in your `.env` to enable REST access.
- To force the REST adapter even when a DB connection exists, set `FORCE_SUPABASE_REST=1` in `.env`.
- To disable the local JSON file fallback (recommended after migrating data to Supabase), set `DISABLE_FILE_FALLBACK=1`.
- Run `npm run check-db` to test DB connectivity locally; the script will attempt a `SELECT 1` and print any error.
- To troubleshoot, test DNS and TCP connectivity (see `docs/BACKEND-INTEGRATION.md`).

Security:
- The Supabase `service_role` key is powerful; rotate it after use and avoid checking it into source control. For production, consider using a more restricted API key/role and run via direct Postgres when possible.

Notes:
- Auth uses bcrypt to store hashed passwords and returns a JWT token on login/signup. Use `Authorization: Bearer <token>` for protected endpoints.
- For production, replace the JSON store with a proper DB and harden secrets (strong `JWT_SECRET`).
