const state = {
  apartments: [],
  categories: [],
  raters: ['שחר', 'ענבל'],
  currentId: null,
};

const board = document.getElementById('board');
const emptyState = document.getElementById('emptyState');
const statCount = document.getElementById('statCount');

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = 'שגיאה בשרת';
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2400);
}

function avgFor(apt, rater) {
  const scores = apt.ratings.filter(r => r.rater === rater).map(r => r.score);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '₪' + Number(n).toLocaleString('he-IL');
}

function statusClass(status) {
  return 'st-' + (status || '').replace(/\s+/g, '-');
}

async function loadAll() {
  const [apts, cats, raters] = await Promise.all([
    api('/api/apartments'),
    api('/api/categories'),
    api('/api/raters'),
  ]);
  state.apartments = apts;
  state.categories = cats;
  state.raters = raters;
  render();
}

function render() {
  board.innerHTML = '';
  statCount.textContent = `${state.apartments.length} דירות בתיק`;
  emptyState.hidden = state.apartments.length !== 0;

  state.apartments.forEach(apt => {
    const card = document.createElement('article');
    card.className = 'acard';
    card.addEventListener('click', () => openModal(apt.id));

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (apt.images.length) {
      const img = document.createElement('img');
      img.src = '/uploads/' + apt.images[0].filename;
      thumb.appendChild(img);
    } else {
      thumb.textContent = 'אין תמונה עדיין';
    }
    const stamp = document.createElement('span');
    stamp.className = 'stamp ' + statusClass(apt.status);
    stamp.textContent = apt.status;
    thumb.appendChild(stamp);
    card.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'body';

    const title = document.createElement('h3');
    title.className = 'title';
    title.textContent = apt.title || apt.address || 'דירה ללא כותרת';
    body.appendChild(title);

    const money = document.createElement('div');
    money.className = 'money-row';
    money.innerHTML = `
      <span><b>${fmtMoney(apt.price)}</b> לחודש</span>
      <span>ארנונה ${fmtMoney(apt.arnona)}</span>
      <span>ועד ${fmtMoney(apt.vaad_bayit)}</span>
    `;
    body.appendChild(money);

    if (apt.pros || apt.cons) {
      const pc = document.createElement('div');
      pc.className = 'pc-preview';
      if (apt.pros) pc.innerHTML += `<div class="p">✓ ${escapeHtml(truncate(apt.pros, 70))}</div>`;
      if (apt.cons) pc.innerHTML += `<div class="c">✕ ${escapeHtml(truncate(apt.cons, 70))}</div>`;
      body.appendChild(pc);
    }

    const scoreRow = document.createElement('div');
    scoreRow.className = 'score-row';
    state.raters.forEach(r => {
      const avg = avgFor(apt, r);
      const chip = document.createElement('div');
      chip.className = 'score-chip' + (avg === null ? ' empty' : '');
      chip.innerHTML = `<div class="who">${r}</div><div class="num">${avg === null ? '–' : avg.toFixed(1)}</div>`;
      scoreRow.appendChild(chip);
    });
    body.appendChild(scoreRow);

    card.appendChild(body);
    board.appendChild(card);
  });
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Modal ----------
const overlay = document.getElementById('modalOverlay');
const galleryEl = document.getElementById('gallery');
const ratingsTableEl = document.getElementById('ratingsTable');

const fields = ['title', 'price', 'arnona', 'vaad', 'contact_name', 'contact_phone', 'status', 'pros', 'cons'];
function fieldEl(name) { return document.getElementById('f_' + name); }

async function openModal(id) {
  let apt;
  if (id) {
    apt = state.apartments.find(a => a.id === id);
  } else {
    apt = await api('/api/apartments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    state.apartments.unshift(apt);
    render();
  }
  state.currentId = apt.id;
  fillModal(apt);
  overlay.hidden = false;
}

function fillModal(apt) {
  fieldEl('title').value = apt.title || '';
  fieldEl('price').value = apt.price ?? '';
  fieldEl('arnona').value = apt.arnona ?? '';
  fieldEl('vaad').value = apt.vaad_bayit ?? '';
  fieldEl('contact_name').value = apt.contact_name || '';
  fieldEl('contact_phone').value = apt.contact_phone || '';
  fieldEl('status').value = apt.status || 'בבדיקה';
  fieldEl('pros').value = apt.pros || '';
  fieldEl('cons').value = apt.cons || '';
  renderGallery(apt);
  renderRatingsTable(apt);
}

function renderGallery(apt) {
  galleryEl.innerHTML = '';
  apt.images.forEach(img => {
    const wrap = document.createElement('div');
    wrap.className = 'gimg-wrap';
    const el = document.createElement('img');
    el.src = '/uploads/' + img.filename;
    const del = document.createElement('button');
    del.className = 'gimg-del';
    del.textContent = '✕';
    del.onclick = async (e) => {
      e.stopPropagation();
      await api('/api/images/' + img.id, { method: 'DELETE' });
      const apt2 = state.apartments.find(a => a.id === state.currentId);
      apt2.images = apt2.images.filter(i => i.id !== img.id);
      renderGallery(apt2);
      render();
    };
    wrap.appendChild(el);
    wrap.appendChild(del);
    galleryEl.appendChild(wrap);
  });
}

function renderRatingsTable(apt) {
  ratingsTableEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rt-head';
  head.innerHTML = `<div>קטגוריה</div><div>שחר</div><div>ענבל</div><div></div>`;
  ratingsTableEl.appendChild(head);

  state.categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'rt-row';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'rt-cat rt-cat-name';
    nameDiv.textContent = cat.name;
    nameDiv.title = 'לחיצה כפולה לעריכת השם';
    nameDiv.ondblclick = async () => {
      const newName = prompt('שם קטגוריה:', cat.name);
      if (newName && newName.trim() && newName !== cat.name) {
        await api('/api/categories/' + cat.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
        cat.name = newName.trim();
        nameDiv.textContent = cat.name;
      }
    };
    row.appendChild(nameDiv);

    state.raters.forEach(rater => {
      const cell = document.createElement('div');
      cell.className = 'rt-score';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1; input.max = 10; input.step = 1;
      const existing = apt.ratings.find(r => r.category_id === cat.id && r.rater === rater);
      input.value = existing ? existing.score : '';
      input.placeholder = '–';
      input.addEventListener('change', async () => {
        const val = input.value === '' ? null : Number(input.value);
        if (val !== null && (val < 1 || val > 10)) { toast('הציון חייב להיות בין 1 ל-10'); input.value = existing ? existing.score : ''; return; }
        await api(`/api/apartments/${apt.id}/ratings`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rater, category_id: cat.id, score: val })
        });
        apt.ratings = apt.ratings.filter(r => !(r.category_id === cat.id && r.rater === rater));
        if (val !== null) apt.ratings.push({ category_id: cat.id, rater, score: val });
        renderFoot(apt);
        render();
      });
      cell.appendChild(input);
      row.appendChild(cell);
    });

    const delCell = document.createElement('div');
    const delBtn = document.createElement('button');
    delBtn.className = 'rt-del';
    delBtn.textContent = '✕';
    delBtn.title = 'מחיקת קטגוריה';
    delBtn.onclick = async () => {
      if (!confirm(`למחוק את הקטגוריה "${cat.name}"? הציונים שלה בכל הדירות יימחקו.`)) return;
      await api('/api/categories/' + cat.id, { method: 'DELETE' });
      state.categories = state.categories.filter(c => c.id !== cat.id);
      state.apartments.forEach(a => { a.ratings = a.ratings.filter(r => r.category_id !== cat.id); });
      renderRatingsTable(apt);
      render();
    };
    delCell.appendChild(delBtn);
    row.appendChild(delCell);

    ratingsTableEl.appendChild(row);
  });

  renderFoot(apt);
}

