// End-to-end test of the Apps Script backend against in-memory fakes of the Google services.
// Run: node assignments/tests/backend.test.js
const assert = require('assert');
const { makeEnv } = require('./fake_google');

const E = makeEnv();
const C = E.ctx;
const call = (body) => JSON.parse(C.doPost({ postData: { contents: JSON.stringify(body) } }).s);
const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
const files = { question: { name: 'q.pdf', data: pdf }, solution: { name: 's.pdf', data: pdf } };
const pdfWithAuthor = Buffer.from('%PDF-1.4\n1 0 obj << /Author (stu A) /Title (by A) >> endobj\n%%EOF').toString('base64');

C.setup();
// a sheet made by an older version lacks the newest column: running setup again adds it
E.sheets.Students.d[0].pop(); E.sheets.Feedback.d = [];
C.setup();
assert.ok(E.sheets.Students.d[0].includes('feedback_done') && E.sheets.Feedback.d[0][0] === 'learned_1to5', 'setup upgrades old sheets');
// roster: 9 students
const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
names.forEach((n, i) => E.sheets.Students.appendRow([String(100000001 + i), 'stu ' + n, n.toLowerCase() + '@x.com', '', '', '', '']));
C.ensureAnonIds_();
const id = (n) => String(100000001 + names.indexOf(n));
const nm = (n) => 'stu ' + n;
const cred = (n) => ({ id: id(n), secret: 'pass-' + n });
const qn = { gender: 'נקבה', age: 22, height_cm: 171, study_hours: 3, screen_est_min: 200, screen_actual_min: 250, predicted_score: 75 };

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
// an upper-case code typed in lower case still works
E.sheets.Students.appendRow(['300000001', 'קוד בדיקה', 'k@x.y', 'SCODE01', C.hash_('salt1', 'K7P2QX'), 'salt1', '']);
assert.ok(call({ action: 'login', id: '300000001', secret: 'k7p2qx' }).ok, 'code is case-insensitive');
assert.ok(!call({ action: 'login', id: '300000001', secret: 'k7p2qy' }).ok, 'wrong code still refused');
E.sheets.Students.d.pop();

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
r = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: Object.assign({}, qn, { height_cm: '' }), files }, cred('I')));
assert.ok(!r.ok, 'every questionnaire field is required');
r = call(Object.assign({ action: 'submitStageA', workMode: 'alone', questionnaire: Object.assign({}, qn, { gender: 'אחר' }), files }, cred('I')));
assert.ok(!r.ok, 'gender is male/female only');
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
// approved group of three: the TA writes J's ID in extra_author_id of A's question
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('A'), questionnaire: qn }, cred('J')));
assert.ok(!r.ok, 'J cannot join before the TA adds them');
{
  const row = C.table_('Questions').find(q => q.uploader_id === id('A'));
  C.updateRow_('Questions', row._row, { extra_author_id: id('J') });
}
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('A'), questionnaire: qn }, cred('J')));
assert.ok(r.ok, 'J confirms as third member: ' + r.error);
assert.strictEqual(r.state.question.uploader, nm('A'));
assert.ok(r.state.question.partner.includes(nm('B')) && r.state.question.partner.includes(nm('J')), 'the group sees all three names');
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: nm('A'), questionnaire: qn, files }, cred('J')));
assert.ok(!r.ok, 'the third member cannot replace the files');
{
  const sc = call(Object.assign({ action: 'state' }, cred('C'))).state.question;
  assert.ok(sc.uploader === nm('D') && sc.partner === nm('C'), 'other groups are unaffected');
}
// A re-uploads: same question id, old files trashed
const qA = C.table_('Questions').find(q => q.uploader_id === id('A')).question_id;
r = call(Object.assign({ action: 'submitStageA', workMode: 'pair', partnerName: '  B   stu ', questionnaire: qn, files }, cred('A')));
assert.ok(r.ok); assert.strictEqual(r.state.question.id, qA);
assert.strictEqual(C.table_('Questions').length, 7);

// review stage: assign, then close submission
C.checkPairs();
assert.strictEqual(C.lastAlert, 'אין בעיות בזוגות.', 'pair check accepts the group of three: ' + C.lastAlert);
C.assignReviewers();
const asg = C.table_('Assignments');
assert.strictEqual(asg.length, 10 * 4);
{
  const qA0 = C.table_('Questions').find(q => q.uploader_id === id('A')).question_id;
  assert.ok(!asg.some(a => a.reviewer_id === id('J') && a.question_id === qA0), 'J never reviews their own group question');
  assert.ok(C.table_('Questions').find(q => q.uploader_id === id('A')).extra_author_id === id('J'), 're-upload keeps the third member');
}
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

