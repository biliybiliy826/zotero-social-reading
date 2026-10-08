# Architecture

The Zotero extension owns reading UI and local PDF context. A loopback service owns an experimental SQLite store and invokes the already installed Codex CLI for AI suggestions. The service is a local prototype for two clients on one host; it is not a public community backend. No Zotero library item is modified to render remote marks.

## Data flow

1. On opening a PDF, the extension gets its local path and asks the local service to identify it by SHA-256. This exact-file fingerprint is the first prototype's matching key; DOI and cross-edition text anchoring are future work.
2. The service returns published highlights with PDF page index and PDF-space rectangles. The extension draws transient overlays on currently rendered PDF pages. Public highlights and public-note markers have separate visibility switches. Personal Zotero annotations retain priority.
3. A selection popup lets the user write a comment and explicitly publish it. Another reader of the same file can see the mark and reply. The extension never uploads arbitrary private annotations.
4. Clicking “AI read paper” sends only the path to the local service, which extracts text with `pdftotext`, passes bounded text to Codex CLI, validates structured suggestions, and returns private drafts. A human must choose a draft and publish it. Published AI contributions retain `authorKind: "ai"` and an obvious label.

## Trust and limitations

The development service binds to 127.0.0.1 and requires an installation token for every API request. It reads PDFs only within a configured Zotero data directory. Two local test clients share a token; this is not multi-user authentication. The future hosted service needs accounts, per-post ownership, abuse controls, and transport security. PDF DOM overlays use reader internals and need visual regression testing after Zotero updates. Node 24, Zotero 10, and Poppler `pdftotext` are the current targets.
