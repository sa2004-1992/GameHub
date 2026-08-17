// ---------------------------------------------------------------------------
// Minimal but rules-complete chess engine (vanilla JS, no dependencies)
// Board: 8x8 array. row 0 = rank 8 (black back rank), row 7 = rank 1 (white).
// col 0 = file a ... col 7 = file h.
// Pieces: 'wP','wN','wB','wR','wQ','wK','bP',... or null
// ---------------------------------------------------------------------------
const CHESS_FILES = ['a','b','c','d','e','f','g','h'];

function chessSquareName(r,c){ return CHESS_FILES[c] + (8-r); }

function chessInitialBoard(){
  const back = ['R','N','B','Q','K','B','N','R'];
  const board = Array.from({length:8}, () => Array(8).fill(null));
  for(let c=0;c<8;c++){
    board[0][c] = 'b'+back[c];
    board[1][c] = 'bP';
    board[6][c] = 'wP';
    board[7][c] = 'w'+back[c];
  }
  return board;
}

function chessNewState(){
  return {
    board: chessInitialBoard(),
    turn: 'w',
    castling: { wK:true, wQ:true, bK:true, bQ:true },
    enPassant: null,     // [r,c] square that can be captured en passant this move
    halfmove: 0,
    fullmove: 1,
    history: []          // list of {move, san}
  };
}

function chessCloneState(state){
  return {
    board: state.board.map(row => row.slice()),
    turn: state.turn,
    castling: Object.assign({}, state.castling),
    enPassant: state.enPassant ? state.enPassant.slice() : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    history: state.history.slice()
  };
}

function chessInBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function chessColorOf(piece){ return piece ? piece[0] : null; }
function chessTypeOf(piece){ return piece ? piece[1] : null; }
function chessOpp(color){ return color==='w' ? 'b' : 'w'; }

const KNIGHT_OFFSETS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_OFFSETS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

// Pseudo-legal moves for the piece at (r,c) - does NOT check king safety.
function chessPieceMoves(state, r, c){
  const board = state.board;
  const piece = board[r][c];
  if(!piece) return [];
  const color = chessColorOf(piece), type = chessTypeOf(piece);
  const moves = [];

  function addSlide(dirs){
    dirs.forEach(([dr,dc]) => {
      let nr=r+dr, nc=c+dc;
      while(chessInBounds(nr,nc)){
        const target = board[nr][nc];
        if(!target){ moves.push({from:[r,c],to:[nr,nc]}); }
        else{
          if(chessColorOf(target) !== color) moves.push({from:[r,c],to:[nr,nc],capture:true});
          break;
        }
        nr+=dr; nc+=dc;
      }
    });
  }

  if(type === 'P'){
    const dir = color==='w' ? -1 : 1;
    const startRow = color==='w' ? 6 : 1;
    const promoRow = color==='w' ? 0 : 7;
    // forward
    if(chessInBounds(r+dir,c) && !board[r+dir][c]){
      if(r+dir === promoRow) ['Q','R','B','N'].forEach(pr => moves.push({from:[r,c],to:[r+dir,c],promotion:pr}));
      else moves.push({from:[r,c],to:[r+dir,c]});
      if(r === startRow && !board[r+2*dir][c]){
        moves.push({from:[r,c],to:[r+2*dir,c],doubleStep:true});
      }
    }
    // captures
    [[dir,-1],[dir,1]].forEach(([dr,dc]) => {
      const nr=r+dr, nc=c+dc;
      if(!chessInBounds(nr,nc)) return;
      const target = board[nr][nc];
      if(target && chessColorOf(target) !== color){
        if(nr === promoRow) ['Q','R','B','N'].forEach(pr => moves.push({from:[r,c],to:[nr,nc],capture:true,promotion:pr}));
        else moves.push({from:[r,c],to:[nr,nc],capture:true});
      } else if(!target && state.enPassant && state.enPassant[0]===nr && state.enPassant[1]===nc){
        moves.push({from:[r,c],to:[nr,nc],capture:true,enPassant:true});
      }
    });
  } else if(type === 'N'){
    KNIGHT_OFFSETS.forEach(([dr,dc]) => {
      const nr=r+dr, nc=c+dc;
      if(!chessInBounds(nr,nc)) return;
      const target = board[nr][nc];
      if(!target) moves.push({from:[r,c],to:[nr,nc]});
      else if(chessColorOf(target)!==color) moves.push({from:[r,c],to:[nr,nc],capture:true});
    });
  } else if(type === 'B'){
    addSlide(BISHOP_DIRS);
  } else if(type === 'R'){
    addSlide(ROOK_DIRS);
  } else if(type === 'Q'){
    addSlide(BISHOP_DIRS.concat(ROOK_DIRS));
  } else if(type === 'K'){
    KING_OFFSETS.forEach(([dr,dc]) => {
      const nr=r+dr, nc=c+dc;
      if(!chessInBounds(nr,nc)) return;
      const target = board[nr][nc];
      if(!target) moves.push({from:[r,c],to:[nr,nc]});
      else if(chessColorOf(target)!==color) moves.push({from:[r,c],to:[nr,nc],capture:true});
    });
    // castling - legality (through-check) verified by caller
    const homeRow = color==='w' ? 7 : 0;
    if(r===homeRow && c===4){
      if(state.castling[color+'K'] && !board[homeRow][5] && !board[homeRow][6] && board[homeRow][7]===color+'R'){
        moves.push({from:[r,c],to:[homeRow,6],castle:'K'});
      }
      if(state.castling[color+'Q'] && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1] && board[homeRow][0]===color+'R'){
        moves.push({from:[r,c],to:[homeRow,2],castle:'Q'});
      }
    }
  }
  return moves;
}

