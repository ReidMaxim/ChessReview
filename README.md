# ChessReview ♟️

**A free, open-source home for postgame chess review.** Designed to grow into a local Stockfish-powered chess coach—not a clone of Chess.com's interface.

## Current milestone: 08 · Polish and reliability

The first working build provides:

- Responsive Chessground board with clean dark studio interface
- Paste and validate a PGN with chess.js
- Move-by-move navigation and a clickable move list
- Keyboard shortcuts: left/right arrows, Home, End
- Board flip, check/checkmate indication, FEN copy
- A clean starting-position board when no PGN has been imported (no sample game shown)
- Imported games open on White's first move; Home returns to the starting position
- Tests, continuous integration, and GitHub Pages deployment workflow
- Optional Stockfish 19 Lite WebAssembly analysis, evaluations, best-move arrows, SAN variation and depth controls
- Full-game review, evaluation timeline, classification badges, critical moves and interruptible progress
- Separate Free Board with legal drag/click moves, promotions, undo/redo, reset, FEN load, and PGN/FEN export
- Coach Notes: readable game recaps, per-move analysis, verified board facts, legal best-move alternatives and a before-position arrow
- Enhanced coaching: saved Stockfish principal variations, legally replayable response and alternative lines, checkmate/capture/check and knight-fork evidence, a natural-language Coach view and optional Technical view
- Command Deck: four focused tool views (Moves, Review, Coach, Engine), a pinned chessboard on desktop, independent analysis-panel scrolling, and persistent navigation controls

**Not yet included:** interactive retry-the-move training puzzles, Chess.com username lookup, AI-generated tactical explanations, saved reviews or proprietary Chess.com accuracy metrics. We intentionally avoid claiming tactical reasons that are not proven by engine lines.

## Run locally

Requirements: Node.js 20+ and npm.

~~~bash
npm install
npm run dev
~~~

Run tests and build:

~~~bash
npm test
npm run build
~~~

## Publish on GitHub Pages

1. Keep this open-source repository **public** so visitors can access the website.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. From the **Actions** tab, run **Deploy GitHub Pages** manually, or push a commit to main.
4. Public site: https://reidmaxim.github.io/ChessReview/

GitHub Pages does not provide the cross-origin isolation needed for multithreaded WASM. ChessReview uses **Stockfish 19 Lite Single** instead, from the pinned `stockfish@19.0.0` package. `npm run build` copies unmodified JS and WASM into `public/engine/`; the browser loads these on demand into a Worker. The evaluation is always shown from White's perspective. No paid engine service is needed.

## Planned milestones

| Stage | Goal |
| --- | --- |
| 01 ✅ | Clean initial board, PGN import, first-move navigation, GitHub Pages |
| 01.5 ✅ | Free Board / Analysis Sandbox: legal manual moves, reset/undo/redo, FEN import and FEN/PGN export |
| 02 ✅ | Browser-side Stockfish evaluations, best-move arrows and principal variations |
| 03 ✅ | On-demand whole-game evaluation graph, move-quality estimates, progress/cancel controls, critical-move list |
| 04 ✅ | Dedicated Free Board practice workspace, distinct from imported-game review |
| 05 (on hold) | Interactive blunder replay / coaching puzzles; postponed until the design is polished |
| 06 ✅ | Grounded, rule-based Coach Notes, position-specific explanations, legal engine alternatives and game summary. Voice deferred. |
| 06.5 ✅ | Retain legal engine continuations, evidence-first commentary, selected verified tactical patterns and reversible line replay; optional LLM layer remains experimental |
| 07 ✅ | Redesigned split-screen Command Deck, persistent board and controls, focused tools and Coach-first game-review flow |
| 08 ✅ | Mobile responsive study view, bounded Stockfish caching, hidden-tab suspension, accessible dialogs and five-screen QA |
| Future (on hold) | Chess.com username import; saved games and voice remain future options |

## Phase 10 — Research, not yet implemented

[Coach Intelligence 2.0 technical research and implementation plan](docs/PHASE_10_RESEARCH.md). Research targets matched-root Stockfish comparisons, conservative tactical evidence, replayable better alternatives, natural-language coaching and rigorous tests. The interactive sharing/export concept is parked for a later phase.

