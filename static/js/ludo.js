// ---------------------------------------------------------------------------
// Ludo — classic cross-shaped board (15x15), 52-cell shared track, per-color
// 6-cell home column, 4-token yards, safe stars, capture, extra turn on 6,
// exact-roll-to-finish. Board layout is the fixed standard Ludo cross;
// the game STATE (dice, turns, token positions) is fresh every game.
// ---------------------------------------------------------------------------
const LUDO_COLORS = { red:'#e74c3c', green:'#27ae60', yellow:'#f1c40f', blue:'#2980b9' };
const LUDO_ORDER = ['red','green','yellow','blue'];
const LUDO_NAMES = { red:'Red', green:'Green', yellow:'Yellow', blue:'Blue' };
const RING_SIZE = 52;
const START_OFFSET = { red:0, green:13, yellow:26, blue:39 };
const SAFE_OFFSETS = [0, 8, 13, 21, 26, 34, 39, 47];

// Verified 52-cell clockwise path around the classic 15x15 cross board.
const RING_PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0]
];

// Home column (6 cells, index0 = entrance, index5 = adjacent to center)
const HOME_COLUMNS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
};

// Yard (base) token slot positions within each 6x6 corner (relative row,col 0-5)
const YARD_SLOTS = [[1,1],[1,3],[3,1],[3,3]];
const YARD_ORIGIN = {
  red:    [0,0],
  green:  [0,9],
  yellow: [9,9],
  blue:   [9,0]
};

