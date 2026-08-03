const state = {
  apartments: [],
  categories: [],
  raters: [], // [{id, name, sort_order}]
  settings: { group_name: 'התסקיר שלנו' },
  currentId: null,
};

const BOARD_ID = (location.pathname.match(/^\/b\/([^/]+)/) || [])[1];
if (!BOARD_ID) location.href = '/';
function b(path) { return `/api/boards/${BOARD_ID}${path}`; }

const board = document.getElementById('board');
const emptyState = document.getElementById('emptyState');
const statCount = document.getElementById('statCount');
const strongCount = document.getElementById('strongCount');
const autosaveState = document.getElementById('autosaveState');
const modalTitle = document.getElementById('modalTitle');
let lastFocusedElement = null;

const icons = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
};

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

function fmtRooms(value) {
  if (value === null || value === undefined || value === '') return '';
  const rooms = Number(value);
  if (!Number.isFinite(rooms)) return '';
  const label = rooms === 1 ? 'חדר' : 'חדרים';
  return `${rooms.toLocaleString('he-IL', { maximumFractionDigits: 1 })} ${label}`;
}

function statusClass(status) {
  return 'st-' + (status || '').replace(/\s+/g, '-');
}

async function loadAll() {
  const [apts, cats, raters, settings] = await Promise.all([
    api(b('/apartments')),
    api(b('/categories')),
    api(b('/raters')),
    api(b('/settings')),
  ]);
  state.apartments = apts;
  state.categories = cats;
  state.raters = raters;
  state.settings = settings;
  applyBranding();
  render();
}

function applyBranding() {
  const name = state.settings.group_name || 'התסקיר שלנו';
  document.getElementById('brandTitle').textContent = name;
  document.getElementById('pageTitleTag').textContent = name;
  const n = state.raters.length;
  document.getElementById('brandSub').textContent = n
    ? `תסקיר דירות קבוצתי · ${n} מדרגים`
    : 'תסקיר דירות קבוצתי';
}

