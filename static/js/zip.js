// ---------------------------------------------------------------------------
// Zip: connect numbered cells 1..K in order while filling every cell.
// Board (Hamiltonian path + waypoints + optional walls) is regenerated
// fresh every game.
// ---------------------------------------------------------------------------
function shuffledZ(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

// Randomized DFS that visits every cell of an N x N grid exactly once.
function generateHamiltonianPath(n){
  const total = n*n;
  const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
  const STEP_BUDGET = 20000; // abort a stuck attempt quickly and retry fresh

  function attempt(){
    const visited = Array.from({length:n}, () => Array(n).fill(false));
    const path = [];
    const startR = Math.floor(Math.random()*n), startC = Math.floor(Math.random()*n);
    visited[startR][startC] = true;
    path.push([startR,startC]);
    let steps = 0;

    function walk(){
      if(path.length === total) return true;
      steps++;
      if(steps > STEP_BUDGET) return false;
      const [r,c] = path[path.length-1];
      // Warnsdorff-like heuristic: try neighbor with fewest onward options first,
      // with randomization so boards differ each game.
      const options = [];
      for(const [dr,dc] of DIRS){
        const nr=r+dr, nc=c+dc;
        if(nr<0||nr>=n||nc<0||nc>=n||visited[nr][nc]) continue;
        let onward = 0;
        for(const [dr2,dc2] of DIRS){
          const nr2=nr+dr2, nc2=nc+dc2;
          if(nr2>=0&&nr2<n&&nc2>=0&&nc2<n&&!visited[nr2][nc2]) onward++;
        }
        options.push({nr,nc,onward});
      }
      if(options.length === 0) return false;
      options.sort((a,b) => a.onward - b.onward);
      // group by onward count, shuffle within group, prefer fewer options first
      const minOnward = options[0].onward;
      const tied = shuffledZ(options.filter(o => o.onward === minOnward));
      const rest = shuffledZ(options.filter(o => o.onward !== minOnward));
      const ordered = tied.concat(rest);
      for(const opt of ordered){
        visited[opt.nr][opt.nc] = true;
        path.push([opt.nr, opt.nc]);
        if(walk()) return true;
        path.pop();
        visited[opt.nr][opt.nc] = false;
        if(steps > STEP_BUDGET) return false;
      }
      return false;
    }
    return walk() ? path : null;
  }

  for(let tries=0; tries<400; tries++){
    const result = attempt();
    if(result){ return result; }
  }
  return null; // extremely unlikely
}

function difficultyWaypointRatio(diff){
  return {Easy:0.34, Medium:0.22, Hard:0.14, Expert:0.09}[diff] || 0.2;
}

function seededRandomZ(seedStr){
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

function buildZipPuzzle(n, difficulty){
  const path = generateHamiltonianPath(n);
  const total = n*n;
  const ratio = difficultyWaypointRatio(difficulty);
  const minWaypoints = Math.max(4, Math.round(total*ratio));

  // Always include the very first and last path cells; sample the rest.
  const middleIdx = shuffledZ(Array.from({length: total-2}, (_,i)=>i+1))
    .slice(0, Math.max(0, minWaypoints-2))
    .sort((a,b)=>a-b);
  const waypointPathIdx = [0, ...middleIdx, total-1];

  const numberAt = {}; // "r,c" -> number
  waypointPathIdx.forEach((pIdx, i) => {
    const [r,c] = path[pIdx];
    numberAt[`${r},${c}`] = i+1;
  });

  // Walls: only for Hard/Expert — block a few edges that are NOT used by
  // the generated solution path, so the intended solution stays valid.
  const walls = new Set(); // "r1,c1-r2,c2" normalized pair (sorted)
  if(difficulty === 'Hard' || difficulty === 'Expert'){
    const usedEdges = new Set();
    for(let i=0;i<path.length-1;i++){
      usedEdges.add(edgeKey(path[i], path[i+1]));
    }
    const candidates = [];
    for(let r=0;r<n;r++) for(let c=0;c<n;c++){
      if(c+1<n) candidates.push([[r,c],[r,c+1]]);
      if(r+1<n) candidates.push([[r,c],[r+1,c]]);
    }
    const wallCount = difficulty === 'Expert' ? Math.round(n*0.9) : Math.round(n*0.5);
    const shuffledCandidates = shuffledZ(candidates.filter(([a,b]) => !usedEdges.has(edgeKey(a,b))));
    shuffledCandidates.slice(0, wallCount).forEach(([a,b]) => walls.add(edgeKey(a,b)));
  }

  return { path, numberAt, walls, totalNumbers: waypointPathIdx.length, size:n };
}

function edgeKey(a, b){
  const s1 = `${a[0]},${a[1]}`, s2 = `${b[0]},${b[1]}`;
  return s1 < s2 ? `${s1}|${s2}` : `${s2}|${s1}`;
}

if(typeof module !== 'undefined'){
  module.exports = { generateHamiltonianPath, buildZipPuzzle, edgeKey };
}

// ---------------------------------------------------------------------------
// Game controller (browser only)
// ---------------------------------------------------------------------------
function initZip(cfg){
  const { size, difficulty, game, daily, seed } = cfg;
  let puzzle;
  if(seed){
    const rng = seededRandomZ(seed);
    const orig = Math.random;
    Math.random = rng;
    puzzle = buildZipPuzzle(size, difficulty);
    Math.random = orig;
  } else {
    puzzle = buildZipPuzzle(size, difficulty);
  }
  const { numberAt, walls, totalNumbers } = puzzle;
  const totalCells = size*size;

  let userPath = [];       // array of [r,c] the player has drawn, in order
  let nextNumberNeeded = 1;
  let dragging = false;
  let hintsUsed = 0, hintsMax = 10, score = 0, seconds = 0, timerId = null, paused = false, gameOver = false;
  let flashMsg = null;

  const cellPx = size >= 8 ? 46 : (size >= 7 ? 52 : 58);
  const gridEl = document.getElementById('grid');
  gridEl.style.position = 'relative';
  gridEl.style.width = gridEl.style.height = (cellPx*size)+'px';
  gridEl.style.margin = '0 auto';

  function cellKey(r,c){ return `${r},${c}`; }
  function pathIndexOf(r,c){ return userPath.findIndex(p => p[0]===r && p[1]===c); }
  function isAdjacent(a,b){ return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) === 1; }
  function wallBetween(a,b){ return walls.has(edgeKey(a,b)); }

  function render(){
    gridEl.innerHTML = '';
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute; left:${c*cellPx}px; top:${r*cellPx}px; width:${cellPx}px; height:${cellPx}px; background:var(--gh-surface); border:1px solid var(--gh-border); box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${cellPx*0.34}px; color:var(--gh-primary); cursor:pointer; user-select:none;`;
        const idx = pathIndexOf(r,c);
        if(idx !== -1){
          cell.style.background = 'var(--gh-primary)';
          cell.style.color = '#fff';
        }
        const num = numberAt[cellKey(r,c)];
        if(num){ cell.textContent = num; if(idx === -1){ cell.style.border = '2px solid var(--gh-primary)'; } }

        cell.addEventListener('mousedown', (e) => { e.preventDefault(); onCellDown(r,c); });
        cell.addEventListener('mouseenter', () => onCellEnter(r,c));
        cell.addEventListener('touchstart', (e) => { e.preventDefault(); onCellDown(r,c); }, {passive:false});

        gridEl.appendChild(cell);
      }
    }
    // wall overlay
    if(walls.size){
      walls.forEach(key => {
        const [aStr,bStr] = key.split('|');
        const [ar,ac] = aStr.split(',').map(Number);
        const [br,bc] = bStr.split(',').map(Number);
        const wall = document.createElement('div');
        const midX = (ac+bc)/2*cellPx + cellPx/2, midY = (ar+br)/2*cellPx + cellPx/2;
        const horizontal = ar === br;
        wall.style.cssText = `position:absolute; background:#1c2333; z-index:3; border-radius:2px;`;
        if(horizontal){
          wall.style.left = (midX-2)+'px'; wall.style.top = (Math.min(ar,br)*cellPx)+'px';
          wall.style.width = '4px'; wall.style.height = cellPx+'px';
        } else {
          wall.style.left = (Math.min(ac,bc)*cellPx)+'px'; wall.style.top = (midY-2)+'px';
          wall.style.width = cellPx+'px'; wall.style.height = '4px';
        }
        gridEl.appendChild(wall);
      });
    }
    document.getElementById('hintsVal').textContent = (hintsMax - hintsUsed);
    document.getElementById('scoreVal').textContent = score;
    document.getElementById('progressVal').textContent = `${userPath.length}/${totalCells}`;
    if(flashMsg){
      document.getElementById('zipMsg').textContent = flashMsg;
    }
  }

  function onCellDown(r,c){
    if(paused || gameOver) return;
    dragging = true;
    tryExtend(r,c, true);
  }
  function onCellEnter(r,c){
    if(!dragging || paused || gameOver) return;
    tryExtend(r,c, false);
  }
  document.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('touchend', () => { dragging = false; });

  function tryExtend(r,c, isStart){
    const cell = [r,c];
    const idx = pathIndexOf(r,c);

    if(userPath.length === 0){
      if(numberAt[cellKey(r,c)] !== 1){ return; } // must start at 1
      userPath.push(cell);
      nextNumberNeeded = 2;
      flashMsg = null;
      render();
      return;
    }

    // clicking the second-to-last cell (or any earlier cell) truncates/undoes back to it
    if(idx !== -1){
      if(idx === userPath.length-1) return; // clicking current end does nothing
      const removed = userPath.splice(idx+1);
      // recompute nextNumberNeeded based on truncated path
      let maxNum = 0;
      userPath.forEach(([rr,cc]) => { const n = numberAt[cellKey(rr,cc)]; if(n) maxNum = Math.max(maxNum, n); });
      nextNumberNeeded = maxNum+1;
      render();
      return;
    }

    const last = userPath[userPath.length-1];
    if(!isAdjacent(last, cell)) return;
    if(wallBetween(last, cell)) return;

    const num = numberAt[cellKey(r,c)];
    if(num && num !== nextNumberNeeded) return; // must hit numbers in order, no skipping

    userPath.push(cell);
    score += 2; // every valid step forward earns a small positive amount
    if(num) nextNumberNeeded = num+1;
    flashMsg = null;
    render();
    checkComplete();
  }

  function checkComplete(){
    if(userPath.length !== totalCells) return false;
    const lastCell = userPath[userPath.length-1];
    if(numberAt[cellKey(lastCell[0], lastCell[1])] !== totalNumbers) return false;
    finishGame();
    return true;
  }

  function tick(){ if(paused||gameOver) return; seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); }
  timerId = setInterval(tick, 1000);

  document.getElementById('restartBtn').addEventListener('click', () => {
    if(confirm('Restart this puzzle?')){
      userPath = []; nextNumberNeeded = 1; score = 0; flashMsg = null;
      render();
    }
  });
  document.getElementById('pauseBtn').addEventListener('click', (e) => {
    paused = !paused;
    e.target.textContent = paused ? '▶ Resume' : '⏸ Pause';
    document.getElementById('overlay').classList.toggle('d-none', !paused);
  });
  document.getElementById('hintBtn').addEventListener('click', () => {
    if(hintsUsed >= hintsMax){ alert('No hints remaining.'); return; }
    // Reveal the next correct cell along the generator's own solution path.
    const { path } = puzzle;
    const lastCell = userPath.length ? userPath[userPath.length-1] : null;
    let nextCell = null;
    if(!lastCell){
      nextCell = path[0];
    } else {
      const pIdx = path.findIndex(([r,c]) => r===lastCell[0] && c===lastCell[1]);
      if(pIdx !== -1 && pIdx+1 < path.length) nextCell = path[pIdx+1];
    }
    if(!nextCell){ flashMsg = 'No hint available from here — try Restart.'; render(); return; }
    hintsUsed++;
    if(userPath.length === 0){
      userPath.push(nextCell);
      nextNumberNeeded = 2;
    } else {
      userPath.push(nextCell);
      const num = numberAt[cellKey(nextCell[0], nextCell[1])];
      if(num) nextNumberNeeded = num+1;
    }
    render();
    checkComplete();
  });
  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost and this attempt will not be saved.')) window.location.href = '/home';
  });

  function finishGame(){
    if(gameOver) return;
    gameOver = true;
    clearInterval(timerId);
    score += 250; // win bonus
    document.getElementById('finalTime').textContent = ghFormatTime(seconds);
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalHints').textContent = hintsUsed;
    document.getElementById('finalStars').textContent = ghStars(score);
    new bootstrap.Modal(document.getElementById('completeModal')).show();
    ghSaveResult({
      game, mode: 'Solo', size, difficulty, score,
      time_taken: seconds, mistakes: 0, hints_used: hintsUsed,
      result: 'Won', daily
    });
  }

  render();
}
