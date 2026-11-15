// End-to-end test of the Apps Script backend against in-memory fakes of the Google services.
// Run: node assignments/tests/backend.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');

function makeEnv() {
  const sheets = {};
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(((this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j]) ?? ''); out.push(row); } return out; }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; while (this.sh.d.length <= R) this.sh.d.push([]); this.sh.d[R][this.c - 1 + j] = x; })); return this; }
    setValue(x) { return this.setValues([[x]]); }
    clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = this.sh.d[this.r - 1 + i]; if (row) row[this.c - 1 + j] = ''; } return this; }
    clearDataValidations() { return this; } setDataValidation() { return this; } setNumberFormat() { return this; } setFontWeight() { return this; }
  }
  class Sheet {
    constructor(n) { this.n = n; this.d = []; }
    getLastRow() { let l = 0; this.d.forEach((r, i) => { if (r && r.some(v => v !== '' && v != null)) l = i + 1; }); return l; }
    getLastColumn() { return Math.max(0, ...this.d.map(r => r ? r.length : 0)); }
    getRange(a, b, c, d) { if (typeof a === 'string') return new Range(this, 1, 1, 1000, 1); return new Range(this, a, b, c, d); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
    appendRow(row) { this.d[this.getLastRow()] = row.slice(); }
    clearContents() { this.d = []; } setFrozenRows() {}
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet: s => delete sheets[s.n] };
  const files = {}; let fid = 0; const mail = [];
  const ctx = {
    console, Math, Date, JSON, String, Number, Object, Array, isFinite, isNaN, Error,
    SpreadsheetApp: { getActive: () => ss, getUi: () => ({ alert: (m) => { ctx.lastAlert = m; return 'YES'; }, ButtonSet: {}, Button: { YES: 'YES' }, createMenu: () => ({}) }),
      newDataValidation: () => ({ requireValueInList: () => ({ build: () => ({}) }) }) },
    DriveApp: {
      createFolder: () => ({ getId: () => 'FOLDER' }),
      getFolderById: () => ({ createFile: (blob) => { const id = 'F' + (++fid); files[id] = blob; return { getId: () => id }; } }),
      getFileById: (id) => ({ getBlob: () => files[id], setTrashed: () => { files[id].trashed = true; } })
    },
    Utilities: {
      base64Decode: s => Array.from(Buffer.from(s, 'base64')).map(b => b > 127 ? b - 256 : b),
      base64Encode: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64'),
      newBlob: (bytes) => { const b = { bytes, setName(n) { b.name = n; return b; }, getBytes: () => bytes }; return b; },
      computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (m) => mail.push(m) }
  };
  vm.createContext(ctx);
  ['Logic.gs', 'Code.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^const /gm, 'var '), ctx));
  return { ctx, sheets, files, mail };
}

const E = makeEnv();
const C = E.ctx;
const call = (body) => JSON.parse(C.doPost({ postData: { contents: JSON.stringify(body) } }).s);
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
const files = { question: { name: 'q.pdf', data: pdf }, solution: { name: 's.pdf', data: pdf } };
const pdfWithAuthor = Buffer.from('%PDF-1.4\n1 0 obj << /Author (stu A) /Title (by A) >> endobj\n%%EOF').toString('base64');

C.setup();
// roster: 9 students
const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
names.forEach((n, i) => E.sheets.Students.appendRow([String(100000001 + i), 'stu ' + n, n.toLowerCase() + '@x.com', '', '', '', '']));
C.ensureAnonIds_();
const id = (n) => String(100000001 + names.indexOf(n));
const nm = (n) => 'stu ' + n;
const cred = (n) => ({ id: id(n), secret: 'pass-' + n });
const qn = { gender: 'אחר', age: 22, height_cm: 171, study_year: 2, gpa: 85, study_hours: 3, screen_est_min: 200, screen_actual_min: 250, predicted_score: 75 };

assert.strictEqual(call({ action: 'config' }).authMode, 'code');
C.setSetting_('AUTH_MODE', 'register');
assert.strictEqual(call({ action: 'config' }).authMode, 'register');
assert.ok(C.settings_().SUBMIT_DEADLINE instanceof Date, 'default deadline is a date');
C.setSetting_('SUBMIT_DEADLINE', '');
assert.ok(!call({ action: 'register', id: '999999999', secret: 'xxxxxx' }).ok, 'unknown id rejected');
names.forEach(n => assert.ok(call(Object.assign({ action: 'register' }, cred(n))).ok, 'register ' + n));
assert.ok(!call({ action: 'register', id: id('A'), secret: 'again!' }).ok, 'double register rejected');
assert.ok(!call({ action: 'login', id: id('A'), secret: 'wrong' }).ok, 'bad password rejected');
assert.ok(call(Object.assign({ action: 'login' }, cred('A'))).ok);

// pairs: A uploads with B; B confirms without files. C+D: D uploads. E,F,G,H,I alone. I tries pair with A (taken).
let r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: '  B   stu ', questionnaire: qn, files }, cred('A')));
assert.ok(r.ok, r.error);
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('A'), questionnaire: qn }, cred('B')));
assert.ok(r.ok, r.error); assert.strictEqual(r.state.question.iAmUploader, false);
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('D'), questionnaire: qn }, cred('C')));
assert.ok(!r.ok, 'C cannot confirm before D uploads');
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: 'stu Z', questionnaire: qn, files }, cred('C')));
assert.ok(!r.ok && r.error.includes('אין בקורס'), 'unknown partner name: ' + r.error);
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('C'), questionnaire: qn, files }, cred('C')));
assert.ok(!r.ok, 'own name as partner rejected');
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('C'), questionnaire: qn, files }, cred('D')));
assert.ok(r.ok, r.error);
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('D'), questionnaire: qn }, cred('C')));
assert.ok(r.ok, r.error);
['E', 'F', 'G', 'H'].forEach(n => { const x = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: qn, files }, cred(n))); assert.ok(x.ok, x.error); });
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('A'), questionnaire: qn, files }, cred('I')));
assert.ok(!r.ok, 'I cannot join A+B: ' + r.error);
r = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: Object.assign({}, qn, { predicted_score: '' }), files }, cred('I')));
assert.ok(!r.ok, 'predicted score required');
r = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: Object.assign({}, qn, { gpa: 'NA' }), files }, cred('I')));
assert.ok(!r.ok, 'every questionnaire field is required');
r = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: qn, files: { question: { data: Buffer.from('hello').toString('base64') }, solution: files.solution } }, cred('I')));
assert.ok(!r.ok, 'non-PDF rejected');
r = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: qn, files }, cred('I')));
assert.ok(r.ok, r.error);
// author metadata is blanked server-side
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('B'), questionnaire: qn, files: { question: { data: pdfWithAuthor }, solution: files.solution } }, cred('A')));
assert.ok(r.ok, r.error);
const qRow = C.table_('Questions').find(q => q.uploader_id === id('A'));
const saved = Buffer.from(E.files[qRow.question_file_id].bytes.map(b => (b + 256) % 256)).toString('latin1');
assert.ok(!saved.includes('stu A') && saved.includes('/Author ('), 'author blanked: ' + saved);
// A re-uploads: same question id, old files trashed
const qA = C.table_('Questions').find(q => q.uploader_id === id('A')).question_id;
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: '  B   stu ', questionnaire: qn, files }, cred('A')));
assert.ok(r.ok); assert.strictEqual(r.state.question.id, qA);
assert.strictEqual(C.table_('Questions').length, 7);