function render() {
  board.innerHTML = '';
  statCount.textContent = state.apartments.length;
  strongCount.textContent = state.apartments.filter(apt => apt.status === 'מועמדת חזקה').length;
  emptyState.hidden = state.apartments.length !== 0;

  if (!dashboardView.hidden && typeof renderDashboard === 'function') renderDashboard();

  state.apartments.forEach(apt => {
    const card = document.createElement('article');
    card.className = 'acard';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `פתיחת פרטי ${apt.title || apt.address || 'הדירה'}`);
    card.addEventListener('click', () => openModal(apt.id));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(apt.id);
      }
    });

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (apt.images.length) {
      const img = document.createElement('img');
      img.src = '/uploads/' + apt.images[0].filename;
      img.alt = `תמונה של ${apt.title || apt.address || 'הדירה'}`;
      img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      const noPhoto = document.createElement('div');
      noPhoto.className = 'no-photo';
      noPhoto.innerHTML = `${icons.camera}<span>אין תמונה עדיין</span>`;
      thumb.appendChild(noPhoto);
    }
    const stamp = document.createElement('span');
    stamp.className = 'stamp ' + statusClass(apt.status);
    stamp.textContent = apt.status || 'בבדיקה';
    thumb.appendChild(stamp);

    if (apt.images.length) {
      const photoCount = document.createElement('span');
      photoCount.className = 'photo-count';
      photoCount.innerHTML = `${icons.camera}<span>${apt.images.length}</span>`;
      photoCount.setAttribute('aria-label', `${apt.images.length} תמונות`);
      thumb.appendChild(photoCount);
    }
    card.appendChild(thumb);

    const body = document.createElement('div');
    body.className = 'body';

    const heading = document.createElement('div');
    heading.className = 'card-heading';
    const title = document.createElement('h3');
    title.className = 'title';
    title.textContent = apt.title || apt.address || 'דירה חדשה';
    const arrow = document.createElement('span');
    arrow.className = 'card-arrow';
    arrow.innerHTML = icons.arrow;
    arrow.setAttribute('aria-hidden', 'true');
    heading.appendChild(title);
    heading.appendChild(arrow);
    body.appendChild(heading);

    const money = document.createElement('div');
    money.className = 'money-row';
    const roomsText = fmtRooms(apt.rooms);
    money.innerHTML = `
      <span class="money-main">${fmtMoney(apt.price)}</span>
      <span>לחודש</span>
      ${roomsText ? `<span class="rooms-count">${roomsText}</span>` : ''}
      <span class="money-separator">/</span>
      <span>ארנונה ${fmtMoney(apt.arnona)}</span>
      <span>ועד ${fmtMoney(apt.vaad_bayit)}</span>`;
    body.appendChild(money);

    if (apt.pros || apt.cons) {
      const pc = document.createElement('div');
      pc.className = 'pc-preview';
      if (apt.pros) pc.innerHTML += `<div class="p">${icons.check}<span>${escapeHtml(truncate(apt.pros, 70))}</span></div>`;
      if (apt.cons) pc.innerHTML += `<div class="c">${icons.close}<span>${escapeHtml(truncate(apt.cons, 70))}</span></div>`;
      body.appendChild(pc);
    }

    const scoreRow = document.createElement('div');
    scoreRow.className = 'score-row';
    state.raters.forEach(r => {
      const avg = avgFor(apt, r.name);
      const chip = document.createElement('div');
      chip.className = 'score-chip' + (avg === null ? ' empty' : '');
      chip.innerHTML = `<div class="who">${escapeHtml(r.name)}</div><div><span class="num">${avg === null ? '–' : avg.toFixed(1)}</span><span class="out-of">/10</span></div>`;
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

const fields = ['title', 'rooms', 'price', 'arnona', 'vaad', 'contact_name', 'contact_phone', 'status', 'pros', 'cons'];
function fieldEl(name) { return document.getElementById('f_' + name); }

async function openModal(id) {
  lastFocusedElement = document.activeElement;
  let apt;
  if (id) {
    apt = state.apartments.find(a => a.id === id);
  } else {
    apt = await api(b('/apartments'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    state.apartments.unshift(apt);
    render();
  }
  state.currentId = apt.id;
  fillModal(apt);
  modalTitle.textContent = apt.title || apt.address || 'דירה חדשה';
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  document.querySelector('.modal-scroll').scrollTop = 0;
  document.getElementById('modalClose').focus({ preventScroll: true });
}

function fillModal(apt) {
  fieldEl('title').value = apt.title || '';
  fieldEl('rooms').value = apt.rooms ?? '';
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
    el.alt = `תמונה של ${apt.title || apt.address || 'הדירה'}`;
    const del = document.createElement('button');
    del.className = 'gimg-del';
    del.type = 'button';
    del.innerHTML = icons.close;
    del.setAttribute('aria-label', 'מחיקת התמונה');
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('למחוק את התמונה הזו?')) return;
      await api(b('/images/' + img.id), { method: 'DELETE' });
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

function ratingsGridTemplate() {
  return `var(--rt-name-col) repeat(${state.raters.length || 1}, var(--rt-score-col)) var(--rt-del-col)`;
}

function renderRatingsTable(apt) {
  ratingsTableEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rt-head';
  head.style.gridTemplateColumns = ratingsGridTemplate();
  head.innerHTML = `<div>קטגוריה</div>${state.raters.map(rater => `<div>${escapeHtml(rater.name)}</div>`).join('')}<div></div>`;
  ratingsTableEl.appendChild(head);

  state.categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'rt-row';
    row.style.gridTemplateColumns = ratingsGridTemplate();

    const nameDiv = document.createElement('div');
    nameDiv.className = 'rt-cat rt-cat-name';
    nameDiv.textContent = cat.name;
    nameDiv.title = 'לחיצה לעריכת השם';
    nameDiv.tabIndex = 0;
    nameDiv.setAttribute('role', 'button');
    nameDiv.setAttribute('aria-label', `עריכת שם הקטגוריה ${cat.name}`);
    const editCategory = async () => {
      const newName = prompt('שם קטגוריה:', cat.name);
      if (newName && newName.trim() && newName !== cat.name) {
        await api(b('/categories/' + cat.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) });
        cat.name = newName.trim();
        nameDiv.textContent = cat.name;
        nameDiv.setAttribute('aria-label', `עריכת שם הקטגוריה ${cat.name}`);
      }
    };
    nameDiv.onclick = editCategory;
    nameDiv.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        editCategory();
      }
    };
    row.appendChild(nameDiv);

    state.raters.forEach(raterObj => {
      const rater = raterObj.name;
      const cell = document.createElement('div');
      cell.className = 'rt-score';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1; input.max = 10; input.step = 1;
      const existing = apt.ratings.find(r => r.category_id === cat.id && r.rater === rater);
      input.value = existing ? existing.score : '';
      input.placeholder = '–';
      input.setAttribute('aria-label', `${cat.name}, ציון של ${rater}`);
      input.addEventListener('change', async () => {
        const val = input.value === '' ? null : Number(input.value);
        if (val !== null && (val < 1 || val > 10)) { toast('הציון חייב להיות בין 1 ל-10'); input.value = existing ? existing.score : ''; return; }
        setSaveState('saving', 'שומר...');
        try {
          await api(b(`/apartments/${apt.id}/ratings`), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rater, category_id: cat.id, score: val })
          });
          apt.ratings = apt.ratings.filter(r => !(r.category_id === cat.id && r.rater === rater));
          if (val !== null) apt.ratings.push({ category_id: cat.id, rater, score: val });
          renderFoot(apt);
          render();
          setSaveState('', 'נשמר אוטומטית');
        } catch (error) {
          setSaveState('error', 'לא נשמר');
          toast('לא הצלחנו לשמור את הציון: ' + error.message);
        }
      });
      cell.appendChild(input);
      row.appendChild(cell);
    });

    const delCell = document.createElement('div');
    const delBtn = document.createElement('button');
    delBtn.className = 'rt-del';
    delBtn.type = 'button';
    delBtn.innerHTML = icons.trash;
    delBtn.title = 'מחיקת קטגוריה';
    delBtn.setAttribute('aria-label', `מחיקת הקטגוריה ${cat.name}`);
    delBtn.onclick = async () => {
      if (!confirm(`למחוק את הקטגוריה "${cat.name}"? הציונים שלה בכל הדירות יימחקו.`)) return;
      await api(b('/categories/' + cat.id), { method: 'DELETE' });
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
  foot.style.gridTemplateColumns = ratingsGridTemplate();
  const cells = [`<div>ממוצע</div>`];
  state.raters.forEach(r => {
    const avg = avgFor(apt, r.name);
    cells.push(`<div>${avg === null ? '–' : avg.toFixed(2)}</div>`);
  });
  cells.push('<div></div>');
  foot.innerHTML = cells.join('');
  ratingsTableEl.appendChild(foot);
}

