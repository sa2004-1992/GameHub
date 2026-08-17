import os
import random
from datetime import datetime, date

from flask import Flask, render_template, redirect, url_for, request, jsonify, flash, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, UserMixin, login_user, login_required,
    logout_user, current_user
)
from werkzeug.security import generate_password_hash, check_password_hash

basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'instance', 'gamehub.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to continue.'

# ---------------------------------------------------------------------------
# Games catalog (single source of truth used by backend + templates)
# ---------------------------------------------------------------------------
GAMES = {
    'sudoku': {
        'name': 'Sudoku', 'icon': '🧩', 'type': 'solo',
        'tagline': 'Number Logic Puzzle',
        'sizes': [4, 6, 8, 9, 12, 16],
        'rules': [
            "Fill the grid so every row contains each number exactly once.",
            "Fill the grid so every column contains each number exactly once.",
            "Fill the grid so every box/region contains each number exactly once.",
            "Use logic and deduction only — no guessing required.",
            "Complete the puzzle to save your score, time and history.",
        ],
    },
    'nonogram': {
        'name': 'Nonogram', 'icon': '🖼️', 'type': 'solo',
        'tagline': 'Picture Logic Puzzle',
        'sizes': [4, 6, 8, 9, 12, 16],
        'rules': [
            "Fill cells to reveal the hidden picture.",
            "Row and column numbers show groups of consecutive filled cells.",
            "Separate groups need at least one empty cell between them.",
            "Solve using logic/deduction.",
            "Complete the puzzle to save score, time, size, and difficulty.",
        ],
    },
    'tango': {
        'name': 'Tango', 'icon': '🌙', 'type': 'solo',
        'tagline': 'Binary Logic Puzzle',
        'sizes': [4, 6, 8, 10, 12, 16],
        'rules': [
            "Fill every cell with either ☀️ Sun or 🌙 Moon.",
            "Each row must contain the same number of Suns and Moons.",
            "Each column must contain the same number of Suns and Moons.",
            "You cannot have three identical symbols next to each other horizontally.",
            "You cannot have three identical symbols next to each other vertically.",
            "Cells connected by × must contain opposite symbols.",
            "Cells connected by = must contain the same symbol.",
            "Complete the entire grid using logic.",
            "Every puzzle has one correct solution.",
        ],
    },
    'queens': {
        'name': 'Queens', 'icon': '♛', 'type': 'solo',
        'tagline': 'Chess-Queen Logic Puzzle',
        'sizes': [4, 6, 8, 9, 12, 16],
        'rules': [
            "Place exactly one ♛ Queen in every row.",
            "Place exactly one ♛ Queen in every column.",
            "Place exactly one ♛ Queen in every colored region.",
            "Two Queens cannot touch each other horizontally, vertically or diagonally.",
            "Use X to mark cells where a Queen cannot be placed.",
            "Solve the puzzle using logic and deduction.",
            "Every puzzle has one correct solution.",
        ],
    },
    'snakes': {
        'name': 'Snakes & Ladders', 'icon': '🐍', 'type': 'multi',
        'tagline': 'Board Game',
        'rules': [
            "Goal: be the first player to reach exactly square 100.",
            "All players start at 0 / START. Each turn, roll one six-sided dice and move forward that many squares.",
            "Landing on the bottom of a ladder → climb straight up to its top. Merely passing over a ladder does not activate it.",
            "Landing on the head of a snake → slide straight down to its tail. Merely passing over a snake does not activate it.",
            "Exact-100 rule: you must land on 100 exactly. If your roll would take you past 100, you stay in place and your turn ends.",
            "Rolling a 6 gives you an extra turn.",
            "Multiple players can share the same square — there is no capturing in Snakes & Ladders.",
            "🎲 New board every game: the snake and ladder positions are randomly generated each time you start a game, so no two games are the same.",
            "The first player to land exactly on 100 wins 🏆 — the game ends immediately.",
        ],
        'color_options': [
            {'id': 'red', 'label': 'Red', 'hex': '#e74c3c'},
            {'id': 'green', 'label': 'Green', 'hex': '#27ae60'},
            {'id': 'yellow', 'label': 'Yellow', 'hex': '#f1c40f'},
            {'id': 'blue', 'label': 'Blue', 'hex': '#2980b9'},
        ],
    },
    'ludo': {
        'name': 'Ludo', 'icon': '🎲', 'type': 'multi',
        'tagline': 'Board / Strategy Game',
        'rules': [
            "Goal: move all 4 of your tokens around the board and into your colored home before the other players.",
            "All 4 tokens start in your home yard. Roll a 6 to bring a token out onto its starting square.",
            "Move a token forward by the number rolled. You choose which eligible token to move.",
            "Rolling a 6 gives you an extra turn (capped after 3 sixes in a row to prevent infinite turns).",
            "Landing on an opponent's token captures it — it returns to that player's yard and must roll a 6 to re-enter. Your own tokens are never captured by each other.",
            "⭐ Safe squares (marked with a star, plus every player's start square) protect tokens from capture.",
            "Each color has its own final home path — tokens must travel the full main track, then their own colored home column to reach the center.",
            "Exact-number rule: a token must roll the exact number needed to reach the center. If the roll overshoots, that token cannot move.",
            "Blockade rule: Disabled in this version — a square can be shared without blocking opponents.",
            "The first player to bring all 4 tokens home wins 🏆.",
            "🤖 Vs Computer: the computer plays diagonally opposite you and follows the exact same rules as a human player, including captures.",
            "👥 2 Players / Vs Computer: opponents always sit diagonally opposite (e.g. Red vs Yellow) rather than adjacent corners, for a fairer, more challenging layout.",
        ],
        'color_options': [
            {'id': 'red', 'label': 'Red', 'hex': '#e74c3c'},
            {'id': 'green', 'label': 'Green', 'hex': '#27ae60'},
            {'id': 'yellow', 'label': 'Yellow', 'hex': '#f1c40f'},
            {'id': 'blue', 'label': 'Blue', 'hex': '#2980b9'},
        ],
    },
    'chess': {
        'name': 'Chess', 'icon': '♟️', 'type': 'chess',
        'tagline': 'Strategy Board Game',
        'rules': [
            "Goal: checkmate the opponent's King — put it under attack with no legal way to escape.",
            "Chess is 2 players only: ⚪ White and ⚫ Black. White always moves first.",
            "Each side starts with 16 pieces: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns.",
            "King: 1 square any direction. Queen: any distance horizontally, vertically or diagonally. Rook: any distance horizontally/vertically. Bishop: any distance diagonally. Knight: moves in an L-shape and can jump over pieces. Pawn: 1 square forward (2 on its first move), captures 1 square diagonally forward.",
            "Special moves: Castling (King + Rook, if neither has moved and the squares between are empty and safe), En Passant (a special pawn capture), and Pawn Promotion (a pawn reaching the far rank becomes a Queen, Rook, Bishop or Knight).",
            "Check: your King is under attack — you must immediately get it out of check.",
            "Checkmate: your King is in check with no legal move to escape — the game ends immediately.",
            "Stalemate: the player to move has no legal move but is not in check — the game is a draw.",
            "🤖 Vs Computer: the computer plays fully legal chess and will detect check, checkmate, and stalemate just like a human opponent.",
            "💡 Stuck? You get 5 hints per game — each one highlights a strong move for the side to play, at a small cost to your final score.",
        ],
    },
}
SITE_USER = {
    'full_name': 'Sagar P',
    'username': 'sagar123',
    'email': 'sagarpsagar1@gmail.com',
    'password': 'sagar123',
}
DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert']
PLAYER_MODES = ['2 Players', '3 Players', '4 Players', 'Vs Computer']
CHESS_MODES = ['Player vs Player', 'Vs Computer']
CHESS_COLORS = [
    {'id': 'white', 'label': 'White', 'hex': '#f5f5f5'},
    {'id': 'black', 'label': 'Black', 'hex': '#333333'},
]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    history = db.relationship('GameHistory', backref='user', lazy=True)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)


class GameHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    game = db.Column(db.String(40), nullable=False)          # sudoku, nonogram, ...
    mode = db.Column(db.String(40), default='Solo')          # Solo / 2 Players / ...
    size = db.Column(db.String(20), default='-')
    difficulty = db.Column(db.String(20), default='-')
    score = db.Column(db.Integer, default=0)
    time_taken = db.Column(db.Integer, default=0)            # seconds
    mistakes = db.Column(db.Integer, default=0)
    hints_used = db.Column(db.Integer, default=0)
    result = db.Column(db.String(20), default='Completed')   # Won / Lost / Completed
    is_daily = db.Column(db.Boolean, default=False)
    played_at = db.Column(db.DateTime, default=datetime.utcnow)


class DailyChallenge(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    game = db.Column(db.String(40), nullable=False)
    challenge_date = db.Column(db.Date, default=date.today)
    completed = db.Column(db.Boolean, default=False)
    score = db.Column(db.Integer, default=0)
    time_taken = db.Column(db.Integer, default=0)
    result = db.Column(db.String(20), default='')
    size = db.Column(db.Integer, default=0)
    difficulty = db.Column(db.String(20), default='')

    __table_args__ = (db.UniqueConstraint('user_id', 'game', 'challenge_date', name='uniq_daily'),)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def daily_seed(game, size, difficulty):
    """Deterministic seed so every user gets the SAME puzzle for a game today."""
    today = date.today().isoformat()
    return f"{game}-{today}-{size}-{difficulty}"


def get_daily_record(user_id, game):
    return DailyChallenge.query.filter_by(
        user_id=user_id, game=game, challenge_date=date.today()
    ).first()


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    return redirect(url_for('login'))


@app.route('/register')
def register():
    # Registration is disabled — this is a single-user private site.
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip().lower()
        password = request.form.get('password', '')
        user = User.query.filter(
            (db.func.lower(User.username) == identifier) | (db.func.lower(User.email) == identifier)
        ).first()
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('home'))
        flash('Invalid username/email or password.', 'danger')
    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ---------------------------------------------------------------------------
