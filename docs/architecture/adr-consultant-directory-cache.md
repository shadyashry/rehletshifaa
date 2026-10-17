# ADR: Consultant directory cache and invalidation

- **Date:** 2026-10-17
- **Status:** Accepted

## Context

The public Consultant directory is editorial data stored in PostgreSQL. It changes rarely, but it appears on the home,
Consultants, care-area and sitemap surfaces. Staff expect a saved publish, unpublish or profile edit to reach those
surfaces within seconds. A transient invalidation failure must not roll back the staff change or leave the directory
stale indefinitely.

The platform already has three possible cache layers:

- a typed Redis cache for shared reference data, with database fallback;
- Next.js' persistent data cache in the visitor-facing frontend;
- nginx and Cloudflare in front of the application.

The backend public endpoint currently permits a five-minute browser cache. The frontend is one self-hosted Next.js
instance today. Live routing, eligibility, credentials, prices used in quotes, authorisation and case data are outside
this decision and remain uncached.

Relevant current guidance:

- Next.js supports time-based `fetch` caching plus tags and recommends tag invalidation for data shared by several
  routes. In Next 16, `revalidateTag` requires an explicit cache-life profile; `{ expire: 0 }` expires the entry
  immediately. <https://nextjs.org/docs/app/guides/caching-without-cache-components>
- Next.js warns that self-hosted multi-instance deployments need a shared cache/tag-coordination handler; invalidating
  one instance does not invalidate the others. <https://nextjs.org/docs/app/guides/self-hosting>
- Cloudflare does not cache dynamic HTML by default. Adding an HTML Cache Rule would create another independently stale
  layer. <https://developers.cloudflare.com/cache/get-started/>
- A transactional outbox commits the business change and delivery work atomically, then retries delivery separately;
  consumers must tolerate duplicate delivery. <https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html>

## Options considered

1. **Next.js data cache only, invalidated by the existing durable outbox.** PostgreSQL remains the backend read source.
2. **Backend Redis plus the Next.js data cache.** This could reduce a measured database hotspot across several backend
   instances, but every write would have to invalidate two independent caches.
3. **Cloudflare or nginx caching in addition to Next.js.** This reduces origin traffic further, while adding another
   purge mechanism and another stale response path.
4. **An in-process after-commit HTTP call.** This avoids an outbox row, but process termination or a transient frontend
   failure can lose the invalidation.

## Decision

Use one application data cache, closest to the visitor: the Next.js data cache.

- Directory reads use a 15-minute TTL and the `consultants` tag. A profile read also carries
  `consultant:<lowercase-kebab-slug>`. Pages remain request-rendered; only the backend fetch result is cached, so a Docker
  build never needs the backend and never prerenders an empty directory.
- Every application service that changes a public-listing fact enqueues one `REVALIDATION` outbox message in the same
  database transaction. The message identifies the practitioner, validated slug, change reason and aggregate version;
  its idempotency key is based on practitioner and version. Rollback therefore persists neither the change nor its
  invalidation.
- The existing outbox worker POSTs over the container network to `/api/revalidate/consultants`, with the shared secret in
  `X-Revalidate-Secret`. Existing retry/backoff handles transient failure. Duplicate delivery is harmless because tag
  expiry is idempotent. Delivery success and failure are counted; failure logs carry only slug and reason.
- The route compares the server-only secret in constant time, accepts only POST, validates the slug, and can invalidate
  only the two fixed tag forms. It does not accept arbitrary tags.
- The public API's browser `Cache-Control` maximum age is shortened from five minutes so a browser does not preserve a
  response after Next has been invalidated. Dynamic HTML is not cached at Cloudflare.
- Do not add `CONSULTANT_DIRECTORY` to Redis. The query is small (13 rows initially), the backend already reads it once
  per Next cache fill, and no measured database load justifies a second invalidation layer.

## Consequences

- A successful edit is visible after outbox delivery and the next request, normally within seconds. The 15-minute TTL is
  the final recovery bound if delivery remains unavailable.
- A failed revalidation never fails or rolls back the staff action. The durable row remains retryable and observable.
- Direct clients of the public backend endpoint may keep a response until its short browser freshness window ends; the
  staff-facing acceptance path is the public Next.js site.
- Scaling the frontend beyond one instance requires a shared Next cache/tag handler before the second instance is added.
  Redis may be used for that coordination then; this ADR does not add it pre-emptively.
- Adding a backend Redis directory cache later requires evidence of query pressure and one more eviction target in the
  same outbox consumer.
