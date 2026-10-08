# Cloud pilot execution plan — 2026-10-08

Goal: move explicitly published shared PDF comments from the loopback prototype to a hosted Cloudflare Worker with D1, while keeping PDFs and private AI drafts local. A reader without Codex or Node should be able to install the XPI and read public comments.

Non-goals for this pilot: open self-registration, unmoderated anonymous posting, syncing private Zotero annotations, uploading PDFs, or claiming that different PDF editions are anchored reliably before testing them.

Steps:
1. Define a cloud API and D1 schema for papers, versions, marks, replies, author identity, and narrow publication permissions. Build deterministic tests and a local Worker integration run.
2. Split the plugin's public API from its optional local Codex bridge. Compute a PDF fingerprint in Zotero, show connection/auth status, and preserve explicit AI publication.
3. Deploy a private-test configuration to the user's Cloudflare account, migrate the schema, and verify a write from one Zotero reader appears in another through the hosted API.
4. Document setup, data handling, authentication limitations, network/proxy observations, rollback, and the path to open registration.

Safety boundaries: The hosted API must never accept a local file path, full PDF, or private AI draft. The server derives the author from an authenticated credential. Public reads may be anonymous; writes need an account credential. Keep test credentials and Cloudflare account IDs out of Git.

Rollback: Switch the extension's public endpoint back to the local prototype and disable the hosted Worker. Do not delete D1 data before export.

Progress:
- Worker/D1 schema and invite-token authentication implemented. D1 and Worker deployed to the user's Cloudflare account in APAC at `https://zotero-social-reading-api.zotero-social-reading.workers.dev`. Local Wrangler config, account credentials, and publishing token remain outside Git.
- Reader panel has beginner (default), standard, and concise guide tiers. It checks the shared cache first, generates privately through the optional loopback Codex bridge on a miss, and shares only after a separate click.
- Local Worker smoke verified anonymous reads, token-gated writes, replies, guide uniqueness, and path rejection. Existing Node tests and static checks passed. `npm audit` found no vulnerabilities after pinning a patched `sharp` release for Wrangler's dev dependency.
- Real Zotero 10.0.6 test: installed 0.2.1, connected from the guide panel, generated beginner (12 comments), standard (6), and concise (3) guides for *How AI Impacts Skill Formation*, and explicitly shared each. A second byte-identical PDF attachment displayed the beginner guide and inline markers without invoking Codex. Anonymous HTTPS GETs returned all three tiers.
- During the first connection, the local proxy intermittently failed TLS; a retry succeeded. The 0.2.1 build kept the generation button disabled through the cache-check refresh during a real standard-tier generation.

Remaining before broad public use: account signup, token rotation/revocation UI, rate limits and moderation, guide quality review and correction workflow, cross-edition anchoring, and repeat Zotero visual checks after future reader updates.
