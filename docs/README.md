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
| Database | PostgreSQL 16 through the `pg` pool (`src/config/database.ts`) with SQL. Nothing imports the Prisma client at runtime |
| Auth | bcrypt (10 rounds), JWT (`jsonwebtoken`, 7 days by default), `Authorization: Bearer` header |
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
  services/              # business logic and SQL
  utils/                 # HttpError (status-carrying error), isUuid
  config/                # pg pool, Stripe client, Prisma client (prisma.ts is not imported)
  types/                 # request/response interfaces
  generated/prisma/      # Prisma client (generated, do not edit)
database/
  init/01-schema.sql     # full schema for a new Docker volume
  init/02-seed.sql       # materials and print configs
  migration/*.sql        # incremental changes, applied in order (see database.md)
prisma/schema.prisma     # Prisma model of the database (not kept in sync, see open issues)
```

Layering rule the code follows: routes do not touch SQL, controllers do not build SQL, services hold the logic. Services throw `HttpError` for expected failures (not found, not owned, already used, expired); controllers turn it into the matching status code.

## Running it

From the repository root (Docker, recommended):

```bash
docker compose up --build
```

The `api` service runs `prisma generate` and then `npm run dev` (nodemon + ts-node) with the source mounted, so edits reload. Inside the compose network the database host is `postgres`, which is why `docker-compose.yml` overrides `DATABASE_URL` and `DB_HOST`.

A new Docker volume gets the full schema from `database/init/`, so no manual migration is needed. An existing database created before this revision needs migration `07-add-users-stripe-customer-id.sql` (see [database.md](database.md#migrations)).

Without Docker:

```bash
npm install
cp .env.example .env     # then fill in the values below
npm run dev              # http://localhost:4000
```

Other scripts: `npm run build` (tsc), `npm start` (runs `dist/server.js`), `npm run type-check`. There is no automated test suite yet (see open issues).

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `PORT` | server | HTTP port, default 4000 |
| `NODE_ENV` | Prisma client caching | `development` or `production` |
| `FRONTEND_URL` | CORS, email links | Allowed origin, default `http://localhost:3000` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `pg` pool | Database connection for the SQL code |
| `DATABASE_URL` | Prisma CLI (`prisma.config.ts`) | Connection string for the Prisma CLI |
| `JWT_SECRET` | auth | Signs and verifies tokens (required) |
| `JWT_EXPIRES_IN` | auth | Token lifetime, default `7d` |
| `BASE_MACHINE_COST_PER_HOUR` | pricing | Machine rate, default 5.00 |
| `MARKUP_PERCENTAGE` | pricing | Markup on subtotal, default 30 |
| `STRIPE_SECRET_KEY` | Stripe client | Server-side Stripe key (test or live mode) |
| `STRIPE_WEBHOOK_SECRET` | webhook | Verifies `Stripe-Signature` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | email | Outgoing mail |

Variables present in `.env` but not read by the code: `MATERIAL_COST_PER_GRAM` and the `AWS_*` / `S3_*` values (no S3 integration exists; `quotes.s3_key` stores the local upload path).

## Conventions

- Success responses are JSON. Errors are `{ "error": "message" }` everywhere, including upload and JSON body errors. The 500 responses use a fixed message and log the cause on the server.
- Protected routes need `Authorization: Bearer <jwt>`. `authenticate` returns 401 when the token is missing or invalid.
- Quote, order and payment-method routes check that an ID is a UUID before querying. A malformed ID returns 404 (or 400 for a body field), never a 500. Address routes do not do this check (see open issues).
- Address and payment-method routes also check ownership: a row that belongs to another user is reported as not found (404), except address routes, which return 403 when `:userId` is not the token's user.
- Money values are numbers rounded to 2 decimals. Weights are grams, volumes cm³, time minutes.
- A quote's price is set when it is created and never comes from the client. Accepting or approving a quote uses the stored total.

## Changes in this revision

Each item was reproduced or verified with a request against the running API.

| Area | Before | Now | Where |
|---|---|---|---|
| Payment methods | Routes not mounted; controller methods for list, default and delete were empty; save called the service with the wrong arguments | All five routes mounted and implemented; one Stripe customer per user | `routes/payment-method.route.ts`, `services/payment-method.service.ts`, `controllers/payment-methods.controller.ts`, `app.ts` |
| Approving a quote | Created an order before checking ownership; took the price from the request body; not awaited | Checks ownership, uses the stored price, returns the new order (201) | `controllers/quote.controller.ts` `approveQuote`, `services/order.service.ts` `acceptQuote` |
| Double order | A quote could be accepted many times (status `accepted` was never checked) | Quote row locked (`FOR UPDATE`); only `pending` quotes can be accepted; repeat gives 409 | `services/order.service.ts` |
| Quote visibility | Any caller with the UUID could read any quote | Owned quotes return 404 to other users; guest quotes stay readable by UUID | `controllers/quote.controller.ts` `getQuote` |
| Associating a guest quote | Owner taken from the request body | Owner taken from the token; body `userId` is ignored | `controllers/quote.controller.ts` `associateQuoteWithUser` |
| Shipping address update | No ownership check; stored `undefined undefined` as the name because it read `name`/`surname` | Ownership checked in SQL (404 otherwise); reads the form fields `firstName`, `lastName`, `zip` and so on | `services/order.service.ts` `updateShippingAddress`, `controllers/order.controller.ts` |
| Errors | Every accept-quote failure was a 500 | Expired 410, used 409, not owned 403, not found 404 | `utils/http-error.ts`, controllers |
| Pay for a missing order | Service threw, so 500 | 404 | `services/order.service.ts` `getOrder` returns null |
| Payment status | Paid also overwrote the order `status` with `paid` | Paid sets `payment_status = paid` and `status = processing` | `services/order.service.ts` `updatePaymentStatus` |
| Upload errors | Multer errors reached Express's default page (HTML 500) | JSON 400, `File too large (maximum 50 MB)` for oversize files | `app.ts` error handler |
| Stripe webhook | Logged the full event object, including card and customer data | Logs the event type only; ignores events without an order ID | `controllers/stripe.controller.ts` |
| Debug output | Logged shipping bodies and webhook payloads | Removed | `controllers/order.controller.ts`, `controllers/stripe.controller.ts` |
| Shipping shape | Accept-quote used `name`/`postalCode`; the address form used `firstName`/`zip` | One shape everywhere: `firstName`, `lastName`, `address`, `addressInfo`, `city`, `zip`, `country`, `isPrimary` | `types/order.types.ts` |
| Malformed IDs | PostgreSQL rejected them and the API returned 500 | 404 (400 for body fields) | `utils/is-uuid.ts` and controllers |
| Schema init | Fresh volumes lacked the verification columns and the address and payment tables | `01-schema.sql` matches the live database column for column, index for index, foreign key for foreign key (checked against a fresh container) | `database/init/01-schema.sql`, `database/migration/07-add-users-stripe-customer-id.sql` |

## Open issues

These are real gaps that were not changed in this revision.

1. **No automated tests.** The checks used during this revision were manual HTTP requests against the running API. Adding a test runner (for example Vitest with a throwaway database) is the next step.
2. **Uploaded STL files are never deleted.** A rejected or expired quote leaves its file in `uploads/stl-files`, and `POST /api/quote` has no rate limit, so the folder grows without bound.
3. **Prisma model is missing a column.** `prisma/schema.prisma` has no `users.stripe_customer_id`. Nothing at runtime uses the Prisma model, so this only affects the Prisma CLI and generated types.
4. **Order cancellation is not possible.** The profile page's delete button for orders is a stub, and no endpoint exists to cancel or delete an order.
5. **Quote expiry is checked only when accepting.** Expired quotes stay in the list and in `GET /api/quotes` with status `pending`.
6. **The session cookie is readable from JavaScript.** `auth_token` is set by the UI without `HttpOnly`, so any script on the page can read the JWT.
7. **Guest quotes are reachable by UUID.** This is intended (the UUID is the link the guest keeps), but anyone who has the link can read and approve the quote until it expires.
8. **Address errors are hidden.** `services/address.service.ts` catches its database errors and only logs them, so `POST /add`, `PUT /edit`, `PATCH /primary` and `DELETE` return success even when nothing was saved (for example a second primary address, or an unknown address ID). The address routes also skip the UUID check. Fix: let the service throw, and map errors in `controllers/address.controller.ts`.
