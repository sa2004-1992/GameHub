// ---------------------------------------------------------------------------
// Snakes & Ladders — 2-4 players or vs Computer, classic 10x10 board (1-100)
// Board (snake/ladder positions) is regenerated fresh every game.
// ---------------------------------------------------------------------------
const SL_COLOR_HEX = { red:'#e74c3c', green:'#27ae60', yellow:'#f1c40f', blue:'#2980b9' };
const SL_ORDER = ['red','green','yellow','blue'];
const SL_NAMES = { red:'Red', green:'Green', yellow:'Yellow', blue:'Blue' };

function slCellNumber(row, col){
  const fromBottom = row;
  const base = fromBottom*10;
  const leftToRight = fromBottom % 2 === 0;
  const posInRow = leftToRight ? col : (9-col);
  return base + posInRow + 1;
}

// ---- Dynamic board generator -------------------------------------------
function generateSnakesAndLadders(){
  const used = new Set([1, 100]);

  function pickCell(minV, maxV){
    let tries = 0;
    while(tries < 200){
      tries++;
      const v = minV + Math.floor(Math.random() * (maxV - minV + 1));
      if(!used.has(v)) return v;
    }
    return null;
  }

  const ladders = {};
  const ladderCount = 6 + Math.floor(Math.random()*2);
  for(let i=0; i<ladderCount; i++){
    const bottom = pickCell(2, 88);
    if(bottom === null) continue;
    const minTop = Math.min(99, bottom + 10);
    const maxTop = Math.min(99, bottom + 40);
    if(minTop > maxTop) continue;
    const top = pickCell(minTop, maxTop);
    if(top === null || top <= bottom) continue;
    ladders[bottom] = top;
    used.add(bottom); used.add(top);
  }

  const snakes = {};
  const snakeCount = 6 + Math.floor(Math.random()*2);
  for(let i=0; i<snakeCount; i++){
    const head = pickCell(15, 99);
    if(head === null) continue;
    const maxDrop = Math.min(head - 2, 40);
    if(maxDrop < 8) continue;
    const minTail = Math.max(2, head - maxDrop);
    const maxTail = head - 8;
    if(minTail > maxTail) continue;
    const tail = pickCell(minTail, maxTail);
    if(tail === null || tail >= head) continue;
    snakes[head] = tail;
    used.add(head); used.add(tail);
  }

  return { snakes, ladders };
}

