// ---------------------------------------------------------------------------
// Tango: Sun (1) / Moon (2) binary logic puzzle
// ---------------------------------------------------------------------------
function shuffledT(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function generateTangoSolution(size){
  const half = size/2;
  const grid = Array.from({length:size}, () => Array(size).fill(0));

  function rowCount(r, val, upto){ let n=0; for(let c=0;c<upto;c++) if(grid[r][c]===val) n++; return n; }
  function colCount(c, val, upto){ let n=0; for(let r=0;r<upto;r++) if(grid[r][c]===val) n++; return n; }

  function safe(r,c,val){
    if(rowCount(r,val,c) >= half) return false;
    if(colCount(c,val,r) >= half) return false;
    if(c>=2 && grid[r][c-1]===val && grid[r][c-2]===val) return false;
    if(r>=2 && grid[r-1][c]===val && grid[r-2][c]===val) return false;
    return true;
  }

  function fill(pos){
    if(pos === size*size) return true;
    const r = Math.floor(pos/size), c = pos%size;
    for(const val of shuffledT([1,2])){
      if(safe(r,c,val)){
        grid[r][c] = val;
        if(fill(pos+1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }
  fill(0);
  return grid;
}

function seededRandomTg(seedStr){
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

function initTango(cfg){
  const { size, difficulty, game, daily, seed } = cfg;
  let solution;
  if(seed){
    const orig = Math.random;
    Math.random = seededRandomTg(seed);
    solution = generateTangoSolution(size);
    Math.random = orig;
  } else {
    solution = generateTangoSolution(size);
  }

  // choose given cells + constraint edges
  const revealRatio = {Easy:0.45, Medium:0.35, Hard:0.25, Expert:0.16}[difficulty] || 0.3;
  const edgeRatio = {Easy:0.30, Medium:0.22, Hard:0.14, Expert:0.08}[difficulty] || 0.2;

  const fixed = Array.from({length:size}, () => Array(size).fill(false));
  const board = Array.from({length:size}, () => Array(size).fill(0));
  const total = size*size;
  const revealCount = Math.floor(total*revealRatio);
  const revealPositions = shuffledT(Array.from({length:total},(_,i)=>i)).slice(0, revealCount);
  revealPositions.forEach(p => {
    const r=Math.floor(p/size), c=p%size;
    fixed[r][c]=true; board[r][c]=solution[r][c];
  });

  // horizontal edges: key `${r}-${c}h` between (r,c)-(r,c+1); vertical: `${r}-${c}v` between (r,c)-(r+1,c)
  const edges = {};
  const allEdges = [];
  for(let r=0;r<size;r++) for(let c=0;c<size-1;c++) allEdges.push([r,c,'h']);
  for(let r=0;r<size-1;r++) for(let c=0;c<size;c++) allEdges.push([r,c,'v']);
  const edgeCount = Math.floor(allEdges.length*edgeRatio);
  shuffledT(allEdges).slice(0, edgeCount).forEach(([r,c,dir]) => {
    const [r2,c2] = dir==='h' ? [r,c+1] : [r+1,c];
    const same = solution[r][c] === solution[r2][c2];
    edges[`${r}-${c}-${dir}`] = same ? '=' : '×';
  });

  let mistakes=0, hintsUsed=0, hintsMax=20, score=0, seconds=0, timerId=null, paused=false, gameOver=false;
  let cursor = [0,0];
  let flashCell = null, flashKind = null;
  const history = [];
  const gridEl = document.getElementById('grid');
  const cellPx = size>10 ? 32 : 42;
  gridEl.style.gridTemplateColumns = `repeat(${size}, ${cellPx}px)`;
  gridEl.style.gridTemplateRows = `repeat(${size}, ${cellPx}px)`;
  gridEl.style.position = 'relative';

  // Custom colored icons (SVG) so we control the exact colors: Sun = orange, Moon = blue
  const SUN_SVG = `<svg viewBox="0 0 24 24" width="68%" height="68%"><circle cx="12" cy="12" r="9" fill="#f97316"/></svg>`;
  const MOON_SVG = `<svg viewBox="0 0 24 24" width="70%" height="70%"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 1 0 10.7 10.7z" fill="#2563eb"/></svg>`;
  const SYM = {1: SUN_SVG, 2: MOON_SVG};

  let mouseDownCell = null, isDragging = false, dragValue = 1;

  function applyValue(r, c, val, countScore){
    if(fixed[r][c]) return;
    history.push({r,c,prev:board[r][c]});
    board[r][c] = val;
    if(countScore && val !== 0){
      if(val === solution[r][c]){ score += 10; flashCell=[r,c]; flashKind='ok'; }
      else { mistakes++; score = Math.max(0, score-5); flashCell=[r,c]; flashKind='bad'; }
    }
  }

  function cycleCell(r,c){
    if(paused || gameOver || fixed[r][c]) return;
    applyValue(r, c, (board[r][c]+1) % 3, true);
    render();
    setTimeout(() => { flashCell = null; render(); }, 350);
    checkComplete();
  }

  function render(){
    gridEl.innerHTML = '';
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const cell = document.createElement('div');
        cell.className = 'puzzle-cell';
        cell.style.width = cell.style.height = cellPx+'px';
        cell.style.fontSize = size>10 ? '14px' : '20px';
        cell.style.position = 'relative';
        if(fixed[r][c]) cell.classList.add('fixed');
        if(cursor[0]===r && cursor[1]===c) cell.classList.add('selected');
        if(flashCell && flashCell[0]===r && flashCell[1]===c) cell.classList.add(flashKind==='ok' ? 'correct-flash' : 'error');
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.innerHTML = board[r][c] ? SYM[board[r][c]] : '';

        if(edges[`${r}-${c}-h`] && c < size-1){
          const m = document.createElement('span');
          m.textContent = edges[`${r}-${c}-h`];
          m.style.cssText = 'position:absolute; right:-9px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:900; z-index:2; background:var(--gh-surface); border-radius:50%; width:14px; height:14px; display:flex; align-items:center; justify-content:center;';
          cell.appendChild(m);
        }
        if(edges[`${r}-${c}-v`] && r < size-1){
          const m = document.createElement('span');
          m.textContent = edges[`${r}-${c}-v`];
          m.style.cssText = 'position:absolute; bottom:-9px; left:50%; transform:translateX(-50%); font-size:12px; font-weight:900; z-index:2; background:var(--gh-surface); border-radius:50%; width:14px; height:14px; display:flex; align-items:center; justify-content:center;';
          cell.appendChild(m);
        }

        if(!fixed[r][c]){
          cell.addEventListener('mousedown', (e) => {
            if(paused || gameOver) return;
            e.preventDefault();
            cursor = [r,c];
            mouseDownCell = [r,c];
            isDragging = false;
            dragValue = (board[r][c]+1) % 3; // dragging paints this same next-value across cells
          });
          cell.addEventListener('mouseenter', () => {
            if(mouseDownCell && !paused && !gameOver){
              if(mouseDownCell[0] !== r || mouseDownCell[1] !== c) isDragging = true;
              if(isDragging){ applyValue(r, c, dragValue, true); render(); }
            }
          });
        }
        gridEl.appendChild(cell);
      }
    }
    document.getElementById('scoreVal').textContent = score;
    document.getElementById('hintsVal').textContent = (hintsMax-hintsUsed);
  }

  document.addEventListener('mouseup', () => {
    if(mouseDownCell && !isDragging){
      cycleCell(mouseDownCell[0], mouseDownCell[1]);
    } else if(isDragging){
      setTimeout(() => { flashCell = null; render(); }, 350);
      checkComplete();
    }
    mouseDownCell = null;
    isDragging = false;
  });

  function tick(){ if(paused||gameOver) return; seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); }
  timerId = setInterval(tick, 1000);

  document.getElementById('undoBtn').addEventListener('click', () => {
    const last = history.pop();
    if(last){ board[last.r][last.c]=last.prev; render(); }
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    if(confirm('Restart this puzzle?')){
      for(let r=0;r<size;r++) for(let c=0;c<size;c++) if(!fixed[r][c]) board[r][c]=0;
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
    for(let r=0;r<size;r++) for(let c=0;c<size;c++){
      if(!fixed[r][c] && board[r][c] !== solution[r][c]){
        board[r][c] = solution[r][c]; fixed[r][c] = true;
        hintsUsed++;
        score = Math.max(0, score-5);
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

  // Keyboard: arrows move cursor, space/enter cycles, 's' sun, 'm' moon, backspace clears
  document.addEventListener('keydown', (e) => {
    if(paused || gameOver) return;
    const [r,c] = cursor;
    if(e.key === 'ArrowUp'){ cursor=[Math.max(0,r-1),c]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowDown'){ cursor=[Math.min(size-1,r+1),c]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ cursor=[r,Math.max(0,c-1)]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ cursor=[r,Math.min(size-1,c+1)]; render(); e.preventDefault(); }
    else if(e.key === ' ' || e.key === 'Enter'){ cycleCell(r,c); e.preventDefault(); }
    else if(e.key.toLowerCase() === 's'){ applyValue(r,c,1,true); render(); setTimeout(()=>{flashCell=null;render();},350); checkComplete(); }
    else if(e.key.toLowerCase() === 'm'){ applyValue(r,c,2,true); render(); setTimeout(()=>{flashCell=null;render();},350); checkComplete(); }
    else if(e.key === 'Backspace' || e.key === 'Delete'){ applyValue(r,c,0,false); render(); }
  });

  function validate(){
    let valid = true, complete = true;
    const half = size/2;
    for(let r=0;r<size;r++){
      let s=0,m=0;
      for(let c=0;c<size;c++){
        if(board[r][c]===0) complete=false;
        if(board[r][c]===1) s++; if(board[r][c]===2) m++;
        if(c>=2 && board[r][c] && board[r][c]===board[r][c-1] && board[r][c]===board[r][c-2]) valid=false;
      }
      if(s>half || m>half) valid=false;
    }
    for(let c=0;c<size;c++){
      let s=0,m=0;
      for(let r=0;r<size;r++){
        if(board[r][c]===1) s++; if(board[r][c]===2) m++;
        if(r>=2 && board[r][c] && board[r][c]===board[r-1][c] && board[r][c]===board[r-2][c]) valid=false;
      }
      if(s>half || m>half) valid=false;
    }
    for(const key in edges){
      const [r,c,dir] = key.split('-');
      const R=parseInt(r), C=parseInt(c);
      const [r2,c2] = dir==='h' ? [R,C+1] : [R+1,C];
      const v1=board[R][C], v2=board[r2][c2];
      if(v1===0 || v2===0) continue;
      const shouldSame = edges[key]==='=';
      if(shouldSame && v1!==v2) valid=false;
      if(!shouldSame && v1===v2) valid=false;
    }
    return {valid, complete: valid && complete};
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
