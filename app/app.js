'use strict';
const PORTAL = 'https://el.ncfu.ru/login/index.php';
const DAYS = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const PAIRS = ['', '08:00–09:30', '09:40–11:10', '11:20–12:50', '13:30–15:00', '15:10–16:40', '16:50–18:20', '18:30–20:00'];
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const KEY = 'student-diary-v1';

const empty = () => ({ profile: {}, subjects: [], schedule: [], absences: [], grades: [], notes: [] });
let db;
try { db = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { db = empty(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const subj = id => db.subjects.find(s => s.id === id) || { name: '—', color: '#999' };
const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); };
const formData = f => Object.fromEntries(new FormData(f).entries());

/* ---------- navigation ---------- */
let portalLoaded = false;
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
function go(v) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  if (v === 'portal' && !portalLoaded) { $('#pv').src = PORTAL; portalLoaded = true; }
  render();
}

/* ---------- helpers ---------- */
function currentWeekType() {
  const start = db.profile.semStart;
  if (!start) return null;
  const s = new Date(start + 'T00:00'); s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  const weeks = Math.floor((Date.now() - s) / (7 * 864e5));
  return weeks < 0 ? null : (weeks % 2 === 0 ? '1' : '2');
}
const missedBy = id => db.absences.filter(a => a.subject === id).reduce((n, a) => n + (+a.pairs || 1), 0);
const totalMissed = (pred = () => true) => db.absences.filter(pred).reduce((n, a) => n + (+a.pairs || 1), 0);
function attendance(s) { if (!s.total) return null; return Math.max(0, Math.round(100 - missedBy(s.id) / s.total * 100)); }
const attColor = p => p == null ? '#bbb' : p >= 85 ? 'var(--ok)' : p >= 70 ? 'var(--valid)' : 'var(--invalid)';

function fillSubjectSelects() {
  const opts = db.subjects.length
    ? db.subjects.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : '<option value="">— сначала добавьте предмет —</option>';
  document.querySelectorAll('.subj-select').forEach(sel => { const v = sel.value; sel.innerHTML = opts; if (v) sel.value = v; });
}

/* ---------- charts (SVG, без внешних библиотек) ---------- */
function monthChart(el) {
  const now = new Date(); const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), valid: 0, invalid: 0 }); }
  db.absences.forEach(a => {
    const d = new Date(a.date + 'T00:00');
    const b = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth());
    if (b) b[a.reason === 'invalid' ? 'invalid' : 'valid'] += (+a.pairs || 1);
  });
  const max = Math.ceil(Math.max(4, ...months.map(m => m.valid + m.invalid)) * 1.15);
  const W = 460, H = 200, pad = 28, bw = (W - pad) / months.length;
  let svg = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%">`;
  for (let i = 0; i <= 4; i++) {
    const y = H - (H - 10) * i / 4, v = Math.round(max * i / 4);
    svg += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#e3e7f0"/><text x="${pad - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
  }
  months.forEach((m, i) => {
    const x = pad + i * bw + bw * .2, w = bw * .6;
    const hv = (H - 10) * m.valid / max, hi = (H - 10) * m.invalid / max;
    if (m.valid) svg += `<rect x="${x}" y="${H - hv}" width="${w}" height="${hv}" rx="3" fill="#f5a623"><title>Уважительные: ${m.valid}</title></rect>`;
    if (m.invalid) svg += `<rect x="${x}" y="${H - hv - hi}" width="${w}" height="${hi}" rx="3" fill="#e5484d"><title>Неуважительные: ${m.invalid}</title></rect>`;
    const tot = m.valid + m.invalid;
    if (tot) svg += `<text x="${x + w / 2}" y="${H - hv - hi - 5}" text-anchor="middle" style="fill:#1d2433;font-weight:600">${tot}</text>`;
    svg += `<text x="${x + w / 2}" y="${H + 16}" text-anchor="middle">${MONTHS[m.m]}</text>`;
  });
  svg += '</svg><div class="legend"><span><i class="dot" style="background:#f5a623"></i> уважительные</span><span><i class="dot" style="background:#e5484d"></i> неуважительные</span><span>(в парах)</span></div>';
  el.innerHTML = svg;
}

