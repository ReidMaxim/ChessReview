# Phase 10 — Coach Intelligence 2.0: Research and design

**Status:** research completed, implementation pending (October 9, 2026). This changes no app behavior.  
**Goal:** explain why important moves matter with evidence from Stockfish and legal chess continuations, without requiring a paid API, account, persistent game library, or language model.

## Core finding

The limiting factor is not prose. The present quick review assigns approximate centipawn-loss buckets by comparing separately searched before/after positions (depth 6–12), and the coaching layer identifies a few motifs that happen to appear in the after-position principal variation. A real fork or check in a line is not automatically the *reason* the evaluation changed. The v06.5 coach cannot reliably establish causal alternatives in complex positions.

Our highest-leverage improvement is an **on-demand deeper investigation of a selected move from one shared root position**, comparing an unrestricted best move against the move actually played. The best and played continuations can then be checked and explained together.

## Existing architecture

- src/lib/engine.ts: one active Stockfish Lite Single WASM Worker search, serialized queues and cancel behavior, depth-aware completed-result cache.
- src/lib/engine-utils.ts: parses PV rank 1, depths and cp/mate scores normalized to White; ignores other MultiPV entries and UCI bound qualifiers.
- src/lib/game-review.ts: first-pass scores, best moves and up to 16 UCI moves of PV per game position.
- src/lib/coach-intelligence.ts: verifies PV legality with chess.js and detects check, mate, capture, and knight attacks on two major/minor pieces.
- src/lib/insights.ts and src/components/CoachNotes.tsx: templates plus engine-line replay in the Command Deck.
- src/lib/pgn.ts: stores exact FENs before/after all played plies; the ideal investigation input.
- src/App.tsx: already suspends live position analysis while running full-game reviews and counterfactual previews.

Keep the fast game-wide pass intact. Investigate only an explicitly selected move, not every game position at new higher depth.

## Source-backed technical capabilities

**Stockfish UCI** supports:
1. The MultiPV option, typically 2–3 candidate continuations; leave MultiPV at 1 for speed in routine analysis.
2. Search restriction using a command of the form: go depth D searchmoves <actualUci>. This scores the played move from the SAME pre-move root as the best move.
3. A combined depth and time budget: go depth D movetime M. Whichever limit is met first stops the search.
4. Optionally UCI_ShowWDL for engine-specific win/draw/loss estimates.
5. Progress messages containing achieved depth, PV rank, candidate score, possibly lowerbound/upperbound, and the final bestmove.

