// ---------------------------------------------------------------------------
// Queens: one queen per row/column/region, no two queens touching (incl diagonal)
// ---------------------------------------------------------------------------
function shuffledQ(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function generateQueensSolution(size){
  const cols = Array.from({length:size}, (_,i)=>i);
  const solution = new Array(size).fill(-1);

  function ok(row, col){
    for(let r=0;r<row;r++){
      if(solution[r] === col) return false;
      if(Math.abs(r-row) <= 1 && Math.abs(solution[r]-col) <= 1) return false;
    }
    return true;
  }
  function backtrack(row, remaining){
    if(row === size) return true;
    for(const col of shuffledQ(remaining)){
      if(ok(row, col)){
        solution[row] = col;
        const rest = remaining.filter(c => c !== col);
        if(backtrack(row+1, rest)) return true;
        solution[row] = -1;
      }
    }
    return false;
  }
  if(!backtrack(0, cols)){
    for(let r=0;r<size;r++) solution[r] = r;
  }
  return solution;
}

function generateRegions(size, solution){
  const regionOf = Array.from({length:size}, () => Array(size).fill(-1));
  let frontier = [];
  for(let r=0;r<size;r++){
    regionOf[r][solution[r]] = r;
    frontier.push([r, solution[r], r]);
  }
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while(frontier.length){
    frontier = shuffledQ(frontier);
    const next = [];
    for(const [r,c,region] of frontier){
      for(const [dr,dc] of shuffledQ(dirs)){
        const nr=r+dr, nc=c+dc;
        if(nr>=0 && nr<size && nc>=0 && nc<size && regionOf[nr][nc]===-1){
          regionOf[nr][nc] = region;
          next.push([nr,nc,region]);
        }
      }
    }
    frontier = next;
  }
  return regionOf;
}

const REGION_COLORS = [
  '#f6c1c1','#c1e1f6','#c9f6c1','#f6ecc1','#ddc1f6','#f6c1ec',
  '#c1f6e0','#f6d9c1','#c1c8f6','#e0f6c1','#f6c1c8','#c1f6f0',
  '#e8c1f6','#f6e0c1','#c1f6c8','#d1c1f6'
];

function seededRandomQ(seedStr){
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

function initQueens(cfg){
  const { size, difficulty, game, daily, seed } = cfg;
  let solution, regions;
  if(seed){
    const orig = Math.random;
    Math.random = seededRandomQ(seed);
    solution = generateQueensSolution(size);
    regions = generateRegions(size, solution);
    Math.random = orig;
  } else {
    solution = generateQueensSolution(size);
    regions = generateRegions(size, solution);
  }

  const board = Array.from({length:size}, () => Array(size).fill(0));

  const helpRatio = {Easy:0.12, Medium:0.06, Hard:0, Expert:0}[difficulty] || 0;
  if(helpRatio > 0){
    const total = size*size;
    const helpCount = Math.floor(total*helpRatio);
    let placed = 0, attempts=0;
    while(placed < helpCount && attempts < total*4){
      attempts++;
      const r = Math.floor(Math.random()*size), c = Math.floor(Math.random()*size);
      if(solution[r] !== c && board[r][c]===0){ board[r][c]=1; placed++; }
    }
  }

  let mistakes=0, hintsUsed=0, hintsMax=20, score=0, seconds=0, timerId=null, paused=false, gameOver=false;
  let cursor = [0,0];
  let flashCell = null, flashKind = null;
  const history = [];
  const gridEl = document.getElementById('grid');
  const cellPx = size>10 ? 32 : 40;
  gridEl.style.gridTemplateColumns = `repeat(${size}, ${cellPx}px)`;
  gridEl.style.gridTemplateRows = `repeat(${size}, ${cellPx}px)`;

  let isDragging = false, dragValue = 1, mouseDownCell = null;

  function render(){
    gridEl.innerHTML = '';
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const cell = document.createElement('div');
        cell.className = 'puzzle-cell';
        cell.style.width = cell.style.height = cellPx+'px';
        cell.style.background = REGION_COLORS[regions[r][c] % REGION_COLORS.length];
        cell.style.fontSize = size>10 ? '14px' : '20px';
        if(board[r][c]===1) cell.textContent = '✕';
        if(board[r][c]===2) cell.textContent = '♛';
        if(cursor[0]===r && cursor[1]===c) cell.classList.add('selected');
        if(flashCell && flashCell[0]===r && flashCell[1]===c) cell.classList.add(flashKind==='ok' ? 'correct-flash' : 'error');

        cell.addEventListener('mousedown', (e) => {
          if(paused || gameOver) return;
          e.preventDefault();
          cursor = [r,c];
          mouseDownCell = [r,c];
          isDragging = false;
          dragValue = board[r][c] === 1 ? 0 : 1; // dragging toggles X marks across cells
        });
        cell.addEventListener('mouseenter', () => {
          if(mouseDownCell && !paused && !gameOver && board[r][c] !== 2){
            if(mouseDownCell[0] !== r || mouseDownCell[1] !== c) isDragging = true;
            if(isDragging){ board[r][c] = dragValue; render(); }
          }
        });
        gridEl.appendChild(cell);
      }
    }
    document.getElementById('scoreVal').textContent = score;
    document.getElementById('hintsVal').textContent = (hintsMax-hintsUsed);
  }

  document.addEventListener('mouseup', () => {
    if(mouseDownCell && !isDragging){
      cycleCell(mouseDownCell[0], mouseDownCell[1]);
    }
    mouseDownCell = null;
    isDragging = false;
  });

  function cycleCell(r, c){
    if(paused || gameOver) return;
    history.push({r,c,prev:board[r][c]});
    const wasQueen = board[r][c] === 2;
    board[r][c] = (board[r][c]+1) % 3;
    if(board[r][c] === 2){
      if(solution[r] === c){ score += 15; flashCell=[r,c]; flashKind='ok'; }
      else { mistakes++; score = Math.max(0, score-8); flashCell=[r,c]; flashKind='bad'; }
    }
    render();
    setTimeout(() => { flashCell = null; render(); }, 350);
    checkComplete();
  }

  // Use plain click for the normal cycle (mousedown handled drag-paint separately for X)

  function tick(){ if(paused||gameOver) return; seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); }
  timerId = setInterval(tick, 1000);

  document.getElementById('undoBtn').addEventListener('click', () => {
    const last = history.pop();
    if(last){ board[last.r][last.c]=last.prev; render(); }
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    if(confirm('Restart this puzzle?')){
      for(let r=0;r<size;r++) for(let c=0;c<size;c++) board[r][c]=0;
      mistakes=0; score=0; history.length=0; render();
    }
  });
  document.getElementById('pauseBtn').addEventListener('click', (e) => {
    paused = !paused;
    e.target.textContent = paused ? '▶ Resume' : '⏸ Pause';
    document.getElementById('overlay').classList.toggle('d-none', !paused);
  });
  document.getElementById('hintBtn').addEventListener('click', () => {
    if(hintsUsed >= hintsMax){ alert('No hints remaining.'); return; }
    for(let r=0;r<size;r++){
      if(board[r][solution[r]] !== 2){
        for(let c=0;c<size;c++) if(board[r][c]===2) board[r][c]=0;
        board[r][solution[r]] = 2;
        hintsUsed++;
        score = Math.max(0, score-8);
        render(); checkComplete();
        return;
      }
    }
  });
  document.getElementById('checkBtn').addEventListener('click', () => {
    const res = validate();
    if(!res.valid) mistakes += 1;
    alert(res.valid ? (res.complete ? 'Solved!' : 'No conflicts so far — keep going!') : 'There are conflicts. Keep trying!');
    render();
    checkComplete();
  });
  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost.')) window.location.href = '/home';
  });

  // Keyboard: arrows move cursor, Enter/Space cycles, 'x' sets X, 'q' sets Queen
  document.addEventListener('keydown', (e) => {
    if(paused || gameOver) return;
    const [r,c] = cursor;
    if(e.key === 'ArrowUp'){ cursor=[Math.max(0,r-1),c]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowDown'){ cursor=[Math.min(size-1,r+1),c]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ cursor=[r,Math.max(0,c-1)]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ cursor=[r,Math.min(size-1,c+1)]; render(); e.preventDefault(); }
    else if(e.key === ' ' || e.key === 'Enter'){ cycleCell(r,c); e.preventDefault(); }
    else if(e.key.toLowerCase() === 'x'){ history.push({r,c,prev:board[r][c]}); board[r][c] = board[r][c]===1?0:1; render(); }
    else if(e.key.toLowerCase() === 'q'){
      history.push({r,c,prev:board[r][c]});
      board[r][c] = 2;
      if(solution[r] === c){ score += 15; flashCell=[r,c]; flashKind='ok'; }
      else { mistakes++; score = Math.max(0, score-8); flashCell=[r,c]; flashKind='bad'; }
      render();
      setTimeout(() => { flashCell = null; render(); }, 350);
      checkComplete();
    }
  });

  function validate(){
    const queens = [];
    for(let r=0;r<size;r++) for(let c=0;c<size;c++) if(board[r][c]===2) queens.push([r,c]);
    const rows = new Set(), cols = new Set(), regs = new Set();
    let valid = true;
    for(const [r,c] of queens){
      if(rows.has(r) || cols.has(c) || regs.has(regions[r][c])) valid = false;
      rows.add(r); cols.add(c); regs.add(regions[r][c]);
    }
    for(let i=0;i<queens.length;i++) for(let j=i+1;j<queens.length;j++){
      const [r1,c1]=queens[i], [r2,c2]=queens[j];
      if(Math.abs(r1-r2)<=1 && Math.abs(c1-c2)<=1) valid=false;
    }
    return {valid, complete: valid && queens.length===size};
  }

  function checkComplete(){
    const res = validate();
    if(res.complete){ finishGame(); return true; }
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

  render();
}
