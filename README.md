# Zotero Social Reading (prototype)

Inline public highlights and discussion for Zotero PDFs. Readers opt in to seeing shared marks; private Zotero annotations are never published automatically. AI reading suggestions are labeled and remain private drafts until explicitly published.

This is a local two-client prototype, not an internet community service. See [docs/index.md](docs/index.md) and [docs/plans/mvp.md](docs/plans/mvp.md).

## Run the prototype

Requirements: Zotero 10.0.x, Node 24+, `pdftotext` (Poppler), and an installed, logged-in Codex CLI for AI suggestions. The current service supports PDFs stored inside the Zotero data directory's `storage` folder.

```bash
npm test
npm run check
npm run build
npm run serve
```

Install `dist/zotero-social-reading-0.1.5.xpi` via Zotero's Add-ons manager. Start the service before opening a PDF. It listens only on `127.0.0.1:34241` and creates a private token in `<Zotero data directory>/social-reading/dev-token`, read by the plugin. If your Zotero data directory is custom, launch the service with `ZOTERO_DATA_DIR=/absolute/path npm run serve`.

The PDF toolbar has separate **公共划线** and **公共笔记** switches. Both start off. Select PDF text and choose **发表讨论** to create a public mark. Click a note marker in the PDF to read and reply. **AI 读论文** extracts selectable PDF text and asks the local Codex CLI for key points and questions. Its purple markers are private drafts; the **AI 草稿** toolbar button jumps to each one, and publishing one requires a separate click. AI identity remains visible after publication.

For a two-client test on one machine, both Zotero profiles must point to this development service and share its local token. The server currently uses an exact PDF hash, so use byte-identical copies of the PDF. A hosted multi-user service and accounts are not implemented.