Research: official Stockfish UCI wiki (https://github.com/official-stockfish/Stockfish/wiki/UCI-Protocol-and-Stockfish-Commands), Stockfish source options (https://github.com/official-stockfish/Stockfish/blob/master/src/engine.cpp), Stockfish FAQ (https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html).

**chess.js** exposes legal move lists and move metadata; board attacks via isAttacked and attackers; check, mate, and draw checks. A geometrical attacker can be pinned and not legally able to capture, so attacks cannot automatically be described as hanging material.

Research: https://jhlywa.github.io/chess.js/next/ and https://github.com/jhlywa/chess.js/blob/master/website/docs/index.md.

**Lichess accuracy research** warns that a big centipawn change in a completely lost position may have little practical impact, whereas the same change in an equal position is significant. Consider an *estimated winning-chance shift* to RANK interesting moves, with clearly disclosed methodology. Do not claim Chess.com accuracy, and do not treat engine-specific WDL as a guaranteed outcome.

Research: https://lichess.org/page/accuracy and https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/AccuracyPercent.scala.

**External architecture inspirations:** ImMoSer/chess_explaner, expert10000/chess-master, dev-arcturus/positional_chess. Their README descriptions support separating board geometry, engine continuation, motif classification, and natural-language output. Use ideas as references, not copy code; check project license before any reuse.

## Proposed investigation algorithm

Given imported game, chosen ply p and actual move:

1. Load exact original pre-move FEN at game.positions[p-1].
2. Search that SAME FEN with unrestricted MultiPV 2–3, at a targeted depth and time budget. Store ranked candidates.
3. Reset MultiPV to 1 and search the SAME pre-move FEN restricted to the played UCI move using searchmoves. This line begins with the actual move and contains Stockfish's best modeled defense/refutation.
4. Optionally search the resulting post-move FEN for extra tactical resolution, clearly marking it as a distinct search, not a directly comparable score.
5. Parse complete, coherent rank/depth information and its score bounds. Convert evaluations into a consistent player/White perspective. If time expires before target depth, show *achieved* depth.
6. Replay UCI moves through chess.js, record SAN, FEN, player, captures, checks and legal states for each step; stop at the first illegal PV move.
7. Extract motif candidates from the played-versus-best line delta, not merely any motif present on the board. Verify the supporting line and highlight its squares.
8. Generate deterministic explanation with provenance/confidence; when evidence is insufficient, display the two lines and explicitly avoid guessing at the cause.

Important: MultiPV changes search allocation and can be slower or vary in evaluation. Restricting a root move at the same depth helps comparison, but does not make the scores mathematically exact or prove a forcing reason. Filter out or label lowerbound/upperbound UCI scores; don't present them as precise.

## Evidence model

Every explanation should carry a category:

- **Board-confirmed**: legal move actually produces check, checkmate, castle, promotion, capture, or a terminal board state.
- **Engine-shown**: a specific, legal PV shows capture of a named piece, a knight fork on named squares, or a later mate. It is a demonstrated continuation, not guaranteed under all alternatives.
- **Positional observation**: doubled/isolated pawns, open files, poorly defended king, piece activity. It is context, not yet proven causal.
- **Insufficient evidence**: we can say Stockfish prefers a different line but cannot verify a simple why.

First pass motifs: mate in 1, forced-looking mate with caveat, check, actually captured material across a line, knight forks with actual follow-up. Next: safe captures vs tactical sacrifices, pins and skewers, discovered checks, overloaded defenders, pawn promotion threats. Later: king safety and pawn-structure/space features.

Require negative fixtures. A defended knight fork, a pinned nominal attacker, and a queen intentionally sacrificed for a winning attack MUST NOT trigger an unqualified "you hung a piece" claim. A pattern is not the same as a proven advantage.

## Data shapes and cache safety

Investigation result should include:
- Source fingerprint or identifier for the current PGN, ply, fenBefore, playedUci and fenAfter.
- Engine build/version, target and achieved depth, elapsed time, time budget, completion status.
- Best, played and optionally candidate line records, each with root FEN, validated SAN/UCI sequence, score, depth and score-bound metadata.
- Evidence records: motif name, support category, involved squares, line ID and exact PV step.
- Coach output: short verdict, practical explanation, uncertainty/fallback.

Cache key must include at least **engine version, root FEN, depth, MultiPV count, forced move (if any), and search profile**. The current quick-analysis key of FEN + depth is not suitable for constrained-MultiPV searches.

## Worker orchestration

Use a dedicated tested coordinator/arbiter so only one Stockfish Worker search proceeds at a time:
- UCI option changes while idle, then isready acknowledgment before searches.
- Search results indexed by generation ID; ignore callbacks after choosing another ply/PGN or canceling.
- Stop/await bestmove before starting new search; cap per-stage and overall wall time.
- Preserve original imported PGN and board move index while exploring hypothetical lines.
- Release/suspend Worker on cancellation; avoid auto-spending CPU on a hundred positions.
- Keep progress meaningful: "finding alternatives", "checking played move", "verifying tactics".

Potential investigation presets for benchmarking, NOT promised latencies:
- Fast: depth around 12–14, 1–3 sec/search, MultiPV 2.
- Balanced: depth around 14–16, 3–6 sec/search, MultiPV 2–3.
- Thorough: depth up to around 18, at most roughly 10 sec/search, MultiPV 3.

Build defaults from actual CI and ordinary-device measurements, especially lower-power machines. A time limit may stop before the desired depth. Do not leave background infinite searches running.

## User experience inside existing Command Deck

No new top-level pages and no account system. In Coach for an analyzed move:

**[Investigate this move]** (visible when not already complete)

Progress and cancel -> result card:

- "What changed?" a short, clear headline.
- "Here is the evidence" concrete consequences with matching board highlights and SAN moves.
- Toggle "After your move" versus "Better alternative" and replay both on the MAIN board.
- Expand "Technical details" to see score comparison, depth, search limits and confidence.

Keep main board visible on desktop and readable on mobile; distinguish original game from counterfactual lines. Show uncertainty inline, not as a generic block of disclaimers. The user may exit investigation at any time.

## Staged implementation gates

**10A — Grounded search foundation:** MultiPV rank/depth parser, bound flags, searchmoves from same root, exclusive worker coordinator, cancel/race tests. Acceptance: two coherent legally replayable variations, correct perspective, no stale game/ply data, no other feature regresses.

**10B — Causal evidence engine:** deterministic motifs, legal line verification, supported squares, comparative context. Acceptance: demonstrated successes and false-positive tests, especially recaptures/pins/sacrifices.

**10C — Human-readable explanations:** fact-first ranked templates, coach/technical modes, explanatory focus on consequences vs raw scores. Acceptance: the same evidence produces consistent correct prose; lack of evidence produces an honest explanation with no invented tactic.

**10D — UX and performance:** one-button Investigate, cancel, progress, alternative line controls, browser/mobile accessibility, memory/CPU limits. Acceptance: Phase 08 regression and new investigation tests pass; no permanent PGN mutation.

Optional LLM wording belongs AFTER these foundations, and only when user opts in. Restrict the input to verified structured evidence. No required external service or data upload, and no generated chess facts.

## Test corpus and quality gates

At minimum include:
- Fool's Mate sequence, with board-verified immediate Qh4#.
- Knight fork with genuine gain AND an equivalent looking but defended fork.
- Nominal attacker pinned to king, check/discovered check, skewer, sacrifice with compensation.
- Lost queen and then legal recapture; avoid false material conclusions.
- Mate-score vs terminal mate, promotion, en passant, castling, stalemate, insufficient material and FEN-start PGNs.
- UCI MultiPV ranks at unequal depths; truncated/malformed/illegal PV; bounded scores.
- Cancel during stage 1 and 2, switch game during search, hidden tab, repeated position and cache mismatches.
- Phone/tablet/desktop replay and keyboard-accessible Coach controls.
- No new dependencies or licensing incompatibilities without a separate explicit review.

## Future project idea — Parked, not in Phase 10

**Shareable analysis report**: export a game summary with clickable moves revealing Coach and Stockfish evidence.

Best long-term primary format is likely **standalone interactive HTML** (expandable move details, optional board and replay, portable offline). A companion **print-ready PDF** can offer static analysis pages, diagrams and navigable move references. Ordinary PDF viewers do not consistently support dynamic click-to-expand content; do not promise that interaction in a PDF without testing viewer support. No export implementation now.

Personal game library, Chess.com importing, and the interactive blunder trainer remain deliberately on hold.
