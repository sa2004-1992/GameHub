import os
import csv
import json
import random
from datetime import datetime, date

from flask import Flask, render_template, redirect, url_for, request, jsonify, flash, abort, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, UserMixin, login_user, login_required,
    logout_user, current_user
)
from werkzeug.security import generate_password_hash, check_password_hash

basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
# Debug mode is read here (module level) so it also takes effect when the
# app is served by gunicorn/WSGI, not only under `python app.py`.
app.debug = os.environ.get('FLASK_DEBUG', '0') == '1'
# Use a real persistent database when one is provided (e.g. Render/Neon
# Postgres via DATABASE_URL). Falls back to a local SQLite file for local
# development, where no external database is needed.
_db_url = os.environ.get('DATABASE_URL')
if _db_url:
    if _db_url.startswith('postgres://'):
        _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = _db_url
else:
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
    'zip': {
        'name': 'Zip', 'icon': '⚡', 'type': 'solo',
        'tagline': 'Number Path Puzzle',
        'sizes': [5, 6, 7, 8],
        'rules': [
            "Connect all numbered cells in order — 1 → 2 → 3 → 4 → ... — and fill every single cell on the board.",
            "Move only up, down, left, or right — never diagonally.",
            "Start at cell 1 and follow the numbers in order — you cannot skip a number or connect them out of sequence.",
            "The path cannot cross or overlap itself, and cannot pass through a black wall (Hard/Expert boards only).",
            "The puzzle is only complete when the numbered sequence is fully connected AND every playable cell is filled — leaving even one cell empty means it's not solved.",
            "Drag through cells to build your path, or click an earlier cell on your path to undo back to that point.",
            "Hints reveal the next correct cell and never cost you points.",
        ],
    },
    'quiz': {
        'name': 'Quiz', 'icon': '🧠', 'type': 'quiz',
        'tagline': 'Trivia Challenge',
        'rules': [
            "Pick a category, then answer one question at a time — each has 4 answer options.",
            "As soon as you pick an answer, you'll immediately see Correct or Wrong.",
            "You can optionally click Check Solution to see the explanation, then click Next Question to continue.",
            "Correct answer: +10 points. Wrong answer: −5 points (your score never drops below 0). Using a hint never changes your score.",
            "There's no losing condition — play as many questions as you like, then click Stop Quiz whenever you want. Your progress, score, and time are saved the moment you stop.",
            "Each category remembers where you left off internally, so you won't see repeat questions until you've gone through the whole question bank — but the question counter always restarts at Question 1 for a new session.",
            "Every category has a large question bank (1,000+ questions), so there's plenty to explore.",
        ],
    },
}
# ---------------------------------------------------------------------------
# Quiz category catalog + question bank (loaded once at startup)
# ---------------------------------------------------------------------------
QUIZ_DATA_DIR = os.path.join(basedir, 'data', 'quiz')
QUIZ_CATEGORIES = {
    'math':         {'name': 'Math / Mathematics',        'icon': '➗', 'file': '01_Math_Mathematics.csv'},
    'history':      {'name': 'History',                   'icon': '🏛️', 'file': '02_History.csv'},
    'science':      {'name': 'Science',                    'icon': '🔬', 'file': '03_Science.csv'},
    'space':        {'name': 'Space',                      'icon': '🚀', 'file': '04_Space.csv'},
    'kannada':      {'name': 'Kannada Subjects',           'icon': '📘', 'file': '05_Kannada_Subjects.csv'},
    'english':      {'name': 'English Subjects',           'icon': '📗', 'file': '06_English_Subjects.csv'},
    'social':       {'name': 'Social Science',             'icon': '🌍', 'file': '07_Social_Science.csv'},
    'software':     {'name': 'Software',                   'icon': '💻', 'file': '08_Software.csv'},
    'hardware':     {'name': 'Hardware',                   'icon': '🖥️', 'file': '09_Hardware.csv'},
    'ai':           {'name': 'AI – Artificial Intelligence','icon': '🤖', 'file': '10_AI_Artificial_Intelligence.csv'},
    'ml':           {'name': 'ML – Machine Learning',      'icon': '📈', 'file': '11_ML_Machine_Learning.csv'},
    'gk':           {'name': 'General Knowledge (GK)',     'icon': '🧠', 'file': '12_General_Knowledge_GK.csv'},
    'cricket':      {'name': 'Cricket',                    'icon': '🏏', 'file': '13_Cricket.csv'},
    'chess_quiz':   {'name': 'Chess',                      'icon': '♟️', 'file': '14_Chess.csv'},
    'aptitude':     {'name': 'Aptitude',                   'icon': '🧮', 'file': '15_Aptitude.csv'},
    'webdev':       {'name': 'Web Development',            'icon': '🌐', 'file': '16_Web_Development.csv'},
    'puzzles':      {'name': 'Puzzles',                    'icon': '🧩', 'file': '17_Puzzles.csv'},
}

