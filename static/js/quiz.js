// ---------------------------------------------------------------------------
// Quiz — either fetches one question at a time from the server (free-play,
// per-category, tracks its own internal progress so it doesn't repeat), or
// plays a fixed pre-loaded set of "Daily Quiz" questions (exactly 17, same
// for everyone that calendar day). Scores answers, no losing condition.
// ---------------------------------------------------------------------------
function initQuiz(cfg){
  const { game, category, categoryName, daily, dailyQuestions, dailyTotal } = cfg;
  const isDaily = !!daily;
  const dailyQueue = isDaily ? (dailyQuestions || []).slice() : null;
  const totalForDisplay = isDaily ? (dailyTotal || dailyQueue.length) : null;

  let questionNum = 0;        // resets to 1 each new session, shown to the player
  let score = 0, correctCount = 0, wrongCount = 0, hintsUsed = 0;
  const hintsMax = isDaily ? 5 : 20;
  let seconds = 0, timerId = null, gameOver = false;
  let current = null;         // {question, options, correct, solution}
  let answered = false, selectedKey = null, solutionShown = false;
  let hiddenOption = null;    // option key removed by a hint

  const qEl = document.getElementById('questionText');
  const optsEl = document.getElementById('optionsWrap');
  const feedbackEl = document.getElementById('feedbackText');
  const solutionEl = document.getElementById('solutionText');

  function tick(){ if(gameOver) return; seconds++; document.getElementById('timeVal').textContent = ghFormatTime(seconds); }
  timerId = setInterval(tick, 1000);

  function updateHud(){
    document.getElementById('qNumVal').textContent = isDaily ? `${questionNum} of ${totalForDisplay}` : questionNum;
    document.getElementById('scoreVal').textContent = score;
    document.getElementById('correctVal').textContent = correctCount;
    document.getElementById('wrongVal').textContent = wrongCount;
    document.getElementById('hintsVal').textContent = (hintsMax - hintsUsed);
  }

  async function loadNext(){
    if(gameOver) return;

    if(isDaily && dailyQueue.length === 0){
      finishGame();
      return;
    }

    answered = false; selectedKey = null; solutionShown = false; hiddenOption = null;
    feedbackEl.textContent = '';
    feedbackEl.className = '';
    solutionEl.classList.add('d-none');
    document.getElementById('checkSolutionBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    document.getElementById('hintBtn').disabled = (hintsUsed >= hintsMax);

    if(isDaily){
      current = dailyQueue.shift();
      questionNum++;
      renderQuestion();
      updateHud();
      return;
    }

    qEl.textContent = 'Loading question…';
    optsEl.innerHTML = '';
    try{
      const res = await fetch(`/api/quiz/next/${category}`);
      if(!res.ok) throw new Error('failed to load question');
      current = await res.json();
      questionNum++;
      renderQuestion();
      updateHud();
    } catch(e){
      qEl.textContent = 'Could not load a question. Please try again.';
      console.error(e);
    }
  }

  function renderQuestion(){
    qEl.textContent = current.question;
    optsEl.innerHTML = '';
    ['A','B','C','D'].forEach(key => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-primary text-start quiz-option mb-2 w-100';
      btn.dataset.key = key;
      btn.innerHTML = `<strong>${key}.</strong> ${current.options[key]}`;
      btn.addEventListener('click', () => selectOption(key));
      optsEl.appendChild(btn);
    });
  }

  function selectOption(key){
    if(answered || gameOver) return;
    if(key === hiddenOption) return;
    answered = true;
    selectedKey = key;
    const correct = key === current.correct;

    if(correct){
      correctCount++;
      score += 10;
      feedbackEl.textContent = '✅ Correct!';
      feedbackEl.className = 'text-success fw-bold';
    } else {
      wrongCount++;
      score = Math.max(0, score - 5);
      feedbackEl.textContent = '❌ Wrong!';
      feedbackEl.className = 'text-danger fw-bold';
    }

    optsEl.querySelectorAll('.quiz-option').forEach(btn => {
      btn.disabled = true;
      if(btn.dataset.key === current.correct) btn.classList.add('btn-success');
      else if(btn.dataset.key === key) btn.classList.add('btn-danger');
      btn.classList.remove('btn-outline-primary');
    });

    document.getElementById('checkSolutionBtn').disabled = false;
    document.getElementById('nextBtn').disabled = false;
    document.getElementById('hintBtn').disabled = true;
    updateHud();
  }

  document.getElementById('hintBtn').addEventListener('click', () => {
    if(answered || gameOver || hiddenOption) return;
    if(hintsUsed >= hintsMax){ alert('No hints remaining.'); return; }
    // 50/50-style hint: gray out one incorrect option. Never changes score.
    const wrongOptions = ['A','B','C','D'].filter(k => k !== current.correct);
    hiddenOption = wrongOptions[Math.floor(Math.random()*wrongOptions.length)];
    hintsUsed++;
    const btn = optsEl.querySelector(`.quiz-option[data-key="${hiddenOption}"]`);
    if(btn){ btn.disabled = true; btn.classList.add('text-muted'); btn.style.opacity = '0.4'; }
    document.getElementById('hintBtn').disabled = true;
    updateHud();
  });

  document.getElementById('checkSolutionBtn').addEventListener('click', () => {
    if(!answered) return;
    solutionShown = true;
    solutionEl.textContent = current.solution || 'No explanation provided for this question.';
    solutionEl.classList.remove('d-none');
  });

  document.getElementById('nextBtn').addEventListener('click', () => {
    if(!answered) return;
    loadNext();
  });

  const finishBtn = document.getElementById('finishBtn');
  if(finishBtn){
    finishBtn.addEventListener('click', async () => {
      if(gameOver || isDaily) return;
      // Commit the in-session pointer to the database FIRST, so the next
      // unused question is remembered for next time, then save this
      // session's score/history like normal.
      try{
        await fetch('/api/quiz/finish', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ category })
        });
      } catch(e){ console.error('Failed to commit quiz progress', e); }
      finishGame();
    });
  }

  document.getElementById('exitBtn').addEventListener('click', () => {
    const msg = isDaily
      ? "Exit without finishing today's Daily Quiz? It won't count as completed and won't be saved."
      : "Exit without saving? Nothing from this session (score, answers, questions played) will be saved, and next time you'll see these same questions again from the start.";
    if(confirm(msg)){
      window.location.href = '/home';
    }
  });

  function finishGame(){
    if(gameOver) return;
    gameOver = true;
    clearInterval(timerId);
    document.getElementById('finalTime').textContent = ghFormatTime(seconds);
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalHints').textContent = hintsUsed;
    document.getElementById('finalStars').textContent = ghStars(score);
    new bootstrap.Modal(document.getElementById('completeModal')).show();

    ghSaveResult({
      game, mode: 'Solo', size: String(questionNum), difficulty: isDaily ? 'Daily Quiz' : categoryName,
      score, time_taken: seconds, mistakes: wrongCount, hints_used: hintsUsed,
      result: 'Completed', daily: isDaily
    });
  }

  loadNext();
}
