// ---------------------------------------------------------------------------
// Sudoku engine: supports 4x4, 6x6, 8x8, 9x9, 12x12, 16x16
// ---------------------------------------------------------------------------
function boxDims(size){
  const map = {4:[2,2], 6:[2,3], 8:[2,4], 9:[3,3], 12:[3,4], 16:[4,4]};
  return map[size] || [Math.sqrt(size), Math.sqrt(size)];
}

function shuffled(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function isSafe(grid, size, boxR, boxC, row, col, val){
  for(let c=0;c<size;c++) if(grid[row][c]===val) return false;
  for(let r=0;r<size;r++) if(grid[r][col]===val) return false;
  const br = Math.floor(row/boxR)*boxR, bc = Math.floor(col/boxC)*boxC;
  for(let r=br;r<br+boxR;r++) for(let c=bc;c<bc+boxC;c++) if(grid[r][c]===val) return false;
  return true;
}

function generateSolution(size){
  const [boxR, boxC] = boxDims(size);
  const grid = Array.from({length:size}, () => Array(size).fill(0));
  const nums = Array.from({length:size}, (_,i)=>i+1);

  function fill(pos){
    if(pos === size*size) return true;
    const row = Math.floor(pos/size), col = pos % size;
    for(const val of shuffled(nums)){
      if(isSafe(grid, size, boxR, boxC, row, col, val)){
        grid[row][col] = val;
        if(fill(pos+1)) return true;
        grid[row][col] = 0;
      }
    }
    return false;
  }
  fill(0);
  return grid;
}

function difficultyRemovalRatio(diff){
  return {Easy:0.40, Medium:0.52, Hard:0.62, Expert:0.72}[diff] || 0.5;
}

function seededRandom(seedStr){
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

function generatePuzzle(size, difficulty, seed){
  if(seed){
    const rng = seededRandom(seed);
    const orig = Math.random;
    Math.random = rng;
    const solution = generateSolution(size);
    const puzzle = solution.map(r => r.slice());
    const total = size*size;
    const removeCount = Math.floor(total * difficultyRemovalRatio(difficulty));
    const positions = shuffled(Array.from({length: total}, (_,i)=>i)).slice(0, removeCount);
    positions.forEach(p => { puzzle[Math.floor(p/size)][p%size] = 0; });
    Math.random = orig;
    return {solution, puzzle};
  }
  const solution = generateSolution(size);
  const puzzle = solution.map(r => r.slice());
  const total = size*size;
  const removeCount = Math.floor(total * difficultyRemovalRatio(difficulty));
  const positions = shuffled(Array.from({length: total}, (_,i)=>i)).slice(0, removeCount);
  positions.forEach(p => { puzzle[Math.floor(p/size)][p%size] = 0; });
  return {solution, puzzle};
}

// ---------------------------------------------------------------------------
// Game controller
// ---------------------------------------------------------------------------
function initSudoku(cfg){
  const { size, difficulty, game, daily, seed } = cfg;
  const { solution, puzzle } = generatePuzzle(size, difficulty, seed);
  const fixed = puzzle.map(row => row.map(v => v !== 0));
  const board = puzzle.map(row => row.slice());
  const [boxR, boxC] = boxDims(size);

  let selected = null;
  let mistakes = 0, hintsUsed = 0, hintsMax = 20, score = 0;
  let seconds = 0, timerId = null, paused = false, gameOver = false;
  let flashCell = null, flashKind = null;
  const history = [];

  const gridEl = document.getElementById('grid');
  gridEl.style.gridTemplateColumns = `repeat(${size}, ${size>10?32:40}px)`;
  gridEl.style.gridTemplateRows = `repeat(${size}, ${size>10?32:40}px)`;

  function cellSizeClass(){ return size>10 ? 'small-cell' : ''; }

  function render(){
    gridEl.innerHTML = '';
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const cell = document.createElement('div');
        cell.className = 'puzzle-cell ' + cellSizeClass();
        if(fixed[r][c]) cell.classList.add('fixed');
        if((c+1) % boxC === 0 && c !== size-1) cell.classList.add('board-cell-r0');
        if((r+1) % boxR === 0 && r !== size-1) cell.classList.add('board-cell-b0');
        cell.style.width = cell.style.height = (size>10?'32px':'40px');
        cell.textContent = board[r][c] || '';
        if(selected && selected[0]===r && selected[1]===c) cell.classList.add('selected');
        if(flashCell && flashCell[0]===r && flashCell[1]===c) cell.classList.add(flashKind === 'ok' ? 'correct-flash' : 'error');
        cell.addEventListener('click', () => { if(!fixed[r][c] && !paused && !gameOver){ selected=[r,c]; render(); } });
        gridEl.appendChild(cell);
      }
    }
    document.getElementById('scoreVal').textContent = score;
    document.getElementById('hintsVal').textContent = (hintsMax - hintsUsed);
  }

  function tick(){
    if(paused || gameOver) return;
    seconds++;
    document.getElementById('timeVal').textContent = ghFormatTime(seconds);
  }
  timerId = setInterval(tick, 1000);

  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => placeValue(parseInt(btn.dataset.val)));
  });
  document.getElementById('eraseBtn').addEventListener('click', () => placeValue(0));

  function placeValue(val){
    if(!selected || paused || gameOver) return;
    const [r,c] = selected;
    if(fixed[r][c]) return;
    history.push({r,c,prev: board[r][c]});
    board[r][c] = val;
    if(val !== 0){
      if(val === solution[r][c]){
        score += 10;
        flashCell = [r,c]; flashKind = 'ok';
      } else {
        mistakes++;
        score = Math.max(0, score - 5);
        flashCell = [r,c]; flashKind = 'bad';
      }
    }
    render();
    setTimeout(() => { flashCell = null; render(); }, 350);
    checkComplete();
  }

  document.getElementById('undoBtn').addEventListener('click', () => {
    const last = history.pop();
    if(last){ board[last.r][last.c] = last.prev; render(); }
  });

  document.getElementById('hintBtn').addEventListener('click', () => {
    if(hintsUsed >= hintsMax){ alert('No hints remaining.'); return; }
    const empties = [];
    for(let r=0;r<size;r++) for(let c=0;c<size;c++)
      if(!fixed[r][c] && board[r][c] !== solution[r][c]) empties.push([r,c]);
    if(empties.length === 0) return;
    const [r,c] = empties[Math.floor(Math.random()*empties.length)];
    board[r][c] = solution[r][c];
    fixed[r][c] = true;
    hintsUsed++;
    score = Math.max(0, score - 5);
    render();
    checkComplete();
  });

  document.getElementById('restartBtn').addEventListener('click', () => {
    if(confirm('Restart this puzzle?')){
      for(let r=0;r<size;r++) for(let c=0;c<size;c++)
        if(!fixed[r][c]) board[r][c] = 0;
      mistakes = 0; score = 0; history.length = 0;
      render();
    }
  });

  document.getElementById('pauseBtn').addEventListener('click', (e) => {
    paused = !paused;
    e.target.textContent = paused ? '▶ Resume' : '⏸ Pause';
    document.getElementById('overlay').classList.toggle('d-none', !paused);
  });

  document.getElementById('checkBtn').addEventListener('click', () => {
    let correct = true;
    for(let r=0;r<size;r++) for(let c=0;c<size;c++){
      if(board[r][c] !== solution[r][c]){ correct = false; }
    }
    alert(correct ? 'Looks good so far — keep going or it may already be solved!' : 'There are still mistakes or empty cells.');
    checkComplete();
  });

  document.getElementById('exitBtn').addEventListener('click', () => {
    if(confirm('Exit to Home? Progress will be lost.')) window.location.href = '/home';
  });

  // Keyboard support: number keys fill the selected cell, arrows move selection
  document.addEventListener('keydown', (e) => {
    if(paused || gameOver || !selected) {
      // still allow arrow keys to establish a starting selection
      if(!selected && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
        selected = [0,0]; render();
      }
      return;
    }
    const [r,c] = selected;
    if(e.key >= '1' && e.key <= '9'){
      const val = parseInt(e.key);
      if(val <= size) placeValue(val);
      e.preventDefault();
    } else if(e.key === 'Backspace' || e.key === 'Delete' || e.key === '0'){
      placeValue(0);
      e.preventDefault();
    } else if(e.key === 'ArrowUp'){ selected = [Math.max(0,r-1), c]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowDown'){ selected = [Math.min(size-1,r+1), c]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ selected = [r, Math.max(0,c-1)]; render(); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ selected = [r, Math.min(size-1,c+1)]; render(); e.preventDefault(); }
  });

  function checkComplete(){
    for(let r=0;r<size;r++) for(let c=0;c<size;c++)
      if(board[r][c] !== solution[r][c]) return false;
    finishGame();
    return true;
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
    document.getElementById('completeModalBody').classList.remove('d-none');
    const modal = new bootstrap.Modal(document.getElementById('completeModal'));
    modal.show();

    ghSaveResult({
      game, mode: 'Solo', size, difficulty, score,
      time_taken: seconds, mistakes, hints_used: hintsUsed,
      result: 'Won', daily
    });
  }

  render();
}