function subjectChart(el) {
  if (!db.subjects.length) { el.innerHTML = '<div class="empty">Добавьте предметы во вкладке «Предметы».</div>'; return; }
  el.innerHTML = db.subjects.map(s => {
    const p = attendance(s), m = missedBy(s.id);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
      <span style="width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.name)}">${esc(s.name)}</span>
      <span class="bar-bg" style="flex:1"><i style="width:${p ?? 0}%;background:${attColor(p)}"></i></span>
      <b style="width:48px;text-align:right">${p == null ? '—' : p + '%'}</b>
      <span class="muted" style="width:80px">${m} проп.</span></div>`;
  }).join('') + '<div class="legend">Чтобы считался процент, укажите у предмета «Всего пар за семестр».</div>';
}

function gradeChart(el) {
  const rows = db.subjects.map(s => {
    const g = db.grades.filter(x => x.subject === s.id);
    return { s, n: g.length, avg: g.length ? g.reduce((a, x) => a + +x.mark, 0) / g.length : null };
  }).filter(r => r.n);
  if (!rows.length) { el.innerHTML = '<div class="empty">Пока нет оценок.</div>'; return; }
  const scale = rows.some(r => r.avg > 5) ? 100 : 5;
  el.innerHTML = rows.map(r => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
    <span style="width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.s.name)}</span>
    <span class="bar-bg" style="flex:1"><i style="width:${Math.min(100, r.avg / scale * 100)}%;background:${r.s.color}"></i></span>
    <b style="width:48px;text-align:right">${r.avg.toFixed(scale === 5 ? 2 : 0)}</b><span class="muted" style="width:70px">${r.n} оц.</span></div>`).join('');
}

/* ---------- renders ---------- */
function render() {
  fillSubjectSelects();
  const p = db.profile;
  $('#who').innerHTML = p.name ? `${esc(p.name)}<br>${esc(p.group || '')}${p.course ? ' · ' + esc(p.course) + ' курс' : ''}` : 'Заполните профиль в настройках';
  renderHome(); renderSchedule(); renderAbsences(); renderGrades(); renderSubjects(); renderNotes();
}

function statCards(el) {
  const all = totalMissed(), inv = totalMissed(a => a.reason === 'invalid'), worked = totalMissed(a => a.worked);
  const total = db.subjects.reduce((n, s) => n + (+s.total || 0), 0);
  const att = total ? Math.max(0, Math.round(100 - all / total * 100)) : null;
  const marks = db.grades.filter(g => +g.mark <= 5).map(g => +g.mark);
  const avg = marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2) : '—';
  el.innerHTML = `
    <div class="card"><div class="n" style="color:${attColor(att)}">${att == null ? '—' : att + '%'}</div><div class="l">общая посещаемость</div></div>
    <div class="card"><div class="n">${all}</div><div class="l">пропущено пар</div></div>
    <div class="card"><div class="n" style="color:var(--invalid)">${inv}</div><div class="l">без уважительной причины</div></div>
    <div class="card"><div class="n" style="color:var(--ok)">${worked}</div><div class="l">отработано пар</div></div>
    <div class="card"><div class="n">${avg}</div><div class="l">средняя оценка (5-балльная)</div></div>`;
}