function initLudo(cfg){
  const { game, mode, daily, colors } = cfg;
  const isVsComputer = mode === 'Vs Computer';
  const numPlayers = isVsComputer ? 2 : parseInt(mode);

  let activeColors;
  if(colors && colors.length === numPlayers){
    activeColors = colors;
  } else if(isVsComputer){
    activeColors = ['red', 'yellow'];              // diagonal opponents by default
  } else if(numPlayers === 2){
    activeColors = ['red', 'yellow'];              // diagonal opponents by default
  } else {
    activeColors = LUDO_ORDER.slice(0, numPlayers);
  }

  const players = activeColors.map((color, i) => ({
    color, name: isVsComputer && i>0 ? `Computer` : `Player ${i+1}`,
    isComputer: isVsComputer && i>0,
    captures: 0,
    tokens: [0,1,2,3].map(() => ({ state:'yard', ringPos:-1, homeStep:-1 }))
  }));

  let current = 0, seconds=0, gameOver=false, winner=null, dice=null, sixStreak=0, turns=0;

  const cellPx = 28;
  const boardSize = cellPx*15;
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  boardEl.style.width = boardEl.style.height = boardSize+'px';
  boardEl.style.position = 'relative';
  boardEl.style.background = '#fff';
  boardEl.style.border = '3px solid #1c2333';
  boardEl.style.margin = '0 auto';
  boardEl.style.borderRadius = '10px';
  boardEl.style.overflow = 'hidden';

  function px(v){ return v*cellPx; }

  function drawBase(){
    // 4 corner yards
    LUDO_ORDER.forEach(color => {
      const [oy, ox] = YARD_ORIGIN[color];
      const yard = document.createElement('div');
      yard.style.cssText = `position:absolute; left:${px(ox)}px; top:${px(oy)}px; width:${px(6)}px; height:${px(6)}px; background:${LUDO_COLORS[color]}22; border:2px solid ${LUDO_COLORS[color]};`;
      const inner = document.createElement('div');
      inner.style.cssText = `position:absolute; left:${px(1)}px; top:${px(1)}px; width:${px(4)}px; height:${px(4)}px; background:#fff; border-radius:12px;`;
      yard.appendChild(inner);
      boardEl.appendChild(yard);
    });

    // track cells (52) - white
    RING_PATH.forEach(([r,c], i) => {
      const cell = document.createElement('div');
      cell.style.cssText = `position:absolute; left:${px(c)}px; top:${px(r)}px; width:${cellPx}px; height:${cellPx}px; background:#fff; border:1px solid #dfe3ec; box-sizing:border-box;`;
      if(SAFE_OFFSETS.includes(i)){
        cell.style.background = '#fff8e1';
        cell.innerHTML = '<span style="font-size:11px;">★</span>';
        cell.style.display='flex'; cell.style.alignItems='center'; cell.style.justifyContent='center';
      }
      Object.entries(START_OFFSET).forEach(([color, off]) => {
        if(off === i) cell.style.background = LUDO_COLORS[color] + '55';
      });
      boardEl.appendChild(cell);
    });

    // home columns - colored
    LUDO_ORDER.forEach(color => {
      HOME_COLUMNS[color].forEach(([r,c]) => {
        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute; left:${px(c)}px; top:${px(r)}px; width:${cellPx}px; height:${cellPx}px; background:${LUDO_COLORS[color]}66; border:1px solid #dfe3ec; box-sizing:border-box;`;
        boardEl.appendChild(cell);
      });
    });

    // center home (rows6-8, cols6-8) with 4 colored triangles
    const center = document.createElement('div');
    center.style.cssText = `position:absolute; left:${px(6)}px; top:${px(6)}px; width:${px(3)}px; height:${px(3)}px; overflow:hidden;`;
    const triSize = px(3);
    center.innerHTML = `
      <svg width="${triSize}" height="${triSize}" viewBox="0 0 90 90">
        <polygon points="0,0 45,45 90,0" fill="${LUDO_COLORS.green}"/>
        <polygon points="90,0 45,45 90,90" fill="${LUDO_COLORS.yellow}"/>
        <polygon points="90,90 45,45 0,90" fill="${LUDO_COLORS.blue}"/>
        <polygon points="0,90 45,45 0,0" fill="${LUDO_COLORS.red}"/>
      </svg>`;
    boardEl.appendChild(center);
  }

  const tokenLayer = document.createElement('div');
  tokenLayer.style.cssText = 'position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none;';
  function buildBase(){ drawBase(); boardEl.appendChild(tokenLayer); }

  function yardTokenPos(color, tokenIdx){
    const [oy, ox] = YARD_ORIGIN[color];
    const [sr, sc] = YARD_SLOTS[tokenIdx];
    return [oy+sr, ox+sc];
  }

  function movableTokens(){
    const p = players[current];
    if(!dice) return [];
    return p.tokens.filter(t => canMove(p, t));
  }
  function stepsTraveled(t, color){
    if(t.state !== 'ring') return -1;
    return (t.ringPos - START_OFFSET[color] + RING_SIZE) % RING_SIZE;
  }
  function canMove(p, t){
    if(t.state === 'done') return false;
    if(t.state === 'yard') return dice === 6;
    if(t.state === 'ring'){
      const traveled = stepsTraveled(t, p.color);
      return (traveled + dice) <= 56;
    }
    if(t.state === 'home') return (t.homeStep + dice) <= 5;
    return false;
  }

  function renderTokens(){
    tokenLayer.innerHTML = '';
    players.forEach(p => {
      p.tokens.forEach((t, ti) => {
        let r, c;
        if(t.state === 'yard'){ [r,c] = yardTokenPos(p.color, ti); }
        else if(t.state === 'ring'){ [r,c] = RING_PATH[t.ringPos]; }
        else if(t.state === 'home'){ [r,c] = HOME_COLUMNS[p.color][t.homeStep]; }
        else { return; } // done -> hidden inside center

        const dot = document.createElement('div');
        const isMovable = players.indexOf(p)===current && !p.isComputer && movableTokens().includes(t);
        const size = cellPx*0.62;
        dot.style.cssText = `position:absolute; left:${px(c)+cellPx/2-size/2}px; top:${px(r)+cellPx/2-size/2}px; width:${size}px; height:${size}px; border-radius:50%; background:${LUDO_COLORS[p.color]}; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,.4); pointer-events:${isMovable?'auto':'none'};`;
        if(isMovable){
          dot.style.boxShadow = `0 0 0 3px #fff, 0 0 0 5px ${LUDO_COLORS[p.color]}`;
          dot.style.cursor = 'pointer';
          dot.addEventListener('click', () => chooseToken(players.indexOf(p), ti));
        }
        tokenLayer.appendChild(dot);
      });
    });
  }

  function renderHUD(){
    const info = document.getElementById('playersInfo');
    info.innerHTML = players.map((p,pi) => {
      const yardCount = p.tokens.filter(t=>t.state==='yard').length;
      const homeCount = p.tokens.filter(t=>t.state==='home' && t.homeStep===5).length;
      const active = pi===current ? 'border:2px solid #1c2333;' : '';
      return `<span class="badge me-1" style="background:${LUDO_COLORS[p.color]}; ${active}">${p.name} (${LUDO_NAMES[p.color]}): yard ${yardCount} · home ${homeCount}/4 · captures ${p.captures}</span>`;
    }).join(' ');
    document.getElementById('statusText').innerHTML = gameOver ? '' :
      `Turn: <span style="color:${LUDO_COLORS[players[current].color]}; font-weight:700;">${players[current].name} (${LUDO_NAMES[players[current].color]})</span>`;
    document.getElementById('timeVal').textContent = ghFormatTime(seconds);
    document.getElementById('diceVal').textContent = dice || '🎲';
  }

  function render(){ renderTokens(); renderHUD(); }

  setInterval(() => { if(!gameOver){ seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); } }, 1000);

  function moveToken(p, t){
    if(t.state === 'yard'){
      t.state = 'ring';
      t.ringPos = START_OFFSET[p.color];
    } else if(t.state === 'ring'){
      const traveled = stepsTraveled(t, p.color) + dice;
      if(traveled <= 50){
        t.ringPos = (START_OFFSET[p.color] + traveled) % RING_SIZE;
        tryCapture(p, t);
      } else {
        t.state = 'home';
        t.homeStep = traveled - 51;
        t.ringPos = -1;
      }
    } else if(t.state === 'home'){
      t.homeStep += dice;
    }
    if(t.state === 'home' && t.homeStep >= 5) t.homeStep = 5;
  }

  function tryCapture(p, t){
    if(SAFE_OFFSETS.includes(t.ringPos)) return;
    players.forEach(op => {
      if(op === p) return;
      op.tokens.forEach(ot => {
        if(ot.state === 'ring' && ot.ringPos === t.ringPos){
          ot.state = 'yard'; ot.ringPos = -1;
          p.captures++;
        }
      });
    });
  }
  function checkWin(){ return players[current].tokens.every(t => t.state==='home' && t.homeStep===5); }

  document.getElementById('rollBtn').addEventListener('click', () => {
    if(gameOver || dice !== null) return;
    dice = 1 + Math.floor(Math.random()*6);
    turns++;
    render();
    const movable = movableTokens();
    if(movable.length === 0){
      setTimeout(endTurn, 700);
    } else if(players[current].isComputer){
      setTimeout(() => computerMove(movable), 700);
    } else if(movable.length === 1){
      setTimeout(() => chooseToken(current, players[current].tokens.indexOf(movable[0])), 300);
    }
  });

  function computerMove(movable){
    let best = movable[0], bestScore = -1;
    movable.forEach(t => {
      let s = 0;
      if(t.state==='yard') s = 5;
      if(t.state==='ring') s = stepsTraveled(t, players[current].color) + 1;
      if(t.state==='home') s = 60;
      // prefer captures
      if(t.state==='ring'){
        const traveled = stepsTraveled(t, players[current].color) + dice;
        if(traveled <= 50){
          const landing = (START_OFFSET[players[current].color] + traveled) % RING_SIZE;
          const canCapture = players.some((op,oi) => oi!==current && op.tokens.some(ot => ot.state==='ring' && ot.ringPos===landing) && !SAFE_OFFSETS.includes(landing));
          if(canCapture) s += 100;
        }
      }
      if(s > bestScore){ bestScore = s; best = t; }
    });
    chooseToken(current, players[current].tokens.indexOf(best));
  }

  function chooseToken(pi, ti){
    if(pi !== current) return;
    const p = players[current];
    const t = p.tokens[ti];
    if(!canMove(p, t)) return;
    moveToken(p, t);
    render();
    if(checkWin()){ gameOver = true; winner = p; finishGame(); return; }
    if(dice === 6){
      sixStreak++;
      dice = null;
      if(sixStreak >= 3){ sixStreak = 0; setTimeout(endTurn, 500); }
      else { render(); if(players[current].isComputer) setTimeout(() => document.getElementById('rollBtn').click(), 700); }
    } else {
      sixStreak = 0;
      setTimeout(endTurn, 500);
    }
  }

  function endTurn(){
    dice = null; sixStreak = 0;
    current = (current+1) % players.length;
    render();
    if(!gameOver && players[current].isComputer){
      setTimeout(() => document.getElementById('rollBtn').click(), 800);
    }
  }

  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost.')) window.location.href = '/home';
  });

  function finishGame(){
    document.querySelector('#completeModal h4').textContent = `🏆 ${winner.name} (${LUDO_NAMES[winner.color]}) Wins!`;
    const score = Math.max(200, 1000 - seconds*2 - turns*3 + winner.captures*30);
    document.getElementById('finalTime').textContent = ghFormatTime(seconds);
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalExtraLabel').textContent = 'Turns';
    document.getElementById('finalHints').textContent = turns;
    document.getElementById('finalExtra2Label').textContent = 'Captures';
    document.getElementById('finalMistakes').textContent = winner.captures;
    document.getElementById('finalStars').textContent = ghStars(score);
    new bootstrap.Modal(document.getElementById('completeModal')).show();
    ghSaveResult({
      game, mode, size:'-', difficulty:'-', score,
      time_taken: seconds, mistakes: winner.captures, hints_used: turns,
      result: (!winner.isComputer) ? 'Won' : 'Lost', daily
    });
    render();
  }

  buildBase();
  render();
}
