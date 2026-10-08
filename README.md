# pocast-backend

Backend for pocast, a global, mobile-first podcast app. Nx monorepo of NestJS
microservices talking over RabbitMQ, built for high traffic.

```
                      ┌─► RabbitMQ (auth_queue)    ──► auth-service    ──► Postgres (pocast_auth)
HTTP ──► api-gateway ─┤
   (JWT verified here)└─► RabbitMQ (catalog_queue) ──► catalog-service ──► Postgres (pocast_catalog)
```

| Project                    | Path                    | Role                                                                |
| -------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `@pocast/api-gateway`      | `apps/api-gateway`      | Public REST API (`/api`): validation, JWT verification, rate limits |
| `@pocast/auth-service`     | `apps/auth-service`     | Users, passwords (Argon2id), sessions, access-token signing         |
| `@pocast/catalog-service`  | `apps/catalog-service`  | Podcasts/episodes/categories (RSS-ingested + hosted)                |
| `@pocast/contracts`        | `libs/contracts`        | Shared message patterns, DTOs, queue names, error shape             |
| `@pocast/microservice-kit` | `libs/microservice-kit` | Shared service helpers: `rpcError`, RPC validation pipe             |

## Getting started

```sh
pnpm install
cp .env.example .env                              # defaults match docker-compose
node tools/scripts/generate-jwt-keys.mjs >> .env  # Ed25519 signing keys (dev only)
pnpm infra:up      # RabbitMQ :5672 (UI :15672 guest/guest), Postgres :5433, Redis :6379
pnpm db:deploy     # apply migrations to all dev and test databases
pnpm dev           # gateway (:3000) + auth-service + catalog-service
```

Postgres is exposed on host port **5433** so it does not clash with a locally
installed Postgres on 5432.

```sh
curl -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json'   -d '{"email":"you@example.com","password":"a long passphrase"}'
curl 'localhost:3000/api/podcasts?limit=20&language=en&category=news'
```

## Auth API

| Method | Path                   | Auth   | Notes                                                    |
| ------ | ---------------------- | ------ | -------------------------------------------------------- |
| POST   | `/api/auth/register`   | –      | `{ email, password }` → `{ user, tokens }`. 5/min per IP |
| POST   | `/api/auth/login`      | –      | Same response. 10/min per IP                             |
| POST   | `/api/auth/refresh`    | –      | `{ refreshToken }` → new token pair. 30/min per IP       |
| POST   | `/api/auth/logout`     | –      | `{ refreshToken }`; ends that device's session           |
| POST   | `/api/auth/logout-all` | Bearer | Ends every session of the user                           |
| GET    | `/api/auth/me`         | Bearer | Current user profile                                     |

- **Access token:** EdDSA (Ed25519) JWT, 15 min, sent as `Authorization: Bearer`.
  Signed only by auth-service; the gateway verifies it locally with the public
  key, so no request ever waits on auth-service.
- **Refresh token:** opaque, 30 days, single use. Every refresh rotates it;
  reusing a rotated token revokes the whole session (theft detection). Only a
  SHA-256 digest is stored.
- **Passwords:** Argon2id (OWASP parameters), 8–128 chars (NIST 800-63B), no
  composition rules. Weaker hashes are upgraded transparently on login. Login
  answers identically (and in the same time) for unknown email, wrong password
  and disabled accounts.
- **Rate limits** are counted in Redis so all gateway replicas share them. Set
  `TRUST_PROXY_HOPS` to the number of proxies in front of the gateway.
- **Roles:** `LISTENER` (default), `CREATOR`, `EDITOR`, `ADMIN`. Protect routes
  with `@Authenticated()` or `@Authenticated('EDITOR', 'ADMIN')`.

## Catalog API

