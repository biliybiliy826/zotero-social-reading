# Codex bridge and rich discussion text — 2026-10-08

Goal: let a reader send the current paper passage and discussion to the installed Codex sidebar as an editable draft, and render Markdown plus LaTeX in Social Reading discussions without turning untrusted content into executable HTML.

Scope: Social Reading's comment, reply, AI guide, and compose surfaces; a small public draft-receive API in the local `zotero-codex` plugin. The user must still click Send in Codex and Publish in Social Reading. No Codex answer is posted publicly by this bridge.

Plan:
1. Inspect both installed extensions and baseline tests. Define a versioned cross-plugin payload containing attachment identity, paper title, PDF page, quote, and discussion text. Resolve the matching Codex paper pane before filling a draft; preserve any unsent draft.
2. Bundle the Codex sidebar's MIT Markdown parser with the independently licensed KaTeX runtime and fonts in Social Reading. Keep stored bodies as source text; render through DOM construction with safe link handling and no raw HTML interpretation.
3. Add explicit Ask Codex actions on Social Reading comments, replies, guide notes, and the selection composer, with useful errors when the companion sidebar is absent or cannot open.
4. Test payload validation, cross-paper isolation, draft retention, Markdown/LaTeX rendering and unsafe-input behavior. Build and install both XPIs in Zotero, verify the real paper workflow, then document deployment and limitations.

Rollback: reinstall the previous XPIs. Hosted D1 schema and stored comments are unchanged; source Markdown remains plain text in storage.

Baseline: both worktrees were clean. Social Reading 0.2.3 passed its static check and 8 tests. Local Codex sidebar source `c79e191` on `feat/runtime-preferences` passed its static check and 63 tests. Zotero had active Social Reading 0.2.3 and Codex sidebar 2026.270.13.3 installed. The Codex sidebar already renders Markdown/KaTeX, but its public `Zotero.CodexSidebar` object did not accept external drafts.

Implemented: Codex exposes draft contract version 1 through `externalDraftVersion` and `prepareExternalDraft(attachmentID, text, tabID)`. Its receiver verifies the active reader and paper attachment, opens and initializes that paper's pane, then appends to the editable composer. Social Reading shows Ask Codex on guide notes, comment cards, replies, AI drafts, and the selection composer. It renders stored comment, reply, and guide source text using a bundled MIT Markdown parser plus KaTeX with raw HTML inert and restricted external links. Comment/reply composition has a live preview. No server schema or endpoint changed.

Verification: Codex `npm run check`, 66 tests on the local integration branch (50 on the isolated upstream branch), and XPI build passed; Social Reading `npm run check`, 11 tests, and XPI build passed. Installed local XPI versions 2026.270.13.4 and 0.2.4 in Zotero 10.0.6. On the open *Attention Is All You Need* PDF, the private guide card rendered with an Ask Codex button; that action opened the matching paper pane and filled its input with title, PDF page, quote, and guide text. The initial real run exposed Zotero's deferred pane initialization, which the receiver now starts explicitly and covers with a regression test. A second real run from the discussion editor rendered Markdown and KaTeX in the live preview and filled the Codex input without sending or publishing. A separate renderer probe confirmed display math rendered via KaTeX and an HTML image tag was not inserted. Test drafts and composer were cleared afterward; public marks remained zero.

Remaining: the [companion sidebar API branch](https://github.com/biliybiliy826/zotero-codex/tree/feat/external-draft-bridge) must be accepted and released upstream before an unmodified upstream XPI supports the handoff. The GitHub integration cannot create a pull request in `RTLiang/zotero-codex` (HTTP 403); the branch is ready for its owner to open a PR. Older Codex sidebars show an upgrade message. The current installed local XPI contains the tested API.