// review stage: assign, then close submission
C.assignReviewers();
const asg = C.table_('Assignments');
assert.strictEqual(asg.length, 9 * 4);
const authorsOf = {}; C.table_('Questions').forEach(q => { [q.uploader_id, q.partner_id].filter(Boolean).forEach(s => { authorsOf[s] = q.question_id; }); });
asg.forEach(a => assert.notStrictEqual(authorsOf[a.reviewer_id], a.question_id, 'own question assigned'));
const loads = {}; asg.forEach(a => { loads[a.question_id] = (loads[a.question_id] || 0) + 1; });
assert.ok(Math.max(...Object.values(loads)) - Math.min(...Object.values(loads)) <= 1, 'balanced loads ' + JSON.stringify(loads));
C.setSetting_('SUBMIT_DEADLINE', new Date(Date.now() - 1000));
assert.ok(!call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: qn, files }, cred('E'))).ok, 'closed after deadline');

// file access: assigned reviewer yes, other no; solution open is logged
const a0 = asg.find(a => a.reviewer_id === id('E'));
const notMine = Object.values(authorsOf).find(q => !asg.some(a => a.reviewer_id === id('E') && a.question_id === q) && q !== authorsOf[id('E')]);
assert.ok(call(Object.assign({ action: 'file', question: a0.question_id, kind: 'question' }, cred('E'))).ok);
assert.ok(!call(Object.assign({ action: 'file', question: notMine, kind: 'question' }, cred('E'))).ok, 'unassigned file blocked');
assert.ok(call(Object.assign({ action: 'file', question: a0.question_id, kind: 'solution' }, cred('E'))).ok);
assert.ok(C.table_('Assignments').find(a => a.reviewer_id === id('E') && a.question_id === a0.question_id).solution_opened_at, 'solution opening logged');

