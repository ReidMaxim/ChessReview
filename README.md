# ChessReview ♟️

**A free, open-source home for postgame chess review.** Designed to grow into a local Stockfish-powered chess coach—not a clone of Chess.com's interface.

## Current milestone: 01 · Foundation

The first working build provides:

- Responsive Chessground board with clean dark studio interface
- Paste and validate a PGN with chess.js
- Move-by-move navigation and a clickable move list
- Keyboard shortcuts: left/right arrows, Home, End
- Board flip, check/checkmate indication, FEN copy
- A preloaded historic sample (Paul Morphy's 1858 Opera Game)
- Tests, continuous integration, and GitHub Pages deployment workflow

**Not yet included:** Stockfish analysis, engine evaluations, move classifications, best-move arrows, game summaries, coach, Chess.com username search. The interface intentionally does not show fabricated analysis data.

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

1. Make this repo **public** when you're ready to release it; the project is currently intended to be open source.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. From the **Actions** tab, run **Deploy GitHub Pages** manually, or push a commit to main.
4. Public site: https://reidmaxim.github.io/ChessReview/

GitHub Pages cannot supply the response headers needed for some multi-threaded Stockfish WASM builds, so the engine milestone will start with a single-threaded, lightweight browser build.

## Planned milestones

| Stage | Goal |
| --- | --- |
| 01 ✅ | PGN import, board, navigation, GitHub Pages |
| 02 | Browser-side Stockfish engine and best-move arrows |
| 03 | Full-game evaluation graph and transparent move quality |
| 04 | Critical positions, guided review, retry moves |
| 05 | Verified chess explanations and optional system voice |
| 06 | Chess.com public-game username importer and saved history |

## Design boundaries

ChessReview is an **independent postgame learning tool**. No live-game cheating aids, no scraping or browser injection, no account passwords, and no claims of affiliation with Chess.com.

We use **chess.js** (BSD-2-Clause) for legal chess moves and **Chessground** (GPL-3.0-or-later) for the board UI. Future Stockfish browser builds are also GPL licensed. The project itself is distributed under **GPL-3.0-or-later**; respect upstream notices and source-distribution requirements.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
