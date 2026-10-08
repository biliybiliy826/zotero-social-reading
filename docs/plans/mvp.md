# MVP execution plan — 2026-10-08

Goal: test WeRead-like inline public highlights and notes in a real Zotero PDF, with explicit publishing and private AI-generated discussion drafts.

Non-goals for this first slice: public deployment, Zotero account integration, DOI-level cross-edition anchoring, global discovery, mobile clients, and moderation operations.

Steps:
1. Implement loopback service with exact-file matching, publication/replies, private AI suggestions, token validation, and deterministic tests.
2. Implement Zotero reader popup actions and temporary visible-page overlays with independent visibility switches.
3. Package and install into Zotero 10; verify PDF selection, rendering, turn-off behavior, coexistence with Codex and Translate, and AI draft flow.
4. Record observed behavior, limitations, rollback, and next production decisions.

Rollback: disable/uninstall this extension and stop the local service. The extension does not write public data into Zotero's item database. Remove the private runtime directory only after exporting anything users want to keep.

Progress:
- Loopback service, exact-PDF matching, human marks/replies, private AI drafts, and explicit AI publication implemented. Backend two-client and AI anchoring tests pass.
- Installed experimental plugin in Zotero 10.0.6. Real PDF selection popup coexists with Translate for Zotero and Codex; a test mark and reply were published and read from the PDF marker.
- The public highlight and public-note visibility switches independently hid lines and markers. PDF viewport geometry was verified against a real text selection after correcting a marker placement bug.
- A CLI-driven AI reading request generated four validated draft comments from the test paper in about 49 seconds. The in-plugin AI action then generated two private, clearly labeled drafts on pages 17 and 19. The toolbar's draft button navigated to page 19, and explicit publication changed that marker to the public `AI` label.
- Two byte-identical Zotero attachments opened as separate reader tabs. A published AI comment appeared in the other tab when its PDF page loaded, without a manual refresh. A human selection comment and reply were also published through the reader UI.
- The service is enabled as a user-level systemd unit on this test machine, with its proxy environment stored in a private local file. The plugin and service do not contain the user's API keys.

Observed limits:
- The running service is bound to localhost and uses one local token, so the successful two-reader test does not demonstrate cross-machine social use or user authentication.
- AI generation took about 49 seconds in one direct Codex CLI run and depends on the currently available proxy/network. This is an asynchronous draft-generation action, not a guaranteed response time.
- Matching requires byte-identical, locally stored Zotero PDFs; different editions or scanned-only PDFs need later anchoring and OCR work.