// everyone but H submits reviews; "quality" = fixed hidden order, so ranks are consistent
const quality = {}; Object.values(authorsOf).forEach((q, i) => { quality[q] = i; });
const just = 'x'.repeat(90);
names.filter(n => n !== 'H').forEach(n => {
  const mine = C.table_('Assignments').filter(a => a.reviewer_id === id(n));
  const items = mine.map(a => ({ question: a.question_id, score: 50 + quality[a.question_id], flagged: false }));
  const ranking = mine.map(a => a.question_id).sort((x, y) => quality[y] - quality[x]);
  if (n === 'A') { items[0].flagged = true; items[0].flagText = 'סעיף ג שגוי, התשובה 3/7'; }
  const x = call(Object.assign({ action: 'submitReview', items, ranking, justification: just }, cred(n)));
  assert.ok(x.ok, n + ': ' + x.error);
});
r = call(Object.assign({ action: 'submitReview', items: [], ranking: [], justification: just }, cred('H')));
assert.ok(!r.ok, 'incomplete review rejected');

C.refreshFlags();
const flags = C.table_('Flags'); assert.strictEqual(flags.length, 1);
E.sheets.Flags.d[1][3] = 'TRUE';
C.computeGrades();
const grades = C.table_('Grades');
const g = (n) => grades.find(x => x.student_id === id(n));
assert.strictEqual(g('A').bonus, 0.5);
assert.strictEqual(g('H').competitive_points, 0, 'H did not review');
assert.strictEqual(String(g('H').review_complete), 'false');
assert.strictEqual(g(names.find(n => authorsOf[id(n)] === flags[0].question_id)).valid_points, 0, 'confirmed error removes 3 points');
assert.strictEqual(g('A').question_id, g('B').question_id);
grades.forEach(x => assert.strictEqual(Number(x.total), Number(x.valid_points) + Number(x.competitive_points) + Number(x.bonus)));
console.log(grades.map(x => [x.name, x.question_id, x.mean_rank, x.tier_points, x.competitive_points, x.bonus, x.total].join(' | ')).join('\n'));

C.setSetting_('RESULTS_PUBLISHED', 'TRUE');
r = call(Object.assign({ action: 'state' }, cred('A')));
assert.strictEqual(r.state.results.total, Number(g('A').total));

C.exportData();
const ex = C.table_('Export_Students');
assert.strictEqual(ex.length, 9);
assert.ok(!JSON.stringify(E.sheets.Export_Students.d).includes('1000000'), 'no IDs in export');
assert.ok(!JSON.stringify(E.sheets.Export_Reviews.d).includes('stu '), 'no names in export');
console.log('\nALL BACKEND TESTS PASSED');
