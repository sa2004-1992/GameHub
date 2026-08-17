# 🎮 GameHub — Entertainment Games Website

A full-stack Flask web app with **7 playable games** — Sudoku, Nonogram,
Tango, Queens, Snakes & Ladders, Ludo, and Chess — built for a single
private user, with daily challenges, live scoring, score/history tracking,
a leaderboard, and dark/light theme.

Everything is self-contained — Bootstrap/Bootstrap Icons are vendored
locally in `static/vendor` and all page backgrounds are local SVG files
in `static/images`, so **no internet connection is required** to run or
use the site (only the login page's Google Font loads from the web, and
falls back to a system font if offline).

## 🔐 Login

This is a single-user site — there is no public registration. Sign in with:

- **Username:** -------------
- **Email:** ---------------------
- **Password:** ------------

The account is seeded automatically the first time the app runs. You can
change the password any time from the **Profile** page.

## ✅ What's included

- **Puzzle games** (Sudoku, Nonogram, Tango, Queens): Rules → Board Size →
  Difficulty → Play. Each has a fresh randomly-generated puzzle every game
  (and a shared, deterministic puzzle for the Daily Challenge). Score
  updates **live** as you play — a correct move adds points, a wrong move
  subtracts points (with a red/green flash on the cell). There's no
  on-screen mistake counter — wrong moves just cost you score, quietly.
  Up to **20 hints** per puzzle. Full **keyboard support** (arrow keys to
  move the cursor, number/space/letter keys to fill) and **mouse
  drag-to-paint** for quickly marking multiple cells.
- **Board games** (Snakes & Ladders, Ludo, Chess): Rules → Select
  Players/Mode → **Select Colors** (or side, for Chess) → Play. Score is
  calculated only at the end of the game.
  - **Snakes & Ladders**: classic green/white board with a brand-new
    random layout of snakes and ladders every game.
  - **Ludo**: authentic cross-shaped board with 4 yards, colored home
    paths, and safe stars. Both **2 Players** and **Vs Computer** always
    place opponents diagonally opposite (e.g. Red vs Yellow) rather than
    in adjacent corners, for a fairer match.
  - **Chess**: a complete, rules-correct chess engine (perft-verified)
    supporting castling, en passant, promotion, check/checkmate/stalemate
    detection, a minimax computer opponent, and **5 hints per game** that
    highlight a strong move for whoever's turn it is.
- **Daily Challenge**: one puzzle/game per day, deterministic (same
  puzzle for every user that day), can't be replayed once completed.
- **History, Profile** (per-game Played/Won/Lost/Score/Best Time, overall
  totals, Daily Completed + Daily Streak, **Change Password**),
  **Leaderboard**.
- **Dark/Light theme toggle**, with a themed background image behind
  every page (unique per game).

## 🚀 Run it locally / in VS Code

1. Open this folder in VS Code.
2. Create a virtual environment (recommended) and install dependencies:

   **Windows (Command Prompt):**
   ```cmd
   python -m venv venv
   venv\Scripts\activate.bat
   pip install -r requirements.txt
   ```

   **Windows (PowerShell)** — if you hit a "running scripts is disabled"
   error, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
   first, then activate as normal.

3. Run the app:

   ```bash
   python app.py
   ```

4. Open your browser at **http://127.0.0.1:5000** and log in with the
   credentials above.

The SQLite database (`instance/gamehub.db`) and the single user account
are created automatically the first time you run the app.

## 🗂️ Project structure

