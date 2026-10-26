/* Verifies the slip canvas: every drawn line advances downward, none overlap,
   text stays inside the paper, and the writer name is printed last. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  runScripts: 'outside-only', url: 'https://localhost/', pretendToBeVisual: true
});
const { window } = dom;
const doc = window.document;

const textOps = [];
const fakeCtx = {
  setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  arcTo() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {},
  setLineDash() {},
  fillText(text, x, y) { textOps.push({ text, x, y, font: this.font, textAlign: this.textAlign }); },
  measureText(t) { return { width: String(t).length * 6.5 }; },
  font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: 'left'
};
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toBlob = cb => cb(new window.Blob(['']));
window.confirm = () => true;
window.scrollTo = () => {};

const errs = [];
window.onerror = m => errs.push(m);
try { window.eval(fs.readFileSync('app.js', 'utf8')); }
catch (e) { errs.push('BOOT ' + e.message); }

const results = [];
const check = (n, c, x = '') => {
  results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  → ' + x}`);
  if (!c) errs.push(n);
};
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

check('app boots', errs.length === 0, errs.join('|'));

/* seed a realistic set: 3 assignments, mixed states, long titles */
const titles = [
  ['Data Structures lab record — pointer arithmetic and memory allocation', '2026-11-05', 'ER diagram + SQL queries for the university database schema, plus normalization up to BCNF and a short report on indexing strategies used in the project', false],
  ['OS assignment 2', '2026-11-12', '', true],
  ['Physics record', '2026-11-20', 'Some details here', false]
];