# Core pages
# ---------------------------------------------------------------------------
@app.route('/home')
@login_required
def home():
    today = date.today()
    daily_status = {}
    for g in GAMES:
        rec = get_daily_record(current_user.id, g)
        daily_status[g] = bool(rec and rec.completed)
    return render_template('home.html', games=GAMES, daily_status=daily_status, today=today)


@app.route('/game/<game>/rules')
@login_required
def game_rules(game):
    if game not in GAMES:
        abort(404)
    info = GAMES[game]
    daily = request.args.get('daily') == '1'
    if daily:
        rec = get_daily_record(current_user.id, game)
        if rec and rec.completed:
            flash("You already completed today's Daily Challenge for this game!", 'info')
            return redirect(url_for('home'))
    if info['type'] == 'solo':
        return render_template('rules_solo.html', game=game, info=info,
                                difficulties=DIFFICULTIES, daily=daily)
    elif info['type'] == 'chess':
        return render_template('rules_multi.html', game=game, info=info,
                                modes=CHESS_MODES, color_options=CHESS_COLORS,
                                is_chess=True, daily=daily)
    else:
        return render_template('rules_multi.html', game=game, info=info,
                                modes=PLAYER_MODES, color_options=info.get('color_options', []),
                                is_chess=False, daily=daily)


@app.route('/game/<game>/play')
@login_required
def game_play(game):
    if game not in GAMES:
        abort(404)
    info = GAMES[game]
    daily = request.args.get('daily') == '1'
    seed = None
    if daily:
        rec = get_daily_record(current_user.id, game)
        if rec and rec.completed:
            flash("You already completed today's Daily Challenge for this game!", 'info')
            return redirect(url_for('home'))

    if info['type'] == 'solo':
        size = int(request.args.get('size', info['sizes'][0]))
        difficulty = request.args.get('difficulty', 'Easy')
        if difficulty not in DIFFICULTIES or size not in info['sizes']:
            abort(400)
        if daily:
            seed = daily_seed(game, size, difficulty)
        template = f'games/{game}.html'
        return render_template(template, game=game, info=info, size=size,
                                difficulty=difficulty, daily=daily, seed=seed)
    elif info['type'] == 'chess':
        mode = request.args.get('mode', 'Player vs Player')
        if mode not in CHESS_MODES:
            abort(400)
        color = request.args.get('color', 'white')
        if color not in ('white', 'black'):
            abort(400)
        template = 'games/chess.html'
        return render_template(template, game=game, info=info, mode=mode,
                                color=color, daily=daily)
    else:
        mode = request.args.get('mode', '2 Players')
        if mode not in PLAYER_MODES:
            abort(400)
        colors_param = request.args.get('colors', '')
        colors = [c for c in colors_param.split(',') if c] or None
        template = f'games/{game}.html'
        return render_template(template, game=game, info=info, mode=mode,
                                colors=colors, daily=daily)


@app.route('/history')
@login_required
def history():
    records = GameHistory.query.filter_by(user_id=current_user.id).order_by(GameHistory.played_at.desc()).all()
    return render_template('history.html', records=records, games=GAMES)


