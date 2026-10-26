/* Tests for: selection + slip, absence reason + backdated, subject analysis. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const errors = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  runScripts: 'outside-only', url: 'https://localhost/', pretendToBeVisual: true
});
const { window } = dom;
const doc = window.document;

/* --- stub canvas: jsdom has no 2d context --- */
const calls = [];
const fakeCtx = {
  setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  arcTo() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {},
  setLineDash() {}, fillText(t) { calls.push(t); },
  measureText(t) { return { width: String(t).length * 6.5 }; },
  font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: 'left'
};
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toBlob = cb => cb(new window.Blob([''], { type: 'image/png' }));
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';

window.confirm = () => true;
window.scrollTo = () => {};
window.onerror = m => errors.push('onerror: ' + m);

try { window.eval(fs.readFileSync('app.js', 'utf8')); }
catch (e) { errors.push('BOOT: ' + e.message + '\n' + e.stack); }

const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const results = [];
const check = (n, c, x = '') => {
  results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  → ' + x}`);
  if (!c) errors.push(n + ' ' + x);
};
const click = el => { if (!el) throw new Error('missing element to click'); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const store = () => JSON.parse(window.localStorage.getItem('student-command-centre-v1'));

check('app boots', errors.length === 0, errors.join(' | '));

/* ================= selection + slip ================= */
click($('.nav-btn[data-nav="assignments"]'));
check('select button exists', !!$('#btn-select-mode'));

// seed two more assignments so selection has choices
for (const [title, dl] of [['DBMS lab record', '2026-11-05'], ['OS assignment 2', '2026-11-12']]) {
  click($('[data-add="assignment"]'));
  $('#modal-form [name=title]').value = title;
  $('#modal-form [name=deadline]').value = dl;
  $('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}
check('3 assignments exist', store().assignments.length === 3, String(store().assignments.length));

click($('#btn-select-mode'));
check('selection mode on', $('#view-assignments').classList.contains('selecting'));
check('selbar visible', $('#selbar').hidden === false);
check('select button label flips', $('#btn-select-mode').textContent === 'Done', $('#btn-select-mode').textContent);

const cards = $$('#assignment-list .item');
check('cards are selectable', cards.length === 3 && cards[0].dataset.pick, String(cards.length));
click(cards[0]);
click($$('#assignment-list .item')[1]);   // list re-renders after each pick — re-query
check('2 selected', $('#sel-count').textContent === '2 selected', $('#sel-count').textContent);
check('selected class applied', $$('#assignment-list .item.selected').length === 2);

// unselect one
click($$('#assignment-list .item.selected')[1]);
check('deselect works', $('#sel-count').textContent === '1 selected', $('#sel-count').textContent);

/* --- open slip --- */
click($('#sel-share'));
check('slip modal opens', $('#slip-backdrop').hidden === false);
check('author input present', !!$('#slip-author'));
check('canvas drawn with title', calls.some(c => c.includes('ASSIGNMENT SLIP')), calls.slice(0, 5).join('|'));
check('canvas has "shared by"', calls.some(c => c.includes('shared by')));
check('canvas lists selected assignment', calls.some(c => c.includes('Try me — tap')), calls.join('|'));

/* --- author name printed last --- */
$('#slip-author').value = 'Priya';
$('#slip-author').dispatchEvent(new window.Event('input', { bubbles: true }));
check('author persisted to storage', store().settings.author === 'Priya', JSON.stringify(store().settings));
const lastTextCalls = calls.slice(-6);
check('author printed near end of drawing', lastTextCalls.some(c => c.includes('Priya')), lastTextCalls.join('|'));

/* --- text version --- */
const txt = window.eval('slipAsText()');
check('text slip has header', txt.includes('ASSIGNMENT SLIP'), txt.slice(0, 40));
check('text slip has author', txt.includes('Priya'));
check('text slip marks pending', txt.includes('PENDING'));

/* --- only selected items included --- */
check('selected assignment in text slip', txt.includes('Try me'), txt.slice(0, 120));
check('unselected assignment not in slip', !txt.includes('OS assignment 2'), txt);

click($('#slip-close'));
check('slip closes', $('#slip-backdrop').hidden === true);
click($('#sel-clear'));
check('clear empties selection', $('#sel-count').textContent === '0 selected');
click($('#btn-select-mode'));
check('selection mode off', $('#selbar').hidden === true);

/* ================= absence reason + backdated ================= */
click($('.nav-btn[data-nav="attendance"]'));
click($('[data-mark="0"]'));   // absent → should open reason modal
check('absence modal opens', $('#modal-backdrop').hidden === false);
check('reason field present', !!$('#modal-form [name=reason]'));
check('backdated toggle present', !!$('#modal-form [name=backdated]'));

// submitting with no reason must be blocked
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('empty reason rejected', $('#modal-backdrop').hidden === false && store().attendance.filter(a => !a.present).length === 0);

$('#modal-form [name=reason]').value = 'Had a fever, went to clinic';
$('#modal-form [name=backdated]').checked = true;
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const abs1 = store().attendance.filter(a => !a.present);
check('absence saved with reason', abs1.length === 1 && abs1[0].reason === 'Had a fever, went to clinic', JSON.stringify(abs1));
check('backdated flag saved', abs1[0].backdated === true);
check('modal closed', $('#modal-backdrop').hidden === true);

// second absence, not eligible
click($('[data-mark="0"]'));
$('#modal-form [name=reason]').value = 'Went to a hackathon';
$('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const abs2 = store().attendance.filter(a => !a.present);
check('second absence saved as not eligible', abs2.length === 2 && abs2.filter(a => a.backdated).length === 1, JSON.stringify(abs2));

// present still marks without a modal
const presentBefore = store().attendance.filter(a => a.present).length;
click($('[data-mark="1"]'));
check('present marks directly (no modal)', store().attendance.filter(a => a.present).length === presentBefore + 1 && $('#modal-backdrop').hidden === true);

/* ================= subject analysis ================= */
click($('[data-analyze]'));
check('analysis view opens', $('#view-analysis').hidden === false);
check('analysis body rendered', $('#analysis-body').textContent.length > 40);
const body = $('#analysis-body').innerHTML;
check('shows percentage', /analysis-pct/.test(body));
check('shows 75% target marker', body.includes('target-marker') && body.includes('left:75%'));
check('shows requirement verdict', body.includes('75%'), body.slice(0, 200));
check('shows attended/absent/total', body.includes('Attended') && body.includes('Absent') && body.includes('Total held'));
check('shows class history', body.includes('week-cell'));
check('shows absence reasons', body.includes('Had a fever'), body.slice(0, 400));
check('shows backdated eligibility label', body.includes('eligible for backdating'));
check('shows not-eligible label', body.includes('not eligible'));

/* verdict math: fresh instance seeded below 75% */
check('targetPlan needs classes when below target', (() => {
  const p = window.eval('JSON.stringify(targetPlan(6,10))');
  const o = JSON.parse(p);
  return o.atTarget === false && o.needed > 0;
})(), window.eval('JSON.stringify(targetPlan(6,10))'));

check('targetPlan allows misses when above target', (() => {
  const p = window.eval('JSON.stringify(targetPlan(90,100))');
  const o = JSON.parse(p);
  return o.atTarget === true && o.canMiss === 20;
})(), window.eval('JSON.stringify(targetPlan(90,100))'));

/* --- fresh boot with a below-target subject --- */
const dom2 = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  runScripts: 'outside-only', url: 'https://localhost/', pretendToBeVisual: true
});
const w2 = dom2.window;
w2.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
w2.confirm = () => true; w2.scrollTo = () => {};
const bootErr = [];
try {
  const semId = 'sem1', subId = 'sub1';
  const recs = [];
  for (let i = 0; i < 10; i++) {
    recs.push({ id: 'r' + i, subjectId: subId, semId, date: '2026-09-' + String(i + 1).padStart(2, '0'),
      present: i < 6, reason: i >= 6 ? 'Late to campus' : '', backdated: i === 9 });
  }
  w2.localStorage.setItem('student-command-centre-v1', JSON.stringify({
    semesters: [{ id: semId, name: 'Semester 1' }], currentSemesterId: semId,
    subjects: [{ id: subId, semId, name: 'Mathematics', code: 'MA-201', teacher: '' }],
    attendance: recs, assignments: [], exams: [], links: [], notes: [],
    settings: { author: '' }
  }));
  w2.eval(fs.readFileSync('app.js', 'utf8'));
} catch (e) { bootErr.push(e.message); }

check('below-target instance boots', bootErr.length === 0, bootErr.join('|'));
const d2 = w2.document;
const click2 = el => el.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
click2(d2.querySelector('.nav-btn[data-nav="attendance"]'));
const pctShown = d2.querySelector('#attendance-list').textContent;
check('60% shown on attendance row', pctShown.includes('60%'), pctShown.slice(0, 120));
click2(d2.querySelector('[data-analyze]'));
check('analysis opens in instance 2', d2.querySelector('#view-analysis').hidden === false);
const anaText = d2.querySelector('#analysis-body').textContent;
check('60% shown in analysis', anaText.includes('60%'), anaText.slice(0, 200));
check('below-target verdict rendered', /Attend the next \d+ classes/.test(anaText), anaText.slice(0, 300));
check('verdict warns about 75%', anaText.includes('75%'), anaText.slice(0, 300));
check('absent count correct', d2.querySelector('#analysis-body').innerHTML.includes('<b style="color:var(--red)">4</b>'), anaText.slice(0, 300));
check('backdated reason listed', anaText.includes('Late to campus'));
check('history strip has 10 cells', d2.querySelectorAll('.week-cell').length === 10, String(d2.querySelectorAll('.week-cell').length));
check('history cells colour-coded', d2.querySelectorAll('.week-cell.present').length === 6 && d2.querySelectorAll('.week-cell.absent').length === 4,
  `${d2.querySelectorAll('.week-cell.present').length}/${d2.querySelectorAll('.week-cell.absent').length}`);

/* back button */
click($('#btn-analysis-back'));
check('back returns to attendance', $('#view-attendance').hidden === false);

/* attendance row links to analysis */
const rowBtn = $('[data-analyze]');
check('attendance rows expose analysis button', !!rowBtn);

/* ================= report ================= */
console.log('\n' + results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (errors.length) console.log('\nERRORS:\n' + errors.join('\n'));
process.exit(failed || errors.length ? 1 : 0);