function renderHome() {
  $('#hello-name').textContent = db.profile.name ? ', ' + db.profile.name.split(' ')[0] : '';
  const wt = currentWeekType();
  $('#today-line').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + (wt ? ' · неделя: ' + (wt === '1' ? 'числитель' : 'знаменатель') : '');
  statCards($('#stat-cards'));
  const dow = new Date().getDay();
  const today = db.schedule.filter(l => +l.day === dow && (l.week === 'all' || !wt || l.week === wt)).sort((a, b) => a.pair - b.pair);
  $('#today-pairs').innerHTML = today.length ? today.map(l => lessonHTML(l)).join('') : '<div class="empty">Сегодня пар нет 🎉</div>';
  monthChart($('#home-chart'));
  const notes = [...db.notes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  $('#home-notes').innerHTML = notes.length ? notes.map(noteHTML).join('') : '<div class="empty">Записей пока нет.</div>';
}

function lessonHTML(l, del) {
  const s = subj(l.subject);
  return `<div class="lesson" style="border-color:${s.color}"><b>${l.pair}. ${esc(s.name)}</b>
    <small>${PAIRS[l.pair]} · ${esc(l.kind)}${l.room ? ' · ауд. ' + esc(l.room) : ''}${l.week !== 'all' ? ' · ' + (l.week === '1' ? 'числ.' : 'знам.') : ''}</small>
    ${del ? `<button class="x" data-del="schedule" data-id="${l.id}">✕</button>` : ''}</div>`;
}

let weekFilter = 'all';
document.querySelectorAll('#week-seg button').forEach(b => b.onclick = () => {
  weekFilter = b.dataset.w; document.querySelectorAll('#week-seg button').forEach(x => x.classList.toggle('on', x === b)); renderSchedule();
});
function renderSchedule() {
  const dow = new Date().getDay();
  $('#week-grid').innerHTML = [1, 2, 3, 4, 5, 6].map(d => {
    const ls = db.schedule.filter(l => +l.day === d && (weekFilter === 'all' || l.week === 'all' || l.week === weekFilter)).sort((a, b) => a.pair - b.pair);
    return `<div class="day ${d === dow ? 'today' : ''}"><h4>${DAYS[d]}</h4>${ls.map(l => lessonHTML(l, true)).join('') || '<div class="empty">—</div>'}</div>`;
  }).join('');
}

function renderAbsences() {
  const all = totalMissed(), valid = totalMissed(a => a.reason !== 'invalid'), inv = totalMissed(a => a.reason === 'invalid');
  const notWorked = totalMissed(a => a.reason === 'invalid' && !a.worked);
  $('#abs-cards').innerHTML = `
    <div class="card"><div class="n">${all}</div><div class="l">всего пропущено пар (${all * 2} ч)</div></div>
    <div class="card"><div class="n" style="color:var(--valid)">${valid}</div><div class="l">по уважительной</div></div>
    <div class="card"><div class="n" style="color:var(--invalid)">${inv}</div><div class="l">без уважительной</div></div>
    <div class="card"><div class="n">${notWorked}</div><div class="l">осталось отработать</div></div>`;
  monthChart($('#abs-month-chart'));
  subjectChart($('#abs-subj-chart'));
  const q = ($('#abs-filter').value || '').toLowerCase();
  const rows = [...db.absences].sort((a, b) => b.date.localeCompare(a.date))
    .filter(a => !q || (subj(a.subject).name + ' ' + (a.note || '')).toLowerCase().includes(q));
  $('#abs-body').innerHTML = rows.map(a => `<tr>
    <td>${fmtDate(a.date)}</td><td><i class="dot" style="background:${subj(a.subject).color}"></i> ${esc(subj(a.subject).name)}</td>
    <td>${a.pairs}</td><td><span class="tag ${a.reason === 'invalid' ? 'invalid' : 'valid'}">${a.reason === 'invalid' ? 'неуважительная' : 'уважительная'}</span></td>
    <td>${esc(a.note)}</td><td><input type="checkbox" data-worked="${a.id}" ${a.worked ? 'checked' : ''}></td>
    <td><button class="x" data-del="absences" data-id="${a.id}">✕</button></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">Пропусков нет 👍</td></tr>';
}
$('#abs-filter').oninput = renderAbsences;

function renderGrades() {
  gradeChart($('#grade-chart'));
  $('#grade-body').innerHTML = [...db.grades].sort((a, b) => b.date.localeCompare(a.date)).map(g => `<tr>
    <td>${fmtDate(g.date)}</td><td>${esc(subj(g.subject).name)}</td><td>${esc(g.type)}${g.note ? ' <span class="muted">· ' + esc(g.note) + '</span>' : ''}</td>
    <td><b>${esc(g.mark)}</b></td><td><button class="x" data-del="grades" data-id="${g.id}">✕</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">Оценок пока нет.</td></tr>';
}

function renderSubjects() {
  $('#subj-body').innerHTML = db.subjects.map(s => {
    const p = attendance(s);
    return `<tr><td><i class="dot" style="background:${s.color}"></i></td><td><b>${esc(s.name)}</b></td><td>${esc(s.teacher)}</td><td>${esc(s.control)}</td>
    <td>${s.total || '—'}</td><td>${missedBy(s.id)}</td>
    <td><span class="bar-bg"><i style="width:${p ?? 0}%;background:${attColor(p)}"></i></span>${p == null ? '—' : p + '%'}</td>
    <td><button class="x" data-del="subjects" data-id="${s.id}">✕</button></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">Добавьте свои предметы — они появятся в расписании, пропусках и оценках.</td></tr>';
}

function noteHTML(n) {
  return `<div class="note ${n.todo && n.done ? 'done' : ''}"><div class="meta">${fmtDate(n.date)}
    ${n.todo ? `<label class="chk"><input type="checkbox" data-done="${n.id}" ${n.done ? 'checked' : ''}> выполнено</label>` : ''}
    <button class="x" data-del="notes" data-id="${n.id}" style="margin-left:auto">✕</button></div>
    <b class="t">${esc(n.title || 'Без заголовка')}</b>${n.text ? `<p>${esc(n.text)}</p>` : ''}</div>`;
}
function renderNotes() {
  const list = [...db.notes].sort((a, b) => b.date.localeCompare(a.date));
  $('#notes-list').innerHTML = list.map(noteHTML).join('') || '<div class="empty">Записей пока нет.</div>';
}

/* ---------- forms ---------- */
function bind(sel, coll, needSubject, map = x => x) {
  $(sel).onsubmit = e => {
    e.preventDefault();
    const d = formData(e.target);
    if (needSubject && !d.subject) { toast('Сначала добавьте предмет'); go('subjects'); return; }
    db[coll].push(Object.assign({ id: uid() }, map(d)));
    save(); e.target.reset(); setDefaults(); render(); toast('Сохранено');
  };
}
bind('#f-schedule', 'schedule', true);
bind('#f-absence', 'absences', true);
bind('#f-grade', 'grades', true);
bind('#f-subject', 'subjects', false);
bind('#f-note', 'notes', false, d => ({ ...d, todo: !!d.todo, done: false }));
$('#f-profile').onsubmit = e => { e.preventDefault(); db.profile = formData(e.target); save(); render(); toast('Профиль сохранён'); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const coll = b.dataset.del, id = b.dataset.id;
  if (coll === 'subjects' && !confirm('Удалить предмет вместе с его расписанием, пропусками и оценками?')) return;
  db[coll] = db[coll].filter(x => x.id !== id);
  if (coll === 'subjects') ['schedule', 'absences', 'grades'].forEach(c => db[c] = db[c].filter(x => x.subject !== id));
  save(); render();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.worked) { const a = db.absences.find(x => x.id === t.dataset.worked); a.worked = t.checked; save(); render(); }
  if (t.dataset.done) { const n = db.notes.find(x => x.id === t.dataset.done); n.done = t.checked; save(); render(); }
});

function setDefaults() {
  document.querySelectorAll('input[type=date]:not([name=semStart])').forEach(i => { if (!i.value) i.value = todayISO(); });
  const f = $('#f-profile'); Object.entries(db.profile).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
}

/* ---------- settings ---------- */
$('#btn-export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `дневник-${todayISO()}.json`; a.click();
};
$('#inp-import').onchange = async e => {
  try { db = Object.assign(empty(), JSON.parse(await e.target.files[0].text())); save(); setDefaults(); render(); toast('Данные загружены'); }
  catch { toast('Не удалось прочитать файл'); }
  e.target.value = '';
};
$('#btn-clear').onclick = () => { if (confirm('Удалить все данные? Это нельзя отменить.')) { db = empty(); save(); location.reload(); } };
$('#btn-demo').onclick = () => {
  if ((db.subjects.length || db.absences.length) && !confirm('Добавить пример к текущим данным?')) return;
  const S = [['Математический анализ', 'Иванова А.П.', 64, 'Экзамен', '#4f7cff'], ['Программирование', 'Петров С.В.', 48, 'Экзамен', '#30a46c'],
    ['Английский язык', 'Смирнова Е.Н.', 32, 'Зачёт', '#f5a623'], ['История России', 'Козлов Д.А.', 32, 'Зачёт', '#8e4ec6'], ['Физическая культура', 'Орлов И.И.', 32, 'Зачёт', '#e5484d']]
    .map(([name, teacher, total, control, color]) => ({ id: uid(), name, teacher, total, control, color }));
  db.subjects.push(...S);
  const L = (day, pair, s, kind, room, week = 'all') => ({ id: uid(), day: String(day), pair: String(pair), subject: S[s].id, kind, room, week });
  db.schedule.push(L(1, 1, 0, 'Лекция', '201'), L(1, 2, 1, 'Лабораторная', '305'), L(2, 2, 2, 'Практика', '114'), L(2, 3, 3, 'Лекция', '201', '1'),
    L(3, 1, 0, 'Практика', '210'), L(3, 3, 4, 'Практика', 'Спортзал'), L(4, 2, 1, 'Лекция', '201'), L(4, 3, 3, 'Семинар', '118', '2'), L(5, 1, 2, 'Практика', '114'));
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  [[3, 0, 1, 'invalid', 'Проспал'], [12, 4, 1, 'valid', 'Справка'], [20, 1, 2, 'valid', 'Болел, справка'], [21, 0, 1, 'valid', 'Болел, справка'],
   [45, 2, 1, 'invalid', ''], [70, 3, 1, 'valid', 'Соревнования'], [95, 4, 1, 'invalid', ''], [110, 1, 1, 'invalid', 'Отработал', true]]
    .forEach(([d, s, pairs, reason, note, worked]) => db.absences.push({ id: uid(), date: day(d), subject: S[s].id, pairs: String(pairs), reason, note, worked: !!worked }));
  [[2, 0, 'Контрольная', 4], [9, 1, 'Лабораторная', 5], [15, 2, 'Тест', 5], [30, 3, 'Доклад', 4], [40, 1, 'Лабораторная', 4], [50, 0, 'Контрольная', 3]]
    .forEach(([d, s, type, mark]) => db.grades.push({ id: uid(), date: day(d), subject: S[s].id, type, mark: String(mark), note: '' }));
  db.notes.push({ id: uid(), date: day(0), title: 'Сдать лабу №4 по программированию', text: 'До пятницы, отправить в el.ncfu.ru', todo: true, done: false },
    { id: uid(), date: day(1), title: 'Матанализ', text: 'Задали №215–230. В четверг коллоквиум.', todo: false });
  save(); render(); toast('Пример добавлен');
};

/* ---------- portal webview ---------- */
const pv = $('#pv');
pv.addEventListener('did-navigate', e => $('#pv-url').textContent = e.url);
pv.addEventListener('did-navigate-in-page', e => $('#pv-url').textContent = e.url);
$('#pv-back').onclick = () => pv.canGoBack() && pv.goBack();
$('#pv-fwd').onclick = () => pv.canGoForward() && pv.goForward();
$('#pv-reload').onclick = () => pv.reload();
$('#pv-home').onclick = () => pv.loadURL(PORTAL);

setDefaults();
render();
