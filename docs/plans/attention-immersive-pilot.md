# Attention Is All You Need immersive guide pilot — 2026-10-08

Goal: test whether the beginner guide lets a newcomer follow *Attention Is All You Need* from the first page through the main text and visual appendix, then improve the guide and reader flow where evidence shows gaps.

Non-goals: changing the source PDF, publishing an unreviewed AI guide, or treating references as pages that need a comment each. Existing shared guides for other PDFs must remain unchanged.

Steps:
1. Inventory the local PDF edition, page text/figures, and current hosted cache. Generate a private baseline guide and measure page coverage, anchoring, beginner prerequisites, and end-to-end navigation.
2. Improve generator coverage and in-reader navigation for identified failures. Keep exact-quote validation and private preview; update schema/limits only where necessary.
3. Install the revised XPI in Zotero, verify real PDF markers and guided page-to-page flow, and inspect explanatory quality before any explicit sharing.
4. Run tests, record evidence and limits, then push validated source changes.

Rollback: reinstall 0.2.2 and retain any private guide draft for comparison. Cloud data is unaffected unless a reviewed guide is explicitly shared.

Evidence: one local 2.2 MB PDF with SHA-256 `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697`, 15 pages of extractable text. Pages 1–10 contain main paper content; 11–12 largely references; 13–15 attention visualizations. A second Zotero attachment is missing its local PDF and cannot be used as a second-reader test without downloading it.

Baseline: version 1 generated 12 comments in 31 seconds, covering only pages 2, 3, 5, 6, 8, 9, 10, and 13. It omitted the abstract, core attention equation, training, and final two visualizations. Comments were roughly 90–132 Chinese characters and the panel only jumped to a page.

Revised private guide: version 2 generated 23 comments through the actual Zotero panel, covering every non-bibliography page (1–10, 13–15). The PDF page 4 attention calculation and page 7 training each have two distinct steps. Manual review caught one incorrect algebraic exponent in an earlier run, so the prompt now tells Codex to follow adjacent prose when PDF-extracted superscripts are ambiguous. The final panel run avoids repeating that exponent and explains the learning-rate trend instead. The paper itself has a 41.0/41.8 English–French BLEU discrepancy between prose and table; guide review should preserve that distinction rather than silently resolve it.

Real-reader validation: the XPI was installed in Zotero 10.0.6. Navigating all 23 steps produced 23/23 matching inline markers in the PDF, including pages 13–15; the last marker was in the visible viewport and clicking it opened an AI-labeled private preview. Previous/next navigation worked. The private guide survived plugin reinstall and a Zotero process restart without rerunning Codex. The guide file lives under the Zotero data directory with mode 0600 and is absent from Git. Local Worker smoke validated version 1 compatibility and version 2 guides over 20 comments. Cloud Worker version `1f180b00-6676-4407-9c19-542f44c2fb5c` was deployed; anonymous version 2 lookup for this PDF returned no public guide, as expected.

Remaining limits: this is a functional and editorial walkthrough, not a comprehension study with novice readers. Codex read extracted text rather than the image pixels, so explanations of attention visualization figures are based on captions and surrounding prose. The guide remains private until a reader explicitly publishes it; other users cannot reuse it yet. Progress position is session-local, while the guide content survives restarts.