_QUIZ_QUESTIONS_CACHE = {}


def get_quiz_questions(category_key):
    """Load (and cache) the question list for a category from its CSV file."""
    if category_key in _QUIZ_QUESTIONS_CACHE:
        return _QUIZ_QUESTIONS_CACHE[category_key]
    info = QUIZ_CATEGORIES.get(category_key)
    if not info:
        return []
    path = os.path.join(QUIZ_DATA_DIR, info['file'])
    questions = []
    try:
        with open(path, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                answer = (row.get('Correct Answer') or '').strip().upper()
                if answer not in ('A', 'B', 'C', 'D'):
                    continue
                questions.append({
                    'question': (row.get('Question') or '').strip(),
                    'options': {
                        'A': (row.get('Option A') or '').strip(),
                        'B': (row.get('Option B') or '').strip(),
                        'C': (row.get('Option C') or '').strip(),
                        'D': (row.get('Option D') or '').strip(),
                    },
                    'correct': answer,
                    'solution': (row.get('Solution') or '').strip(),
                })
    except FileNotFoundError:
        questions = []
    _QUIZ_QUESTIONS_CACHE[category_key] = questions
    return questions


# ---------------------------------------------------------------------------
# Daily Quiz — a fixed set of 17 questions per calendar day, drawn in order
# from the combined 17,935-question dataset. Every user gets the SAME 17
# questions on the same day, and the dataset position marches forward one
# day at a time, wrapping back to the start once it's fully cycled through.
# ---------------------------------------------------------------------------
QUIZ_DAILY_FILE = 'All_17_Categories_Combined.csv'
QUIZ_DAILY_PER_DAY = 17
QUIZ_DAILY_EPOCH = date(2024, 1, 1)  # fixed reference point so the schedule is stable
_QUIZ_DAILY_BANK_CACHE = None


def get_daily_quiz_bank():
    global _QUIZ_DAILY_BANK_CACHE
    if _QUIZ_DAILY_BANK_CACHE is not None:
        return _QUIZ_DAILY_BANK_CACHE
    path = os.path.join(QUIZ_DATA_DIR, QUIZ_DAILY_FILE)
    questions = []
    try:
        with open(path, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                answer = (row.get('Correct Answer') or '').strip().upper()
                if answer not in ('A', 'B', 'C', 'D'):
                    continue
                questions.append({
                    'question': (row.get('Question') or '').strip(),
                    'options': {
                        'A': (row.get('Option A') or '').strip(),
                        'B': (row.get('Option B') or '').strip(),
                        'C': (row.get('Option C') or '').strip(),
                        'D': (row.get('Option D') or '').strip(),
                    },
                    'correct': answer,
                    'solution': (row.get('Solution') or '').strip(),
                })
    except FileNotFoundError:
        questions = []
    _QUIZ_DAILY_BANK_CACHE = questions
    return questions


def get_daily_quiz_questions_for_today():
    bank = get_daily_quiz_bank()
    total = len(bank)
    if total == 0:
        return []
    per_day = QUIZ_DAILY_PER_DAY
    total_slots = (total + per_day - 1) // per_day  # ceil division, handles any remainder
    day_index = (date.today() - QUIZ_DAILY_EPOCH).days
    cycle_pos = day_index % total_slots
    start = cycle_pos * per_day
    end = min(start + per_day, total)
    return bank[start:end]


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


class QuizProgress(db.Model):
    """Remembers, per user + category, how far into that category's question
    bank we've gotten — so a new Quiz session continues from unused questions
    without repeating, while always displaying 'Question 1' on screen."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    category = db.Column(db.String(40), nullable=False)
    next_index = db.Column(db.Integer, default=0)

    __table_args__ = (db.UniqueConstraint('user_id', 'category', name='uniq_quiz_progress'),)


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
def _parse_names_param(names_param):
    """Safely parse the player-name list passed from the setup screen."""
    if not names_param:
        return None
    try:
        names = json.loads(names_param)
    except (ValueError, TypeError):
        return None
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        return None
    # Trim and cap length so a crafted URL can't inject huge strings
    return [n.strip()[:24] for n in names]


@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    return redirect(url_for('login'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    if request.method == 'POST':
        full_name = request.form.get('full_name', '').strip()
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')

        if not all([full_name, username, email, password, confirm_password]):
            flash('Please fill in every field.', 'danger')
        elif not username.replace('_', '').isalnum():
            flash('Username can only contain letters, numbers, and underscores.', 'danger')
        elif '@' not in email or '.' not in email.split('@')[-1]:
            flash('Please enter a valid email address.', 'danger')
        elif len(password) < 6:
            flash('Password must be at least 6 characters.', 'danger')
        elif password != confirm_password:
            flash('Passwords do not match.', 'danger')
        elif User.query.filter(db.func.lower(User.email) == email).first():
            flash('An account with that email already exists.', 'danger')
        elif User.query.filter(db.func.lower(User.username) == username.lower()).first():
            flash('That username is already taken.', 'danger')
        else:
            user = User(full_name=full_name, username=username, email=email)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            login_user(user)
            return redirect(url_for('home'))
        return render_template('login.html', show_register=True)
    return render_template('login.html', show_register=True)


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
        return render_template('login.html', show_register=False)
    return render_template('login.html', show_register=False)


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
    elif info['type'] == 'quiz':
        if daily:
            return redirect(url_for('game_play', game=game, daily=1))
        return render_template('rules_quiz.html', game=game, info=info,
                                categories=QUIZ_CATEGORIES)
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
        chess_difficulty = request.args.get('difficulty', 'Medium')
        if chess_difficulty not in ('Easy', 'Medium', 'Hard'):
            abort(400)
        chess_names = _parse_names_param(request.args.get('names', ''))
        template = 'games/chess.html'
        return render_template(template, game=game, info=info, mode=mode,
                                color=color, chess_difficulty=chess_difficulty,
                                names=chess_names, daily=daily)
    elif info['type'] == 'quiz':
        if daily:
            daily_questions = get_daily_quiz_questions_for_today()
            return render_template('games/quiz.html', game=game, info=info,
                                    category=None, category_info=None,
                                    daily=True, daily_questions=daily_questions,
                                    daily_total=QUIZ_DAILY_PER_DAY)
        category = request.args.get('category', '')
        if category not in QUIZ_CATEGORIES:
            abort(400)
        # Reset the in-session pointer to the last COMMITTED position every
        # time the quiz page loads. Only "Finish & Save" advances the real
        # saved position — so an abandoned attempt always replays the same
        # questions from the same starting point next time.
        progress = QuizProgress.query.filter_by(user_id=current_user.id, category=category).first()
        if not progress:
            progress = QuizProgress(user_id=current_user.id, category=category, next_index=0)
            db.session.add(progress)
            db.session.commit()
        session[f'quiz_pos_{category}'] = progress.next_index
        return render_template('games/quiz.html', game=game, info=info,
                                category=category, category_info=QUIZ_CATEGORIES[category],
                                daily=False, daily_questions=None, daily_total=0)
    else:
        mode = request.args.get('mode', '2 Players')
        if mode not in PLAYER_MODES:
            abort(400)
        colors_param = request.args.get('colors', '')
        colors = [c for c in colors_param.split(',') if c] or None
        names = _parse_names_param(request.args.get('names', ''))
        template = f'games/{game}.html'
        return render_template(template, game=game, info=info, mode=mode,
                                colors=colors, names=names, daily=daily)


@app.route('/history')
@login_required
def history():
    records = GameHistory.query.filter_by(user_id=current_user.id).order_by(GameHistory.played_at.desc()).all()
    return render_template('history.html', records=records, games=GAMES)


@app.route('/clear_game_data', methods=['POST'])
@login_required
def clear_game_data():
    """Permanently delete every piece of saved GAME data for the logged-in
    user across all 9 games — history, scores, statistics, daily-challenge
    records/streaks, and quiz question-bank progress.

    Deliberately untouched: the User row itself (name, username, email,
    password), and all on-disk assets (game code, question CSVs).
    Scoped to current_user only, so other accounts are unaffected.
    """
    uid = current_user.id

    deleted_history = GameHistory.query.filter_by(user_id=uid).delete(synchronize_session=False)
    deleted_daily = DailyChallenge.query.filter_by(user_id=uid).delete(synchronize_session=False)
    deleted_quiz = QuizProgress.query.filter_by(user_id=uid).delete(synchronize_session=False)
    db.session.commit()

    # Drop any in-flight quiz position held in the browser session so a
    # cleared account really does start from question 1 again.
    for key in [k for k in list(session.keys()) if k.startswith('quiz_pos_')]:
        session.pop(key, None)

    total = deleted_history + deleted_daily + deleted_quiz
    if total:
        flash('All game data cleared. Your account details were not changed.', 'success')
    else:
        flash('There was no game data to clear.', 'info')
    return redirect(url_for('profile'))


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
        if g == 'quiz':
            continue  # Quiz has its own completely separate stats system below
        g_records = [r for r in records if r.game == g]
        played = len(g_records)
        won = len([r for r in g_records if r.result == 'Won'])
        lost = len([r for r in g_records if r.result == 'Lost'])
        score = sum(r.score for r in g_records)
        times = [r.time_taken for r in g_records if r.time_taken]
        best = min(times) if times else None
        highest_score = max((r.score for r in g_records), default=None)
        stats[g] = {'played': played, 'won': won, 'lost': lost, 'score': score,
                     'best_time': best, 'highest_score': highest_score}
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

    # Quiz has its own richer stat set (question banks, correct/wrong totals, etc.)
    # Quiz Statistics only ever reflects Normal Quiz sessions — Daily Quiz
    # results live in the general Daily Completed / Daily Streak system above,
    # same as every other game's daily challenge, not in these Quiz numbers.
    quiz_records = [r for r in records if r.game == 'quiz' and not r.is_daily]
    quiz_stats = {
        'played': len(quiz_records),
        'correct': sum((int(r.size) - r.mistakes) for r in quiz_records if str(r.size).isdigit()),
        'wrong': sum(r.mistakes for r in quiz_records),
        'total_score': sum(r.score for r in quiz_records),
        'highest_score': max((r.score for r in quiz_records), default=0),
        'highest_questions': max((int(r.size) for r in quiz_records if str(r.size).isdigit()), default=0),
        'highest_correct': max(((int(r.size) - r.mistakes) for r in quiz_records if str(r.size).isdigit()), default=0),
        'highest_wrong': max((r.mistakes for r in quiz_records), default=0),
        'highest_time': max((r.time_taken for r in quiz_records), default=0),
    }

    return render_template('profile.html', games=GAMES, stats=stats,
                            total_played=total_played, total_won=total_won,
                            total_lost=total_lost, total_score=total_score,
                            best_time=best_time,
                            daily_completed=daily_completed, streak=streak,
                            quiz_stats=quiz_stats)


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


@app.route('/api/quiz/next/<category>')
@login_required
def api_quiz_next(category):
    if category not in QUIZ_CATEGORIES:
        return jsonify({'error': 'invalid category'}), 400
    questions = get_quiz_questions(category)
    if not questions:
        return jsonify({'error': 'no questions available'}), 500

    # This only advances an in-session (cookie) pointer, NOT the saved
    # database position — so an abandoned quiz never loses its place.
    # The database position only moves forward when the player clicks
    # "Finish & Save" (see /api/quiz/finish below).
    key = f'quiz_pos_{category}'
    if key not in session:
        progress = QuizProgress.query.filter_by(user_id=current_user.id, category=category).first()
        session[key] = progress.next_index if progress else 0

    idx = session[key] % len(questions)
    q = questions[idx]
    session[key] = session[key] + 1
    session.modified = True

    return jsonify({
        'question': q['question'],
        'options': q['options'],
        'correct': q['correct'],
        'solution': q['solution'],
        'bank_size': len(questions),
    })


@app.route('/api/quiz/finish', methods=['POST'])
@login_required
def api_quiz_finish():
    data = request.get_json(force=True) or {}
    category = data.get('category')
    if category not in QUIZ_CATEGORIES:
        return jsonify({'error': 'invalid category'}), 400
    questions = get_quiz_questions(category)
    if not questions:
        return jsonify({'error': 'no questions available'}), 500

    key = f'quiz_pos_{category}'
    session_pos = session.get(key)
    if session_pos is None:
        return jsonify({'ok': True, 'committed': False})

    progress = QuizProgress.query.filter_by(user_id=current_user.id, category=category).first()
    if not progress:
        progress = QuizProgress(user_id=current_user.id, category=category, next_index=0)
        db.session.add(progress)
    progress.next_index = session_pos % len(questions)
    db.session.commit()
    session.pop(key, None)

    return jsonify({'ok': True, 'committed': True})


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
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
else:
    # Also make sure the DB + seeded user exist when run under a WSGI
    # server (gunicorn, PythonAnywhere, etc.) where __main__ never runs.
    create_db()