function renderFoot(apt) {
  let foot = ratingsTableEl.querySelector('.rt-foot');
  if (foot) foot.remove();
  foot = document.createElement('div');
  foot.className = 'rt-foot';
  const cells = [`<div>ממוצע</div>`];
  state.raters.forEach(r => {
    const avg = avgFor(apt, r);
    cells.push(`<div>${avg === null ? '–' : avg.toFixed(2)}</div>`);
  });
  cells.push('<div></div>');
  foot.innerHTML = cells.join('');
  ratingsTableEl.appendChild(foot);
}

async function saveField(name, apiKey) {
  const val = fieldEl(name).value;
  const apt = state.apartments.find(a => a.id === state.currentId);
  const body = { [apiKey || name]: val === '' ? null : val };
  const updated = await api('/api/apartments/' + state.currentId, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  Object.assign(apt, updated);
  render();
}

fieldEl('title').addEventListener('change', () => saveField('title'));
fieldEl('price').addEventListener('change', () => saveField('price'));
fieldEl('arnona').addEventListener('change', () => saveField('arnona'));
fieldEl('vaad').addEventListener('change', () => saveField('vaad', 'vaad_bayit'));
fieldEl('contact_name').addEventListener('change', () => saveField('contact_name'));
fieldEl('contact_phone').addEventListener('change', () => saveField('contact_phone'));
fieldEl('status').addEventListener('change', () => saveField('status'));
fieldEl('pros').addEventListener('change', () => saveField('pros'));
fieldEl('cons').addEventListener('change', () => saveField('cons'));

document.getElementById('imageInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('images', f);
  const created = await api(`/api/apartments/${state.currentId}/images`, { method: 'POST', body: fd });
  const apt = state.apartments.find(a => a.id === state.currentId);
  apt.images.push(...created);
  renderGallery(apt);
  render();
  e.target.value = '';
});

document.getElementById('addCategoryBtn').addEventListener('click', async () => {
  const name = prompt('שם הקטגוריה החדשה:');
  if (!name || !name.trim()) return;
  const cat = await api('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
  state.categories.push(cat);
  const apt = state.apartments.find(a => a.id === state.currentId);
  renderRatingsTable(apt);
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  const apt = state.apartments.find(a => a.id === state.currentId);
  if (!confirm(`למחוק את "${apt.title || apt.address || 'הדירה'}" מהתיק? הפעולה בלתי הפיכה.`)) return;
  await api('/api/apartments/' + state.currentId, { method: 'DELETE' });
  state.apartments = state.apartments.filter(a => a.id !== state.currentId);
  closeModal();
  render();
  toast('הדירה נמחקה');
});

function closeModal() {
  overlay.hidden = true;
  state.currentId = null;
}
document.getElementById('modalClose').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });

document.getElementById('openAddBtn').addEventListener('click', () => openModal(null));

loadAll().catch(err => toast('שגיאה בטעינה: ' + err.message));