// partner name without a middle name
E.sheets.Students.appendRow(['200000001', 'אלעד יוסף בראון', 'x@y.z', 'SMID001', '', '', '']);
E.sheets.Students.appendRow(['200000002', 'חן פרידמן', 'x2@y.z', 'SMID002', '', '', '']);
E.sheets.Students.appendRow(['200000003', 'תכלת חן פרידמן', 'x3@y.z', 'SMID003', '', '', '']);
assert.strictEqual(C.studentByName_('אלעד בראון').student_id, '200000001', 'middle name may be left out');
assert.strictEqual(C.studentByName_('בראון אלעד').student_id, '200000001', 'in any order');
assert.strictEqual(C.studentByName_('חן פרידמן').student_id, '200000002', 'exact full name wins over a partial match');
assert.throws(() => C.studentByName_('בראון'), /אין בקורס/, 'one word is not enough');
[200000003, 200000002, 200000001].forEach(() => E.sheets.Students.d.pop());
// anonymous feedback: once per student, no identity in the Feedback sheet
assert.ok(!call(Object.assign({ action: 'submitFeedback', learned: 6, fairness: 3 }, cred('A'))).ok, 'scale is 1-5');
['A', 'B', 'C'].forEach(n => assert.ok(call(Object.assign({ action: 'submitFeedback', learned: 4, fairness: 3, comment: 'הערה של ' + n }, cred(n))).ok, 'feedback ' + n));
assert.ok(!call(Object.assign({ action: 'submitFeedback', learned: 4, fairness: 3 }, cred('A'))).ok, 'feedback only once');
assert.strictEqual(call(Object.assign({ action: 'state' }, cred('A'))).state.feedback.done, true);
assert.strictEqual(call(Object.assign({ action: 'state' }, cred('D'))).state.feedback.done, false);
const fb = C.table_('Feedback');
assert.strictEqual(fb.length, 3);
assert.ok(!JSON.stringify(E.sheets.Feedback.d).match(/1000000|stu /), 'feedback holds no IDs or names');
assert.ok(fb.every(r => /^\d{4}-\d{2}-\d{2}$/.test(String(r.submitted_on))), 'date only, no time');
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
assert.strictEqual(g('J').question_id, g('A').question_id, 'J shares the group question');
assert.strictEqual(Number(g('J').valid_points), Number(g('A').valid_points));
grades.forEach(x => assert.strictEqual(Number(x.total), Number(x.valid_points) + Number(x.competitive_points) + Number(x.bonus)));
console.log(grades.map(x => [x.name, x.question_id, x.mean_rank, x.tier_points, x.competitive_points, x.bonus, x.total].join(' | ')).join('\n'));

C.setSetting_('RESULTS_PUBLISHED', 'TRUE');
r = call(Object.assign({ action: 'state' }, cred('A')));
assert.strictEqual(r.state.results.total, Number(g('A').total));

C.exportData();
const ex = C.table_('Export_Students');
assert.strictEqual(ex.length, 10);
assert.ok(!JSON.stringify(E.sheets.Export_Students.d).includes('1000000'), 'no IDs in export');
assert.ok(!JSON.stringify(E.sheets.Export_Reviews.d).includes('stu '), 'no names in export');
// reset after a dry run: test students (99999...) and all data go, real students stay
E.sheets.Students.appendRow(['999990001', 'בדיקה א', '', '', '', '', '']);
C.resetTestData();
assert.strictEqual(C.table_('Questions').length, 0);
assert.strictEqual(C.table_('Reviews').length, 0);
assert.strictEqual(C.table_('Feedback').length, 0, 'reset clears feedback');
assert.ok(!C.table_('Students').some(r => String(r.feedback_done) === 'true'), 'reset clears feedback flags');
assert.ok(!C.table_('Students').some(r => r.student_id.startsWith('99999')), 'test students removed');
assert.strictEqual(C.table_('Students').length, 10, 'real students kept');
assert.ok(Object.values(E.files).every(f => f.trashed), 'files trashed');
console.log('\nALL BACKEND TESTS PASSED');
