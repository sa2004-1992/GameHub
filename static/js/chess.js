// ---------------------------------------------------------------------------
// Chess UI controller — uses chess-engine.js for all rules/legality
// ---------------------------------------------------------------------------
const PIECE_GLYPH = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

function initChess(cfg){
  const { game, mode, color, difficulty, names, daily } = cfg;
  const isVsComputer = mode === 'Vs Computer';
  const humanColor = color === 'black' ? 'b' : 'w';
  const computerColor = humanColor === 'w' ? 'b' : 'w';

  // Display names chosen on the setup screen. names[0] is the human's
  // name; in Vs Computer the opponent is always "Computer".
  function playerLabel(sideColor){
    if(isVsComputer){
      return sideColor === humanColor ? ((names && names[0]) ? names[0] : 'Player 1') : 'Computer';
    }
    const whiteName = (names && names[0]) ? names[0] : 'White Player';
    const blackName = (names && names[1]) ? names[1] : 'Black Player';
    return sideColor === 'w' ? whiteName : blackName;
  }

  // Difficulty controls both search depth and how often the computer
  // deliberately plays a weaker move ("blunder"), so the win-rate curve
  // matches the target: Easy ≈ 100% human wins, Medium ≈ 70-80% human wins,
  // Hard ≈ a roughly even fight.
  const AI_CONFIG = {
    Easy:   { depth: 1, blunderChance: 1.0 },
    Medium: { depth: 2, blunderChance: 0.30 },
    Hard:   { depth: 3, blunderChance: 0 },
  };
  const aiConfig = AI_CONFIG[difficulty] || AI_CONFIG.Medium;

  let state = chessNewState();
  let selected = null;         // [r,c] currently selected square
  let legalForSelected = [];   // legal moves from selected square
  let seconds = 0, gameOver = false, moveCount = 0;
  let hintsUsed = 0, hintsMax = 5, hintSquares = null; // hint highlight [from,to]
  let capturedByWhite = [], capturedByBlack = [];
  let pendingPromotion = null; // {from,to} awaiting piece choice
  let moveHistory = [];        // {num, color, text} — for the Move History panel
  let lastMove = null;         // {from,to} of the most recent move, for highlighting
  let liveScore = 0;           // only ever goes up — capture points as you play
  const CAPTURE_VALUE = { Q:50, R:30, B:30, N:30, P:10, K:0 };

  const cellPx = 56;
  const boardEl = document.getElementById('board');
  boardEl.style.position = 'relative';
  boardEl.style.width = boardEl.style.height = (cellPx*8 + 28)+'px';
  boardEl.style.margin = '0 auto';
  boardEl.style.userSelect = 'none';

  // Board orientation: the human's own color is always shown at the
  // bottom of the screen, for both PvP and Vs Computer.
  const flipped = humanColor === 'b';
  function displayPos(r, c){
    return flipped ? [7-r, 7-c] : [r, c];
  }

  function squareColorLight(r,c){ return (r+c)%2===0; }

  function render(){
    boardEl.innerHTML = '';
    const offset = 22;

    // file labels (bottom) — reversed when the board is flipped
    for(let i=0;i<8;i++){
      const fileIdx = flipped ? 7-i : i;
      const lbl = document.createElement('div');
      lbl.textContent = CHESS_FILES[fileIdx];
      lbl.style.cssText = `position:absolute; left:${offset+i*cellPx+cellPx/2-4}px; top:${8*cellPx+offset+2}px; font-size:12px; color:var(--gh-muted); font-weight:600;`;
      boardEl.appendChild(lbl);
    }
    // rank labels (left) — reversed when the board is flipped
    for(let i=0;i<8;i++){
      const rankIdx = flipped ? i : 7-i;
      const lbl = document.createElement('div');
      lbl.textContent = rankIdx + 1;
      lbl.style.cssText = `position:absolute; left:2px; top:${offset+i*cellPx+cellPx/2-7}px; font-size:12px; color:var(--gh-muted); font-weight:600;`;
      boardEl.appendChild(lbl);
    }

    const kingInCheckPos = chessIsInCheck(state, state.turn) ? chessFindKing(state.board, state.turn) : null;

    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const [dr, dc] = displayPos(r, c);
        const cell = document.createElement('div');
        const isLight = squareColorLight(r,c);
        cell.style.cssText = `position:absolute; left:${offset+dc*cellPx}px; top:${offset+dr*cellPx}px; width:${cellPx}px; height:${cellPx}px; background:${isLight ? '#f0d9b5' : '#b58863'}; display:flex; align-items:center; justify-content:center; font-size:38px; cursor:pointer; box-sizing:border-box;`;

        if(selected && selected[0]===r && selected[1]===c){
          cell.style.boxShadow = 'inset 0 0 0 3px #4a90d9';
        }
        if(kingInCheckPos && kingInCheckPos[0]===r && kingInCheckPos[1]===c){
          cell.style.background = '#e74c3c99';
        }
        if(hintSquares && ((hintSquares[0][0]===r && hintSquares[0][1]===c) || (hintSquares[1][0]===r && hintSquares[1][1]===c))){
          cell.style.background = '#facc15aa';
        }
        if(lastMove && ((lastMove.from[0]===r && lastMove.from[1]===c) || (lastMove.to[0]===r && lastMove.to[1]===c))){
          cell.style.boxShadow = (cell.style.boxShadow ? cell.style.boxShadow + ', ' : '') + 'inset 0 0 0 3px #22c55e88';
        }

        const piece = state.board[r][c];
        if(piece){
          const span = document.createElement('span');
          span.textContent = PIECE_GLYPH[piece];
          span.style.color = piece[0]==='w' ? '#fff' : '#111';
          span.style.textShadow = piece[0]==='w' ? '0 0 2px #000, 0 0 1px #000' : '0 0 1px #fff8';
          span.style.pointerEvents = 'none';
          cell.appendChild(span);
        }

        // legal-move dot
        const legalHit = legalForSelected.find(m => m.to[0]===r && m.to[1]===c);
        if(legalHit){
          const dot = document.createElement('div');
          dot.style.cssText = `position:absolute; width:${piece?cellPx-6:16}px; height:${piece?cellPx-6:16}px; border-radius:50%; ${piece ? 'box-shadow: inset 0 0 0 4px rgba(74,144,217,0.7);' : 'background:rgba(74,144,217,0.55);'} pointer-events:none;`;
          cell.appendChild(dot);
        }

        cell.addEventListener('click', () => onSquareClick(r,c));
        boardEl.appendChild(cell);
      }
    }

    document.getElementById('capturedWhite').textContent = capturedByWhite.map(p=>PIECE_GLYPH[p]).join(' ');
    document.getElementById('capturedBlack').textContent = capturedByBlack.map(p=>PIECE_GLYPH[p]).join(' ');
    document.getElementById('timeVal').textContent = ghFormatTime(seconds);
    document.getElementById('hintsVal').textContent = (hintsMax - hintsUsed);
    document.getElementById('scoreVal').textContent = liveScore;
    updateStatus();
  }

  function updateStatus(){
    const statusEl = document.getElementById('statusText');
    if(gameOver) return;
    const status = chessGameStatus(state);
    const turnName = `${playerLabel(state.turn)} (${state.turn === 'w' ? 'White' : 'Black'})`;
    if(status.status === 'check'){
      statusEl.innerHTML = `Turn: <strong>${turnName}</strong> — <span class="text-danger fw-bold">Check! ⚠️</span>`;
    } else {
      statusEl.innerHTML = `Turn: <strong>${turnName}</strong>`;
    }
  }

  setInterval(() => { if(!gameOver){ seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); } }, 1000);

  function onSquareClick(r,c){
    if(gameOver || pendingPromotion) return;
    if(isVsComputer && state.turn === computerColor) return; // not your turn

    const piece = state.board[r][c];

    if(selected){
      const hit = legalForSelected.find(m => m.to[0]===r && m.to[1]===c);
      if(hit){
        if(hit.promotion && hit.promotion !== 'Q'){
          // multiple promotion options exist for this destination; ask user, but only trigger once
        }
        const promoOptions = legalForSelected.filter(m => m.to[0]===r && m.to[1]===c && m.promotion);
        if(promoOptions.length > 1){
          pendingPromotion = { moves: promoOptions };
          showPromotionDialog();
          return;
        }
        performMove(hit);
        return;
      }
      // clicking another own piece re-selects
      if(piece && chessColorOf(piece) === state.turn){
        selected = [r,c];
        legalForSelected = chessLegalMoves(state, selected);
        render();
        return;
      }
      selected = null; legalForSelected = []; render();
      return;
    }

    if(piece && chessColorOf(piece) === state.turn){
      selected = [r,c];
      legalForSelected = chessLegalMoves(state, selected);
      render();
    }
  }

  function showPromotionDialog(){
    const modalEl = document.getElementById('promoModal');
    const body = document.getElementById('promoOptions');
    body.innerHTML = '';
    const color = state.turn;
    ['Q','R','B','N'].forEach(pt => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline-primary fs-3 mx-1';
      btn.textContent = PIECE_GLYPH[color+pt];
      btn.addEventListener('click', () => {
        const mv = pendingPromotion.moves.find(m => m.promotion === pt);
        bootstrap.Modal.getInstance(modalEl).hide();
        pendingPromotion = null;
        performMove(mv);
      });
      body.appendChild(btn);
    });
    new bootstrap.Modal(modalEl, {backdrop:'static'}).show();
  }

  function chessSquareLabel(r, c){ return CHESS_FILES[c] + (8-r); }

  function moveNotation(mv, piece, captured){
    if(mv.castle === 'K') return 'O-O';
    if(mv.castle === 'Q') return 'O-O-O';
    const pieceLetter = {K:'K',Q:'Q',R:'R',B:'B',N:'N',P:''}[chessTypeOf(piece)];
    const fromSq = chessSquareLabel(mv.from[0], mv.from[1]);
    const toSq = chessSquareLabel(mv.to[0], mv.to[1]);
    let s = pieceLetter + fromSq + ((captured || mv.enPassant) ? 'x' : '-') + toSq;
    if(mv.promotion) s += '=' + mv.promotion;
    return s;
  }

  function renderMoveHistory(){
    const el = document.getElementById('moveHistoryList');
    if(!el) return;
    if(moveHistory.length === 0){
      el.innerHTML = '<div class="text-muted small">No moves yet.</div>';
      return;
    }
    // most recent move first
    el.innerHTML = moveHistory.slice().reverse().map(m => {
      const label = playerLabel(m.color);
      return `<div class="small py-1 border-bottom"><span class="text-muted">${m.num}.</span> <strong>${label}</strong> — ${m.text}</div>`;
    }).join('');
  }

  function performMove(mv){
    const movingPiece = state.board[mv.from[0]][mv.from[1]];
    const moverColor = state.turn;
    const { state: ns, captured } = chessApplyMove(state, mv);
    if(captured){
      if(chessColorOf(captured) === 'w') capturedByBlack.push(captured);
      else capturedByWhite.push(captured);
      // In Vs Computer, only the human's own captures earn points.
      // In Player vs Player it's one shared local scoreboard.
      if(!isVsComputer || moverColor === humanColor){
        liveScore += CAPTURE_VALUE[chessTypeOf(captured)] || 0;
      }
    }
    state = ns;
    moveCount++;
    lastMove = mv;
    moveHistory.push({ num: Math.ceil(moveCount/2), color: moverColor, text: moveNotation(mv, movingPiece, captured) });
    renderMoveHistory();
    selected = null; legalForSelected = [];
    render();

    const status = chessGameStatus(state);
    if(status.status === 'checkmate' || status.status === 'stalemate' || status.status === 'draw'){
      finishGame(status);
      return;
    }
    if(isVsComputer && state.turn === computerColor){
      setTimeout(computerMove, 500);
    }
  }

  function computerMove(){
    if(gameOver) return;
    let mv;
    if(Math.random() < aiConfig.blunderChance){
      // Deliberately play a weaker/random legal move for lower difficulties.
      const legal = chessLegalMoves(state);
      mv = legal[Math.floor(Math.random() * legal.length)];
    } else {
      mv = chessBestMove(state, aiConfig.depth);
    }
    if(!mv) return;
    performMove(mv);
  }

  document.getElementById('hintBtn').addEventListener('click', () => {
    if(gameOver || pendingPromotion) return;
    if(isVsComputer && state.turn === computerColor) return; // not your turn to get a hint for
    if(hintsUsed >= hintsMax){ alert('No hints remaining.'); return; }
    const btn = document.getElementById('hintBtn');
    btn.disabled = true;
    btn.textContent = '💡 Thinking...';
    setTimeout(() => {
      const mv = chessBestMove(state, 3);
      btn.disabled = false;
      btn.textContent = '💡 Hint';
      if(!mv) return;
      hintsUsed++;
      hintSquares = [mv.from, mv.to];
      render();
      setTimeout(() => { hintSquares = null; render(); }, 3000);
    }, 30);
  });

  document.getElementById('resignBtn').addEventListener('click', () => {
    if(gameOver) return;
    if(!confirm('Resign this game?')) return;
    finishGame({status:'resign', winner: chessOpp(state.turn)});
  });
  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost.')) window.location.href = '/home';
  });

  function finishGame(status){
    gameOver = true;
    let resultText, humanWon, finalScore;

    if(status.status === 'checkmate'){
      const winnerName = `${playerLabel(status.winner)} (${status.winner === 'w' ? 'White' : 'Black'})`;
      resultText = `🏆 Checkmate — ${winnerName} Wins!`;
      const humanDelivered = !isVsComputer || status.winner === humanColor;
      humanWon = humanDelivered;
      // Win bonus (+250) is added on top of whatever capture points were
      // earned; a loss zeroes the score entirely (never negative).
      finalScore = humanDelivered ? (liveScore + 250) : 0;
    } else if(status.status === 'resign'){
      const winnerName = `${playerLabel(status.winner)} (${status.winner === 'w' ? 'White' : 'Black'})`;
      resultText = `🏳️ Resignation — ${winnerName} Wins!`;
      const humanWonIt = !isVsComputer || status.winner === humanColor;
      humanWon = humanWonIt;
      finalScore = humanWonIt ? (liveScore + 250) : 0;
    } else if(status.status === 'stalemate'){
      resultText = '🤝 Draw — Stalemate';
      humanWon = null;
      finalScore = liveScore + 250;
    } else {
      resultText = '🤝 Draw';
      humanWon = null;
      finalScore = liveScore + 250;
    }

    document.getElementById('statusText').innerHTML = `<strong>${resultText}</strong>`;
    document.querySelector('#completeModal h4').textContent = resultText;
    document.getElementById('finalTime').textContent = ghFormatTime(seconds);
    document.getElementById('finalScore').textContent = finalScore;
    document.getElementById('finalExtraLabel').textContent = 'Moves';
    document.getElementById('finalHints').textContent = moveCount;
    document.getElementById('finalExtra2Label').textContent = 'Result';
    document.getElementById('finalMistakes').textContent = status.status === 'checkmate' ? 'Checkmate' : (status.status === 'resign' ? 'Resignation' : 'Draw');
    document.getElementById('finalStars').textContent = ghStars(finalScore);
    new bootstrap.Modal(document.getElementById('completeModal')).show();

    let result;
    if(humanWon === null) result = 'Completed';
    else result = humanWon ? 'Won' : 'Lost';

    ghSaveResult({
      game, mode, size:'-', difficulty: color, score: finalScore,
      time_taken: seconds, mistakes: 0, hints_used: hintsUsed,
      result, daily
    });
  }

  render();
  if(isVsComputer && state.turn === computerColor){
    setTimeout(computerMove, 500);
  }
}
