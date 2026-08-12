# Decision Room implementation notes

This document records delivery dependencies that cannot be verified from the repository alone. The refactor keeps strict decision-data gates enabled while these inputs are pending.

## External dependencies

- The current Drizzle Kit release still references the deprecated `@esbuild-kit` loader. The repository pins its compatible core utility to `vendor/core-utils`, which keeps the loader API while resolving `esbuild` to the patched `0.25.x` line. Remove this override when Drizzle Kit ships a native replacement.
- Production decision-data imports require a reviewed and licensed source for game compatibility, network pools, platform offerings, subscription availability, and prices. The import scripts reject incomplete provenance and do not enable `COMPLETE` rows without a source URL and verification timestamp.
- YouTube gameplay search requires `YOUTUBE_API_KEY` in the server environment. Without it, the provider fails closed and the room flow continues without a video recommendation.
- Production deployment must set the real HTTPS web origin, API origin, database URL, token pepper, and CSP allow-list. The checked-in defaults are local-development values only.
- If a reverse proxy terminates the API connection, configure the platform so the API receives a trusted client address before relying on IP-based rate limits. The server intentionally does not trust arbitrary `X-Forwarded-For` headers.
- A persistent scheduler or platform job must invoke `npm run purge:expired` at the configured retention interval. The command is idempotent and emits expiration events for active realtime listeners.
- Legal/privacy review remains required for the final retention period, processor agreements, and user-facing LGPD wording before production launch.

## Audit decisions

- Public room snapshots expose only public participant fields. Private subscriptions, owned games, PC tier, and preference details are returned only to the owning session or to the internal start-room transaction.
- Database constraints enforce provenance, positive numeric ranges, and same-room participant references in addition to the application checks.
