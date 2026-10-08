# pocast

pocast is the backend for a global podcast app. Listeners browse a catalog
built from public RSS feeds, follow shows and pick up an episode on their
phone exactly where they left off on their laptop. Creators can also host
their show with us: they upload audio, we generate a standards-compliant RSS
feed for them, and the show shows up in the catalog next to everything else.

The product borrows openly from apps that already got this right: the listener
experience of Pocket Casts, the hosting model of Spotify for Creators, and a
catalog that grows by crawling feeds rather than waiting for people to submit
them.

Under the hood it is an Nx monorepo of five services written in three
languages. They talk to each other over RabbitMQ and sit behind a single HTTP
gateway.

## Architecture

```
                                    ┌──► auth-service      (NestJS)       ──► Postgres  pocast_auth
                                    │
 clients ──HTTP──► api-gateway ─────┼──► catalog-service   (NestJS)       ──► Postgres  pocast_catalog
                  (NestJS, :3000)   │        ▲      │
                   JWT check        │        │      └── fetches public RSS feeds
                   rate limits      │        │ catalog.hosted.sync
                   validation       │        │
                                    ├──► creator-service   (Spring Boot)  ──► Postgres  pocast_creator
                                    │                                     ──► S3        audio & artwork
                                    │
                                    └──► library-service   (.NET 9)       ──► Postgres  pocast_library

                         all arrows between services are RabbitMQ queues
```

| Project                    | Path                    | Stack                  | What it owns                                               |
| -------------------------- | ----------------------- | ---------------------- | ---------------------------------------------------------- |
| `@pocast/api-gateway`      | `apps/api-gateway`      | NestJS                 | The public REST API under `/api`                           |
| `@pocast/auth-service`     | `apps/auth-service`     | NestJS, Prisma         | Accounts, passwords, sessions, token signing               |
| `@pocast/catalog-service`  | `apps/catalog-service`  | NestJS, Prisma         | Podcasts, episodes, categories, feed crawling, search      |
| `@pocast/creator-service`  | `apps/creator-service`  | Spring Boot 4, Java 25 | Hosted shows, episode drafts, uploads, generated RSS feeds |
| `@pocast/library-service`  | `apps/library-service`  | .NET 9                 | Follows and playback progress                              |
| `@pocast/contracts`        | `libs/contracts`        | TypeScript             | Message patterns, queue names, DTOs and response shapes    |
| `@pocast/microservice-kit` | `libs/microservice-kit` | TypeScript             | Shared helpers for the NestJS services                     |

A few decisions shape everything else:

- **The gateway is the only thing on the internet.** Services have no HTTP
  port. The gateway validates input, checks the access token and forwards the
  call as an RPC message.
- **One database per service.** No service reads another service's tables.
  If catalog-service needs a hosted show's feed, it asks creator-service for
  it over RabbitMQ.
- **Audio never flows through our code.** Listeners stream directly from the
  publisher's server or from our bucket/CDN, and creators upload straight to
  S3 with a presigned URL.
