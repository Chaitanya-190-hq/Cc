/* Smoke test: boots the app in jsdom and exercises the core flows. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://localhost/',
  pretendToBeVisual: true
});
const { window } = dom;
window.confirm = () => true;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.scrollTo = () => {};
window.onerror = (m) => errors.push('window.onerror: ' + m);

// run app.js in the window context
try {
  window.eval(fs.readFileSync('app.js', 'utf8'));
} catch (e) {
  errors.push('BOOT THREW: ' + e.message + '\n' + e.stack);
}

const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const results = [];
const check = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + extra}`);
  if (!cond) errors.push(name + ' ' + extra);
};

const click = el => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };

/* ---------- boot ---------- */
check('app boots without throwing', errors.length === 0, errors.join(' | '));
check('home view visible', !$('#view-home').hidden);
check('hero date rendered', $('#hero-date').textContent.length > 5, $('#hero-date').textContent);
check('semester shown in topbar', $('#topbar-semester').textContent.includes('Semester'), $('#topbar-semester').textContent);
check('seeded data present', $('#stat-notes').textContent === '1', $('#stat-notes').textContent);
check('next-up list rendered', $('#home-next').children.length > 0, $('#home-next').innerHTML.slice(0, 80));

/* ---------- navigation ---------- */
click($('.nav-btn[data-nav="assignments"]'));
check('assignments view opens', !$('#view-assignments').hidden);
check('assignments nav active', $('.nav-btn[data-nav="assignments"]').classList.contains('active'));

/* ---------- add assignment via modal ---------- */
const before = JSON.parse(window.localStorage.getItem('student-command-centre-v1')).assignments.length;
click($('[data-add="assignment"]'));
check('modal opens', !$('#modal-backdrop').hidden);
check('modal has fields', $$('#modal-form .field').length >= 4, String($$('#modal-form .field').length));
$('#modal-form [name=title]').value = 'DBMS lab record';
$('#modal-form [name=deadline]').value = '2026-11-05';
$('#modal-form [name=details]').value = 'ER diagram + SQL queries';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const after = JSON.parse(window.localStorage.getItem('student-command-centre-v1')).assignments.length;
check('assignment saved', after === before + 1, `${before} -> ${after}`);
check('modal closed after save', $('#modal-backdrop').hidden);
check('assignment rendered', $('#assignment-list').textContent.includes('DBMS lab record'));

/* ---------- copy assignment ---------- */
let copied = null;
window.navigator.clipboard = { writeText: t => { copied = t; return Promise.resolve(); } };
Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
click($('[data-copy-asg]'));
check('copy puts text on clipboard', !!copied && copied.includes('📋') && copied.includes('Deadline:'), String(copied).slice(0, 60));

/* ---------- toggle done filter ---------- */
const pendingBtn = $('#assignment-filter [data-filter=pending]');
click(pendingBtn);
check('pending filter active after click', pendingBtn.classList.contains('active'));

/* ---------- attendance ---------- */
click($('.nav-btn[data-nav="attendance"]'));
check('attendance view opens', !$('#view-attendance').hidden);
check('attendance subject listed', $('#attendance-list').textContent.includes('Mathematics'));
const statBefore = JSON.parse(window.localStorage.getItem('student-command-centre-v1')).attendance.length;
click($('[data-mark="1"]'));
const statAfter = JSON.parse(window.localStorage.getItem('student-command-centre-v1')).attendance.length;
check('attendance marked', statAfter === statBefore + 1, `${statBefore} -> ${statAfter}`);
check('attendance % shown', $('#att-overall').textContent.includes('%'), $('#att-overall').textContent);

/* ---------- exams ---------- */
click($('.nav-btn[data-nav="exams"]'));
click($('[data-add="exam"]'));
$('#modal-form [name=title]').value = 'Mid term';
$('#modal-form [name=date]').value = '2026-12-01';
$('#modal-form [name=syllabus]').value = 'Unit 1\nUnit 2';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('exam saved + rendered', $('#exam-list').textContent.includes('Mid term'));

