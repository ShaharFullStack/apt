// ---------- Palette ----------
// Built from this app's own brand tokens (styles.css :root), not a generic
// dataviz default — the maroon/amber slots are the exact --danger/--warning
// hex values so the charts read as one system with the board's status
// pills. Ordering was chosen and verified with the dataviz skill's
// validate_palette.js (all six categorical checks pass on a white surface).
const PALETTE = {
  categorical: ['#0080a8', '#a63d46', '#7a9a1f', '#a85b74', '#3f5aa8', '#9a641d', '#5c4b8a', '#2f8a52'],
  sequential: '#123b46', // --brand
  status: { good: '#276b50', warning: '#9a641d', critical: '#a63d46', neutral: '#60767a' }, // --success/--warning/--danger/--ink-soft
  ink: '#102f35', // --ink
  inkSecondary: '#60767a', // --ink-soft
  grid: '#d7e3e0', // --line
  axis: '#b7c8c5',
};

function statusColor(status) {
  if (status === 'מועמדת חזקה') return PALETTE.status.good;
  if (status === 'נפסלה') return PALETTE.status.critical;
  if (status === 'הוגשה הצעה') return PALETTE.status.warning;
  return PALETTE.status.neutral; // בבדיקה / unknown
}

function raterColor(index) {
  return PALETTE.categorical[index % PALETTE.categorical.length];
}

// ---------- Data model ----------
function totalMonthlyCost(apt) {
  return (Number(apt.price) || 0) + (Number(apt.arnona) || 0) + (Number(apt.vaad_bayit) || 0);
}

function overallAvg(apt) {
  if (!apt.ratings.length) return null;
  return apt.ratings.reduce((sum, r) => sum + r.score, 0) / apt.ratings.length;
}

function valueScore(apt) {
  const cost = totalMonthlyCost(apt);
  const avg = overallAvg(apt);
  if (!cost || avg === null) return null;
  return avg / cost;
}

function apartmentLabel(apt) {
  return apt.title || apt.address || 'דירה ללא שם';
}