function chessIsSquareAttacked(board, r, c, byColor){
  // Pawns
  const dir = byColor==='w' ? -1 : 1; // white pawns attack "upward" (toward row-1)
  const pr = r - dir; // the row a byColor pawn attacking (r,c) would sit on... actually attacker is at r+? let's derive directly
  // A byColor pawn at (r+ (byColor==='w'?1:-1), c±1) attacks (r,c)
  const attackerRow = r + (byColor==='w' ? 1 : -1);
  for(const dc of [-1,1]){
    const ar = attackerRow, ac = c+dc;
    if(chessInBounds(ar,ac) && board[ar][ac] === byColor+'P') return true;
  }
  // Knights
  for(const [dr,dc] of KNIGHT_OFFSETS){
    const ar=r+dr, ac=c+dc;
    if(chessInBounds(ar,ac) && board[ar][ac] === byColor+'N') return true;
  }
  // King
  for(const [dr,dc] of KING_OFFSETS){
    const ar=r+dr, ac=c+dc;
    if(chessInBounds(ar,ac) && board[ar][ac] === byColor+'K') return true;
  }
  // Sliding: bishop/queen diagonals
  for(const [dr,dc] of BISHOP_DIRS){
    let ar=r+dr, ac=c+dc;
    while(chessInBounds(ar,ac)){
      const p = board[ar][ac];
      if(p){
        if(chessColorOf(p)===byColor && (chessTypeOf(p)==='B' || chessTypeOf(p)==='Q')) return true;
        break;
      }
      ar+=dr; ac+=dc;
    }
  }
  // Sliding: rook/queen orthogonal
  for(const [dr,dc] of ROOK_DIRS){
    let ar=r+dr, ac=c+dc;
    while(chessInBounds(ar,ac)){
      const p = board[ar][ac];
      if(p){
        if(chessColorOf(p)===byColor && (chessTypeOf(p)==='R' || chessTypeOf(p)==='Q')) return true;
        break;
      }
      ar+=dr; ac+=dc;
    }
  }
  return false;
}

function chessFindKing(board, color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c] === color+'K') return [r,c];
  return null;
}

function chessApplyMove(state, move){
  const ns = chessCloneState(state);
  const board = ns.board;
  const [fr,fc] = move.from, [tr,tc] = move.to;
  const piece = board[fr][fc];
  const color = chessColorOf(piece);

  let captured = board[tr][tc] || null;

  // en passant capture
  if(move.enPassant){
    const capRow = color==='w' ? tr+1 : tr-1;
    captured = board[capRow][tc];
    board[capRow][tc] = null;
  }

  board[tr][tc] = move.promotion ? color+move.promotion : piece;
  board[fr][fc] = null;

  // castling rook move
  if(move.castle === 'K'){
    const homeRow = color==='w'?7:0;
    board[homeRow][5] = board[homeRow][7];
    board[homeRow][7] = null;
  } else if(move.castle === 'Q'){
    const homeRow = color==='w'?7:0;
    board[homeRow][3] = board[homeRow][0];
    board[homeRow][0] = null;
  }

  // update castling rights
  if(chessTypeOf(piece) === 'K'){ ns.castling[color+'K']=false; ns.castling[color+'Q']=false; }
  if(fr===7&&fc===0 || tr===7&&tc===0){ ns.castling.wQ=false; }
  if(fr===7&&fc===7 || tr===7&&tc===7){ ns.castling.wK=false; }
  if(fr===0&&fc===0 || tr===0&&tc===0){ ns.castling.bQ=false; }
  if(fr===0&&fc===7 || tr===0&&tc===7){ ns.castling.bK=false; }

  // update en passant target
  ns.enPassant = move.doubleStep ? [(fr+tr)/2, fc] : null;

  ns.halfmove = (captured || chessTypeOf(piece)==='P') ? 0 : ns.halfmove+1;
  if(color==='b') ns.fullmove++;
  ns.turn = chessOpp(color);
  ns.history = state.history.concat([{move, piece, captured}]);
  return { state: ns, captured };
}

