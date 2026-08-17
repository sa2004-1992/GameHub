// ---------------------------------------------------------------------------
// Nonogram: picture logic puzzle
// ---------------------------------------------------------------------------
function generateNonogramSolution(size, difficulty){
  const fillProb = {Easy:0.42, Medium:0.48, Hard:0.52, Expert:0.55}[difficulty] || 0.5;
  let grid;
  // regenerate until no completely empty row/col (keeps puzzle interesting)
  let tries = 0;
  do{
    grid = Array.from({length:size}, () => Array.from({length:size}, () => Math.random() < fillProb ? 1 : 0));
    tries++;
  } while(tries < 25 && (grid.some(row => row.every(v=>v===0)) || grid[0].map((_,c)=>grid.every(r=>r[c]===0)).some(Boolean)));
  return grid;
}

function lineClues(line){
  const clues = [];
  let run = 0;
  for(const v of line){
    if(v===1) run++;
    else { if(run>0) clues.push(run); run=0; }
  }
  if(run>0) clues.push(run);
  return clues.length ? clues : [0];
}

function seededRandomNg(seedStr){
  let h = 1779033703 ^ seedStr.length;
  for(let i=0;i<seedStr.length;i++){
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function initNonogram(cfg){
  const { size, difficulty, game, daily, seed } = cfg;
  let solution;
  if(seed){
    const orig = Math.random;
    Math.random = seededRandomNg(seed);
    solution = generateNonogramSolution(size, difficulty);
    Math.random = orig;
  } else {
    solution = generateNonogramSolution(size, difficulty);
  }
  const rowClues = solution.map(r => lineClues(r));
  const colClues = [];
  for(let c=0;c<size;c++) colClues.push(lineClues(solution.map(r=>r[c])));

  // 0 = unknown, 1 = filled, 2 = marked-empty(X)
  const board = Array.from({length:size}, () => Array(size).fill(0));

  let mistakes=0, hintsUsed=0, hintsMax=20, score=0, seconds=0, timerId=null, paused=false, gameOver=false;
  const history = [];
  const cellPx = size>10 ? 26 : 36;
  const clueColWidth = size>10 ? 60 : 80;
  let cursor = [0,0];
  let flashCell = null, flashKind = null;
  let mouseDownCell = null, isDragging = false, dragValue = 1;

  const wrap = document.getElementById('nonoWrap');
  const maxRowClueLen = Math.max(...rowClues.map(c=>c.length));
  const maxColClueLen = Math.max(...colClues.map(c=>c.length));

  function applyValue(r, c, val, countScore){
    history.push({r,c,prev:board[r][c]});
    board[r][c] = val;
    if(countScore && val !== 0){
      const correct = (val===1 && solution[r][c]===1) || (val===2 && solution[r][c]===0);
      if(correct){ score += 10; flashCell=[r,c]; flashKind='ok'; }
      else { mistakes++; score = Math.max(0, score-5); flashCell=[r,c]; flashKind='bad'; }
    }
  }

  function buildTable(){
    wrap.innerHTML = '';
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.margin = '0 auto';

    // column clue rows
    for(let cr=0; cr<maxColClueLen; cr++){
      const tr = document.createElement('tr');
      const corner = document.createElement('td');
      corner.style.width = clueColWidth+'px';
      tr.appendChild(corner);
      for(let c=0;c<size;c++){
        const td = document.createElement('td');
        const clueArr = colClues[c];
        const idx = clueArr.length - (maxColClueLen - cr);
        td.textContent = idx>=0 ? clueArr[idx] : '';
        td.style.cssText = `text-align:center; font-size:12px; font-weight:700; width:${cellPx}px; height:20px; color: var(--gh-text);`;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    for(let r=0;r<size;r++){
      const tr = document.createElement('tr');
      const clueTd = document.createElement('td');
      clueTd.textContent = rowClues[r].join(' ');
      clueTd.style.cssText = `text-align:right; padding-right:8px; font-size:12px; font-weight:700; white-space:nowrap; color: var(--gh-text);`;
      tr.appendChild(clueTd);
      for(let c=0;c<size;c++){
        const td = document.createElement('td');
        td.style.cssText = `width:${cellPx}px; height:${cellPx}px; border:1px solid var(--gh-border); text-align:center; cursor:pointer; font-size:${cellPx-16}px; background: var(--gh-surface);`;
        if((c+1)%5===0 && c!==size-1) td.style.borderRight = '2px solid var(--gh-text)';
        if((r+1)%5===0 && r!==size-1) td.style.borderBottom = '2px solid var(--gh-text)';
        if(board[r][c]===1){ td.style.background = 'var(--gh-primary)'; }
        if(board[r][c]===2){ td.textContent = '✕'; td.style.color = 'var(--gh-muted)'; }
        if(cursor[0]===r && cursor[1]===c) td.style.outline = '2px solid var(--gh-accent)';
        if(flashCell && flashCell[0]===r && flashCell[1]===c){
          td.style.background = flashKind==='ok' ? '#d6ffe0' : '#ffd6d6';
        }
        td.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if(paused || gameOver) return;
          cursor = [r,c];
          mouseDownCell = [r,c];
          isDragging = false;
          dragValue = (board[r][c]+1) % 3;
        });
        td.addEventListener('mouseenter', () => {
          if(mouseDownCell && !paused && !gameOver){
            if(mouseDownCell[0] !== r || mouseDownCell[1] !== c) isDragging = true;
            if(isDragging){ applyValue(r, c, dragValue, true); buildTable(); }
          }
        });
        td.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if(paused || gameOver) return;
          applyValue(r, c, board[r][c]===2 ? 0 : 2, true);
          buildTable();
          setTimeout(() => { flashCell=null; buildTable(); }, 350);
          checkComplete();
        });
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    document.getElementById('scoreVal').textContent = score;
    document.getElementById('hintsVal').textContent = (hintsMax-hintsUsed);
  }

  document.addEventListener('mouseup', () => {
    if(mouseDownCell && !isDragging){
      const [r,c] = mouseDownCell;
      if(!paused && !gameOver){
        applyValue(r, c, (board[r][c]+1) % 3, true);
        buildTable();
        setTimeout(() => { flashCell=null; buildTable(); }, 350);
        checkComplete();
      }
    } else if(isDragging){
      setTimeout(() => { flashCell=null; buildTable(); }, 350);
      checkComplete();
    }
    mouseDownCell = null;
    isDragging = false;
  });

  function tick(){ if(paused||gameOver) return; seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); }
  timerId = setInterval(tick, 1000);

  document.getElementById('undoBtn').addEventListener('click', () => {
    const last = history.pop();
    if(last){ board[last.r][last.c]=last.prev; buildTable(); }
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    if(confirm('Restart this puzzle?')){
      for(let r=0;r<size;r++) for(let c=0;c<size;c++) board[r][c]=0;
      mistakes=0; score=0; history.length=0; buildTable();
    }
  });
  document.getElementById('pauseBtn').addEventListener('click', (e) => {
    paused = !paused;
    e.target.textContent = paused ? '▶ Resume' : '⏸ Pause';
    document.getElementById('overlay').classList.toggle('d-none', !paused);
  });
  document.getElementById('hintBtn').addEventListener('click', () => {
    if(hintsUsed >= hintsMax){ alert('No hints remaining.'); return; }
    for(let r=0;r<size;r++) for(let c=0;c<size;c++){
      if(solution[r][c]===1 && board[r][c]!==1){
        board[r][c]=1; hintsUsed++;
        score = Math.max(0, score-5);
        buildTable(); checkComplete(); return;
      }
    }
  });
  document.getElementById('checkBtn').addEventListener('click', () => {
    const res = validate();
    if(!res.complete) mistakes += 1;
    alert(res.complete ? 'Solved!' : 'Not solved yet — keep going!');
    buildTable();
    checkComplete();
  });
  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost.')) window.location.href = '/home';
  });

  // Keyboard: arrows move cursor, space fills, 'x' marks empty, backspace clears
  document.addEventListener('keydown', (e) => {
    if(paused || gameOver) return;
    const [r,c] = cursor;
    if(e.key === 'ArrowUp'){ cursor=[Math.max(0,r-1),c]; buildTable(); e.preventDefault(); }
    else if(e.key === 'ArrowDown'){ cursor=[Math.min(size-1,r+1),c]; buildTable(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ cursor=[r,Math.max(0,c-1)]; buildTable(); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ cursor=[r,Math.min(size-1,c+1)]; buildTable(); e.preventDefault(); }
    else if(e.key === ' ' || e.key === 'Enter'){
      applyValue(r,c,(board[r][c]+1)%3,true); buildTable();
      setTimeout(()=>{flashCell=null;buildTable();},350); checkComplete();
      e.preventDefault();
    } else if(e.key.toLowerCase() === 'x'){
      applyValue(r,c, board[r][c]===2?0:2, true); buildTable();
      setTimeout(()=>{flashCell=null;buildTable();},350); checkComplete();
    } else if(e.key === 'Backspace' || e.key === 'Delete'){
      applyValue(r,c,0,false); buildTable();
    }
  });

  function validate(){
    for(let r=0;r<size;r++) for(let c=0;c<size;c++){
      const filled = board[r][c]===1;
      if(filled !== (solution[r][c]===1)) return {complete:false};
    }
    return {complete:true};
  }
  function checkComplete(){
    if(validate().complete){ finishGame(); return true; }
    return false;
  }
  function finishGame(){
    if(gameOver) return;
    gameOver = true;
    clearInterval(timerId);
    score += Math.max(0, 200 - seconds);
    document.getElementById('finalTime').textContent = ghFormatTime(seconds);
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalHints').textContent = hintsUsed;
    document.getElementById('finalStars').textContent = ghStars(score);
    new bootstrap.Modal(document.getElementById('completeModal')).show();
    ghSaveResult({game, mode:'Solo', size, difficulty, score, time_taken: seconds, mistakes, hints_used: hintsUsed, result:'Won', daily});
  }

  buildTable();
}