/* ---------- subjects / semester ---------- */
click($('.nav-btn[data-nav="more"]'));
check('more sheet opens', !$('#more-backdrop').hidden);
click($('#more-sheet [data-nav="subjects"]'));
check('subjects view opens', !$('#view-subjects').hidden);
check('more sheet closed on nav', $('#more-backdrop').hidden);
check('subject listed', $('#subject-list').textContent.includes('Mathematics'));
check('semester listed', $('#semester-list').textContent.includes('Semester 1'));

click($('[data-add="subject"]'));
$('#modal-form [name=name]').value = 'Physics';
$('#modal-form [name=code]').value = 'PH-101';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('subject added', $('#subject-list').textContent.includes('Physics'));

click($('[data-add="semester"]'));
$('#modal-form [name=name]').value = 'Semester 2';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const st = JSON.parse(window.localStorage.getItem('student-command-centre-v1'));
check('semester added', st.semesters.length === 2, String(st.semesters.length));
check('semester 2 becomes current', st.currentSemesterId === st.semesters[1].id);

/* ---------- switching back keeps subjects separate ---------- */
const st3 = JSON.parse(window.localStorage.getItem('student-command-centre-v1'));
const sem1 = st3.semesters[0].id, sem2 = st3.semesters[1].id;
check('physics belongs to semester 1 (where it was added)',
  st3.subjects.find(s => s.name === 'Physics').semId === st3.subjects.find(s => s.name === 'Mathematics').semId,
  JSON.stringify(st3.subjects));

// semester 2 is current right after being added → semester 1 has the Switch button
click($(`[data-use-sem="${sem1}"]`));
check('switched to semester 1', JSON.parse(window.localStorage.getItem('student-command-centre-v1')).currentSemesterId === sem1);
click($('.nav-btn[data-nav="more"]'));
click($('#more-sheet [data-nav="subjects"]'));
check('semester 1 shows its own subjects', $('#subject-list').textContent.includes('Mathematics') && $('#subject-list').textContent.includes('Physics'), $('#subject-list').textContent.slice(0, 80));

// now semester 2 has the Switch button
click($(`[data-use-sem="${sem2}"]`));
check('switched to semester 2', JSON.parse(window.localStorage.getItem('student-command-centre-v1')).currentSemesterId === sem2);
click($('.nav-btn[data-nav="more"]'));
click($('#more-sheet [data-nav="subjects"]'));
check('semester 2 has its own (empty) subject list', $('#subject-list').querySelectorAll('.item').length === 0 && $('#subject-list').textContent.includes('No subjects'), $('#subject-list').textContent.slice(0, 60));

// back to semester 1 for the rest of the test
click($(`[data-use-sem="${sem1}"]`));
check('back on semester 1', JSON.parse(window.localStorage.getItem('student-command-centre-v1')).currentSemesterId === sem1);

/* ---------- notes + copy ---------- */
click($('.nav-btn[data-nav="more"]'));
click($('#more-sheet [data-nav="notes"]'));
check('notes view opens', !$('#view-notes').hidden);
check('seed note rendered', $('#note-list').textContent.includes('Welcome note'));
copied = null;
click($('[data-copy-note]'));
check('note copy works', !!copied && copied.includes('Welcome note'), String(copied));

click($('[data-add="note"]'));
$('#modal-form [name=title]').value = 'Physics formulas';
$('#modal-form [name=body]').value = 'F = ma';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('note saved', $('#note-list').textContent.includes('Physics formulas'));

/* ---------- links ---------- */
click($('.nav-btn[data-nav="more"]'));
click($('#more-sheet [data-nav="links"]'));
click($('[data-add="link"]'));
$('#modal-form [name=title]').value = 'Classroom';
$('#modal-form [name=url]').value = 'classroom.google.com';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const links = JSON.parse(window.localStorage.getItem('student-command-centre-v1')).links;
check('link saved with https:// added', links.length === 1 && links[0].url.startsWith('https://'), JSON.stringify(links));

/* ---------- back to home ---------- */
click($('.nav-btn[data-nav="home"]'));
check('home renders again', !$('#view-home').hidden && $('#home-next').children.length > 0);

/* ---------- report ---------- */
console.log('\n' + results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