function computeDashboardStats() {
  const apartments = state.apartments;
  const withCost = apartments.filter(a => totalMonthlyCost(a) > 0);
  const withRating = apartments.filter(a => overallAvg(a) !== null);
  const withValue = apartments.filter(a => valueScore(a) !== null);

  const pickExtreme = (list, fn, cmp) => list.length
    ? list.reduce((best, cur) => (cmp(fn(cur), fn(best)) ? cur : best))
    : null;

  const cheapest = pickExtreme(withCost, totalMonthlyCost, (a, b) => a < b);
  const priciest = pickExtreme(withCost, totalMonthlyCost, (a, b) => a > b);
  const topRated = pickExtreme(withRating, overallAvg, (a, b) => a > b);
  const bestValue = pickExtreme(withValue, valueScore, (a, b) => a > b);

  const statusCounts = {};
  apartments.forEach(a => {
    const s = a.status || 'בבדיקה';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const categoryAverages = state.categories.map(cat => {
    const scores = [];
    apartments.forEach(a => a.ratings.forEach(r => { if (r.category_id === cat.id) scores.push(r.score); }));
    return {
      category: cat,
      avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      count: scores.length,
    };
  }).filter(c => c.avg !== null).sort((a, b) => b.avg - a.avg);

  return { apartments, withCost, withRating, withValue, cheapest, priciest, topRated, bestValue, statusCounts, categoryAverages };
}

// ---------- SVG + tooltip helpers ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgTag(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

let tooltipEl;
function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
function positionTooltip(evt) {
  const el = ensureTooltip();
  const pad = 16;
  const rect = el.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
  el.style.left = Math.max(8, x) + 'px';
  el.style.top = Math.max(8, y) + 'px';
}
function showTooltip(evt, html) {
  const el = ensureTooltip();
  el.innerHTML = html;
  el.hidden = false;
  positionTooltip(evt);
}
function hideTooltip() { if (tooltipEl) tooltipEl.hidden = true; }
function attachTooltip(el, htmlFn) {
  el.addEventListener('mouseenter', e => showTooltip(e, htmlFn()));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function legendRow(items) {
  const row = document.createElement('div');
  row.className = 'chart-legend';
  items.forEach(item => {
    const el = document.createElement('span');
    el.className = 'legend-item';
    el.innerHTML = `<span class="legend-swatch" style="background:${item.color}"></span>${escapeHtml(item.label)}`;
    row.appendChild(el);
  });
  return row;
}

function chartCard(title, subtitle) {
  const card = document.createElement('section');
  card.className = 'chart-card';
  const head = document.createElement('div');
  head.className = 'chart-card-head';
  head.innerHTML = `<h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}`;
  card.appendChild(head);
  return card;
}

// ---------- Charts ----------
function barChart(items, { valueFmt = String, width = 640, colorFor } = {}) {
  const rowH = 42;
  const barH = 20;
  const labelW = 150;
  const tipGap = 66;
  const plotRight = width - labelW;
  const maxVal = Math.max(...items.map(i => i.value), 1);
  const height = items.length * rowH + 12;

  const svg = svgTag('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img' });
  svg.appendChild(svgTag('line', {
    x1: plotRight, x2: plotRight, y1: 4, y2: height - 4, class: 'chart-axis-line',
  }));

  items.forEach((item, i) => {
    const y = i * rowH + (rowH - barH) / 2;
    const usable = plotRight - tipGap;
    const barW = Math.max((item.value / maxVal) * usable, 3);
    const barX = plotRight - barW;
    const color = colorFor ? colorFor(item) : PALETTE.sequential;

    const rect = svgTag('rect', { x: barX, y, width: barW, height: barH, rx: 4, fill: color });
    attachTooltip(rect, () => `<strong>${escapeHtml(item.label)}</strong><br>${valueFmt(item.value)}`);
    svg.appendChild(rect);

    const name = svgTag('text', { x: width, y: y + barH / 2 + 4, 'text-anchor': 'end', class: 'chart-label chart-label-name' });
    name.textContent = item.badge ? `${truncate(item.label, 16)} · ${item.badge}` : truncate(item.label, 20);
    svg.appendChild(name);

    const val = svgTag('text', { x: barX - 8, y: y + barH / 2 + 4, 'text-anchor': 'end', class: 'chart-label chart-value-label' });
    val.textContent = valueFmt(item.value);
    svg.appendChild(val);
  });

  const wrap = document.createElement('div');
  wrap.className = 'chart-svg-wrap';
  wrap.appendChild(svg);
  return wrap;
}

function groupedBarChart(apartments, raters) {
  const width = 680;
  const chartH = 220;
  const padTop = 10;
  const padBottom = 26;
  const padLeft = 30;
  const padRight = 10;
  const plotW = width - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;
  const groupW = plotW / Math.max(apartments.length, 1);
  const barGap = 3;
  const barW = Math.max((groupW - barGap * (raters.length + 1)) / Math.max(raters.length, 1), 4);
  const maxScore = 10;

  const svg = svgTag('svg', { viewBox: `0 0 ${width} ${chartH}`, class: 'chart-svg', role: 'img' });

  [0, 5, 10].forEach(tick => {
    const y = padTop + plotH - (tick / maxScore) * plotH;
    svg.appendChild(svgTag('line', { x1: padLeft, x2: width - padRight, y1: y, y2: y, class: 'chart-gridline' }));
    const t = svgTag('text', { x: padLeft - 6, y: y + 3, 'text-anchor': 'end', class: 'chart-label chart-tick' });
    t.textContent = tick;
    svg.appendChild(t);
  });

  apartments.forEach((apt, gi) => {
    const groupX = padLeft + gi * groupW;
    raters.forEach((rater, ri) => {
      const avg = avgFor(apt, rater.name);
      const val = avg === null ? 0 : avg;
      const barHpx = (val / maxScore) * plotH;
      const x = groupX + barGap + ri * (barW + barGap);
      const y = padTop + plotH - barHpx;
      const rect = svgTag('rect', {
        x, y, width: barW, height: Math.max(barHpx, avg === null ? 0 : 2), rx: 3,
        fill: avg === null ? PALETTE.grid : raterColor(ri),
      });
      attachTooltip(rect, () => `<strong>${escapeHtml(apartmentLabel(apt))}</strong><br>${escapeHtml(rater.name)}: ${avg === null ? 'אין ציון' : avg.toFixed(1)}`);
      svg.appendChild(rect);
    });
    const label = svgTag('text', {
      x: groupX + groupW / 2, y: chartH - 8, 'text-anchor': 'middle', class: 'chart-label chart-tick',
    });
    label.textContent = truncate(apartmentLabel(apt), 12);
    svg.appendChild(label);
  });

  const wrap = document.createElement('div');
  wrap.className = 'chart-svg-wrap';
  wrap.appendChild(svg);
  const container = document.createElement('div');
  container.appendChild(legendRow(raters.map((r, i) => ({ label: r.name, color: raterColor(i) }))));
  container.appendChild(wrap);
  return container;
}

function scatterChart(apartments, bestValueId) {
  const width = 640;
  const height = 320;
  const pad = { top: 16, right: 24, bottom: 40, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const points = apartments
    .map(apt => ({ apt, cost: totalMonthlyCost(apt), avg: overallAvg(apt) }))
    .filter(p => p.cost > 0 && p.avg !== null);

  const svg = svgTag('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img' });

  if (!points.length) return null;

  const maxCost = Math.max(...points.map(p => p.cost)) * 1.08;
  const minCost = Math.min(...points.map(p => p.cost)) * 0.92;
  const x = cost => pad.left + ((cost - minCost) / (maxCost - minCost || 1)) * plotW;
  const y = avg => pad.top + plotH - ((avg - 1) / 9) * plotH;

  // gridlines: rating 1..10 lightly, cost ticks
  [2, 4, 6, 8, 10].forEach(r => {
    const yy = y(r);
    svg.appendChild(svgTag('line', { x1: pad.left, x2: width - pad.right, y1: yy, y2: yy, class: 'chart-gridline' }));
    const t = svgTag('text', { x: pad.left - 6, y: yy + 3, 'text-anchor': 'end', class: 'chart-label chart-tick' });
    t.textContent = r;
    svg.appendChild(t);
  });
  svg.appendChild(svgTag('line', { x1: pad.left, x2: pad.left, y1: pad.top, y2: height - pad.bottom, class: 'chart-axis-line' }));
  svg.appendChild(svgTag('line', { x1: pad.left, x2: width - pad.right, y1: height - pad.bottom, y2: height - pad.bottom, class: 'chart-axis-line' }));

  const costTickCount = 4;
  for (let i = 0; i <= costTickCount; i++) {
    const cost = minCost + (i / costTickCount) * (maxCost - minCost);
    const xx = x(cost);
    const t = svgTag('text', { x: xx, y: height - pad.bottom + 16, 'text-anchor': 'middle', class: 'chart-label chart-tick' });
    t.textContent = fmtMoney(Math.round(cost / 50) * 50);
    svg.appendChild(t);
  }

  const yAxisLabel = svgTag('text', { x: 12, y: pad.top + plotH / 2, 'text-anchor': 'middle', class: 'chart-label chart-axis-title', transform: `rotate(-90 12 ${pad.top + plotH / 2})` });
  yAxisLabel.textContent = 'דירוג ממוצע';
  svg.appendChild(yAxisLabel);
  const xAxisLabel = svgTag('text', { x: pad.left + plotW / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label chart-axis-title' });
  xAxisLabel.textContent = 'עלות חודשית כוללת';
  svg.appendChild(xAxisLabel);

  points.forEach(p => {
    const cx = x(p.cost);
    const cy = y(p.avg);
    const isBest = p.apt.id === bestValueId;
    const circle = svgTag('circle', {
      cx, cy, r: isBest ? 8 : 6.5, fill: statusColor(p.apt.status), stroke: '#fff', 'stroke-width': 2,
    });
    attachTooltip(circle, () => `<strong>${escapeHtml(apartmentLabel(p.apt))}</strong><br>${fmtMoney(p.cost)} לחודש · ${p.avg.toFixed(1)}/10`);
    svg.appendChild(circle);
    if (isBest) {
      const label = svgTag('text', { x: cx, y: cy - 12, 'text-anchor': 'middle', class: 'chart-label chart-emphasis-label' });
      label.textContent = 'המשתלמת ביותר';
      svg.appendChild(label);
    }
  });

  const wrap = document.createElement('div');
  wrap.className = 'chart-svg-wrap';
  wrap.appendChild(svg);

  const statuses = [...new Set(points.map(p => p.apt.status || 'בבדיקה'))];
  const container = document.createElement('div');
  container.appendChild(wrap);
  container.appendChild(legendRow(statuses.map(s => ({ label: s, color: statusColor(s) }))));
  return container;
}

function donutChart(statusCounts) {
  const entries = Object.entries(statusCounts);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  if (!total) return null;

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 90;
  const rInner = 56;
  const svg = svgTag('svg', { viewBox: `0 0 ${size} ${size}`, class: 'chart-svg chart-donut', role: 'img' });

  let angle = -Math.PI / 2;
  const gapRad = total > 1 ? 0.02 : 0;
  entries.forEach(([status, count]) => {
    const frac = count / total;
    const sweep = frac * (Math.PI * 2) - gapRad;
    const a0 = angle + gapRad / 2;
    const a1 = a0 + Math.max(sweep, 0);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const p0o = [cx + rOuter * Math.cos(a0), cy + rOuter * Math.sin(a0)];
    const p1o = [cx + rOuter * Math.cos(a1), cy + rOuter * Math.sin(a1)];
    const p0i = [cx + rInner * Math.cos(a1), cy + rInner * Math.sin(a1)];
    const p1i = [cx + rInner * Math.cos(a0), cy + rInner * Math.sin(a0)];
    const d = `M ${p0o[0]} ${p0o[1]} A ${rOuter} ${rOuter} 0 ${large} 1 ${p1o[0]} ${p1o[1]}
      L ${p0i[0]} ${p0i[1]} A ${rInner} ${rInner} 0 ${large} 0 ${p1i[0]} ${p1i[1]} Z`;
    const path = svgTag('path', { d, fill: statusColor(status) });
    attachTooltip(path, () => `<strong>${escapeHtml(status)}</strong><br>${count} דירות`);
    svg.appendChild(path);
    angle += frac * Math.PI * 2;
  });

  const centerVal = svgTag('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'chart-label chart-donut-total' });
  centerVal.textContent = total;
  svg.appendChild(centerVal);
  const centerLabel = svgTag('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'chart-label chart-donut-caption' });
  centerLabel.textContent = 'דירות';
  svg.appendChild(centerLabel);

  const wrap = document.createElement('div');
  wrap.className = 'chart-svg-wrap chart-donut-wrap';
  wrap.appendChild(svg);
  const container = document.createElement('div');
  container.className = 'chart-donut-layout';
  container.appendChild(wrap);
  container.appendChild(legendRow(entries.map(([status, count]) => ({ label: `${status} (${count})`, color: statusColor(status) }))));
  return container;
}

// ---------- KPI tiles ----------
function kpiTile(label, value, sub) {
  const tile = document.createElement('div');
  tile.className = 'kpi-tile';
  tile.innerHTML = `
    <span class="kpi-label">${escapeHtml(label)}</span>
    <span class="kpi-value">${value}</span>
    ${sub ? `<span class="kpi-sub">${escapeHtml(sub)}</span>` : ''}`;
  return tile;
}

// ---------- Ranking table (also serves as the accessibility "table view") ----------
function rankingTable(stats) {
  const wrap = document.createElement('div');
  wrap.className = 'data-table-wrap';
  const table = document.createElement('table');
  table.className = 'data-table';
  const raterHeaders = state.raters.map(r => `<th>${escapeHtml(r.name)}</th>`).join('');
  table.innerHTML = `
    <thead><tr>
      <th>דירה</th><th>סטטוס</th><th>עלות חודשית</th>${raterHeaders}<th>ממוצע כללי</th><th>ערך לכסף</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');
  const rows = stats.apartments.map(apt => ({
    apt, cost: totalMonthlyCost(apt), avg: overallAvg(apt), value: valueScore(apt),
  })).sort((a, b) => (b.value || -1) - (a.value || -1));

  rows.forEach(({ apt, cost, avg }) => {
    const tr = document.createElement('tr');
    const raterCells = state.raters.map(r => {
      const a = avgFor(apt, r.name);
      return `<td>${a === null ? '–' : a.toFixed(1)}</td>`;
    }).join('');
    const badges = [];
    if (stats.cheapest && apt.id === stats.cheapest.id) badges.push('<span class="table-badge table-badge-good">הכי זולה</span>');
    if (stats.priciest && apt.id === stats.priciest.id) badges.push('<span class="table-badge table-badge-critical">הכי יקרה</span>');
    if (stats.bestValue && apt.id === stats.bestValue.id) badges.push('<span class="table-badge table-badge-accent">הכי משתלמת</span>');
    if (stats.topRated && apt.id === stats.topRated.id) badges.push('<span class="table-badge table-badge-accent">הכי מדורגת</span>');
    tr.innerHTML = `
      <td class="data-table-name">${escapeHtml(apartmentLabel(apt))}${badges.length ? `<div class="table-badges">${badges.join('')}</div>` : ''}</td>
      <td>${escapeHtml(apt.status || 'בבדיקה')}</td>
      <td>${cost ? fmtMoney(cost) : '–'}</td>
      ${raterCells}
      <td>${avg === null ? '–' : avg.toFixed(1) + '/10'}</td>
      <td>${(cost && avg !== null) ? (avg / cost * 1000).toFixed(2) : '–'}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

// ---------- Assembly ----------
function renderDashboard() {
  const root = document.getElementById('dashboardView');
  root.innerHTML = '';

  if (!state.apartments.length) {
    root.innerHTML = `
      <div class="dashboard-empty">
        <p class="eyebrow">עדיין אין נתונים</p>
        <h2>הדאשבורד יתעורר לחיים אחרי שתוסיפו דירה</h2>
        <p>הוסיפו דירה, מלאו מחיר ובקשו מכל אחד בקבוצה לתת ציונים — כאן תראו השוואות, גרפים ותובנות.</p>
      </div>`;
    return;
  }

  const stats = computeDashboardStats();

  const heading = document.createElement('section');
  heading.className = 'list-heading dashboard-heading';
  heading.innerHTML = `
    <div><p class="eyebrow">תמונת מצב</p><h2>דאשבורד ההשוואה</h2></div>
    <p class="list-hint">מבוסס על ${state.apartments.length} דירות ו-${state.raters.length} מדרגים</p>`;
  root.appendChild(heading);

  // ---- KPI row ----
  const kpiRow = document.createElement('div');
  kpiRow.className = 'kpi-row';
  kpiRow.appendChild(kpiTile('סה"כ דירות בתיק', state.apartments.length));
  kpiRow.appendChild(kpiTile(
    'הכי זולה',
    stats.cheapest ? fmtMoney(totalMonthlyCost(stats.cheapest)) : '–',
    stats.cheapest ? apartmentLabel(stats.cheapest) : 'עדיין אין מחירים'
  ));
  kpiRow.appendChild(kpiTile(
    'הכי יקרה',
    stats.priciest ? fmtMoney(totalMonthlyCost(stats.priciest)) : '–',
    stats.priciest ? apartmentLabel(stats.priciest) : 'עדיין אין מחירים'
  ));
  kpiRow.appendChild(kpiTile(
    'הכי משתלמת (ערך לכסף)',
    stats.bestValue ? apartmentLabel(stats.bestValue) : '–',
    stats.bestValue ? `${overallAvg(stats.bestValue).toFixed(1)}/10 בכ-${fmtMoney(totalMonthlyCost(stats.bestValue))} לחודש` : 'צריך גם מחיר וגם דירוג'
  ));
  kpiRow.appendChild(kpiTile(
    'הכי מדורגת',
    stats.topRated ? apartmentLabel(stats.topRated) : '–',
    stats.topRated ? `${overallAvg(stats.topRated).toFixed(1)}/10 ממוצע` : 'עדיין אין דירוגים'
  ));
  root.appendChild(kpiRow);

  // ---- Charts grid ----
  const grid = document.createElement('div');
  grid.className = 'dashboard-grid';

  if (stats.withCost.length) {
    const items = stats.withCost
      .map(apt => ({
        label: apartmentLabel(apt),
        value: totalMonthlyCost(apt),
        badge: apt.id === stats.cheapest.id ? 'הכי זולה' : apt.id === stats.priciest.id ? 'הכי יקרה' : null,
        id: apt.id,
      }))
      .sort((a, b) => a.value - b.value);
    const card = chartCard('עלות חודשית כוללת', 'שכירות + ארנונה + ועד בית, מהזולה ליקרה');
    card.appendChild(barChart(items, {
      valueFmt: fmtMoney,
      colorFor: item => item.id === stats.cheapest.id ? PALETTE.status.good : item.id === stats.priciest.id ? PALETTE.status.critical : PALETTE.sequential,
    }));
    grid.appendChild(card);
  }

  const scatter = scatterChart(stats.apartments, stats.bestValue && stats.bestValue.id);
  if (scatter) {
    const card = chartCard('ערך תמורה למחיר', 'עלות מול דירוג ממוצע — כמה שיותר למעלה-שמאלה, יותר משתלם');
    card.appendChild(scatter);
    grid.appendChild(card);
  }

  if (state.raters.length && stats.withRating.length) {
    const card = chartCard('השוואת דירוגים בין המדרגים', 'הציון הממוצע שכל אחד נתן לכל דירה');
    card.appendChild(groupedBarChart(stats.apartments, state.raters));
    grid.appendChild(card);
  }

  if (stats.categoryAverages.length) {
    const items = stats.categoryAverages.map(c => ({ label: c.category.name, value: c.avg }));
    const card = chartCard('קטגוריות לפי ציון ממוצע', 'על פני כל הדירות והמדרגים — מה בולט לטובה ומה פחות');
    card.appendChild(barChart(items, { valueFmt: v => v.toFixed(1) + '/10' }));
    grid.appendChild(card);
  }

  const donut = donutChart(stats.statusCounts);
  if (donut) {
    const card = chartCard('סטטוס הדירות', 'כמה דירות בכל שלב החלטה');
    card.appendChild(donut);
    grid.appendChild(card);
  }

  root.appendChild(grid);

  // ---- Full data table (also the accessibility "table view" for the charts above) ----
  const tableSection = chartCard('כל הדירות בטבלה אחת', 'תצוגה מלאה — כולל ציון כל מדרג/ת בנפרד');
  tableSection.classList.add('chart-card-wide');
  tableSection.appendChild(rankingTable(stats));
  root.appendChild(tableSection);
}