click($('.nav-btn[data-nav="assignments"]'));
for (const [title, dl, details, done] of titles) {
  click($('[data-add="assignment"]'));
  $('#modal-form [name=title]').value = title;
  $('#modal-form [name=deadline]').value = dl;
  if (details) $('#modal-form [name=details]').value = details;
  if (done) $('#modal-form [name=done]').checked = true;
  $('#modal-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}
check('4 assignments (1 seeded + 3 added)', JSON.parse(window.localStorage.getItem('student-command-centre-v1')).assignments.length === 4, String(JSON.parse(window.localStorage.getItem('student-command-centre-v1')).assignments.length));

click($('#assignment-filter [data-filter="all"]'));   // default filter hides the done one
click($('#btn-select-mode'));
const pickAll = n => { for (let i = 0; i < n; i++) click($$('#assignment-list .item')[i]); };
pickAll(4);   // list re-renders on every pick — always re-query
check('all 4 selected', $('#sel-count').textContent === '4 selected', $('#sel-count').textContent);

click($('#sel-share'));
$('#slip-author').value = 'Priya';
$('#slip-author').dispatchEvent(new window.Event('input', { bubbles: true }));
// clear the two renders so far, then capture one clean draw
textOps.length = 0;
window.eval('renderSlipCanvas()');
check('slip opened', $('#slip-backdrop').hidden === false);
check('canvas ops recorded', textOps.length > 5, String(textOps.length));

/* --- 1. vertical positions must be non-decreasing (no pile-up) --- */
let overlap = null;
for (let i = 1; i < textOps.length; i++) {
  const d = textOps[i].y - textOps[i - 1].y;
  if (d < -0.5) { overlap = `${textOps[i - 1].text} @${textOps[i - 1].y} then ${textOps[i].text} @${textOps[i].y}`; break; }
}
check('lines drawn top-to-bottom in order', !overlap, overlap);

/* --- 2. no two labels on the same line may overlap horizontally --- */
const widthOf = o => String(o.text).length * 6.5;
const spanOf = o => {
  const w = widthOf(o);
  if (o.textAlign === 'center') return [o.x - w / 2, o.x + w / 2];
  if (o.textAlign === 'right') return [o.x - w, o.x];
  return [o.x, o.x + w];
};
// capture textAlign at draw time
const realFill = fakeCtx.fillText;
let collisions = [];
for (let i = 0; i < textOps.length; i++) {
  for (let j = i + 1; j < textOps.length; j++) {
    const a = textOps[i], b = textOps[j];
    if (Math.abs(a.y - b.y) > 8) continue;   // not on the same visual line
    const [a0, a1] = spanOf(a), [b0, b1] = spanOf(b);
    if (a0 < b1 - 1 && b0 < a1 - 1) {
      collisions.push(`"${a.text}"[x ${a0 | 0}-${a1 | 0}] vs "${b.text}"[x ${b0 | 0}-${b1 | 0}] @y${a.y | 0}`);
    }
  }
}
check('no two labels collide on the same line', collisions.length === 0, collisions.join(' ;; '));

/* --- 3. total spread must cover the whole slip --- */
const ys = textOps.map(o => o.y);
const spread = Math.max(...ys) - Math.min(...ys);
check('content spreads down the slip (>=200px)', spread >= 200, `spread=${spread}`);

/* --- 4. canvas is tall enough for its content --- */
const cv = $('#slip-canvas');
check('canvas has real height', cv.height > 300, String(cv.height));
check('canvas is 2x for sharpness', cv.width === 680, String(cv.width));
check('canvas taller than wide-ish (portrait receipt)', cv.height > cv.width * 0.8, `${cv.width}x${cv.height}`);

/* --- 5. writer name is the LAST thing drawn --- */
const last = textOps[textOps.length - 1].text;
check('writer name printed last', last === 'Priya', `last="${last}"`);
check('"shared by" sits just above the name', textOps[textOps.length - 2].text === 'shared by',
  `before-last="${textOps[textOps.length - 2].text}"`);

/* --- 6. required slip content present and ordered --- */
const findIdx = t => textOps.findIndex(o => o.text === t);
check('header first', findIdx('ASSIGNMENT SLIP') === 0, String(findIdx('ASSIGNMENT SLIP')));
const headerY = textOps[findIdx('ASSIGNMENT SLIP')].y;
const subY = textOps[findIdx('Student Command Centre')].y;
check('subtitle under header', subY > headerY, `${headerY} vs ${subY}`);
check('4 assignments listed', textOps.filter(o => /^0[1-4]$/.test(o.text)).length === 4,
  textOps.filter(o => /^0[1-4]$/.test(o.text)).join(','));
check('TOTAL row present', textOps.some(o => o.text === 'TOTAL'));
check('total shows counts', textOps.some(o => /\d+ done · \d+ pending/.test(o.text)),
  textOps.map(o => o.text).join('|'));

/* --- 7. badges present with correct status --- */
check('PENDING badge shown', textOps.some(o => o.text === 'PENDING'));
check('DONE badge shown', textOps.some(o => o.text === 'DONE'));

/* --- 8. long title wrapped, never drawn past the right margin --- */
const W = 340, padX = 22;
const overflow = textOps.filter(o => o.x > W - padX + 1);
check('no text drawn past right margin', overflow.length === 0,
  overflow.map(o => `${o.text}@x=${o.x}`).join(','));
const leftOverflow = textOps.filter(o => o.x < padX - 1);
check('no text drawn past left margin', leftOverflow.length === 0,
  leftOverflow.map(o => `${o.text}@x=${o.x}`).join(','));

const dsTitle = 'Data Structures lab record';
const dsOps = textOps.filter(o => o.font.includes('600 13px') && o.x === padX + 26);
check('titles drawn in the title font', dsOps.length >= 3, `lines=${dsOps.length}`);
const wrappedIndent = dsOps.every(o => o.x === padX + 26);
check('wrapped lines share the same indent', wrappedIndent, dsOps.map(o => o.x).join(','));
const dsWrapped = textOps.some(o => o.text.startsWith(dsTitle)) &&
  textOps.some(o => o.font.includes('600 13px') && !o.text.startsWith(dsTitle) && o.x === padX + 26);
check('long title wrapped across lines', dsWrapped, textOps.map(o => o.text).join('|'));

/* --- 9. text version still sane --- */
const txt = window.eval('slipAsText()');
check('text slip lists all 4', (txt.match(/\n\s*\d\d\./g) || []).length === 4, txt.slice(0, 300));

console.log('\n' + results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (errs.length) console.log('\nERRORS:\n' + errs.join('\n'));
process.exit(failed ? 1 : 0);
