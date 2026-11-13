# 3D Print Shop API: Overview

Express 5 + TypeScript REST API for the PrintFlow 3D store. It parses uploaded STL files, prices them, stores quotes, turns quotes into orders, takes card payments through Stripe, and keeps each customer's saved cards and addresses.

- [API reference and UML](api.md): every endpoint, request and response shapes, error codes, sequence and class diagrams
- [Database](database.md): tables, columns, relationships (ER diagram), migrations

## Stack

| Concern | Technology |
|---|---|
| HTTP | Express 5, `cors`, `express.json` |
| Uploads | Multer (disk storage in `uploads/stl-files`, STL only, 50 MB limit) |
| STL parsing | `node-stl` (volume, surface area, bounding box) |
| Database | PostgreSQL 16 through the `pg` pool (`src/config/database.ts`) with SQL. The SQL files in `database/` are the schema source of truth |
| Auth | bcrypt (10 rounds), JWT (`jsonwebtoken`, 7 days by default). Browsers get an HttpOnly, SameSite=Strict session cookie; API clients can send `Authorization: Bearer` |
| Payments | Stripe: PaymentIntents for orders (EUR), SetupIntents and saved cards for payment methods, webhook for `payment_intent.succeeded` |
| Email | Nodemailer over SMTP (verification, welcome, order confirmation) |

## Project layout

```
src/
  server.ts              # listens on PORT (default 4000)
  app.ts                 # middleware, CORS, route mounting, /health, JSON error handler
  routes/                # URL -> middleware -> controller method
  middleware/            # authenticate (required JWT), optionalAuth (JWT if present)
  controllers/           # HTTP layer: validate input, map errors to status codes
  services/              # business logic and SQL; quote-cleanup.service expires quotes and removes uploads
  utils/                 # HttpError, isUuid, address field check, session cookie helpers
  config/                # pg pool, Stripe client
  types/                 # request/response interfaces
database/
  init/01-schema.sql     # full schema for a new Docker volume
  init/02-seed.sql       # materials and print configs
  migration/*.sql        # incremental changes, applied in order (see database.md)
test/                    # node:test suite: unit tests and HTTP tests against a running API
```

Layering rule the code follows: routes do not touch SQL, controllers do not build SQL, services hold the logic. Services throw `HttpError` for expected failures (not found, not owned, already used, expired); controllers turn it into the matching status code.

## Running it

From the repository root (Docker, recommended):

```bash
docker compose up --build
```

The `api` service runs `npm run dev` (nodemon + ts-node) with the source mounted, so edits reload. Inside the compose network the database host is `postgres`, which is why `docker-compose.yml` overrides `DB_HOST`.