| Method | Path                         | Notes                                                                   |
| ------ | ---------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/podcasts`              | Recently updated first. `cursor`, `limit` (≤50), `language`, `category` |
| GET    | `/api/podcasts/:id`          | Detail incl. category slugs                                             |
| GET    | `/api/podcasts/:id/episodes` | Newest first. `cursor`, `limit` (≤50)                                   |
| POST   | `/api/podcasts/import`       | `{ feedUrl }`; idempotent. Requires role EDITOR or ADMIN                |

Lists return `{ items, nextCursor }`; pass `nextCursor` back as `cursor`.
GETs send `Cache-Control: public, max-age=60, stale-while-revalidate=300` so a
CDN can absorb most read traffic. `durationSeconds` may be null (many feeds
omit it); clients should fall back to the media's real duration.

## Feed ingestion

catalog-service runs in up to three roles, chosen with `CATALOG_ROLES`
(default: all). Deploy them separately in production to scale independently:

- **api**: answers `catalog_queue` (reads, imports).
- **scheduler**: every 30s claims due feeds with `FOR UPDATE SKIP LOCKED`
  (safe with any number of replicas; 10 min lease) and enqueues refresh jobs.
- **worker**: consumes `catalog_ingest_queue` with manual ack and
  `prefetch = CATALOG_INGEST_CONCURRENCY`, so each process refreshes a bounded
  number of feeds at once.

Refreshing uses conditional GET (ETag/Last-Modified) plus a body hash to skip
unchanged feeds, polls adaptively (15 min for daily shows up to 24 h for
dormant ones, ±10% jitter), backs off exponentially on errors, and hides feeds
that are gone (404/410) or fail 20 times in a row. Fetching blocks private and
internal addresses (SSRF), including via redirects and DNS rebinding, caps
feeds at 15 MB and times out slow servers.

## Everyday commands

```sh
pnpm build | test | lint | typecheck   # all projects (cached)
pnpm affected                          # only what your change touched
pnpm graph                             # interactive dependency graph
pnpm db:migrate -- --name <change>     # create + apply a catalog migration
pnpm db:studio                         # browse the catalog database
```

`prisma-generate` is a cached Nx target that `build`, `test`, `lint` and
`typecheck` depend on, so the generated client (gitignored) is always current.

## Conventions

- **Apps never import apps.** Shared code goes in `libs/`. Enforced by
  `@nx/enforce-module-boundaries` using project tags (`type:*`, `scope:*`).
- **Database per service.** Only catalog-service touches `pocast_catalog`;
  other services ask it over RabbitMQ.
- **Every message pattern lives in `@pocast/contracts`.** Gateway and service
  import the same constant and DTO, so they cannot drift apart.
- **Services report errors with `rpcError()` from `@pocast/microservice-kit`.**
  The gateway maps `statusCode` back to HTTP; anything else becomes a 500.
- **One instance of each Nest package.** `pnpm check:deps` (also in CI) fails
  if pnpm splits `@nestjs/*` into peer variants, which silently turns expected
  RPC errors into 500s. Optional peers in use (e.g. `ioredis`) live at the root.
- **Built for load:** no unbounded queries (lists are capped / cursor
  paginated), select only needed columns, every query path backed by an index,
  UUIDv7 primary keys, DB pool size via `CATALOG_DB_POOL_MAX`, audio is never
  proxied through our services.
- **Tests:** unit tests use in-memory repositories; `*.int.spec.ts` run
  against `pocast_catalog_test` (never the dev DB) and are skipped when
  `CATALOG_TEST_DATABASE_URL` is unset.
- Workspace libs are bundled into each app; npm packages stay external
  (`tools/webpack/workspace-externals.js`, needed because pnpm does not hoist
  app dependencies to the root).

## Adding a new service

```sh
pnpm nx g @nx/nest:app apps/<name>-service --linter=eslint --unitTestRunner=jest \
  --e2eTestRunner=none --strict --tags="type:app,scope:<name>"
pnpm add --filter @pocast/<name>-service @nestjs/microservices amqplib \
  amqp-connection-manager class-validator class-transformer "@pocast/contracts@workspace:*"
```

Then: wire `workspaceExternals` into its `webpack.config.js` and set
`outDir`/`tsBuildInfoFile` in `tsconfig.app.json` to `out-tsc/app` (copy from
an existing app), add its patterns/queue to `libs/contracts`, add a
`scope:<name>` rule in `eslint.config.mjs`, and give its `serve` target a
unique debugger `port`.