async function saveField(name, apiKey) {
  setSaveState('saving', 'שומר...');
  try {
    const val = fieldEl(name).value;
    const apt = state.apartments.find(a => a.id === state.currentId);
    const body = { [apiKey || name]: val === '' ? null : val };
    const updated = await api(b('/apartments/' + state.currentId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    Object.assign(apt, updated);
    modalTitle.textContent = apt.title || apt.address || 'דירה חדשה';
    render();
    setSaveState('', 'נשמר אוטומטית');
  } catch (error) {
    setSaveState('error', 'לא נשמר');
    toast('לא הצלחנו לשמור: ' + error.message);
  }
}

function setSaveState(className, label) {
  autosaveState.className = 'autosave-state' + (className ? ` ${className}` : '');
  autosaveState.innerHTML = `${className === 'error' ? icons.close : icons.check}<span>${label}</span>`;
}

fieldEl('title').addEventListener('change', () => saveField('title'));
fieldEl('rooms').addEventListener('change', () => saveField('rooms'));
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
  setSaveState('saving', 'מעלה תמונות...');
  try {
    const created = await api(b(`/apartments/${state.currentId}/images`), { method: 'POST', body: fd });
    const apt = state.apartments.find(a => a.id === state.currentId);
    apt.images.push(...created);
    renderGallery(apt);
    render();
    setSaveState('', 'נשמר אוטומטית');
  } catch (error) {
    setSaveState('error', 'ההעלאה נכשלה');
    toast('לא הצלחנו להעלות את התמונות: ' + error.message);
  } finally {
    e.target.value = '';
  }
});