```
gamehub/
├── app.py                    # Flask app: models, auth, routes, API
├── requirements.txt
├── instance/                 # SQLite DB created here at runtime
├── static/
│   ├── css/style.css         # Theme (light/dark via CSS variables) + layout + page backgrounds
│   ├── images/                # Per-page background SVGs (light + dark variants)
│   ├── js/
│   │   ├── common.js         # theme toggle + shared helpers
│   │   ├── sudoku.js          # generator + validator + controller
│   │   ├── queens.js
│   │   ├── tango.js
│   │   ├── nonogram.js
│   │   ├── snakes.js          # dynamic board generator + renderer
│   │   ├── ludo.js            # classic cross board + full rules
│   │   ├── chess-engine.js    # standalone, perft-verified rules engine
│   │   └── chess.js           # board UI + click-to-move + AI + hints
│   └── vendor/                # Bootstrap + Bootstrap Icons (vendored, offline)
└── templates/
    ├── base.html, login.html (autumn-themed, single-user), home.html
    ├── rules_solo.html        # Rules → Size → Difficulty (4 puzzle games)
    ├── rules_multi.html       # Rules → Mode → Colors (Snakes, Ludo, Chess)
    ├── history.html, profile.html (incl. Change Password modal), leaderboard.html
    └── games/
        ├── _hud.html, _controls.html                (puzzle-game partials)
        ├── _complete_modal.html                      (puzzle completion)
        ├── _complete_modal_board.html                (board-game completion)
        └── sudoku.html, nonogram.html, tango.html, queens.html,
            snakes.html, ludo.html, chess.html
```

## 🎨 Changing backgrounds

Each page's background is set via a CSS custom property in
`static/css/style.css` (search for `.page-home`, `.page-chess`, etc.).
To swap in your own image, replace the `--page-bg` value with
`url('/static/images/your-file.jpg')` and drop the file into
`static/images/`. There's a `[data-theme="dark"]` variant of each rule
if you want a different image for dark mode — delete it to just reuse
the light-mode image instead.

## 🧩 Notes on game logic

- **Sudoku**: real backtracking generator for 4×4, 6×6, 8×8, 9×9, 12×12,
  16×16 with correct box dimensions for each size.
- **Queens**: backtracking solution generator + flood-fill region
  generator so every board has a valid one-queen-per-row/col/region,
  no-touching solution.
- **Tango**: constraint generator enforcing row/column Sun (round,
  orange) / Moon (blue crescent) balance and no-three-in-a-row, with a
  subset of `=`/`×` edge clues shown.
- **Nonogram**: random picture generator with row/column clues computed
  from the solution.
- **Snakes & Ladders**: classic 10×10 boustrophedon board with a **freshly
  randomized** set of 6–7 snakes and 6–7 ladders every game (validated:
  no ladder starts at 100, no snake head at 1, no overlapping cells,
  ladders always climb, snakes always drop).
- **Ludo**: authentic cross-shaped 15×15 board — the 52-cell shared track
  and per-color home columns were verified with an automated script
  (continuity, no duplicate cells, correct home-column alignment for
  every color). Full rules: 6-to-exit, capture, safe squares, exact-finish,
  extra turn on 6 (capped at 3 in a row), diagonal-opponent placement.
- **Chess**: a hand-written legal-move generator, verified against known
  perft values (20 / 400 / 8,902 / 197,281 legal move sequences at depths
  1–4 from the standard starting position — these are the officially
  published correct counts, so the engine's move legality is provably
  correct). Includes castling, en passant, promotion, check, checkmate,
  and stalemate detection. The computer opponent uses minimax with
  alpha-beta pruning and a material + positional evaluation; hints use
  the same search.
- **Live scoring**: in the 4 puzzle games, every move is checked against
  the solution the instant you make it — correct adds points, wrong
  subtracts points — rather than only scoring at the end.
- **Daily Challenge** puzzles use a seeded random generator keyed by
  `game + date + size + difficulty`, so every user gets the *same*
  puzzle for a given game on a given day.

## ⚠️ Production notes

This is set up for local development (SQLite, a hardcoded `SECRET_KEY`).
Before deploying publicly:
- Set a real `SECRET_KEY` via environment variable
- Turn off debug mode
- Switch to MySQL/PostgreSQL (the SQLAlchemy models work unchanged)
- Serve with a production WSGI server (gunicorn/uwsgi) behind nginx
- Change the seeded user's password (or do it from the Profile page)
