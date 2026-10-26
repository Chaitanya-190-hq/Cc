/* ============================================================
   Student Command Centre — app logic
   Everything is editable. Data lives in localStorage.
   ============================================================ */

const STORAGE_KEY = 'student-command-centre-v1';

const DEFAULT_STATE = () => ({
  semesters: [{ id: uid(), name: 'Semester 1' }],
  currentSemesterId: null,
  subjects: [],        // { id, semId, name, code, teacher }
  attendance: [],      // { id, subjectId, semId, date, present:bool, note }
  assignments: [],     // { id, title, subjectId, semId, deadline, done, details }
  exams: [],           // { id, title, subjectId, semId, date, syllabus, done }
  links: [],           // { id, title, url, subjectId, semId }
  notes: [],           // { id, title, body, subjectId, semId }
  settings: { author: '' } // name printed on shared slips
});

let state = load();
const ui = {
  view: 'home',
  attFilter: 'current',
  asgFilter: 'pending',
  examFilter: 'upcoming',
  linkSearch: '',
  noteSearch: '',
  selecting: false,
  selected: new Set(),
  analysisSubjectId: null
};

/* ---------------- storage ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const data = JSON.parse(raw);
    const merged = Object.assign(DEFAULT_STATE(), data);
    if (!merged.settings) merged.settings = { author: '' };
    return merged;
  } catch (e) {
    console.warn('Could not read saved data', e);
    return seed();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seed() {
  const s = DEFAULT_STATE();
  const sub = { id: uid(), semId: s.semesters[0].id, name: 'Mathematics', code: 'MA-201', teacher: '' };
  s.subjects.push(sub);
  s.currentSemesterId = s.semesters[0].id;
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  s.assignments.push({
    id: uid(), title: 'Try me — tap ✎ to edit or 🗑 to delete', subjectId: sub.id,
    semId: s.semesters[0].id, deadline: soon, done: false, details: 'Every card in this app is editable.'
  });
  s.notes.push({
    id: uid(), title: 'Welcome note', subjectId: sub.id, semId: s.semesters[0].id,
    body: 'Your notes live here.\nTap the copy button to share them with friends.'
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  return s;
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 864e5);
}

function fmtDate(dateStr) {
  if (!dateStr) return 'No date';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' });
}

function relDue(dateStr) {
  const n = daysUntil(dateStr);
  if (n === null) return { text: 'No deadline', cls: 'grey' };
  if (n < 0) return { text: `${-n} day${n === -1 ? '' : 's'} overdue`, cls: 'red' };
  if (n === 0) return { text: 'Due today', cls: 'red' };
  if (n === 1) return { text: 'Due tomorrow', cls: 'amber' };
  if (n <= 7) return { text: `Due in ${n} days`, cls: 'amber' };
  return { text: `Due in ${n} days`, cls: 'green' };
}

function relExam(dateStr) {
  const n = daysUntil(dateStr);
  if (n === null) return { text: 'No date', cls: 'grey' };
  if (n < 0) return { text: 'Completed', cls: 'grey' };
  if (n === 0) return { text: 'Today!', cls: 'red' };
  if (n === 1) return { text: 'Tomorrow', cls: 'red' };
  return { text: `In ${n} days`, cls: n <= 7 ? 'amber' : 'green' };
}

function currentSem() {
  if (!state.semesters.length) {
    const s = { id: uid(), name: 'Semester 1' };
    state.semesters.push(s);
    state.currentSemesterId = s.id;
    save();
  }
  let sem = state.semesters.find(s => s.id === state.currentSemesterId);
  if (!sem) { sem = state.semesters[0]; state.currentSemesterId = sem.id; save(); }
  return sem;
}

function subjectsOf(semId) { return state.subjects.filter(s => s.semId === semId); }
function subjectName(id) { const s = state.subjects.find(x => x.id === id); return s ? s.name : 'General'; }
function allSubjects() { return state.subjects; }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 1900);
}

function copyText(text, label = 'Copied') {
  const done = () => toast(label + ' 📋');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); }
  catch (e) { toast('Copy failed'); }
  document.body.removeChild(ta);
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function go(view) {
  if (view === 'more') { openSheet(true); return; }
  if (ui.view === 'assignments' && view !== 'assignments' && ui.selecting) {
    ui.selecting = false;
    ui.selected.clear();
  }
  ui.view = view;
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== view; });
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  closeSheet();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  render();
}

function openSheet(on) {
  $('#more-backdrop').hidden = !on;
}
function closeSheet() { openSheet(false); }

/* ============================================================
   MODAL FORM BUILDER
   ============================================================ */
let modalSubmit = null;

function openModal({ title, fields, values = {}, submitLabel = 'Save', onSubmit }) {
  $('#modal-title').textContent = title;
  const form = $('#modal-form');
  form.innerHTML = fields.map(f => fieldHtml(f, values)).join('') +
    `<div class="modal-actions">
       <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
       <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
     </div>`;
  form.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modalSubmit = onSubmit;
  $('#modal-backdrop').hidden = false;
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    const out = {};
    fields.forEach(f => {
      if (f.type === 'check') out[f.name] = fd.has(f.name);
      else if (f.type === 'number') out[f.name] = fd.get(f.name) === '' ? '' : Number(fd.get(f.name));
      else out[f.name] = (fd.get(f.name) || '').toString().trim();
    });
    if (modalSubmit(out) !== false) closeModal();
  };
  const first = form.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
}

function fieldHtml(f, values) {
  const v = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : (f.def ?? '');
  if (f.type === 'check') {
    return `<div class="field"><label class="check">
      <input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label></div>`;
  }
  if (f.type === 'select') {
    const opts = f.options.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`
    ).join('');
    return `<div class="field"><label for="${f.name}">${esc(f.label)}</label>
      <select id="${f.name}" name="${f.name}">${opts}</select></div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="field"><label for="${f.name}">${esc(f.label)}</label>
      <textarea id="${f.name}" name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea></div>`;
  }
  const type = f.type || 'text';
  return `<div class="field"><label for="${f.name}">${esc(f.label)}</label>
    <input id="${f.name}" name="${f.name}" type="${type}" value="${esc(v)}"
      placeholder="${esc(f.placeholder || '')}" ${f.type === 'date' ? '' : ''}></div>`;
}

function closeModal() {
  $('#modal-backdrop').hidden = true;
  $('#modal-form').reset();
  modalSubmit = null;
}

/* ============================================================
   SUBJECT / SEMESTER OPTION HELPERS
   ============================================================ */
function subjectOptions(semId, includeAll = false) {
  const list = subjectsOf(semId);
  const opts = includeAll ? [{ value: '', label: '— General / no subject —' }] : [];
  if (!includeAll && !list.length) opts.push({ value: '', label: '— No subjects yet —' });
  list.forEach(s => opts.push({ value: s.id, label: s.name + (s.code ? ` (${s.code})` : '') }));
  return opts;
}

/* ============================================================
   ATTENDANCE
   ============================================================ */
function attendanceStats(filter) {
  const semId = currentSem().id;
  const rows = {};
  state.attendance.forEach(a => {
    if (filter === 'current' && a.semId !== semId) return;
    if (!rows[a.subjectId]) rows[a.subjectId] = { present: 0, total: 0 };
    rows[a.subjectId].total++;
    if (a.present) rows[a.subjectId].present++;
  });
  let p = 0, t = 0;
  Object.values(rows).forEach(r => { p += r.present; t += r.total; });
  return { rows, present: p, total: t, pct: t ? Math.round((p / t) * 100) : null };
}

function attTone(pct) {
  if (pct === null) return 'grey';
  if (pct >= 75) return 'green';
  if (pct >= 60) return 'amber';
  return 'red';
}

function bunkHint(pct, total) {
  if (pct === null || !total) return 'Mark attendance to see your safe-to-bunk info.';
  if (pct >= 75) {
    // how many can be missed while staying >=75
    let canMiss = 0;
    while (((total - (canMiss + 1)) / (total + canMiss + 1)) >= 0.75) break;
    // simple direct calc: find n missed such that (p)/(t+n) >= .75
    let n = 0;
    while ((total - 0) / (total + n + 1) >= 0.75 && n < 500) {
      // present stays the same, we add absences
      const futurePct = (pctToPresent(pct, total)) / (total + n + 1);
      if (futurePct < 0.75) break;
      n++;
    }
    return n > 0
      ? `You can miss ${n} more class${n === 1 ? '' : 'es'} and stay at 75%.`
      : `You're at the edge — attend the next class to stay safe.`;
  }
  const needed = Math.ceil((0.75 * total - pctToPresent(pct, total)) / 0.25);
  return `Attend the next ${needed} class${needed === 1 ? '' : 'es'} to reach 75%.`;
}

