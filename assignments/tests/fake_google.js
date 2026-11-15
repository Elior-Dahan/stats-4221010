// In-memory fakes of the Google services the backend uses, plus a loader for Code.gs + Logic.gs.
// Used by backend.test.js and fake_server.js.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
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
    deleteRow(r) { this.d.splice(r - 1, 1); }
    insertRowBefore(r) { this.d.splice(r - 1, 0, []); }
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet: s => delete sheets[s.n] };
  const files = {}; let fid = 0; const mail = [];
  const ctx = {
    console, Math, Date, JSON, String, Number, Object, Array, isFinite, isNaN, Error,
    SpreadsheetApp: { getActive: () => ss, getUi: () => ({ alert: (m) => { ctx.lastAlert = m; return 'YES'; }, prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => 'מחק' }), ButtonSet: {}, Button: { YES: 'YES', OK: 'OK' }, createMenu: () => ({}) }),
      newDataValidation: () => ({ requireValueInList: () => ({ build: () => ({}) }) }) },
    DriveApp: {
      createFolder: () => ({ getId: () => 'FOLDER' }),
      getFolderById: () => ({
        createFile: (blob) => { const id = 'F' + (++fid); files[id] = blob; return { getId: () => id }; },
        getFiles: () => { const ids = Object.keys(files).filter(k => !files[k].trashed); let i = 0; return { hasNext: () => i < ids.length, next: () => { const id = ids[i++]; return { setTrashed: () => { files[id].trashed = true; } }; } }; }
      }),
      getFileById: (id) => ({ getBlob: () => files[id], setTrashed: () => { files[id].trashed = true; } })
    },
    Utilities: {
      base64Decode: s => Array.from(Buffer.from(s, 'base64')).map(b => b > 127 ? b - 256 : b),
      base64Encode: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64'),
      newBlob: (bytes) => { const b = { bytes, setName(n) { b.name = n; return b; }, getBytes: () => bytes }; return b; },
      computeDigest: (_a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      formatDate: (d) => d.toISOString().slice(0, 10)
    },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (m) => mail.push(m) }
  };
  vm.createContext(ctx);
  ['Logic.gs', 'Code.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^const /gm, 'var '), ctx));
  return { ctx, sheets, files, mail };
}

module.exports = { makeEnv };