A new Docker volume gets the full schema from `database/init/`, so no manual migration is needed. An existing database created before this revision needs migration `07-add-users-stripe-customer-id.sql` (see [database.md](database.md#migrations)).

Without Docker:

```bash
npm install
cp .env.example .env     # then fill in the values below
npm run dev              # http://localhost:4000
```

Other scripts: `npm run build` (tsc), `npm start` (runs `dist/server.js`), `npm run type-check`.

Tests run inside the API container while it is up, because the HTTP tests call the running API and use the database:

```bash
docker compose exec api npm test
```

The HTTP tests tag every user and quote they create with a run stamp (`probe-<stamp>@example.com` and the quote session `probe-<stamp>`). Cleanup deletes by that stamp, dependent rows first, and reports the counts. They also write real verification emails through the configured SMTP account (see open issues).

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `PORT` | server | HTTP port, default 4000 |
| `NODE_ENV` | session cookie | `production` sets the cookie `Secure` flag |
| `TRUST_PROXY` | rate limiting | Hop count (for example `1` behind one reverse proxy) so the upload limit sees client addresses. Unset means the connection address is used |
| `FRONTEND_URL` | CORS, email links | Allowed origin, default `http://localhost:3000` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `pg` pool | Database connection for the SQL code |
| `JWT_SECRET` | auth | Signs and verifies tokens (required) |
| `JWT_EXPIRES_IN` | auth | Token lifetime, default `7d` |
| `BASE_MACHINE_COST_PER_HOUR` | pricing | Machine rate, default 5.00 |
| `MARKUP_PERCENTAGE` | pricing | Markup on subtotal, default 30 |
| `STRIPE_SECRET_KEY` | Stripe client | Server-side Stripe key (test or live mode) |
| `STRIPE_WEBHOOK_SECRET` | webhook | Verifies `Stripe-Signature` |
| `QUOTE_RATE_LIMIT` | `POST /api/quote` | Uploads allowed per IP per 15 minutes, default 60 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | email | Outgoing mail |

Variables present in `.env` but not read by the code: `MATERIAL_COST_PER_GRAM` and the `AWS_*` / `S3_*` values (no S3 integration exists; `quotes.s3_key` stores the local upload path).

## Conventions

- Success responses are JSON. Errors are `{ "error": "message" }` everywhere, including upload and JSON body errors. The 500 responses use a fixed message and log the cause on the server.
- Protected routes accept the `auth_token` session cookie or `Authorization: Bearer <jwt>`. `authenticate` returns 401 when neither is valid.
- Quote, order and payment-method routes check that an ID is a UUID before querying. A malformed ID returns 404 (or 400 for a body field), never a 500. Address routes do not do this check (see open issues).
- Address and payment-method routes also check ownership: a row that belongs to another user is reported as not found (404), except address routes, which return 403 when `:userId` is not the token's user.
- Uploads are limited per IP (`QUOTE_RATE_LIMIT`) and answer 429 when exceeded. Uploads that fail to parse or price are deleted from disk.
- Money values are numbers rounded to 2 decimals. Weights are grams, volumes cm³, time minutes.
- A quote's price is set when it is created and never comes from the client. Accepting or approving a quote uses the stored total.

## Recent changes

Each item was checked against the running API (HTTP requests or the test suite).

| Area | Change | Where |
|---|---|---|
| Session | The API sets an HttpOnly, SameSite=Strict cookie on register and login, and `POST /api/auth/logout` clears it. The browser no longer reads or sends a token itself. CORS allows credentials for the frontend origin | `utils/session.ts`, `controllers/auth.controller.ts`, `middleware/auth.middleware.ts`, `app.ts` |
| Orders | Unpaid orders can be cancelled once (`POST /api/orders/:id/cancel`). Paid orders return 409 because refunds are not built | `services/order.service.ts` `cancelOrder` |
| Addresses | Address writes now throw on failure. Setting a primary address clears the others in the same transaction. Missing or malformed IDs return 404, and bad bodies return 400 | `services/address.service.ts`, `controllers/address.controller.ts` |
| Quotes | Pending quotes past `expires_at` are marked `expired` at startup and then hourly, and their uploads are removed. The quote list shows an overdue pending quote as expired at once. Rejecting a quote removes its upload. A failed parse removes the upload it came from | `services/quote-cleanup.service.ts`, `server.ts`, `controllers/quote.controller.ts` |
| Uploads | `POST /api/quote` is rate limited per IP (`express-rate-limit`) | `routes/quote.route.ts` |
| Prisma | Removed. Nothing used it at runtime, and it carried the vulnerable packages. The SQL in `database/` is the schema | `package.json`, `Dockerfile` |
| Vulnerabilities | `npm audit` reports zero findings for runtime and development packages. `nodemailer` is 10.x | `package-lock.json` |
| Email | Mail to RFC 2606 reserved domains (`example.com` and similar) is logged and not sent, so test users do not use the SMTP quota | `services/email.service.ts` |
| Refunds | Cancelling a paid order refunds it through Stripe (idempotent, row locked) and marks the order `refunded` | `services/order.service.ts` `cancelOrder` |
| Catalogue | `GET /api/materials` and `GET /api/print-presets` are public reference data for the Materials and Services pages | `routes/catalog.route.ts` |
| Proxy | `TRUST_PROXY` configures the client address used by the rate limit | `app.ts` |
| Tests | 35 unit and HTTP tests. HTTP tests tag every row with a run stamp and clean up by it | `test/` |

## Open issues

These are real gaps that were not changed.

1. **Quote expiry removed data once.** When the expiry job first ran against the live database it marked six overdue quotes (February to July) as expired and deleted their upload files. Those quotes could not be ordered anyway, and the files cannot be restored. This is a record, not a current risk.
2. **Refunds depend on Stripe state.** A paid order is refunded only when its payment intent is still refundable in Stripe. Otherwise the cancel returns 400 with Stripe's message and nothing changes.
3. **Test runs create Stripe test-mode objects.** The API and end-to-end tests create customers, payment intents and refunds in the Stripe test account. They are harmless but accumulate.
