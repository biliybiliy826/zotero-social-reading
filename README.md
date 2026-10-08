# Zotero Social Reading

Inline shared PDF highlights and discussion for Zotero 10. The optional **AI 导读** panel offers three depths: **新手 · 详细** (default), **标准 · 重点**, and **简洁 · 核心**. A shared guide for the exact same PDF and depth is reused before Codex is called. AI explanations are shown both in the panel and as clearly labeled markers in the PDF. Generated guides stay private until their reader explicitly clicks **公开共享这份导读**.

This is an experimental invite-only cloud pilot, not a production open community. See [docs/index.md](docs/index.md) and [docs/plans/cloud-pilot.md](docs/plans/cloud-pilot.md).

## Build and test

Requirements: Zotero 10.0.x, Node 24+, Poppler `pdftotext`, and a logged-in Codex CLI for local AI generation.

```bash
npm install
npm run check
npm test
npm run build
```

Install `dist/zotero-social-reading-0.2.2.xpi` in Zotero's Add-ons manager. The PDF toolbar has separate **公共划线** and **公共笔记** switches, plus **AI 导读**. Select PDF text and choose **发表讨论** to publish a comment. Personal Zotero annotations are never uploaded automatically.

The current shared pilot URL is `https://zotero-social-reading-api.zotero-social-reading.workers.dev`. Enter it under **AI 导读 → 共享服务设置**. Anonymous reading needs only the URL; publishing currently requires an invited-user token from the maintainer. The token is stored under the Zotero data directory at `social-reading/cloud-token`; it must not be committed to Git. Until a hosted endpoint is configured, the plugin continues to use the loopback prototype at `127.0.0.1:34241` for comments. The optional local AI bridge always runs on loopback; start it with `npm run serve` to generate guides. It creates its own private `dev-token` in that directory. The bridge's PDF file access is restricted to Zotero storage and it must never be exposed to the internet.

## Run a local Cloudflare Worker pilot

Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`. Create a D1 database and replace the placeholder ID for cloud deployment. For local-only verification:

```bash
npx wrangler d1 migrations apply zotero-social-reading --local
node scripts/provision-user.mjs 'Test Reader' /tmp/zsr-token /tmp/zsr-user.sql
npx wrangler d1 execute zotero-social-reading --local --file /tmp/zsr-user.sql
npx wrangler dev --local
node scripts/smoke-worker.mjs http://127.0.0.1:8787 /tmp/zsr-token
```

The smoke script writes a fake paper to the **local** D1 store; do not run it against a public service. For cloud deployment, use Wrangler OAuth, `wrangler d1 create`, apply migrations with `--remote`, provision each invited user via a private SQL file, and deploy. Keep SQL seed files, account IDs, and tokens outside the repository. The first cloud pilot uses exact PDF SHA-256: byte-different editions do not share anchors. Public registration, abuse controls, and moderation are needed before opening writes to anyone.