function initSnakes(cfg){
  const { game, mode, daily, colors } = cfg;
  const { snakes: SL_SNAKES, ladders: SL_LADDERS } = generateSnakesAndLadders();

  let numPlayers = mode === 'Vs Computer' ? 2 : parseInt(mode);
  const isVsComputer = mode === 'Vs Computer';
  const chosenColors = (colors && colors.length === numPlayers) ? colors : SL_ORDER.slice(0, numPlayers);

  const players = Array.from({length:numPlayers}, (_,i) => ({
    id: i, name: isVsComputer && i===1 ? 'Computer' : `Player ${i+1}`,
    color: chosenColors[i], hex: SL_COLOR_HEX[chosenColors[i]], pos: 0,
    isComputer: isVsComputer && i===1
  }));

  let current = 0, seconds = 0, gameOver = false, winner = null, rolling = false, turns = 0;
  const boardWrap = document.getElementById('board');
  const size = 10;
  const cellPx = 46;

  boardWrap.style.position = 'relative';
  boardWrap.style.width = boardWrap.style.height = (cellPx*size)+'px';
  boardWrap.style.margin = '0 auto';

  const gridDiv = document.createElement('div');
  gridDiv.className = 'sl-board';
  gridDiv.style.gridTemplateColumns = `repeat(${size}, ${cellPx}px)`;
  gridDiv.style.gridTemplateRows = `repeat(${size}, ${cellPx}px)`;
  boardWrap.appendChild(gridDiv);

  const svgNS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(svgNS, 'svg');
  overlay.setAttribute('width', cellPx*size);
  overlay.setAttribute('height', cellPx*size);
  overlay.style.position = 'absolute';
  overlay.style.left = '0'; overlay.style.top = '0';
  overlay.style.pointerEvents = 'none';
  boardWrap.appendChild(overlay);

  function cellCenter(num){
    for(let visualRow=0; visualRow<size; visualRow++){
      const row = size-1-visualRow;
      for(let col=0; col<size; col++){
        if(slCellNumber(row, col) === num){
          return { x: col*cellPx + cellPx/2, y: visualRow*cellPx + cellPx/2 };
        }
      }
    }
    return {x:0,y:0};
  }

  const SNAKE_COLORS = ['#e74c8f','#8e44ad','#16a085','#e67e22','#c0392b','#2980b9','#d35400'];

  function drawConnectors(){
    overlay.innerHTML = '';
    // ladders: two blue rails + rungs
    Object.entries(SL_LADDERS).forEach(([bottom, top]) => {
      const a = cellCenter(parseInt(bottom)), b = cellCenter(top);
      const dx = b.x-a.x, dy = b.y-a.y;
      const len = Math.hypot(dx,dy) || 1;
      const nx = -dy/len, ny = dx/len; // perpendicular unit vector
      const off = 5;
      const rail1 = document.createElementNS(svgNS,'line');
      rail1.setAttribute('x1', a.x+nx*off); rail1.setAttribute('y1', a.y+ny*off);
      rail1.setAttribute('x2', b.x+nx*off); rail1.setAttribute('y2', b.y+ny*off);
      rail1.setAttribute('stroke', '#4a90d9'); rail1.setAttribute('stroke-width','3'); rail1.setAttribute('opacity','0.85');
      overlay.appendChild(rail1);
      const rail2 = document.createElementNS(svgNS,'line');
      rail2.setAttribute('x1', a.x-nx*off); rail2.setAttribute('y1', a.y-ny*off);
      rail2.setAttribute('x2', b.x-nx*off); rail2.setAttribute('y2', b.y-ny*off);
      rail2.setAttribute('stroke', '#4a90d9'); rail2.setAttribute('stroke-width','3'); rail2.setAttribute('opacity','0.85');
      overlay.appendChild(rail2);
      const rungs = 6;
      for(let i=1;i<rungs;i++){
        const t = i/rungs;
        const rx = a.x + dx*t, ry = a.y + dy*t;
        const rung = document.createElementNS(svgNS,'line');
        rung.setAttribute('x1', rx+nx*off); rung.setAttribute('y1', ry+ny*off);
        rung.setAttribute('x2', rx-nx*off); rung.setAttribute('y2', ry-ny*off);
        rung.setAttribute('stroke', '#4a90d9'); rung.setAttribute('stroke-width','2'); rung.setAttribute('opacity','0.85');
        overlay.appendChild(rung);
      }
    });
    // snakes: colored wavy body + head/tail dots
    Object.entries(SL_SNAKES).forEach(([head, tail], idx) => {
      const a = cellCenter(parseInt(head)), b = cellCenter(parseInt(tail));
      const color = SNAKE_COLORS[idx % SNAKE_COLORS.length];
      const mx = (a.x+b.x)/2 + (a.y-b.y)*0.18, my = (a.y+b.y)/2 + (b.x-a.x)*0.18;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`);
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '5');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('opacity', '0.8');
      overlay.appendChild(path);
      const headDot = document.createElementNS(svgNS,'circle');
      headDot.setAttribute('cx', a.x); headDot.setAttribute('cy', a.y); headDot.setAttribute('r','6');
      headDot.setAttribute('fill', color);
      overlay.appendChild(headDot);
      const tailDot = document.createElementNS(svgNS,'circle');
      tailDot.setAttribute('cx', b.x); tailDot.setAttribute('cy', b.y); tailDot.setAttribute('r','3');
      tailDot.setAttribute('fill', color); tailDot.setAttribute('opacity','0.7');
      overlay.appendChild(tailDot);
    });
  }

  function render(){
    gridDiv.innerHTML = '';
    for(let visualRow=0; visualRow<size; visualRow++){
      const row = size-1-visualRow;
      for(let col=0; col<size; col++){
        const num = slCellNumber(row, col);
        const cell = document.createElement('div');
        cell.className = 'sl-cell';
        cell.style.width = cell.style.height = cellPx+'px';
        // classic green/white checkerboard
        cell.style.background = ((row+col) % 2 === 0) ? '#eef7ea' : '#7fbf6a';
        let label = `${num}`;
        cell.textContent = label;
        cell.style.color = ((row+col) % 2 === 0) ? '#2d5a34' : '#fff';
        if(num === 100){ cell.style.background = '#ffe28a'; cell.style.color = '#7a5200'; }
        const tokenRow = document.createElement('div');
        tokenRow.className = 'token-row';
        players.forEach(p => {
          if(p.pos === num){
            const t = document.createElement('span');
            t.className = 'token';
            t.style.background = p.hex;
            tokenRow.appendChild(t);
          }
        });
        cell.appendChild(tokenRow);
        gridDiv.appendChild(cell);
      }
    }
    drawConnectors();

    const statusEl = document.getElementById('statusText');
    if(!gameOver){
      statusEl.innerHTML = `Turn: <span style="color:${players[current].hex}; font-weight:700;">${players[current].name} (${SL_NAMES[players[current].color]})</span>`;
    }
    document.getElementById('playersInfo').innerHTML = players.map(p =>
      `<span class="badge" style="background:${p.hex}">${p.name}: ${p.pos}</span>`
    ).join(' ');
    document.getElementById('timeVal').textContent = ghFormatTime(seconds);
  }

  setInterval(() => { if(!gameOver) { seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); } }, 1000);

  function move(player, dice){
    let target = player.pos + dice;
    if(target > 100) return;
    if(SL_SNAKES[target]) target = SL_SNAKES[target];
    else if(SL_LADDERS[target]) target = SL_LADDERS[target];
    player.pos = target;
    if(player.pos === 100){
      gameOver = true;
      winner = player;
      finishGame();
    }
  }

  function nextTurn(){
    current = (current+1) % players.length;
    render();
    if(!gameOver && players[current].isComputer){
      setTimeout(rollDice, 900);
    }
  }

  function rollDice(){
    if(gameOver || rolling) return;
    rolling = true;
    const dice = 1 + Math.floor(Math.random()*6);
    turns++;
    document.getElementById('diceVal').textContent = dice;
    move(players[current], dice);
    render();
    rolling = false;
    if(!gameOver){
      if(dice === 6){
        document.getElementById('statusText').innerHTML += ' <span class="badge bg-warning text-dark">Extra Turn! 🎲</span>';
        setTimeout(render, 900);
      } else {
        setTimeout(nextTurn, 500);
      }
    }
  }
  document.getElementById('rollBtn').addEventListener('click', rollDice);

  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost.')) window.location.href = '/home';
  });

  function finishGame(){
    document.getElementById('statusText').innerHTML = `🏆 <span style="color:${winner.hex}">${winner.name}</span> Wins!`;
    const score = Math.max(200, 1000 - seconds*2 - turns*5);
    document.getElementById('finalTime').textContent = ghFormatTime(seconds);
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalExtraLabel').textContent = 'Turns';
    document.getElementById('finalHints').textContent = turns;
    document.getElementById('finalExtra2Label').textContent = 'Result';
    document.getElementById('finalMistakes').textContent = winner.isComputer ? 'Lost' : 'Won';
    document.getElementById('finalStars').textContent = ghStars(score);
    document.querySelector('#completeModal h4').textContent = `🏆 ${winner.name} Wins!`;
    new bootstrap.Modal(document.getElementById('completeModal')).show();
    const isHumanWinner = !winner.isComputer;
    ghSaveResult({
      game, mode, size: '-', difficulty: '-',
      score, time_taken: seconds, mistakes: 0, hints_used: 0,
      result: isHumanWinner ? 'Won' : 'Lost', daily
    });
  }

  render();
}
