function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2400);
}

document.getElementById('createBoardBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error('שגיאה בשרת');
    const board = await res.json();
    window.location.href = '/b/' + board.id;
  } catch (error) {
    toast('לא הצלחנו לפתוח תסקיר חדש: ' + error.message);
    btn.disabled = false;
  }
});