@app.route('/change_password', methods=['POST'])
@login_required
def change_password():
    current_pw = request.form.get('current_password', '')
    new_pw = request.form.get('new_password', '')
    confirm_pw = request.form.get('confirm_password', '')

    if not current_user.check_password(current_pw):
        flash('Current password is incorrect.', 'danger')
    elif len(new_pw) < 6:
        flash('New password must be at least 6 characters.', 'danger')
    elif new_pw != confirm_pw:
        flash('New passwords do not match.', 'danger')
    else:
        current_user.set_password(new_pw)
        db.session.commit()
        flash('Password changed successfully!', 'success')
    return redirect(url_for('profile'))


@app.route('/profile')
@login_required
def profile():
    records = GameHistory.query.filter_by(user_id=current_user.id).all()
    stats = {}
    total_played, total_won, total_lost, total_score = 0, 0, 0, 0
    best_time = None
    for g in GAMES:
        g_records = [r for r in records if r.game == g]
        played = len(g_records)
        won = len([r for r in g_records if r.result == 'Won'])
        lost = len([r for r in g_records if r.result == 'Lost'])
        score = sum(r.score for r in g_records)
        times = [r.time_taken for r in g_records if r.time_taken]
        best = min(times) if times else None
        stats[g] = {'played': played, 'won': won, 'lost': lost, 'score': score, 'best_time': best}
        total_played += played
        total_won += won
        total_lost += lost
        total_score += score
        if best is not None and (best_time is None or best < best_time):
            best_time = best

    daily_completed = DailyChallenge.query.filter_by(user_id=current_user.id, completed=True).count()

    # streak: consecutive days (including today or yesterday) with >=1 completed daily challenge
    streak = 0
    day = date.today()
    while True:
        done = DailyChallenge.query.filter_by(
            user_id=current_user.id, challenge_date=day, completed=True
        ).first()
        if done:
            streak += 1
            day = date.fromordinal(day.toordinal() - 1)
        else:
            if day == date.today():
                day = date.fromordinal(day.toordinal() - 1)
                continue
            break

    return render_template('profile.html', games=GAMES, stats=stats,
                            total_played=total_played, total_won=total_won,
                            total_lost=total_lost, total_score=total_score,
                            best_time=best_time,
                            daily_completed=daily_completed, streak=streak)


@app.route('/leaderboard')
@login_required
def leaderboard():
    from sqlalchemy import func
    rows = db.session.query(
        User.username, func.sum(GameHistory.score).label('total_score'),
        func.count(GameHistory.id).label('games_played')
    ).join(GameHistory, GameHistory.user_id == User.id).group_by(User.id).order_by(
        func.sum(GameHistory.score).desc()
    ).limit(20).all()
    return render_template('leaderboard.html', rows=rows)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@app.route('/api/daily_status/<game>')
@login_required
def api_daily_status(game):
    rec = get_daily_record(current_user.id, game)
    return jsonify({'completed': bool(rec and rec.completed)})


@app.route('/api/save_result', methods=['POST'])
@login_required
def api_save_result():
    data = request.get_json(force=True)
    game = data.get('game')
    if game not in GAMES:
        return jsonify({'error': 'invalid game'}), 400

    is_daily = bool(data.get('daily'))

    record = GameHistory(
        user_id=current_user.id,
        game=game,
        mode=data.get('mode', 'Solo'),
        size=str(data.get('size', '-')),
        difficulty=data.get('difficulty', '-'),
        score=int(data.get('score', 0)),
        time_taken=int(data.get('time_taken', 0)),
        mistakes=int(data.get('mistakes', 0)),
        hints_used=int(data.get('hints_used', 0)),
        result=data.get('result', 'Completed'),
        is_daily=is_daily,
    )
    db.session.add(record)

    if is_daily:
        rec = get_daily_record(current_user.id, game)
        if not rec:
            rec = DailyChallenge(user_id=current_user.id, game=game, challenge_date=date.today())
            db.session.add(rec)
        rec.completed = True
        rec.score = record.score
        rec.time_taken = record.time_taken
        rec.result = record.result
        rec.size = int(data.get('size', 0)) if str(data.get('size', '0')).isdigit() else 0
        rec.difficulty = data.get('difficulty', '')

    db.session.commit()
    return jsonify({'ok': True, 'id': record.id})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
def create_db():
    with app.app_context():
        db.create_all()
        # Seed the single allowed user account if it doesn't exist yet.
        existing = User.query.filter_by(username=SITE_USER['username']).first()
        if not existing:
            user = User(
                full_name=SITE_USER['full_name'],
                username=SITE_USER['username'],
                email=SITE_USER['email'],
            )
            user.set_password(SITE_USER['password'])
            db.session.add(user)
            db.session.commit()


if __name__ == '__main__':
    create_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