## Phase 08 — Polish and reliability

- **Small-screen study mode:** phone portrait view uses a condensed board and a scrollable Command Deck, aiming to keep both usable together. Touch targets are enlarged and breakpoints adapt from 320px phones through desktop widths.
- **Automatic analysis efficiency:** repeated positions at the same requested depth reuse a bounded, completed-result cache (96 positions). Cached partial or shallower scores are never presented as final deep analysis.
- **Background tab behavior:** automatic single-position Stockfish suspends when the page becomes hidden and resumes on return. Explicit full-game review remains a user-controlled task.
- **Accessible dialogs:** Escape closes settings/import, Tab/Shift-Tab remain within open dialogs, and focus returns to the original control when a dialog closes.
- **Regression coverage:** Chromium tests now include a five-size viewport matrix, overflow checks, navigation controls, dialog focus and desktop/mobile board accessibility.

These optimizations remain local-only; preferences continue to be stored in the same browser. The full-game analysis and Free Board interactions are unchanged.

## Command Deck workspace (Phase 07)

We replaced the growing stack of right-side control panels with a single focused deck:

- **Moves:** PGN move history and navigation; opening a game starts here.
- **Review:** evaluation timeline, annotations, critical moves and adjustable full-game analysis.
- **Coach:** human-readable evidence, better-move alternatives and real engine lines. Automatically selected when a full-game review finishes.
- **Engine:** on-demand Stockfish analysis of one specific position, search depth, score and principal variation.

The move-navigation transport is available below every tool, so you can advance through a game while reading Coach Notes. On desktop, the board is pinned alongside the independently scrolling deck. When you click a critical move in Review, the deck opens Coach Notes for that moment. An always-available toolbar shows the review status and starts or stops full-game analysis.

We also replaced the old hero heading with a compact study workspace once a PGN is loaded. A small board status HUD shows the selected move, the evaluation when available, and Copy FEN. Engine-line replay is still marked clearly as a variation and never changes imported PGN history.

On narrow screens the layout switches to a stacked, touch-friendly board and a height-limited tool deck. The navigation and all four tools remain available. We intentionally do not pin a full-sized board over the coach content on small phones.

## Stockfish analysis

1. Import a PGN for a **finished** game.
2. Click **Analyze** to load Stockfish locally in your browser.
3. Navigate to another position or change depth (8–16) to recompute the best continuation. A green arrow shows the engine's recommended next move.
4. **Pause** disposes of the worker to conserve battery and resources.
5. Select **Review game** for the full game; this is a separate, optional analysis and pauses single-position analysis.
6. Full review evaluates each position sequentially at depth 6–12, displays progress and can be stopped. It may take a while for longer games on slower hardware.

Engine licensing: The official Stockfish.js 19 build (GPL-3.0) is included from the npm package without modification at build time. Source, authors, and terms: https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish. ChessReview remains GPL-3.0-or-later.

## How move classifications work

ChessReview evaluates the position **before** and **after** each move using White-perspective Stockfish scores. The score difference is multiplied by the side that moved (so that losing 100 centipawns is bad for either player). Negative losses are clamped to zero.

- **Best:** matches the engine's first recommended UCI move at that depth.
- **Good:** less than 50 centipawns lost.
- **Inaccuracy:** 50–129 centipawns lost.
- **Mistake:** 130–259 centipawns lost.
- **Blunder:** 260+ centipawns lost.

Mate scores are represented as decisive ±1500 centipawns for this approximate bucketing, while the chart clamps the view at ±5 pawns. Game-ending mate and drawn FENs are handled directly without making an engine request. Search-depth differences and shallow mate detection can change labels. We do **not** calculate a proprietary accuracy percentage or call these judgments authoritative.

Game reviews are currently session-only: importing another PGN clears the current report. Analysis runs completely in the browser without sending PGNs to an API. Stop the review to release Stockfish's Worker.

## Coach Notes (Phase 06)

Run **Review game** to unlock Coach Notes below the evaluation timeline. Select a move or a highlighted turning point. The panel shows:

