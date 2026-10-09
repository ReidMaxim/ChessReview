# ChessReview ♟️

**A free, open-source home for postgame chess review.** Designed to grow into a local Stockfish-powered chess coach—not a clone of Chess.com's interface.

## Current milestone: 03 · Full-game review

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

**Not yet included:** Free Board/Sandbox mode, Chess.com username lookup, full coaching explanations and proprietary Chess.com accuracy metrics. Our move labels are transparent *heuristics*, not official ratings.

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
| 01.5 📋 | Free Board / Analysis Sandbox: manual legal moves, reset/undo, FEN and PGN export; independent from imported-game review |
| 02 ✅ | Browser-side Stockfish evaluations, best-move arrows and principal variations |
| 03 ✅ | On-demand whole-game evaluation graph, move-quality estimates, progress/cancel controls, critical-move list |
| 04 | Critical positions, guided review, retry moves |
| 05 | Verified chess explanations and optional system voice |
| 06 | Chess.com public-game username importer and saved history |

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

## Free Board / Analysis Sandbox design (researched, not implemented yet)

We already use Chessground for rendering and chess.js for move legality and PGN/FEN.
Chessground supports \`movable\` configuration (legal destinations and an \`after\`
callback); chess.js provides legal moves, turn tracking, SAN, FEN, and undo.

Implementation sketch:
1. Add a separate **Review** / **Free Board** mode. The empty home view remains read-only until Free Board is explicitly selected.
2. Keep a dedicated \`Chess\` instance and move history for sandbox positions; don't write sandbox moves into imported PGNs.
3. Generate \`movable.dests\` from \`chess.moves({ square, verbose: true })\`; on \`after\`, validate and apply the move with chess.js, then update the board from the resulting FEN.
4. Handle castling, en passant, promotion choices, undo/redo, reset, turn rules, orientation, and mobile touch.
5. Export the practice line as PGN and the current position as FEN. Let the user copy a sandbox position into a *separate* postgame/standalone engine analysis view later.
6. When browser Stockfish arrives, make it available for study positions and postgame analysis, not as assistance in games currently being played against other people.

Calling the feature "Free Board" or "Analysis Sandbox" helps avoid confusion with cheating during online live games. Chess.com prohibits using a chess engine or other outside help during ongoing live games.

See:
- https://github.com/lichess-org/chessground/blob/master/src/config.ts
- https://support.chess.com/en/articles/8568369-what-do-i-need-to-know-about-fair-play-on-chess-com

## Design boundaries

ChessReview is an **independent postgame learning tool**. No live-game cheating aids, no scraping or browser injection, no account passwords, and no claims of affiliation with Chess.com.

We use **chess.js** (BSD-2-Clause) for legal chess moves and **Chessground** (GPL-3.0-or-later) for the board UI. Future Stockfish browser builds are also GPL licensed. The project itself is distributed under **GPL-3.0-or-later**; respect upstream notices and source-distribution requirements.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
