# Cloud pilot operations

Hosted endpoint: `https://zotero-social-reading-api.zotero-social-reading.workers.dev`. The public repository includes only `wrangler.example.jsonc`; the working `wrangler.jsonc` contains the D1 ID and is ignored by Git. Wrangler OAuth credentials live outside the repository. D1 is in Cloudflare's APAC location. The initial dataset contains guides for the exact PDF SHA-256 of *How AI Impacts Skill Formation*: beginner (12 comments), standard (6), concise (3).

## Deploy

Authenticate with `npx wrangler login --device` when needed. Copy the example config to `wrangler.jsonc`, set the existing D1 database ID, then run:

```bash
npm run check
npm test
npx wrangler d1 migrations apply zotero-social-reading --remote
npx wrangler deploy
```

Apply a new migration only after reviewing its D1 effect. The local smoke test needs local migrations and a local test user; never point it at the hosted endpoint because it creates synthetic posts.

## Invite a writer

The pilot has no self-registration. Use `scripts/provision-user.mjs` with a private token path and a temporary SQL path **outside the repository**. Apply the generated SQL via `npx wrangler d1 execute zotero-social-reading --remote --file <private-SQL-path>`. Deliver the raw token privately to the invitee; never put it in a command line, issue, log, or Git. The Zotero panel stores it in the Zotero data directory's `social-reading/cloud-token` with owner-only permissions. Keep only the D1 token hash; remove the temporary SQL seed after confirming the user exists. Disable a compromised token by setting that user's `disabled` field to `1` through a reviewed D1 operation, then provision a replacement.

## Verify and rollback

`GET /v1/health` needs no credential. Anonymous `GET /v1/documents/<exact-PDF-SHA256>/guides?tier=beginner&version=2` returns a new immersive beginner guide when one has been explicitly published. Omit `version` to read earlier version 1 guides. In Zotero, enter the endpoint in **AI 导读 → 共享服务设置**, open the same PDF in another reader, and confirm the guide appears without a new Codex process. Cloud network access can fail intermittently through the user's local proxy; distinguish this from a Worker error by checking `/v1/health` from the same machine.

To stop using the cloud service in Zotero, clear its endpoint in the panel. This switches published comments back to the local prototype and leaves the cloud data intact. Roll back a bad Worker deployment through Cloudflare's version history after checking D1 schema compatibility. Do not delete D1 until public data has been exported and users have been informed.

## Pilot boundaries

Reads are public. Every write, including the Worker's `identify` route, requires a personal bearer token derived into a D1 user identity. `identify` accepts only an exact PDF SHA-256 and metadata; it does not accept file paths or PDF bytes. It does not verify that a published AI guide is factually correct or that quotes exist in the PDF; the local generator checks quotations before preview. Different PDF byte versions do not currently share guides or marks. This service still needs user onboarding, rate limits, moderation and corrections, and data export before broad open registration.
