(function(){
  const root = document.documentElement;
  const saved = localStorage.getItem('gh-theme') || 'light';
  root.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  function updateIcon(){
    if(!btn) return;
    const icon = btn.querySelector('i');
    icon.className = root.getAttribute('data-theme') === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  }
  updateIcon();
  if(btn){
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('gh-theme', next);
      updateIcon();
    });
  }
})();

function ghFormatTime(sec){
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = Math.floor(sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

async function ghSaveResult(payload){
  try{
    const res = await fetch('/api/save_result', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    return await res.json();
  }catch(e){
    console.error('Failed to save result', e);
    return null;
  }
}

function ghStars(score){
  if(score >= 900) return '⭐⭐⭐';
  if(score >= 600) return '⭐⭐';
  if(score >= 300) return '⭐';
  return '';
}