1. Stockfish's recorded **before** and **after** position scores and that move's existing quality label.
2. An explanation of what the measured centipawn loss actually means; no invented tactical causality or made-up plans.
3. Verified board events: captures, check, checkmate, castling, pawn promotion, and immediately available legal captures (not asserted to win material).
4. Stockfish's best legal alternative **from the position before the played move**, converted from UCI to SAN using chess.js.
5. An optional **Show the alternative on the board** action that moves the viewer back one ply and draws a green arrow from the correct pre-move position. **Return** restores the played move. No game notation is changed.
6. A recap of moves reviewed, engine-matching moves, major threshold-crossing moves by side, checks and captures, and up to four biggest evaluation swings.

## Coach Intelligence Upgrade (06.5)

Our first Coach Notes implementation could quantify an error without telling you what followed. The upgrade adds an evidence chain:

1. During a full-game Stockfish review, ChessReview stores up to 16 UCI moves from the engine's principal variation for **each** analyzed position, not only the top move and score.
2. For the selected played move, the **consequence line** starts from the position *after* it; the **better alternative line** starts from the position *before* it. Both are validated through chess.js. Invalid or interrupted PVs are truncated, never treated as factual moves.
3. The coach can discuss visible engine-line evidence: a legal immediate mate, a check, a valuable piece actually captured in the shown line, or a knight's geometric attack on two valuable pieces. It does not assert that a possible capture guarantees a net win.
4. **Replay on the board** shows each line on the main viewer with Next/Previous and Exit controls, without changing imported PGN moves, the position index, or the sandbox. A prominent ENGINE LINE ribbon distinguishes counterfactual continuations from what happened in the actual game.
5. **Coach** prose leads with accessible explanations, while **Technical** mode provides depth and score numbers. No LLM or paid API is required.

The tool still cannot prove why all positional evaluation changes occur; at shallow depth it may miss combinations, and its PV is one plausible engine continuation rather than a full proof. The future optional AI-language stage must take only verified structured chess evidence as input and should never invent tactical reasons. No LLM model is downloaded or run in this release.

All notes are local, deterministic and based on chess.js positions and stored Stockfish review scores. Engine depth matters. Mate-related score buckets are coarse, and the panel does not claim proprietary accuracy estimates. There is no paid service and no generated voice in this release.

## Free Board / Analysis Sandbox

Select **Free Board** to open a completely separate study board:

1. Make legal moves by dragging or clicking pieces. The turn and legal destinations are enforced by chess.js, including castling and en passant.
2. Choose a queen, rook, bishop, or knight when a pawn promotes.
3. Undo and redo moves, click previous moves to navigate, or reset to a standard starting position. Playing a new move after undo creates a new branch and discards the old continuation.
4. Load any valid FEN to practice a custom position.
5. Copy the current position as FEN or the played line through the current cursor as PGN. No game data leaves the browser.
6. Switch back to Game Review without losing the imported PGN or its analysis results; the sandbox retains its own position during the session.

Engine analysis is **deliberately disabled** in Free Board. This prevents the separate practice workflow from becoming a real-time competitive match assistant. To study Stockfish suggestions, import a finished PGN into Game Review instead.

## Deferred enhancements

- A second on-demand deeper search of selected critical positions, with a longer continuation and optionally MultiPV for competing moves.
- More rigorously verified tactics (pins, skewers, tactical exchanges), plus positional features validated against known chess positions.
- Optional browser-based or local LLM rewriting of **structured evidence**, not the chess analysis itself. No hidden cloud transmission, and an equally useful non-AI default.
- Chess.com username import and Blunder Trainer remain on hold per project priorities.

## Design boundaries

ChessReview is an **independent postgame learning tool**. No live-game cheating aids, no scraping or browser injection, no account passwords, and no claims of affiliation with Chess.com.

We use **chess.js** (BSD-2-Clause) for legal chess moves and **Chessground** (GPL-3.0-or-later) for the board UI. Future Stockfish browser builds are also GPL licensed. The project itself is distributed under **GPL-3.0-or-later**; respect upstream notices and source-distribution requirements.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