function pctToPresent(pct, total) { return Math.round((pct / 100) * total); }

function renderAttendance() {
  const stats = attendanceStats(ui.attFilter);
  const ring = $('.summary-ring');
  ring.style.setProperty('--pct', stats.pct ?? 0);
  $('#att-overall').textContent = stats.pct === null ? '—' : stats.pct + '%';
  $('#att-summary-text').innerHTML = stats.total
    ? `Attended <b>${stats.present}</b> of <b>${stats.total}</b> classes.<br>${esc(bunkHint(stats.pct, stats.total))}`
    : 'No attendance records yet for this view.';

  $$('#att-filter .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === ui.attFilter));

  const semId = currentSem().id;
  const subjects = ui.attFilter === 'current'
    ? subjectsOf(semId)
    : state.subjects;

  const html = subjects.map(s => {
    const r = stats.rows[s.id] || { present: 0, total: 0 };
    const pct = r.total ? Math.round((r.present / r.total) * 100) : null;
    const tone = attTone(pct);
    return `<div class="item att-row">
      <div class="item-top">
        <div style="min-width:0;flex:1" role="button" tabindex="0" data-analyze="${s.id}">
          <div class="item-title">${esc(s.name)} <span style="color:var(--muted);font-weight:400">›</span></div>
          <div class="item-sub">
            <span class="chip ${tone}">${pct === null ? 'no data' : pct + '%'}</span>
            <span>${r.present}/${r.total} classes</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm" data-analyze="${s.id}" title="Analysis">📊</button>
          <button class="btn btn-sm" data-edit-att-subject="${s.id}">✎</button>
        </div>
      </div>
      <div class="att-controls">
        <button class="att-btn present" data-mark="1" data-sub="${s.id}">✓ Present</button>
        <button class="att-btn absent" data-mark="0" data-sub="${s.id}">✗ Absent</button>
        <button class="btn btn-sm" data-manual-att="${s.id}">+1</button>
      </div>
    </div>`;
  }).join('');

  $('#attendance-list').innerHTML = html || emptyBox('No subjects yet. Add them under Subjects, then start marking attendance.');
}

function emptyBox(msg) { return `<div class="empty">${esc(msg)}</div>`; }

/* ============================================================
   SUBJECT ANALYSIS (75% target)
   ============================================================ */
function targetPlan(present, total) {
  if (!total) return { needed: 0, canMiss: 0, atTarget: true };
  const atTarget = (present / total) >= 0.75;
  if (atTarget) {
    // how many classes can we miss and still be >= 75%?
    let canMiss = 0;
    while (canMiss < 500 && present / (total + canMiss + 1) >= 0.75) canMiss++;
    return { needed: 0, canMiss, atTarget: true };
  }
  let needed = 0;
  while (needed < 500 && (present + needed + 1) / (total + needed + 1) < 0.75) needed++;
  needed++;
  return { needed, canMiss: 0, atTarget: false };
}

function openAnalysis(subjectId) {
  ui.analysisSubjectId = subjectId;
  go('analysis');
}

function renderAnalysis() {
  const s = state.subjects.find(x => x.id === ui.analysisSubjectId);
  if (!s) { go('attendance'); return; }

  const recs = state.attendance.filter(a => a.subjectId === s.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = recs.length;
  const present = recs.filter(r => r.present).length;
  const absent = total - present;
  const pct = total ? Math.round((present / total) * 100) : 0;
  const plan = targetPlan(present, total);
  const tone = attTone(total ? pct : null);

  const recent = recs.slice(-14);

  const absences = recs.filter(r => !r.present).slice().reverse();

  let verdict;
  if (!total) {
    verdict = { cls: 'warn', icon: '📏', text: 'No classes recorded yet. Mark attendance to see how you measure up against the <b>75% requirement</b>.' };
  } else if (plan.atTarget) {
    verdict = { cls: 'ok', icon: '✅', text: `You're above 75%. You can miss the next <b>${plan.canMiss}</b> ${plan.canMiss === 1 ? 'class' : 'classes'} and still stay eligible.` };
  } else {
    verdict = { cls: 'bad', icon: '⚠️', text: `Below the 75% requirement. Attend the next <b>${plan.needed}</b> ${plan.needed === 1 ? 'class' : 'classes'} (no absents) to get back above it.` };
  }

  const backdatedCount = absences.filter(a => a.backdated).length;

  $('#analysis-body').innerHTML = `
    <div class="analysis-hero">
      <div class="analysis-name">${esc(s.name)}</div>
      <div class="analysis-code">${esc([s.code, s.teacher].filter(Boolean).join(' · ')) || 'Subject'}</div>
      <div class="analysis-pct" style="color:var(--${tone === 'grey' ? 'muted' : tone})">${total ? pct + '%' : '—'}
        ${total ? `<small>${present}/${total} classes</small>` : ''}
      </div>

      <div class="target-bar">
        <div class="progress"><i style="width:${Math.min(100, pct)}%;background:var(--${tone === 'grey' ? 'accent' : tone})"></i></div>
        <span class="target-marker" style="left:75%"></span>
      </div>
      <div class="target-legend"><span>0%</span><span>required 75%</span><span>100%</span></div>

      <div class="verdict ${verdict.cls}"><span>${verdict.icon}</span><span>${verdict.text}</span></div>
    </div>

    <div class="mini-grid">
      <div class="mini-card"><b style="color:var(--green)">${present}</b><span>Attended</span></div>
      <div class="mini-card"><b style="color:var(--red)">${absent}</b><span>Absent</span></div>
      <div class="mini-card"><b>${total}</b><span>Total held</span></div>
    </div>

    <div class="block">
      <div class="block-head"><h2>📋 Class history</h2><span class="hint" style="margin:0">last ${recent.length}</span></div>
      <div class="card">
        <div class="week-strip">
          ${recent.map(r => `<span class="week-cell ${r.present ? 'present' : 'absent'}" title="${esc(fmtDate(r.date))}${r.reason ? ' — ' + esc(r.reason) : ''}">${r.present ? '✓' : '✗'}</span>`).join('') || '<span class="hint" style="margin:0">No records yet</span>'}
        </div>
      </div>
    </div>

    <div class="block">
      <div class="block-head"><h2>🗓️ Backdated attendance</h2></div>
      <div class="card">
        ${absences.length ? `
          <p class="hint" style="margin-bottom:10px">${backdatedCount} of ${absences.length} absence(s) flagged as eligible for backdating.</p>
          ${absences.map(a => `
            <div class="reason-tag">
              <span>${a.backdated ? '🕒' : '📌'}</span>
              <span style="flex:1">
                <b style="color:var(--text)">${esc(fmtDate(a.date))}</b> — ${esc(a.reason || 'No reason recorded')}
                <br><span class="chip ${a.backdated ? 'amber' : 'grey'}" style="margin-top:5px">${a.backdated ? 'eligible for backdating' : 'not eligible'}</span>
              </span>
            </div>`).join('')}
        ` : '<p class="hint" style="margin:0">No absences recorded. Keep it that way 🌟</p>'}
      </div>
    </div>
  `;
}

function markAttendance(subjectId, present) {
  const sem = currentSem();
  if (present) {
    state.attendance.push({
      id: uid(), subjectId, semId: sem.id,
      date: new Date().toISOString().slice(0, 10), present: true,
      reason: '', backdated: null
    });
    save();
    render();
    toast('Marked present ✓');
    return;
  }
  // absent → ask why, and whether it qualifies for backdated attendance
  const subject = state.subjects.find(s => s.id === subjectId);
  openModal({
    title: `Absent — ${subject ? subject.name : ''}`,
    fields: [
      { type: 'textarea', name: 'reason', label: 'Why were you absent?', placeholder: 'e.g. Had a fever / went for a competition / family work…' },
      { type: 'check', name: 'backdated', label: 'Yes — this reason is eligible for backdated attendance', def: false }
    ],
    submitLabel: 'Save absence',
    onSubmit: d => {
      if (!d.reason) { toast('Add a reason first'); return false; }
      state.attendance.push({
        id: uid(), subjectId, semId: sem.id,
        date: new Date().toISOString().slice(0, 10), present: false,
        reason: d.reason, backdated: !!d.backdated
      });
      save(); render();
      toast(d.backdated ? 'Saved · flagged for backdating' : 'Absence saved');
    }
  });
}

function manualAttendance(subjectId) {
  const list = subjectsOf(currentSem().id);
  const subject = state.subjects.find(s => s.id === subjectId);
  openModal({
    title: `Adjust — ${subject.name}`,
    fields: [
      { type: 'select', name: 'kind', label: 'Add record as', def: 'present',
        options: [{ value: 'present', label: 'Present (+1)' }, { value: 'absent', label: 'Absent (+1)' }] },
      { type: 'number', name: 'count', label: 'How many classes?', def: 1 },
      { type: 'textarea', name: 'reason', label: 'Reason (only needed for absences)', placeholder: 'Why were you absent?' },
      { type: 'check', name: 'backdated', label: 'Eligible for backdated attendance', def: false }
    ],
    submitLabel: 'Add',
    onSubmit: d => {
      const n = Math.max(1, Math.min(200, Number(d.count) || 1));
      const sem = currentSem();
      for (let i = 0; i < n; i++) {
        state.attendance.push({
          id: uid(), subjectId, semId: sem.id,
          date: new Date().toISOString().slice(0, 10), present: d.kind === 'present',
          reason: d.kind === 'present' ? '' : (d.reason || ''),
          backdated: d.kind === 'present' ? null : !!d.backdated
        });
      }
      save(); render(); toast(`Added ${n} record${n === 1 ? '' : 's'}`);
    }
  });
}

function editSubjectAttendance(subjectId) {
  const s = state.subjects.find(x => x.id === subjectId);
  const recs = state.attendance.filter(a => a.subjectId === subjectId);
  openModal({
    title: `Records — ${s.name}`,
    fields: [
      { type: 'number', name: 'present', label: 'Classes attended', def: recs.filter(r => r.present).length },
      { type: 'number', name: 'total', label: 'Total classes held', def: recs.length }
    ],
    submitLabel: 'Update',
    onSubmit: d => {
      const present = Math.max(0, Number(d.present) || 0);
      const total = Math.max(present, Number(d.total) || 0);
      const sem = currentSem();
      // rebuild records for this subject
      state.attendance = state.attendance.filter(a => a.subjectId !== subjectId);
      const today = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < total; i++) {
        state.attendance.push({
          id: uid(), subjectId, semId: sem.id, date: today, present: i < present,
          reason: i < present ? '' : '', backdated: i < present ? null : false
        });
      }
      save(); render(); toast('Attendance updated');
    }
  });
}

/* ============================================================
   ASSIGNMENTS
   ============================================================ */
function assignmentCopyText(a) {
  const due = a.deadline ? fmtDate(a.deadline) : 'no deadline';
  const rel = relDue(a.deadline).text;
  return [
    `📋 ${a.title}`,
    a.subjectId ? `📚 ${subjectName(a.subjectId)}` : null,
    `📅 Deadline: ${due} (${rel})`,
    a.details ? `\n${a.details}` : null,
    a.done ? '\n✅ Submitted' : '\n⏳ Pending'
  ].filter(Boolean).join('\n');
}

function renderAssignments() {
  $$('#assignment-filter .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === ui.asgFilter));
  let list = state.assignments.slice();
  if (ui.asgFilter === 'pending') list = list.filter(a => !a.done);
  else if (ui.asgFilter === 'done') list = list.filter(a => a.done);
  list.sort((x, y) => (x.done - y.done) || String(x.deadline || '9999').localeCompare(String(y.deadline || '9999')));

  $('#view-assignments').classList.toggle('selecting', ui.selecting);
  const selBtn = $('#btn-select-mode');
  if (selBtn) selBtn.textContent = ui.selecting ? 'Done' : 'Select';

  $('#assignment-list').innerHTML = list.length ? list.map(a => {
    const due = relDue(a.deadline);
    const picked = ui.selected.has(a.id);
    return `<div class="item selectable ${picked ? 'selected' : ''}" data-pick="${a.id}" role="button" tabindex="0">
      <div class="item-top">
        <span class="selbox" aria-hidden="true"></span>
        <div style="min-width:0;flex:1">
          <div class="item-title">${a.done ? '✅ ' : ''}${esc(a.title)}</div>
          <div class="item-sub">
            <span class="chip">${esc(subjectName(a.subjectId))}</span>
            <span class="chip ${due.cls}">${esc(due.text)}</span>
            <span>${esc(fmtDate(a.deadline))}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm" data-copy-asg="${a.id}" title="Copy">⧉</button>
          <button class="btn btn-sm" data-edit-asg="${a.id}" title="Edit">✎</button>
          <button class="btn btn-sm btn-danger" data-del-asg="${a.id}" title="Delete">🗑</button>
        </div>
      </div>
      ${a.details ? `<p style="font-size:13.5px;color:var(--muted);line-height:1.5;white-space:pre-wrap">${esc(a.details)}</p>` : ''}
      <div class="pill-row">
        <button class="btn btn-sm" data-toggle-asg="${a.id}">${a.done ? '↩ Mark pending' : '✓ Mark submitted'}</button>
      </div>
    </div>`;
  }).join('') : emptyBox(ui.asgFilter === 'pending'
    ? 'Nothing pending. Tap "+ Add" to create an assignment, or switch to "All".'
    : 'Nothing here. Tap "+ Add" to create your first assignment/deadline.');

  // selection bar
  const bar = $('#selbar');
  bar.hidden = !ui.selecting;
  if (ui.selecting) $('#sel-count').textContent = `${ui.selected.size} selected`;
}

/* ---------- selection mode ---------- */
function toggleSelectMode(on) {
  ui.selecting = on === undefined ? !ui.selecting : on;
  if (!ui.selecting) ui.selected.clear();
  renderAssignments();
}

function togglePick(id) {
  if (ui.selected.has(id)) ui.selected.delete(id);
  else ui.selected.add(id);
  renderAssignments();
}

/* ---------- shareable slip (receipt style) ---------- */
function slipItems() {
  return state.assignments
    .filter(a => ui.selected.has(a.id))
    .sort((x, y) => String(x.deadline || '9999').localeCompare(String(y.deadline || '9999')));
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawSlip(canvas, items, author, scale = 2) {
  const W = 340;
  const padX = 22;
  const inner = W - padX * 2;
  const ctx = canvas.getContext('2d');
  const font = (w, s) => `${w} ${s}px "Plus Jakarta Sans", Inter, system-ui, sans-serif`;
  const foot = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const TITLE_W = inner - 92;   // keeps titles clear of the status badge
  const TEXT_W = inner - 26;    // leaves room for the "01" index column

  // ---- pass 1: lay out blocks, recording where each one starts ----
  const blocks = [];
  let y = 14;
  const push = (h, fn) => { blocks.push({ y, fn }); y += h; };

  ctx.font = font(700, 18);
  push(28, c => {
    c.font = font(700, 18); c.textAlign = 'center'; c.fillStyle = '#fafafa';
    c.fillText('ASSIGNMENT SLIP', W / 2, y + 19);
  });
  ctx.font = font(500, 10.5);
  push(20, c => {
    c.font = font(500, 10.5); c.textAlign = 'center'; c.fillStyle = '#a1a1aa';
    c.fillText('Student Command Centre', W / 2, y + 11);
  });
  push(17, c => drawDash(c, padX, W - padX, y + 8));

  const countLine = `${items.length} ASSIGNMENT${items.length === 1 ? '' : 'S'} SELECTED`;
  push(23, c => {
    c.font = font(600, 10.5); c.textAlign = 'left'; c.fillStyle = '#60a5fa';
    c.fillText(countLine, padX, y + 13);
  });

  items.forEach((a, i) => {
    ctx.font = font(600, 13);
    const titleLines = wrapLines(ctx, a.title, TITLE_W);
    ctx.font = font(500, 10.5);
    const meta = `${subjectName(a.subjectId)} · ${fmtDate(a.deadline)}`;
    const metaLines = wrapLines(ctx, meta, TEXT_W);
    const detailsH = a.details ? 13 : 0;
    const h = 6 + titleLines.length * 17 + metaLines.length * 14 + detailsH + 6;

    push(h, c => {
      const top = y + 6;
      c.textAlign = 'left';
      c.font = font(700, 11); c.fillStyle = '#71717a';
      c.fillText(String(i + 1).padStart(2, '0'), padX, top + 12);

      const tag = a.done ? 'DONE' : 'PENDING';
      c.font = font(700, 9);
      const tw = c.measureText(tag).width + 14;
      c.fillStyle = a.done ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.14)';
      roundRect(c, W - padX - tw, top, tw, 16, 5); c.fill();
      c.strokeStyle = a.done ? 'rgba(34,197,94,0.45)' : 'rgba(245,158,11,0.45)'; c.lineWidth = 1;
      roundRect(c, W - padX - tw, top, tw, 16, 5); c.stroke();
      c.fillStyle = a.done ? '#22c55e' : '#f59e0b';
      c.fillText(tag, W - padX - tw + 7, top + 11.5);

      let ly = top + 12;
      c.font = font(600, 13); c.fillStyle = '#fafafa';
      titleLines.forEach(l => { c.fillText(l, padX + 26, ly); ly += 17; });
      c.font = font(500, 10.5); c.fillStyle = '#a1a1aa';
      metaLines.forEach(l => { c.fillText(l, padX + 26, ly + 1); ly += 14; });
      if (a.details) {
        c.font = font(400, 10.5); c.fillStyle = '#71717a';
        c.fillText('has details ✓', padX + 26, ly + 2);
      }
    });
    push(12, c => drawDash(c, padX, W - padX, y + 6));
  });

  const pending = items.filter(a => !a.done).length;
  push(26, c => {
    c.textAlign = 'left'; c.font = font(700, 12); c.fillStyle = '#fafafa';
    c.fillText('TOTAL', padX, y + 17);
    c.textAlign = 'right'; c.font = font(600, 12); c.fillStyle = '#fafafa';
    c.fillText(`${items.length - pending} done · ${pending} pending`, W - padX, y + 17);
  });
  push(16, c => drawDash(c, padX, W - padX, y + 8));
  push(16, c => {
    c.textAlign = 'center'; c.font = font(500, 9.5); c.fillStyle = '#71717a';
    c.fillText(foot, W / 2, y + 10);
  });
  push(14, c => drawDash(c, padX, W - padX, y + 7));

  // writer name — the last thing printed on the slip
  ctx.font = font(500, 10);
  const sigLines = wrapLines(ctx, author || '—', inner - 20);
  push(18, c => {
    c.textAlign = 'center'; c.font = font(500, 10); c.fillStyle = '#a1a1aa';
    c.fillText('shared by', W / 2, y + 11);
  });
  push(sigLines.length * 18 + 14, c => {
    c.textAlign = 'center'; c.font = font(700, 15); c.fillStyle = '#fafafa';
    let ly = y + 16;
    sigLines.forEach(l => { c.fillText(l, W / 2, ly); ly += 18; });
  });

  const H = Math.ceil(y);

  // ---- pass 2: draw, restoring each block's own y ----
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0c0c0f';
  roundRect(ctx, 0, 0, W, H, 10); ctx.fill();
  ctx.strokeStyle = '#27272a'; ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  roundRect(ctx, 4, 4, W - 8, H - 8, 7); ctx.stroke();
  ctx.setLineDash([]);

  blocks.forEach(b => { y = b.y; b.fn(ctx); });
  return canvas;
}

function drawDash(c, x1, x2, yPos) {
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.setLineDash([3, 4]);
  c.beginPath(); c.moveTo(x1, yPos); c.lineTo(x2, yPos); c.stroke();
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function openSlip() {
  const items = slipItems();
  if (!items.length) { toast('Select at least one assignment'); return; }
  $('#slip-author').value = state.settings.author || '';
  $('#slip-backdrop').hidden = false;
  renderSlipCanvas();
}

function closeSlip() {
  $('#slip-backdrop').hidden = true;
}

function renderSlipCanvas() {
  const items = slipItems();
  if (!items.length) return closeSlip();
  drawSlip($('#slip-canvas'), items, $('#slip-author').value.trim());
}

function slipAsText() {
  const items = slipItems();
  const author = ($('#slip-author').value || '').trim();
  const pending = items.filter(a => !a.done).length;
  const bar = '─────────────────────────';
  return [
    bar,
    '   📋 ASSIGNMENT SLIP',
    '   Student Command Centre',
    bar,
    ...items.flatMap((a, i) => [
      `${String(i + 1).padStart(2, '0')}. ${a.title}`,
      `    ${subjectName(a.subjectId)} · ${fmtDate(a.deadline)} · ${a.done ? 'DONE' : 'PENDING'}`,
      ...(a.details ? [`    ℹ ${a.details.replace(/\n/g, ' ')}`] : []),
      ''
    ]),
    `TOTAL: ${items.length}  (${items.length - pending} done · ${pending} pending)`,
    bar,
    `shared by ${author || '—'}`,
    new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    bar
  ].join('\n');
}

function slipPngBlob() {
  return new Promise(resolve => $('#slip-canvas').toBlob(resolve, 'image/png'));
}

function assignmentForm(a = {}) {
  openModal({
    title: a.id ? 'Edit assignment' : 'New assignment',
    fields: [
      { name: 'title', label: 'Title', def: a.title, placeholder: 'e.g. Data Structures lab report' },
      { type: 'select', name: 'subjectId', label: 'Subject', def: a.subjectId ?? '', options: subjectOptions(currentSem().id, true) },
      { type: 'date', name: 'deadline', label: 'Deadline', def: a.deadline },
      { type: 'textarea', name: 'details', label: 'Details / topics', def: a.details, placeholder: 'What exactly has to be submitted?' },
      { type: 'check', name: 'done', label: 'Already submitted', def: a.done ? true : false }
    ],
    submitLabel: a.id ? 'Save changes' : 'Add assignment',
    onSubmit: d => {
      if (!d.title) { toast('Title is required'); return false; }
      if (a.id) {
        Object.assign(a, d);
      } else {
        state.assignments.push(Object.assign({ id: uid(), semId: currentSem().id }, d));
      }
      save(); render(); toast(a.id ? 'Updated' : 'Assignment added');
    }
  });
}

/* ============================================================
   EXAMS
   ============================================================ */
function examCopyText(e) {
  return [
    `📝 ${e.title}`,
    e.subjectId ? `📚 ${subjectName(e.subjectId)}` : null,
    `📅 ${fmtDate(e.date)} (${relExam(e.date).text})`,
    e.syllabus ? `\nSyllabus:\n${e.syllabus}` : null
  ].filter(Boolean).join('\n');
}

function renderExams() {
  $$('#exam-filter .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === ui.examFilter));
  let list = state.exams.slice();
  const now = new Date().toISOString().slice(0, 10);
  if (ui.examFilter === 'upcoming') list = list.filter(e => e.date >= now && !e.done);
  else if (ui.examFilter === 'past') list = list.filter(e => e.date < now || e.done);
  list.sort((x, y) => String(x.date || '9999').localeCompare(String(y.date || '9999')));

  $('#exam-list').innerHTML = list.length ? list.map(e => {
    const rel = relExam(e.date);
    const covered = countCovered(e.syllabus);
    return `<div class="item">
      <div class="item-top">
        <div style="min-width:0">
          <div class="item-title">${esc(e.title)}</div>
          <div class="item-sub">
            <span class="chip">${esc(subjectName(e.subjectId))}</span>
            <span class="chip ${rel.cls}">${esc(rel.text)}</span>
            <span>${esc(fmtDate(e.date))}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm" data-copy-exam="${e.id}" title="Copy">⧉</button>
          <button class="btn btn-sm" data-edit-exam="${e.id}" title="Edit">✎</button>
          <button class="btn btn-sm btn-danger" data-del-exam="${e.id}" title="Delete">🗑</button>
        </div>
      </div>
      ${e.syllabus ? `<p style="font-size:13.5px;color:var(--muted);line-height:1.5;white-space:pre-wrap">${esc(e.syllabus)}</p>` : ''}
      <div class="pill-row">
        <button class="btn btn-sm" data-toggle-exam="${e.id}">${e.done ? '↩ Mark upcoming' : '✓ Done'}</button>
      </div>
    </div>`;
  }).join('') : emptyBox('No exams here. Tap "+ Add" to track one with its syllabus.');
}

function countCovered(syllabus) {
  if (!syllabus) return null;
  const lines = syllabus.split('\n').map(l => l.trim()).filter(Boolean);
  const done = lines.filter(l => /^\[x\]|^✔|^\[done\]/i.test(l)).length;
  return { done, total: lines.length };
}

function examForm(e = {}) {
  openModal({
    title: e.id ? 'Edit exam' : 'New exam',
    fields: [
      { name: 'title', label: 'Exam name', def: e.title, placeholder: 'e.g. Mid-semester — Unit 1-3' },
      { type: 'select', name: 'subjectId', label: 'Subject', def: e.subjectId ?? '', options: subjectOptions(currentSem().id, true) },
      { type: 'date', name: 'date', label: 'Date', def: e.date },
      { type: 'textarea', name: 'syllabus', label: 'Syllabus / topics (one per line)', def: e.syllabus, placeholder: 'Unit 1 – Functions\nUnit 2 – Arrays' },
      { type: 'check', name: 'done', label: 'Already written', def: e.done ? true : false }
    ],
    submitLabel: e.id ? 'Save changes' : 'Add exam',
    onSubmit: d => {
      if (!d.title) { toast('Name is required'); return false; }
      if (e.id) Object.assign(e, d);
      else state.exams.push(Object.assign({ id: uid(), semId: currentSem().id }, d));
      save(); render(); toast(e.id ? 'Updated' : 'Exam added');
    }
  });
}

/* ============================================================
   LINKS
   ============================================================ */
function renderLinks() {
  const q = ui.linkSearch.toLowerCase();
  let list = state.links.slice();
  if (q) list = list.filter(l => (l.title + ' ' + l.url + ' ' + subjectName(l.subjectId)).toLowerCase().includes(q));
  list.sort((a, b) => a.title.localeCompare(b.title));

  $('#link-list').innerHTML = list.length ? list.map(l => `<div class="item">
    <div class="item-top">
      <div style="min-width:0">
        <div class="item-title">${esc(l.title)}</div>
        <div class="item-sub">
          <span class="chip">${esc(subjectName(l.subjectId))}</span>
          <span style="word-break:break-all">${esc(l.url)}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-sm" data-copy-link="${l.id}" title="Copy">⧉</button>
        <button class="btn btn-sm" data-edit-link="${l.id}" title="Edit">✎</button>
        <button class="btn btn-sm btn-danger" data-del-link="${l.id}" title="Delete">🗑</button>
      </div>
    </div>
    <div class="pill-row">
      <a class="btn btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
  </div>`).join('') : emptyBox('No links yet. Add classrooms, portals, docs — anything you open often.');
}

function linkForm(l = {}) {
  openModal({
    title: l.id ? 'Edit link' : 'New link',
    fields: [
      { name: 'title', label: 'Name', def: l.title, placeholder: 'e.g. Google Classroom' },
      { name: 'url', label: 'URL', def: l.url, placeholder: 'https://…' },
      { type: 'select', name: 'subjectId', label: 'Subject', def: l.subjectId ?? '', options: subjectOptions(currentSem().id, true) }
    ],
    submitLabel: l.id ? 'Save changes' : 'Add link',
    onSubmit: d => {
      if (!d.title || !d.url) { toast('Name and URL required'); return false; }
      if (!/^https?:\/\//i.test(d.url)) d.url = 'https://' + d.url;
      if (l.id) Object.assign(l, d);
      else state.links.push(Object.assign({ id: uid(), semId: currentSem().id }, d));
      save(); render(); toast(l.id ? 'Updated' : 'Link added');
    }
  });
}

/* ============================================================
   NOTES
   ============================================================ */
function noteCopyText(n) {
  return `🗒️ ${n.title}${n.subjectId ? `\n📚 ${subjectName(n.subjectId)}` : ''}\n\n${n.body}`;
}

function renderNotes() {
  const q = ui.noteSearch.toLowerCase();
  let list = state.notes.slice();
  if (q) list = list.filter(n => (n.title + ' ' + n.body + ' ' + subjectName(n.subjectId)).toLowerCase().includes(q));
  list.sort((a, b) => a.title.localeCompare(b.title));

  $('#note-list').innerHTML = list.length ? list.map(n => `<div class="item">
    <div class="item-top">
      <div style="min-width:0">
        <div class="item-title">${esc(n.title)}</div>
        <div class="item-sub"><span class="chip">${esc(subjectName(n.subjectId))}</span></div>
      </div>
      <div class="item-actions">
        <button class="btn btn-sm" data-copy-note="${n.id}" title="Copy">⧉</button>
        <button class="btn btn-sm" data-edit-note="${n.id}" title="Edit">✎</button>
        <button class="btn btn-sm btn-danger" data-del-note="${n.id}" title="Delete">🗑</button>
      </div>
    </div>
    <p style="font-size:13.8px;line-height:1.6;color:var(--text-2);white-space:pre-wrap">${esc(n.body)}</p>
  </div>`).join('') : emptyBox('No notes yet. Save formulas, dates, important points — then share them with the ⧉ button.');
}

function noteForm(n = {}) {
  openModal({
    title: n.id ? 'Edit note' : 'New note',
    fields: [
      { name: 'title', label: 'Title', def: n.title, placeholder: 'e.g. OS exam key points' },
      { type: 'select', name: 'subjectId', label: 'Subject', def: n.subjectId ?? '', options: subjectOptions(currentSem().id, true) },
      { type: 'textarea', name: 'body', label: 'Note', def: n.body, placeholder: 'Write it here…' }
    ],
    submitLabel: n.id ? 'Save changes' : 'Save note',
    onSubmit: d => {
      if (!d.title && !d.body) { toast('Add a title or content'); return false; }
      if (!d.title) d.title = d.body.slice(0, 40);
      if (n.id) Object.assign(n, d);
      else state.notes.push(Object.assign({ id: uid(), semId: currentSem().id }, d));
      save(); render(); toast(n.id ? 'Updated' : 'Note saved');
    }
  });
}

/* ============================================================
   SUBJECTS & SEMESTERS
   ============================================================ */
function renderSubjects() {
  const sem = currentSem();
  $('#subjects-hint').textContent = `Showing subjects of ${sem.name}. Each semester has its own list.`;
  const list = subjectsOf(sem.id);
  $('#subject-list').innerHTML = list.length ? list.map(s => {
    const st = attendanceStats('current').rows[s.id] || { present: 0, total: 0 };
    const pct = st.total ? Math.round((st.present / st.total) * 100) : null;
    const counts = [
      state.assignments.filter(a => a.subjectId === s.id && !a.done).length + ' tasks',
      state.exams.filter(e => e.subjectId === s.id).length + ' exams',
      state.notes.filter(n => n.subjectId === s.id).length + ' notes'
    ].join(' · ');
    return `<div class="item">
      <div class="item-top">
        <div style="min-width:0">
          <div class="item-title">${esc(s.name)}</div>
          <div class="item-sub">
            ${s.code ? `<span class="chip">${esc(s.code)}</span>` : ''}
            ${s.teacher ? `<span>${esc(s.teacher)}</span>` : ''}
            <span class="chip ${attTone(pct)}">${pct === null ? 'no attendance' : pct + '% attend.'}</span>
          </div>
          <div class="item-sub">${counts}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm" data-edit-sub="${s.id}">✎</button>
          <button class="btn btn-sm btn-danger" data-del-sub="${s.id}">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('') : emptyBox('No subjects in this semester yet. Add them and everything else can be tagged to them.');

  $('#semester-list').innerHTML = state.semesters.map(s => `
    <div class="item">
      <div class="item-top">
        <div style="min-width:0">
          <div class="item-title">${esc(s.name)}</div>
          <div class="item-sub">
            ${subjectsOf(s.id).length} subjects
            ${s.id === sem.id ? '<span class="chip green">current</span>' : ''}
          </div>
        </div>
        <div class="item-actions">
          ${s.id === sem.id ? '' : `<button class="btn btn-sm" data-use-sem="${s.id}">Switch</button>`}
          <button class="btn btn-sm" data-edit-sem="${s.id}">✎</button>
          <button class="btn btn-sm btn-danger" data-del-sem="${s.id}">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function subjectForm(s = {}) {
  openModal({
    title: s.id ? 'Edit subject' : 'New subject',
    fields: [
      { name: 'name', label: 'Subject name', def: s.name, placeholder: 'e.g. Operating Systems' },
      { name: 'code', label: 'Code (optional)', def: s.code, placeholder: 'CS-301' },
      { name: 'teacher', label: 'Teacher (optional)', def: s.teacher },
      { type: 'select', name: 'semId', label: 'Semester', def: s.semId ?? currentSem().id,
        options: state.semesters.map(x => ({ value: x.id, label: x.name })) }
    ],
    submitLabel: s.id ? 'Save changes' : 'Add subject',
    onSubmit: d => {
      if (!d.name) { toast('Name is required'); return false; }
      if (s.id) Object.assign(s, d);
      else state.subjects.push(Object.assign({ id: uid() }, d));
      state.currentSemesterId = d.semId || state.currentSemesterId;
      save(); render(); toast(s.id ? 'Updated' : 'Subject added');
    }
  });
}

function semesterForm(s = {}) {
  openModal({
    title: s.id ? 'Edit semester' : 'New semester',
    fields: [{ name: 'name', label: 'Semester name', def: s.name, placeholder: 'e.g. Semester 3' }],
    submitLabel: s.id ? 'Save changes' : 'Add semester',
    onSubmit: d => {
      if (!d.name) { toast('Name is required'); return false; }
      if (s.id) Object.assign(s, d);
      else {
        const n = { id: uid(), name: d.name };
        state.semesters.push(n);
        state.currentSemesterId = n.id;
      }
      save(); render(); toast(s.id ? 'Updated' : 'Semester added — now add its subjects');
    }
  });
}

/* ============================================================
   HOME / DASHBOARD
   ============================================================ */
function renderHome() {
  const sem = currentSem();
  $('#topbar-semester').textContent = sem.name;

  const now = new Date();
  $('#hero-date').textContent = now.toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const h = now.getHours();
  $('#hero-greeting').textContent =
    (h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : h < 21 ? 'Good evening 🌙' : 'Late night 🦉') +
    ' — ' + sem.name;

  const stats = attendanceStats('current');
  $('#stat-attendance').textContent = stats.pct === null ? '—' : stats.pct + '%';

  const pending = state.assignments.filter(a => !a.done && a.semId === sem.id);
  $('#stat-assignments').textContent = pending.length;
  $('#stat-exams').textContent = state.exams.filter(e => !e.done && e.date >= now.toISOString().slice(0, 10)).length;
  $('#stat-notes').textContent = state.notes.length;

  // next assignments
  const next = pending.slice().sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'))).slice(0, 4);
  $('#home-next').innerHTML = next.length ? next.map(a => {
    const due = relDue(a.deadline);
    return `<div class="item">
      <div class="item-top">
        <div style="min-width:0">
          <div class="item-title">${esc(a.title)}</div>
          <div class="item-sub">
            <span class="chip">${esc(subjectName(a.subjectId))}</span>
            <span class="chip ${due.cls}">${esc(due.text)}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm" data-copy-asg="${a.id}">⧉</button>
        </div>
      </div>
    </div>`;
  }).join('') : emptyBox('No pending assignments. Enjoy the calm 🎉');

  // upcoming exams
  const today = now.toISOString().slice(0, 10);
  const upExams = state.exams.filter(e => !e.done && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  $('#home-exams').innerHTML = upExams.length ? upExams.map(e => {
    const rel = relExam(e.date);
    return `<div class="item">
      <div class="item-top">
        <div style="min-width:0">
          <div class="item-title">${esc(e.title)}</div>
          <div class="item-sub">
            <span class="chip">${esc(subjectName(e.subjectId))}</span>
            <span class="chip ${rel.cls}">${esc(rel.text)}</span>
            <span>${esc(fmtDate(e.date))}</span>
          </div>
        </div>
        <div class="item-actions"><button class="btn btn-sm" data-copy-exam="${e.id}">⧉</button></div>
      </div>
    </div>`;
  }).join('') : emptyBox('No upcoming exams tracked yet.');

  // attendance alerts
  const rows = stats.rows;
  const alerts = Object.keys(rows)
    .map(id => {
      const r = rows[id];
      const pct = r.total ? Math.round((r.present / r.total) * 100) : 0;
      return { id, pct, ...r };
    })
    .filter(r => r.pct < 75)
    .sort((a, b) => a.pct - b.pct);

  $('#home-attendance').innerHTML = alerts.length ? alerts.map(r => `
    <div class="item">
      <div class="item-top">
        <div style="min-width:0">
          <div class="item-title">${esc(subjectName(r.id))}</div>
          <div class="item-sub">
            <span class="chip ${attTone(r.pct)}">${r.pct}%</span>
            <span>${r.present}/${r.total} classes</span>
          </div>
          <div class="item-sub">${esc(bunkHint(r.pct, r.total))}</div>
        </div>
        <div class="item-actions"><button class="btn btn-sm" data-mark="1" data-sub="${r.id}">✓</button></div>
      </div>
    </div>`).join('')
    : (stats.total ? '<div class="empty" style="border-style:solid;border-color:rgba(34,197,94,.30);color:var(--green);box-shadow:0 0 22px -10px var(--green-glow)">All subjects above 75% ✅</div>'
      : emptyBox('Mark attendance to see alerts here.'));
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function render() {
  if (ui.view === 'home') renderHome();
  else if (ui.view === 'attendance') renderAttendance();
  else if (ui.view === 'analysis') renderAnalysis();
  else if (ui.view === 'assignments') renderAssignments();
  else if (ui.view === 'exams') renderExams();
  else if (ui.view === 'subjects') renderSubjects();
  else if (ui.view === 'links') renderLinks();
  else if (ui.view === 'notes') renderNotes();
  $('#topbar-semester').textContent = currentSem().name;
}

/* ============================================================
   EVENTS
   ============================================================ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-nav],[data-goto],[data-add],[data-filter],[data-mark],[data-manual-att],[data-edit-att-subject],[data-analyze],[data-pick],[data-edit-sub-analysis],' +
    '[data-copy-asg],[data-edit-asg],[data-del-asg],[data-toggle-asg],' +
    '[data-copy-exam],[data-edit-exam],[data-del-exam],[data-toggle-exam],' +
    '[data-copy-link],[data-edit-link],[data-del-link],' +
    '[data-copy-note],[data-edit-note],[data-del-note],' +
    '[data-edit-sub],[data-del-sub],[data-edit-sem],[data-del-sem],[data-use-sem]');
  if (!t) return;
  const d = t.dataset;

  if (d.nav) return go(d.nav);
  if (d.goto) return go(d.goto);

  if (d.add) {
    ({ assignment: assignmentForm, exam: examForm, link: linkForm, note: noteForm,
       subject: subjectForm, semester: semesterForm,
       attendance: () => go('attendance') }[d.add])();
    return;
  }

  // segmented filters
  if (d.filter !== undefined) {
    const group = t.parentElement;
    if (group.id === 'att-filter') ui.attFilter = d.filter;
    else if (group.id === 'assignment-filter') ui.asgFilter = d.filter;
    else if (group.id === 'exam-filter') ui.examFilter = d.filter;
    $$('.seg-btn', group).forEach(b => b.classList.toggle('active', b === t));
    render();
    return;
  }

  if (d.mark !== undefined && d.sub) return markAttendance(d.sub, d.mark === '1');
  if (d.manualAtt) return manualAttendance(d.manualAtt);
  if (d.editAttSubject) return editSubjectAttendance(d.editAttSubject);
  if (d.analyze) return openAnalysis(d.analyze);
  if (d.pick !== undefined) {
    // cards are only tappable while in Select mode — never hijack normal browsing
    if (ui.selecting) return togglePick(d.pick);
    return;
  }
  if (d.editSubAnalysis) {
    const s = state.subjects.find(x => x.id === ui.analysisSubjectId);
    return s && subjectForm(s);
  }

  if (d.copyAsg) { const a = state.assignments.find(x => x.id === d.copyAsg); return copyText(assignmentCopyText(a), 'Assignment copied'); }
  if (d.editAsg) return assignmentForm(state.assignments.find(x => x.id === d.editAsg));
  if (d.delAsg) return removeItem('assignments', d.delAsg, 'Delete this assignment?');
  if (d.toggleAsg) { const a = state.assignments.find(x => x.id === d.toggleAsg); a.done = !a.done; save(); render(); return toast(a.done ? 'Marked submitted ✅' : 'Back to pending'); }

  if (d.copyExam) { const x = state.exams.find(y => y.id === d.copyExam); return copyText(examCopyText(x), 'Exam copied'); }
  if (d.editExam) return examForm(state.exams.find(x => x.id === d.editExam));
  if (d.delExam) return removeItem('exams', d.delExam, 'Delete this exam?');
  if (d.toggleExam) { const x = state.exams.find(y => y.id === d.toggleExam); x.done = !x.done; save(); render(); return toast(x.done ? 'Marked done ✅' : 'Back to upcoming'); }

  if (d.copyLink) { const l = state.links.find(x => x.id === d.copyLink); return copyText(l.title + '\n' + l.url, 'Link copied'); }
  if (d.editLink) return linkForm(state.links.find(x => x.id === d.editLink));
  if (d.delLink) return removeItem('links', d.delLink, 'Delete this link?');

  if (d.copyNote) { const n = state.notes.find(x => x.id === d.copyNote); return copyText(noteCopyText(n), 'Note copied'); }
  if (d.editNote) return noteForm(state.notes.find(x => x.id === d.editNote));
  if (d.delNote) return removeItem('notes', d.delNote, 'Delete this note?');

  if (d.editSub) return subjectForm(state.subjects.find(x => x.id === d.editSub));
  if (d.delSub) return deleteSubject(d.delSub);
  if (d.editSem) return semesterForm(state.semesters.find(x => x.id === d.editSem));
  if (d.delSem) return deleteSemester(d.delSem);
  if (d.useSem) { state.currentSemesterId = d.useSem; save(); render(); return toast('Switched to ' + currentSem().name); }
});

function removeItem(key, id, msg) {
  if (!confirm(msg)) return;
  state[key] = state[key].filter(x => x.id !== id);
  save(); render(); toast('Deleted');
}

function deleteSubject(id) {
  const s = state.subjects.find(x => x.id === id);
  const linked =
    state.assignments.filter(a => a.subjectId === id).length +
    state.exams.filter(e => e.subjectId === id).length +
    state.notes.filter(n => n.subjectId === id).length +
    state.links.filter(l => l.subjectId === id).length +
    state.attendance.filter(a => a.subjectId === id).length;
  if (!confirm(`Delete "${s.name}"? ${linked} linked item(s) will become "General".`)) return;
  state.assignments.forEach(a => { if (a.subjectId === id) a.subjectId = ''; });
  state.exams.forEach(e => { if (e.subjectId === id) e.subjectId = ''; });
  state.notes.forEach(n => { if (n.subjectId === id) n.subjectId = ''; });
  state.links.forEach(l => { if (l.subjectId === id) l.subjectId = ''; });
  state.attendance = state.attendance.filter(a => a.subjectId !== id);
  state.subjects = state.subjects.filter(x => x.id !== id);
  save(); render(); toast('Subject deleted');
}

function deleteSemester(id) {
  const sem = state.semesters.find(x => x.id === id);
  const subs = subjectsOf(id);
  if (state.semesters.length === 1) return toast('Keep at least one semester');
  if (!confirm(`Delete "${sem.name}" and its ${subs.length} subject(s)? Everything tagged to them is removed too.`)) return;
  const subIds = subs.map(s => s.id);
  state.subjects = state.subjects.filter(s => s.semId !== id);
  ['assignments', 'exams', 'links', 'notes'].forEach(k => {
    state[k] = state[k].filter(x => !subIds.includes(x.subjectId) && x.semId !== id);
  });
  state.attendance = state.attendance.filter(a => !subIds.includes(a.subjectId) && a.semId !== id);
  state.semesters = state.semesters.filter(s => s.id !== id);
  if (state.currentSemesterId === id) state.currentSemesterId = state.semesters[0].id;
  save(); render(); toast('Semester deleted');
}

/* ---------- selection + slip ---------- */
const selBtn = $('#btn-select-mode');
if (selBtn) selBtn.addEventListener('click', () => toggleSelectMode());

$('#sel-clear').addEventListener('click', () => {
  ui.selected.clear();
  renderAssignments();
});

$('#sel-share').addEventListener('click', openSlip);

$('#slip-close').addEventListener('click', closeSlip);
$('#slip-backdrop').addEventListener('click', e => { if (e.target.id === 'slip-backdrop') closeSlip(); });
$('#slip-author').addEventListener('input', () => {
  state.settings.author = $('#slip-author').value.trim();
  save();
  renderSlipCanvas();
});

$('#slip-download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = $('#slip-canvas').toDataURL('image/png');
  a.download = 'assignment-slip.png';
  a.click();
  toast('Slip saved ⬇');
});

$('#slip-copy').addEventListener('click', async () => {
  try {
    const blob = await slipPngBlob();
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no clipboard image support');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Image copied ⧉');
  } catch (err) {
    toast('Image copy not supported here — use Save PNG');
  }
});

$('#slip-copy-text').addEventListener('click', () => copyText(slipAsText(), 'Slip copied as text'));

/* ---------- analysis ---------- */
$('#btn-analysis-back').addEventListener('click', () => go('attendance'));

/* topbar + sheet + modal buttons */
$('#btn-semester-switch').addEventListener('click', () => {
  const opts = state.semesters.map(s => ({
    value: s.id, label: (s.id === state.currentSemesterId ? '✓ ' : '') + s.name
  }));
  openModal({
    title: 'Switch semester',
    fields: [{ type: 'select', name: 'semId', label: 'Active semester', def: state.currentSemesterId, options: opts }],
    submitLabel: 'Switch',
    onSubmit: d => {
      state.currentSemesterId = d.semId;
      save(); render();
      go('home');
      toast('Now viewing ' + currentSem().name);
    }
  });
});

$('#modal-close').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', e => { if (e.target.id === 'modal-backdrop') closeModal(); });
$('#more-close').addEventListener('click', closeSheet);
$('#more-backdrop').addEventListener('click', e => { if (e.target.id === 'more-backdrop') closeSheet(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeSheet(); closeSlip(); }
});

/* search inputs */
$('#link-search').addEventListener('input', e => { ui.linkSearch = e.target.value; renderLinks(); });
$('#note-search').addEventListener('input', e => { ui.noteSearch = e.target.value; renderNotes(); });

/* export / import / reset */
$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'student-command-centre-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
  closeSheet();
  toast('Backup downloaded 💾');
});

$('#btn-import').addEventListener('click', () => { $('#import-file').click(); });
$('#import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.semesters) throw new Error('bad file');
      state = Object.assign(DEFAULT_STATE(), data);
      save(); render();
      toast('Data imported ✅');
    } catch (err) {
      toast('Invalid backup file');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
  closeSheet();
});

$('#btn-reset').addEventListener('click', () => {
  closeSheet();
  if (!confirm('Erase ALL data? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = load();
  render();
  go('home');
  toast('Everything reset');
});

/* ============================================================
   BOOT
   ============================================================ */
render();
go('home');