// Legal moves for the side to move, filtered so the mover's own king is never left in check.
function chessLegalMoves(state, forSquareOnly){
  const color = state.turn;
  const board = state.board;
  const result = [];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p || chessColorOf(p) !== color) continue;
      if(forSquareOnly && (r!==forSquareOnly[0] || c!==forSquareOnly[1])) continue;
      const pseudo = chessPieceMoves(state, r, c);
      for(const mv of pseudo){
        if(mv.castle){
          // king cannot be in check, cannot pass through or land on attacked square
          const homeRow = color==='w'?7:0;
          if(chessIsSquareAttacked(board, homeRow, 4, chessOpp(color))) continue;
          const pathCols = mv.castle==='K' ? [5,6] : [3,2];
          let blocked = false;
          for(const col of pathCols){
            if(chessIsSquareAttacked(board, homeRow, col, chessOpp(color))){ blocked = true; break; }
          }
          if(blocked) continue;
        }
        const { state: ns } = chessApplyMove(state, mv);
        const kingPos = chessFindKing(ns.board, color);
        if(kingPos && chessIsSquareAttacked(ns.board, kingPos[0], kingPos[1], chessOpp(color))) continue;
        result.push(mv);
      }
    }
  }
  return result;
}

function chessIsInCheck(state, color){
  const kingPos = chessFindKing(state.board, color);
  if(!kingPos) return false;
  return chessIsSquareAttacked(state.board, kingPos[0], kingPos[1], chessOpp(color));
}

function chessGameStatus(state){
  const moves = chessLegalMoves(state);
  const inCheck = chessIsInCheck(state, state.turn);
  if(moves.length === 0){
    return inCheck ? {status:'checkmate', winner: chessOpp(state.turn)} : {status:'stalemate'};
  }
  if(state.halfmove >= 100) return {status:'draw', reason:'50-move rule'};
  return {status: inCheck ? 'check' : 'ongoing'};
}

// ---------------------------------------------------------------------------
// Simple material + light positional evaluation, used by the AI
// ---------------------------------------------------------------------------
const PIECE_VALUE = {P:100,N:320,B:330,R:500,Q:900,K:0};
const PAWN_TABLE = [
  0,0,0,0,0,0,0,0,
  50,50,50,50,50,50,50,50,
  10,10,20,30,30,20,10,10,
  5,5,10,25,25,10,5,5,
  0,0,0,20,20,0,0,0,
  5,-5,-10,0,0,-10,-5,5,
  5,10,10,-20,-20,10,10,5,
  0,0,0,0,0,0,0,0
];
const CENTER_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,0,0,0,0,0,0,-10,
  -10,0,5,5,5,5,0,-10,
  -10,0,5,10,10,5,0,-10,
  -10,0,5,10,10,5,0,-10,
  -10,0,5,5,5,5,0,-10,
  -10,0,0,0,0,0,0,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

function chessEvaluate(state){
  let score = 0;
  const board = state.board;
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      const color = chessColorOf(p), type = chessTypeOf(p);
      let val = PIECE_VALUE[type];
      const idx = color==='w' ? r*8+c : (7-r)*8+c;
      if(type==='P') val += PAWN_TABLE[idx]*0.3;
      else if(type!=='K') val += CENTER_TABLE[idx]*0.3;
      score += (color==='w' ? val : -val);
    }
  }
  return score; // positive favors white
}

function chessMinimax(state, depth, alpha, beta, maximizing){
  const status = chessGameStatus(state);
  if(status.status === 'checkmate') return maximizing ? -100000+depth : 100000-depth;
  if(status.status === 'stalemate' || status.status === 'draw') return 0;
  if(depth === 0) return chessEvaluate(state);

  const moves = chessLegalMoves(state);
  // move ordering: captures first
  moves.sort((a,b) => (b.capture?1:0) - (a.capture?1:0));

  if(maximizing){
    let best = -Infinity;
    for(const mv of moves){
      const { state: ns } = chessApplyMove(state, mv);
      const val = chessMinimax(ns, depth-1, alpha, beta, false);
      if(val > best) best = val;
      alpha = Math.max(alpha, val);
      if(beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for(const mv of moves){
      const { state: ns } = chessApplyMove(state, mv);
      const val = chessMinimax(ns, depth-1, alpha, beta, true);
      if(val < best) best = val;
      beta = Math.min(beta, val);
      if(beta <= alpha) break;
    }
    return best;
  }
}

function chessBestMove(state, depth){
  const color = state.turn;
  const maximizing = color === 'w';
  const moves = chessLegalMoves(state);
  if(moves.length === 0) return null;
  moves.sort((a,b) => (b.capture?1:0) - (a.capture?1:0));

  let best = null, bestVal = maximizing ? -Infinity : Infinity;
  for(const mv of moves){
    const { state: ns } = chessApplyMove(state, mv);
    const val = chessMinimax(ns, depth-1, -Infinity, Infinity, !maximizing);
    if(maximizing ? val > bestVal : val < bestVal){
      bestVal = val; best = mv;
    }
  }
  return best;
}

// Export for Node testing (harmless in-browser — module is undefined there)
if(typeof module !== 'undefined'){
  module.exports = {
    chessNewState, chessCloneState, chessLegalMoves, chessApplyMove,
    chessIsInCheck, chessGameStatus, chessBestMove, chessSquareName,
    chessFindKing, chessIsSquareAttacked, chessPieceMoves
  };
}