document.getElementById('addCategoryBtn').addEventListener('click', async () => {
  const name = prompt('שם הקטגוריה החדשה:');
  if (!name || !name.trim()) return;
  const cat = await api(b('/categories'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
  state.categories.push(cat);
  const apt = state.apartments.find(a => a.id === state.currentId);
  renderRatingsTable(apt);
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  const apt = state.apartments.find(a => a.id === state.currentId);
  if (!confirm(`למחוק את "${apt.title || apt.address || 'הדירה'}" מהתיק? הפעולה בלתי הפיכה.`)) return;
  await api(b('/apartments/' + state.currentId), { method: 'DELETE' });
  state.apartments = state.apartments.filter(a => a.id !== state.currentId);
  closeModal();
  render();
  toast('הדירה נמחקה');
});

function closeModal() {
  overlay.hidden = true;
  document.body.classList.remove('modal-open');
  state.currentId = null;
  if (lastFocusedElement && document.contains(lastFocusedElement)) lastFocusedElement.focus();
}
document.getElementById('modalClose').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (overlay.hidden) return;
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  if (e.key === 'Tab') {
    const focusable = [...document.getElementById('modal').querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    )].filter(element => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

document.getElementById('openAddBtn').addEventListener('click', () => openModal(null));
document.getElementById('mobileAddBtn').addEventListener('click', () => openModal(null));
document.querySelector('.empty-add').addEventListener('click', () => openModal(null));

// ---------- View tabs (board / dashboard) ----------
const tabBoard = document.getElementById('tabBoard');
const tabDashboard = document.getElementById('tabDashboard');
const boardView = document.getElementById('boardView');
const dashboardView = document.getElementById('dashboardView');

function setView(view) {
  const isDash = view === 'dashboard';
  boardView.hidden = isDash;
  dashboardView.hidden = !isDash;
  tabBoard.setAttribute('aria-pressed', String(!isDash));
  tabDashboard.setAttribute('aria-pressed', String(isDash));
  tabBoard.classList.toggle('active', !isDash);
  tabDashboard.classList.toggle('active', isDash);
  if (isDash && typeof renderDashboard === 'function') renderDashboard();
}
tabBoard.addEventListener('click', () => setView('board'));
tabDashboard.addEventListener('click', () => setView('dashboard'));

// ---------- Settings modal (group name + raters) ----------
const settingsOverlay = document.getElementById('settingsOverlay');
const ratersListEl = document.getElementById('ratersList');

function openSettings() {
  document.getElementById('f_groupName').value = state.settings.group_name || '';
  document.getElementById('f_shareLink').value = location.origin + '/b/' + BOARD_ID;
  renderRatersList();
  settingsOverlay.hidden = false;
  document.body.classList.add('modal-open');
}

function closeSettings() {
  settingsOverlay.hidden = true;
  document.body.classList.remove('modal-open');
}

document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });

document.getElementById('copyShareLinkBtn').addEventListener('click', async () => {
  const link = document.getElementById('f_shareLink').value;
  try {
    await navigator.clipboard.writeText(link);
    toast('הקישור הועתק');
  } catch {
    document.getElementById('f_shareLink').select();
    toast('סמנו והעתיקו את הקישור');
  }
});

document.getElementById('f_groupName').addEventListener('change', async (e) => {
  try {
    const updated = await api(b('/settings'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_name: e.target.value })
    });
    state.settings = updated;
    applyBranding();
    toast('שם התסקיר עודכן');
  } catch (error) {
    toast('לא הצלחנו לעדכן: ' + error.message);
  }
});

function renderRatersList() {
  ratersListEl.innerHTML = '';
  state.raters.forEach(rater => {
    const row = document.createElement('div');
    row.className = 'rater-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'rater-name';
    nameEl.textContent = rater.name;
    nameEl.tabIndex = 0;
    nameEl.setAttribute('role', 'button');
    nameEl.setAttribute('aria-label', `עריכת שם ${rater.name}`);
    const rename = async () => {
      const newName = prompt('שם המדרג/ת:', rater.name);
      if (!newName || !newName.trim() || newName === rater.name) return;
      try {
        await api(b('/raters/' + rater.id), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() })
        });
        const oldName = rater.name;
        rater.name = newName.trim();
        state.apartments.forEach(a => a.ratings.forEach(r => { if (r.rater === oldName) r.rater = rater.name; }));
        renderRatersList();
        applyBranding();
        render();
      } catch (error) {
        toast('לא הצלחנו לעדכן: ' + error.message);
      }
    };
    nameEl.onclick = rename;
    nameEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rename(); } };
    row.appendChild(nameEl);

    const delBtn = document.createElement('button');
    delBtn.className = 'rater-del';
    delBtn.type = 'button';
    delBtn.innerHTML = icons.trash;
    delBtn.setAttribute('aria-label', `מחיקת ${rater.name}`);
    delBtn.onclick = async () => {
      if (state.raters.length <= 1) { toast('צריך לפחות מדרג/ת אחד/ת'); return; }
      if (!confirm(`למחוק את "${rater.name}"? הציונים שלו/ה בכל הדירות יימחקו.`)) return;
      try {
        await api(b('/raters/' + rater.id), { method: 'DELETE' });
        state.raters = state.raters.filter(r => r.id !== rater.id);
        state.apartments.forEach(a => { a.ratings = a.ratings.filter(r => r.rater !== rater.name); });
        renderRatersList();
        applyBranding();
        render();
      } catch (error) {
        toast('לא הצלחנו למחוק: ' + error.message);
      }
    };
    row.appendChild(delBtn);

    ratersListEl.appendChild(row);
  });
}

document.getElementById('addRaterBtn').addEventListener('click', async () => {
  const name = prompt('שם המדרג/ת החדש/ה:');
  if (!name || !name.trim()) return;
  try {
    const rater = await api(b('/raters'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    state.raters.push(rater);
    renderRatersList();
    applyBranding();
    render();
  } catch (error) {
    toast('לא הצלחנו להוסיף: ' + error.message);
  }
});

loadAll().catch(err => toast('שגיאה בטעינה: ' + err.message));