- **Every service speaks the same wire format,** whatever language it is
  written in. Details are in [Talking between services](#talking-between-services).

## Getting started

You need Node 22+, pnpm, Docker, the .NET 9 SDK and JDK 25 or newer. Maven is
not required because creator-service ships with the Maven wrapper.

```sh
pnpm install
cp .env.example .env
node tools/scripts/generate-jwt-keys.mjs >> .env
pnpm infra:up
pnpm db:deploy
pnpm dev
```

`infra:up` starts RabbitMQ (`:5672`, management UI on `:15672`, `guest`/`guest`),
Postgres (`:5433`, so it does not fight a local install on 5432), Redis
(`:6379`) and an S3 mock (`:9090`). `db:deploy` runs the migrations of every
service. `pnpm dev` starts the gateway on `http://localhost:3000/api` together
with all four services.

The JWT key script generates a fresh Ed25519 key pair for local use. Production
keys belong in your secret manager, not in `.env`.

A quick tour from the command line:

```sh
curl -X POST localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a long passphrase"}'

curl 'localhost:3000/api/podcasts?language=en&category=technology&limit=20'
curl 'localhost:3000/api/podcasts/search?q=history'
```

## The API

Everything lives under `/api`. Routes marked _Bearer_ need an access token in
`Authorization: Bearer <token>`. Lists are capped at 50 items and paginate with
an opaque cursor: send the `nextCursor` you got back as `cursor`, and stop when
it is `null`.

### Accounts and sessions

| Method | Path                 | Auth   | Notes                                                    |
| ------ | -------------------- | ------ | -------------------------------------------------------- |
| POST   | `/auth/register`     |        | `{ email, password }` → `{ user, tokens }`. 5/min per IP |
| POST   | `/auth/login`        |        | Same response. 10/min per IP                             |
| POST   | `/auth/refresh`      |        | `{ refreshToken }` → a new token pair. 30/min per IP     |
| POST   | `/auth/logout`       |        | `{ refreshToken }` ends the session on this device       |
| POST   | `/auth/logout-all`   | Bearer | Ends every session of the user                           |
| GET    | `/auth/me`           | Bearer | The current user                                         |
| GET    | `/auth/sessions`     | Bearer | Active sessions, one per device                          |
| DELETE | `/auth/sessions/:id` | Bearer | Signs out a single device                                |

### Catalog

| Method | Path                     | Auth            | Notes                                                   |
| ------ | ------------------------ | --------------- | ------------------------------------------------------- |
| GET    | `/podcasts`              |                 | Recently updated first. Filters: `language`, `category` |
| GET    | `/podcasts/search`       |                 | `q`, optional `language`, `limit`, `offset` (up to 200) |
| GET    | `/podcasts/:id`          |                 | Show details including category slugs                   |
| GET    | `/podcasts/:id/episodes` |                 | Newest first                                            |
| POST   | `/podcasts/import`       | Editor or admin | `{ feedUrl }`. Safe to call twice for the same feed     |

Catalog responses are cacheable (`public, max-age=60, stale-while-revalidate=300`),
so a CDN in front of the gateway absorbs most read traffic.

### Library

| Method | Path                                 | Auth   | Notes                                                                   |
| ------ | ------------------------------------ | ------ | ----------------------------------------------------------------------- |
| GET    | `/library/follows`                   | Bearer | Followed shows, newest first                                            |
| PUT    | `/library/follows/:podcastId`        | Bearer | Follow. Calling it again changes nothing                                |
| DELETE | `/library/follows/:podcastId`        | Bearer | Unfollow                                                                |
| PUT    | `/library/progress/:episodeId`       | Bearer | `{ podcastId, positionSeconds, durationSeconds?, completed, playedAt }` |
| GET    | `/library/progress?episodeIds=a,b,c` | Bearer | Progress for up to 100 episodes in one call                             |
| GET    | `/library/progress/in-progress`      | Bearer | The "continue listening" shelf                                          |

### Studio and feeds

| Method | Path                                   | Auth   | Notes                                                |
| ------ | -------------------------------------- | ------ | ---------------------------------------------------- |
| POST   | `/studio/shows`                        | Bearer | Create a show. Up to 20 per creator                  |
| GET    | `/studio/shows`                        | Bearer | Your shows                                           |
| GET    | `/studio/shows/:id`                    | Bearer | One of your shows                                    |
| PATCH  | `/studio/shows/:id`                    | Bearer | Edit any subset of the fields                        |
| POST   | `/studio/shows/:id/artwork`            | Bearer | Get an upload URL for JPEG or PNG cover art (≤10 MB) |
| POST   | `/studio/shows/:id/artwork/complete`   | Bearer | Confirm the upload                                   |
| POST   | `/studio/shows/:id/episodes`           | Bearer | Create a draft episode                               |
| GET    | `/studio/shows/:id/episodes`           | Bearer | Drafts and published episodes                        |
| GET    | `/studio/episodes/:id`                 | Bearer | One episode                                          |
| POST   | `/studio/episodes/:id/upload`          | Bearer | Get an upload URL for the audio (≤500 MB)            |
| POST   | `/studio/episodes/:id/upload/complete` | Bearer | `{ durationSeconds }`, confirms the upload           |
| POST   | `/studio/episodes/:id/publish`         | Bearer | Goes live. Fails with 409 if there is no audio yet   |
| GET    | `/feeds/:showId`                       |        | The show's public RSS feed                           |

If you ask for someone else's show or episode, you get a 404 rather than a 403,
so the API never confirms that a given ID exists.

## How the pieces work

### Authentication

auth-service is the only service that can sign tokens. Access tokens are EdDSA
(Ed25519) JWTs that live for 15 minutes. The gateway verifies them locally with
the public key, so an ordinary request never waits on auth-service.

Refresh tokens are opaque, last 30 days and can be used exactly once. Every
refresh hands out a new one. If an old one ever comes back, we assume it was
stolen and revoke the whole session. We only store a SHA-256 digest of each
refresh token.

Passwords are hashed with Argon2id using OWASP's recommended parameters, and
older hashes are upgraded quietly the next time the user logs in. Following
NIST 800-63B, we only require a length of 8 to 128 characters, with no "must
contain a symbol" rules. Login answers the same way, and takes about the same
time, whether the email is unknown, the password is wrong or the account is
disabled.

Rate limits are counted in Redis, so every gateway replica sees the same
numbers. If the gateway runs behind proxies or a load balancer, set
`TRUST_PROXY_HOPS` so client IPs are read correctly.

Roles are `LISTENER` (the default), `CREATOR`, `EDITOR` and `ADMIN`. A gateway
route opts in with `@Authenticated()` or `@Authenticated('EDITOR', 'ADMIN')`.

### Crawling the catalog

catalog-service has three jobs. You can run all of them in one process or
split them across deployments with `CATALOG_ROLES`:

- **api** answers reads, searches and imports on `catalog_queue`.
- **scheduler** wakes up every 30 seconds and claims feeds that are due with
  `FOR UPDATE SKIP LOCKED` and a 10 minute lease. You can run as many
  schedulers as you like and no feed gets picked twice.
- **worker** consumes refresh jobs from `catalog_ingest_queue` with manual
  acks. `CATALOG_INGEST_CONCURRENCY` caps how many feeds one process fetches
  at a time.

Crawling tries hard to be polite and cheap. It sends conditional requests
(ETag and Last-Modified) and also hashes the body, so a feed that has not
changed costs almost nothing. How often a feed is polled depends on how
active the show is: every 15 minutes for daily shows, once a day for dormant
ones, with ±10% jitter so the requests do not all land at the same moment.
Failures back off exponentially. A feed that disappears (404 or 410), or fails
20 times in a row, is hidden.

Because we fetch URLs that strangers give us, the fetcher refuses private and
internal addresses. That includes addresses reached through redirects or DNS
rebinding. It also gives up on feeds larger than 15 MB and on servers that
answer too slowly.

### Hosting a show

Hosting is an upload flow with one extra step at the end:

1. The creator makes a show and a draft episode in the studio.
2. They ask for an upload URL. creator-service returns a short-lived presigned
   S3 `PUT` URL that is pinned to the declared content type and size. The
   file goes straight from their device to the bucket.
3. They call `upload/complete`. creator-service runs a `HEAD` on the object and
   only accepts it if the file is really there and its size and type match
   what was declared.
4. They publish. The episode and the show go live, and the show's RSS feed is
   available at `/api/feeds/:showId`. It includes the iTunes tags, so the
   creator can submit the same URL to Apple Podcasts and Spotify.

When the publish transaction commits, creator-service puts a
`catalog.hosted.sync` event on the catalog's ingest queue. catalog-service
picks it up, asks creator-service for the feed over RPC and runs it through
the same parser and upsert code it uses for any RSS podcast. The show then
appears in the catalog as `HOSTED`, with no HTTP round trip involved. Edits to
a published show, such as a new title or new artwork, go through the same
path.

In development, the S3 mock in `docker-compose.yml` stands in for the bucket.
It does not check signatures and forgets its files when it restarts. In
production, point the `MEDIA_*` variables at S3, R2 or any S3-compatible store,
and set `MEDIA_PUBLIC_BASE_URL` to the CDN in front of it.

### Library sync

library-service keeps two things per user: the shows they follow and how far
they got in each episode. Clients send progress updates with the time they
were played (`playedAt`). An update only overwrites what is stored if it is
newer, so a phone that was offline for an hour cannot undo the progress you
made on your laptop in the meantime. A `playedAt` in the future is clamped to
the server's clock, so a device with a wrong clock cannot win every conflict.

Each write is a single `INSERT ... ON CONFLICT` statement, and the
"continue listening" shelf reads from a partial index that only covers
unfinished episodes.

### Search

Search runs on Postgres. Title, author and description are combined into a
weighted `tsvector` that a trigger keeps up to date. It uses the `simple`
configuration on purpose: pocast is global, and an English stemmer would make
a mess of Turkish or Japanese titles. The last word of the query is treated as
a prefix, so search works as the user types. A trigram index on the title
catches typos, so `artwrk` still finds "Artwork Show". Both indexes are GIN,
and the planner combines them in one bitmap scan.

## Talking between services

All services use the request/reply protocol that NestJS uses for RabbitMQ. It
is simple enough to implement in any language:

```jsonc
// request, sent to the service's queue with replyTo and correlationId set
{ "pattern": "library.follow.add", "data": { "userId": "…", "podcastId": "…" }, "id": "…" }

// reply, sent to replyTo with the same correlationId
{ "id": "…", "response": { "podcastId": "…", "followedAt": "…" }, "err": null, "isDisposed": true }

// a failure puts the error in err
{ "id": "…", "response": null, "err": { "statusCode": 404, "message": "Podcast … not found" }, "isDisposed": true }
```

The gateway turns `err.statusCode` into the HTTP status the client sees.
Anything that does not match that shape becomes a plain 500, so internal
details never leak. Events, such as feed refreshes and hosted syncs, use the
same envelope without an `id`.

The pattern names and payload types live in `@pocast/contracts`. The gateway
and the NestJS services import them from there, so they cannot drift apart.
The .NET and Java services mirror those names and also validate every payload
themselves: unknown fields, missing fields and out-of-range values are
rejected with a 400, just like on the gateway.

Inside each service:

- **library-service (.NET 9)** is a hosted worker around `RabbitMQ.Client` 7.
  It uses Npgsql with hand-written SQL, applies embedded SQL migrations under a
  Postgres advisory lock, and tunes throughput with `LIBRARY_PREFETCH` and
  `LIBRARY_CONCURRENCY`.
- **creator-service (Spring Boot 4, Java 25)** uses Spring AMQP listeners on
  virtual threads, Spring Data JPA entities and Flyway migrations. Hibernate
  runs in `validate` mode, so it checks the schema at startup but never
  changes it. Domain rules live on the entities, for example
  `episode.publish()` and `show.attachArtwork()`.
- **auth-service and catalog-service (NestJS)** use Prisma 7 with the `pg`
  driver adapter.

## Configuration

`.env.example` lists every variable with values that work against
`docker-compose.yml`. The important groups are:

| Variables                                                             | Used by           |
| --------------------------------------------------------------------- | ----------------- |
| `RABBITMQ_URL`, `REDIS_URL`, `PORT`, `TRUST_PROXY_HOPS`               | gateway, services |
| `AUTH_DATABASE_URL`, `AUTH_JWT_*`                                     | auth-service      |
| `CATALOG_DATABASE_URL`, `CATALOG_ROLES`, `CATALOG_INGEST_CONCURRENCY` | catalog-service   |
| `CREATOR_DATABASE_URL`, `CREATOR_PREFETCH`, `CREATOR_CONCURRENCY_*`   | creator-service   |
| `MEDIA_*`, `FEED_PUBLIC_BASE_URL`                                     | creator-service   |
| `LIBRARY_DATABASE_URL`, `LIBRARY_PREFETCH`, `LIBRARY_CONCURRENCY`     | library-service   |
| `*_DB_POOL_MAX`                                                       | each service      |

Every service reads its database as a `postgresql://` URL. The .NET and Java
services convert it to their own connection format at startup.

## Working in the repo

Nx drives everything, including the .NET and Java projects, so the same
commands work everywhere:

```sh
pnpm build                     # every project, cached
pnpm lint
pnpm typecheck
pnpm affected                  # only what your change touched
pnpm graph                     # the dependency graph in the browser

pnpm nx serve @pocast/creator-service
pnpm nx run @pocast/library-service:db-deploy
pnpm db:migrate -- --name <change>   # new Prisma migration for catalog or auth
pnpm db:studio                       # browse the catalog database
```

Tests are optional in this repo. Every project has a `test` target, and it
passes when there is nothing to run, so adding tests later needs no extra
setup.

How migrations work depends on the stack:

| Service       | Tool                     | Where                                                            |
| ------------- | ------------------------ | ---------------------------------------------------------------- |
| auth, catalog | Prisma migrate           | `apps/<service>/prisma/migrations`                               |
| creator       | Flyway                   | `apps/creator-service/src/main/resources/db/migration`           |
| library       | embedded SQL, own runner | `apps/library-service/src/Pocast.Library/Persistence/Migrations` |

The catalog search migration also creates a trigger and the `pg_trgm`
extension. Prisma does not track either of them, so keep that migration intact
if you ever regenerate the schema from scratch.

## Conventions

- **Apps never import other apps.** Shared code goes in `libs/`, and
  `@nx/enforce-module-boundaries` enforces it through the `type:*` and
  `scope:*` tags.
- **Every message pattern is defined in `@pocast/contracts`,** including the
  ones served by the .NET and Java services.
- **NestJS services raise errors with `rpcError()`** from
  `@pocast/microservice-kit`. The other stacks build the same
  `{ statusCode, message }` shape themselves.
- **Built for load.** No query is unbounded, lists use keyset pagination, and
  every query path has an index behind it. Primary keys are UUIDv7, so inserts
  stay index-friendly. Connection pools are sized through the environment.
- **One copy of each Nest package.** `pnpm check:deps` (also run in CI) fails
  if pnpm splits `@nestjs/*` into peer variants. A split copy quietly turns
  expected RPC errors into 500s.
- **No code comments.** Names and small functions are expected to carry the
  meaning.

## Adding a service

New services join the same RabbitMQ protocol and get a `project.json` so that
Nx can build, serve and lint them. For a NestJS service:

```sh
pnpm nx g @nx/nest:app apps/<name>-service --linter=eslint --unitTestRunner=jest \
  --e2eTestRunner=none --strict --tags="type:app,scope:<name>"
```

Then wire `workspaceExternals` into its `webpack.config.js`, add its patterns
and queue name to `libs/contracts`, add a `scope:<name>` rule in
`eslint.config.mjs` and give its `serve` target its own debugger port.

For another language, use `apps/library-service` or `apps/creator-service` as
the template. Each has an `nx:run-commands` `project.json`, a database URL
parser and a small RPC router that implements the envelope described above.
