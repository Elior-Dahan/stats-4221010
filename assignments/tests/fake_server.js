// Local stand-in for the deployed Apps Script web app, for rehearsing live_e2e.py offline.
// Run: node assignments/tests/fake_server.js [port]   (default 8787)
// Then: python assignments/tests/live_e2e.py http://localhost:8787 --auto-admin
// Besides the real API it accepts {"action":"__admin","step":...} to play the admin's menu clicks.
const http = require('http');
const { makeEnv } = require('./fake_google');

const E = makeEnv();
const C = E.ctx;
C.setup();

const admin = {
  prepare() {                       // what the guide asks the admin to set before the dry run
    C.setSetting_('AUTH_MODE', 'register');
    C.setSetting_('SUBMIT_DEADLINE', new Date(Date.now() + 864e5));
    C.setSetting_('REVIEW_OPEN', '');
    C.setSetting_('RESULTS_PUBLISHED', 'FALSE');
  },
  addStudents(rows) {
    rows.forEach(r => E.sheets.Students.appendRow([r[0], r[1], r[2] || '', '', '', '', '']));
  },
  closeAndAssign() {
    C.setSetting_('SUBMIT_DEADLINE', new Date(Date.now() - 60e3));
    C.assignReviewers();
  },
  grade() {
    C.refreshFlags();
    const sh = E.sheets.Flags;
    for (let i = 1; i < sh.d.length; i++) if (sh.d[i] && sh.d[i][0]) sh.d[i][3] = 'TRUE';
    C.computeGrades();
    C.setSetting_('RESULTS_PUBLISHED', 'TRUE');
  },
  exportAndReset() {
    C.exportData();
    const ex = JSON.stringify(E.sheets.Export_Students.d) + JSON.stringify(E.sheets.Export_Reviews.d);
    const leaks = C.table_('Students').filter(s => ex.includes(s.student_id) || ex.includes(s.name)).length +
      E.sheets.Export_Students.d.slice(1).filter(r => r && !r[0]).length;   // rows without an anonymous id
    C.resetTestData();
    return { exportLeaks: leaks, questionsLeft: C.table_('Questions').length };
  }
};

const port = Number(process.argv[2]) || 8787;
http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let out;
    try {
      const msg = JSON.parse(body || '{}');
      if (msg.action === '__admin') {
        out = { ok: true, result: admin[msg.step](msg.rows) || null, alert: C.lastAlert || '' };
      } else {
        out = JSON.parse(C.doPost({ postData: { contents: body } }).s);
      }
    } catch (e) {
      out = { ok: false, error: String(e && e.stack || e) };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}).listen(port, () => console.log('fake assignment server on http://localhost:' + port));
