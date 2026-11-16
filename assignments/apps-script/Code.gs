/**
 * Assignment 1 (estimators): submission, peer review and grading backend.
 *
 * Runs as a Google Apps Script web app bound to a Google Sheet. The Sheet is the database
 * and the admin interface (custom menu "מטלה 1"). PDFs live in a private Drive folder and
 * are streamed to the page through this script, so students never see who uploaded them.
 *
 * Setup: see assignments/README.md.
 */

const TABS = {
  settings: 'Settings',
  students: 'Students',
  questionnaire: 'Questionnaire',
  questions: 'Questions',
  assignments: 'Assignments',
  reviews: 'Reviews',
  notes: 'RankNotes',
  flags: 'Flags',
  grades: 'Grades',
  feedback: 'Feedback',
  exportStudents: 'Export_Students',
  exportReviews: 'Export_Reviews'
};

const HEADERS = {
  Settings: ['key', 'value', 'note'],
  Students: ['student_id', 'name', 'email', 'anon_id', 'secret_hash', 'salt', 'registered_at', 'feedback_done'],
  Questionnaire: ['student_id', 'work_mode', 'partner_id', 'gender', 'age', 'height_cm',
    'study_hours', 'screen_est_min', 'screen_actual_min', 'predicted_score', 'submitted_at'],
  // extra_author_id: filled by hand by the TA only, for an approved group of three (students never see this option)
  Questions: ['question_id', 'uploader_id', 'partner_id', 'question_file_id', 'solution_file_id', 'created_at', 'updated_at', 'extra_author_id'],
  Assignments: ['reviewer_id', 'question_id', 'position', 'solution_opened_at'],
  Reviews: ['reviewer_id', 'question_id', 'position', 'score', 'unsolved', 'flagged', 'flag_text', 'rank', 'submitted_at'],
  RankNotes: ['reviewer_id', 'justification', 'submitted_at'],
  Flags: ['question_id', 'reviewer_id', 'flag_text', 'confirmed', 'ta_note'],
  Grades: ['student_id', 'name', 'question_id', 'valid_points', 'mean_rank', 'mean_score', 'n_reviews', 'tier_points',
    'review_complete', 'competitive_points', 'bonus', 'total', 'note'],
  // Anonymous: no student column, date without time, rows inserted at a random position.
  Feedback: ['learned_1to5', 'fairness_1to5', 'comment', 'submitted_on']
};

const DEFAULT_SETTINGS = [
  ['AUTH_MODE', 'code', 'code = קוד אישי נשלח במייל (תפריט: שליחת קודים). register = הסטודנט בוחר סיסמה בכניסה הראשונה (רק ת"ז שברשימה)'],
  ['SUBMIT_DEADLINE', new Date('2026-11-21T23:59:00+02:00'), 'מועד אחרון לשלב א'],
  ['REVIEW_OPEN', '', 'ריק = השיפוט נפתח ברגע שמריצים הקצאת שופטים'],
  ['REVIEW_DEADLINE', new Date('2026-11-28T23:59:00+02:00'), 'מועד אחרון לשלב ב'],
  ['RESULTS_PUBLISHED', 'FALSE', 'TRUE = הסטודנטים רואים את הציון שלהם (אחרי חישוב ציונים)'],
  ['REVIEWS_PER_STUDENT', 4, 'כמה שאלות כל סטודנט שופט'],
  ['MAX_FILE_MB', 10, 'גודל מקסימלי לכל PDF'],
  ['MIN_JUSTIFICATION_CHARS', 80, 'אורך מינימלי לנימוק הדירוג'],
  ['MIN_FLAG_CHARS', 15, 'אורך מינימלי להסבר של סימון טעות'],
  ['BONUS_PER_FLAG', 0.5, 'בונוס לכל טעות שאושרה'],
  ['BONUS_CAP', 1, 'תקרת הבונוס'],
  ['SITE_URL', '', 'כתובת עמוד המטלה (נכנסת למייל של הקודים)'],
  ['DRIVE_FOLDER_ID', '', 'נוצר אוטומטית בהגדרה הראשונית']
];

/* =========================== web app entry points =========================== */

function doGet() {
  return json_({ ok: true, service: 'assignment1' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'בקשה לא תקינה' });
  }
  try {
    const handler = API[req.action];
    if (!handler) throw userError_('פעולה לא מוכרת');
    return json_(Object.assign({ ok: true }, handler(req)));
  } catch (err) {
    if (err && err.userFacing) return json_({ ok: false, error: err.message });
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'שגיאה בשרת. נסו שוב, ואם זה חוזר פנו למתרגל.' });
  }
}

const API = {
  config: function () {
    const s = settings_();
    return { authMode: s.AUTH_MODE, deadlines: deadlines_(s), phase: phase_(s) };
  },

  register: function (req) {
    const s = settings_();
    if (s.AUTH_MODE !== 'register') throw userError_('ההרשמה סגורה. הכניסה היא עם הקוד שנשלח אליכם במייל.');
    const pw = String(req.secret || '');
    if (pw.length < 6) throw userError_('הסיסמה צריכה להכיל לפחות 6 תווים.');
    return withLock_(function () {
      const st = findStudent_(req.id);
      if (!st) throw userError_('תעודת הזהות לא נמצאה ברשימת הקורס. בדקו את המספר או פנו למתרגל.');
      if (st.secret_hash) throw userError_('כבר נרשמתם. היכנסו עם הסיסמה. שכחתם? פנו למתרגל לאיפוס.');
      const salt = randomToken_(16);
      updateRow_(TABS.students, st._row, { secret_hash: hash_(salt, pw), salt: salt, registered_at: new Date() });
      return { state: state_(findStudent_(req.id), s) };
    });
  },

  login: function (req) {
    const s = settings_();
    return { state: state_(auth_(req), s) };
  },

  state: function (req) {
    return { state: state_(auth_(req), settings_()) };
  },

  submitStageA: function (req) {
    const me = auth_(req);
    const s = settings_();
    if (!phase_(s).canSubmit) throw userError_('ההגשה לשלב א סגורה.');
    const q = validateQuestionnaire_(req.questionnaire || {});
    const pair = req.workMode === 'pair';
    let partner = null;
    if (pair) {
      partner = studentByName_(req.partnerName);
      if (partner.student_id === me.student_id) throw userError_('כתבתם את השם שלכם. כתבו את השם של השותף/ה.');
    }
    const files = req.files || null;
    return withLock_(function () {
      const questions = table_(TABS.questions);
      const mine = questions.find(r => authorsOf_(r).indexOf(me.student_id) >= 0) || null;
      const ofPartner = partner ? questions.find(r => authorsOf_(r).indexOf(partner.student_id) >= 0) || null : null;

      if (files) {
        if (mine && mine.extra_author_id === me.student_id) {
          throw userError_('את הקבצים של הקבוצה מעלים רק מי שהעלה אותם או השותף שלו. אם צריך שינוי, פנו למתרגל.');
        }
        if (mine && mine.partner_id === me.student_id && (!partner || mine.uploader_id !== partner.student_id)) {
          throw userError_('אתם רשומים כשותפים בהגשה של סטודנט אחר. אם זו טעות, פנו למתרגל.');
        }
        if (ofPartner && mine && ofPartner !== mine) {
          throw userError_('לכם ולשותף שבחרתם יש כבר הגשות נפרדות. פנו למתרגל כדי לאחד אותן.');
        }
        if (ofPartner && ofPartner !== mine) {
          const others = authorsOf_(ofPartner).filter(x => x !== partner.student_id);
          if (others.length && others[0] !== me.student_id) throw userError_('השותף שבחרתם כבר הגיש עם סטודנט אחר.');
        }
        const target = mine || ofPartner;
        const qf = checkPdf_(files.question, 'השאלה', s);
        const sf = checkPdf_(files.solution, 'הפתרון', s);
        const folder = DriveApp.getFolderById(String(s.DRIVE_FOLDER_ID));
        const qid = target ? target.question_id : 'Q' + randomToken_(6).toUpperCase();
        const qFile = folder.createFile(qf.setName(qid + '-question.pdf'));
        const sFile = folder.createFile(sf.setName(qid + '-solution.pdf'));
        const row = {
          question_id: qid, uploader_id: me.student_id, partner_id: partner ? partner.student_id : '',
          question_file_id: qFile.getId(), solution_file_id: sFile.getId(), updated_at: new Date()
        };
        if (target) {
          [target.question_file_id, target.solution_file_id].forEach(trashQuietly_);
          updateRow_(TABS.questions, target._row, row);
        } else {
          row.created_at = new Date();
          appendRow_(TABS.questions, row);
        }
      } else {
        if (pair) {
          if (!ofPartner || authorsOf_(ofPartner).indexOf(me.student_id) < 0) {
            throw userError_('השותף שבחרתם עוד לא העלה את הקבצים, או שלא ציין אתכם כשותפים. אחד מבני הזוג צריך להעלות את השאלה והפתרון ולבחור את השני כשותף.');
          }
        } else if (!mine || mine.uploader_id !== me.student_id) {
          throw userError_('יש להעלות את קובץ השאלה ואת קובץ הפתרון.');
        }
      }

      q.student_id = me.student_id;
      q.work_mode = pair ? 'pair' : 'alone';
      q.partner_id = partner ? partner.student_id : '';
      q.submitted_at = new Date();
      upsert_(TABS.questionnaire, 'student_id', me.student_id, q);
      return { state: state_(me, s) };
    });
  },

  file: function (req) {
    const me = auth_(req);
    const kind = req.kind === 'solution' ? 'solution' : 'question';
    const q = table_(TABS.questions).find(r => r.question_id === req.question);
    if (!q) throw userError_('השאלה לא נמצאה.');
    const isAuthor = authorsOf_(q).indexOf(me.student_id) >= 0;
    const a = table_(TABS.assignments).find(r => r.reviewer_id === me.student_id && r.question_id === q.question_id);
    if (!isAuthor && !(a && phase_(settings_()).reviewVisible)) throw userError_('אין לכם גישה לקובץ הזה.');
    if (kind === 'solution' && a && !a.solution_opened_at) {
      withLock_(function () { updateRow_(TABS.assignments, a._row, { solution_opened_at: new Date() }); });
    }
    const blob = DriveApp.getFileById(kind === 'solution' ? q.solution_file_id : q.question_file_id).getBlob();
    return { name: q.question_id + '-' + kind + '.pdf', mime: 'application/pdf', data: Utilities.base64Encode(blob.getBytes()) };
  },

  submitFeedback: function (req) {
    const me = auth_(req);
    const s = settings_();
    if (!phase_(s).reviewVisible) throw userError_('המשוב נפתח אחרי שלב א.');
    const scale = function (v, label) {
      const n = Number(v);
      if (!(n >= 1 && n <= 5 && Math.round(n) === n)) throw userError_(label + ': בחרו ערך בין 1 ל-5.');
      return n;
    };
    const learned = scale(req.learned, 'כמה למדתם');
    const fairness = scale(req.fairness, 'הוגנות השיפוט');
    const comment = String(req.comment || '').trim().slice(0, 2000);
    return withLock_(function () {
      const fresh = findStudent_(me.student_id);
      if (truthy_(fresh.feedback_done)) throw userError_('כבר שלחתם משוב. תודה!');
      const sh = sheet_(TABS.feedback);
      const n = Math.max(0, sh.getLastRow() - 1);
      const at = 2 + Math.floor(Math.random() * (n + 1));   // random row, so order says nothing about who
      if (at <= sh.getLastRow()) sh.insertRowBefore(at);
      const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jerusalem', 'yyyy-MM-dd');
      sh.getRange(at, 1, 1, 4).setValues([[learned, fairness, comment, day]]);
      updateRow_(TABS.students, fresh._row, { feedback_done: true });
      return { state: state_(findStudent_(me.student_id), s) };
    });
  },

  submitReview: function (req) {
    const me = auth_(req);
    const s = settings_();
    if (!phase_(s).canReview) throw userError_('שלב השיפוט סגור.');
    const assigned = table_(TABS.assignments).filter(r => r.reviewer_id === me.student_id);
    if (!assigned.length) throw userError_('לא הוקצו לכם שאלות לשיפוט.');
    const ids = assigned.map(a => a.question_id).sort();
    const items = req.items || [];
    const ranking = req.ranking || [];
    const same = (a, b) => a.length === b.length && a.slice().sort().every((x, i) => x === b[i]);
    if (!same(items.map(i => i.question), ids)) throw userError_('צריך לשפוט את כל השאלות שהוקצו לכם.');
    if (!same(ranking, ids)) throw userError_('צריך לדרג את כל השאלות, בלי תיקו.');
    const minFlag = Number(s.MIN_FLAG_CHARS) || 15;
    items.forEach(function (it, i) {
      const sc = Number(it.score);
      if (it.score === '' || it.score == null || !isFinite(sc) || sc < 0 || sc > 100 || Math.round(sc) !== sc) {
        throw userError_('ציון 0–100 חסר או לא תקין בשאלה ' + (i + 1) + '.');
      }
      if (it.flagged && String(it.flagText || '').trim().length < minFlag) {
        throw userError_('בסימון טעות צריך לפרט באיזה סעיף הטעות ומה התשובה הנכונה.');
      }
    });
    const just = String(req.justification || '').trim();
    if (just.length < (Number(s.MIN_JUSTIFICATION_CHARS) || 80)) throw userError_('נימוק הדירוג קצר מדי. הסבירו למה כל שאלה נמצאת במקום שלה.');

    return withLock_(function () {
      const pos = {};
      assigned.forEach(a => { pos[a.question_id] = a.position; });
      const now = new Date();
      const rows = items.map(it => ({
        reviewer_id: me.student_id, question_id: it.question, position: pos[it.question],
        score: Number(it.score), unsolved: !!it.unsolved, flagged: !!it.flagged,
        flag_text: it.flagged ? String(it.flagText).trim() : '', rank: ranking.indexOf(it.question) + 1, submitted_at: now
      }));
      replaceRowsWhere_(TABS.reviews, r => r.reviewer_id === me.student_id, rows);
      upsert_(TABS.notes, 'reviewer_id', me.student_id, { reviewer_id: me.student_id, justification: just, submitted_at: now });
      return { state: state_(me, s) };
    });
  }
};

/* =========================== state for the page =========================== */

function state_(me, s) {
  const ph = phase_(s);
  const st = table_(TABS.students);
  const nameOf = {};
  st.forEach(r => { nameOf[r.student_id] = r.name; });
  const out = {
    me: { name: me.name, anon: me.anon_id },
    phase: ph,
    deadlines: deadlines_(s),
    limits: {
      maxFileMb: Number(s.MAX_FILE_MB) || 10,
      minJustification: Number(s.MIN_JUSTIFICATION_CHARS) || 80,
      minFlag: Number(s.MIN_FLAG_CHARS) || 15
    }
  };
  const qn = table_(TABS.questionnaire).find(r => r.student_id === me.student_id);
  if (qn) {
    const copy = {};
    HEADERS.Questionnaire.forEach(h => { if (['student_id', 'partner_id', 'submitted_at'].indexOf(h) < 0) copy[h] = qn[h]; });
    const p = st.find(r => r.student_id === qn.partner_id);
    copy.partner = p ? p.name : '';
    copy.submitted_at = iso_(qn.submitted_at);
    out.questionnaire = copy;
  }
  const q = table_(TABS.questions).find(r => authorsOf_(r).indexOf(me.student_id) >= 0);
  if (q) {
    out.question = {
      id: q.question_id,
      uploader: nameOf[q.uploader_id] || '',
      partner: [q.partner_id, q.extra_author_id].filter(Boolean).map(x => nameOf[x] || '').join(' ו'),
      iAmUploader: q.uploader_id === me.student_id,
      updated_at: iso_(q.updated_at || q.created_at)
    };
  }
  if (ph.reviewVisible) {
    const assigned = table_(TABS.assignments).filter(r => r.reviewer_id === me.student_id)
      .sort((a, b) => a.position - b.position);
    const mine = table_(TABS.reviews).filter(r => r.reviewer_id === me.student_id);
    const note = table_(TABS.notes).find(r => r.reviewer_id === me.student_id);
    out.review = {
      items: assigned.map(a => {
        const r = mine.find(x => x.question_id === a.question_id);
        return {
          question: a.question_id, position: a.position,
          score: r ? r.score : '', unsolved: r ? truthy_(r.unsolved) : false, flagged: r ? truthy_(r.flagged) : false,
          flagText: r ? r.flag_text : '', rank: r ? r.rank : ''
        };
      }),
      justification: note ? note.justification : '',
      submitted_at: note ? iso_(note.submitted_at) : null
    };
  }
  out.feedback = { open: ph.reviewVisible, done: truthy_(me.feedback_done) };
  if (ph.resultsPublished) {
    const g = table_(TABS.grades).find(r => r.student_id === me.student_id);
    if (g) {
      out.results = {
        valid: Number(g.valid_points), competitive: Number(g.competitive_points), tier: Number(g.tier_points),
        reviewComplete: truthy_(g.review_complete), bonus: Number(g.bonus), total: Number(g.total),
        meanScore: g.mean_score === '' ? null : Number(g.mean_score), nReviews: Number(g.n_reviews)
      };
    }
  }
  return out;
}

function phase_(s) {
  const now = new Date();
  const sub = asDate_(s.SUBMIT_DEADLINE), rOpen = asDate_(s.REVIEW_OPEN), rEnd = asDate_(s.REVIEW_DEADLINE);
  const hasAssignments = sheet_(TABS.assignments).getLastRow() > 1;
  const canSubmit = !sub || now < sub;
  const reviewStarted = hasAssignments && (!rOpen || now >= rOpen);
  const canReview = reviewStarted && (!rEnd || now < rEnd);
  const resultsPublished = truthy_(s.RESULTS_PUBLISHED);
  return {
    canSubmit: canSubmit,
    canReview: canReview,
    reviewVisible: reviewStarted,
    resultsPublished: resultsPublished,
    name: resultsPublished ? 'results' : canReview ? 'review' : canSubmit ? 'submit' : reviewStarted ? 'review-closed' : 'waiting'
  };
}

function deadlines_(s) {
  return { submit: iso_(s.SUBMIT_DEADLINE), reviewOpen: iso_(s.REVIEW_OPEN), review: iso_(s.REVIEW_DEADLINE) };
}

/* =========================== validation =========================== */

function validateQuestionnaire_(q) {
  const out = {};
  const genders = ['זכר', 'נקבה'];
  if (genders.indexOf(q.gender) < 0) throw userError_('בחרו מגדר.');
  out.gender = q.gender;
  const num = function (key, label, lo, hi, intOnly) {
    const v = q[key];
    const n = Number(v);
    if (v === '' || v == null || !isFinite(n) || n < lo || n > hi || (intOnly && Math.round(n) !== n)) {
      throw userError_(label + ': ערך בין ' + lo + ' ל-' + hi + '.');
    }
    out[key] = n;
  };
  num('age', 'גיל', 16, 90, true);
  num('height_cm', 'גובה', 120, 230, false);
  num('study_hours', 'שעות לימוד שבועיות', 0, 80, false);
  num('screen_est_min', 'הערכת זמן מסך', 0, 1440, true);
  num('screen_actual_min', 'זמן מסך בפועל', 0, 1440, true);
  num('predicted_score', 'הציון שאתם צופים לשאלה שלכם', 0, 100, true);
  return out;
}

function checkPdf_(f, label, s) {
  if (!f || !f.data) throw userError_('חסר קובץ ' + label + '.');
  const bytes = Utilities.base64Decode(f.data);
  const maxMb = Number(s.MAX_FILE_MB) || 10;
  if (bytes.length > maxMb * 1024 * 1024) throw userError_('קובץ ' + label + ' גדול מ-' + maxMb + 'MB.');
  const head = String.fromCharCode.apply(null, bytes.slice(0, 4).map(b => (b + 256) % 256));
  if (head !== '%PDF') throw userError_('קובץ ' + label + ' צריך להיות PDF.');
  return Utilities.newBlob(stripPdfMeta_(bytes), 'application/pdf');
}

/* =========================== auth =========================== */

function auth_(req) {
  const st = findStudent_(req.id);
  const bad = userError_('תעודת זהות או סיסמה/קוד שגויים.');
  if (!st || !st.secret_hash) throw bad;
  const typed = String(req.secret || '').trim();
  // emailed codes are upper-case; accept them typed in lower case too (phones often do that)
  const ok = hash_(st.salt, typed) === st.secret_hash || hash_(st.salt, typed.toUpperCase()) === st.secret_hash;
  if (!ok) throw bad;
  return st;
}

function findStudent_(id) {
  const nid = normId_(id);
  if (!nid) return null;
  return table_(TABS.students).find(r => r.student_id === nid) || null;
}

/** Find a classmate by the name a student typed: word order, extra spaces and punctuation don't matter. */
function studentByName_(typed) {
  const key = nameKey_(typed);
  if (!key) throw userError_('כתבו את השם המלא של השותף/ה.');
  const students = table_(TABS.students);
  let hits = students.filter(r => nameKey_(r.name) === key);
  if (!hits.length) {
    // a middle name may be left out: "אלעד בראון" finds "אלעד יוסף בראון" (at least two words, one match only)
    const words = key.split(' ');
    if (words.length >= 2) {
      hits = students.filter(function (r) {
        const have = nameKey_(r.name).split(' ');
        return words.every(w => have.indexOf(w) >= 0);
      });
    }
  }
  if (!hits.length) throw userError_('אין בקורס סטודנט בשם "' + String(typed).trim() + '". כתבו שם פרטי ושם משפחה כמו שהם רשומים באוניברסיטה.');
  if (hits.length > 1) throw userError_('יש בקורס יותר מסטודנט אחד שמתאים לשם הזה. כתבו את השם המלא, כולל שם אמצעי.');
  return hits[0];
}

function nameKey_(name) {
  return String(name || '').replace(/[-\u05BE]/g, ' ').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean).sort().join(' ');
}

function normId_(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  return d ? d.padStart(9, '0') : '';
}

function hash_(salt, secret) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + secret, Utilities.Charset.UTF_8);
  return raw.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function randomToken_(n) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/* =========================== admin menu =========================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('מטלה 1')
    .addItem('1. הגדרה ראשונית', 'setup')
    .addItem('2. שליחת קודים במייל (מצב code)', 'sendCodes')
    .addSeparator()
    .addItem('3. הקצאת שופטים', 'assignReviewers')
    .addItem('4. רענון רשימת הטעויות לבדיקה', 'refreshFlags')
    .addItem('5. חישוב ציונים', 'computeGrades')
    .addItem('6. ייצוא נתונים אנונימיים למטלה 2', 'exportData')
    .addSeparator()
    .addItem('בדיקת זוגות', 'checkPairs')
    .addSeparator()
    .addItem('איפוס נתוני בדיקה', 'resetTestData')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      // after a code update: add any column the sheet does not have yet, at the end
      const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      HEADERS[name].filter(h => have.indexOf(h) < 0).forEach(function (h) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold');
      });
    }
  });
  sheet_(TABS.students).getRange('A:A').setNumberFormat('@');
  const set = sheet_(TABS.settings);
  const have = table_(TABS.settings).map(r => r.key);
  DEFAULT_SETTINGS.forEach(function (row) { if (have.indexOf(row[0]) < 0) set.appendRow(row); });
  const s = settings_();
  if (!s.DRIVE_FOLDER_ID) {
    const folder = DriveApp.createFolder('מטלה 1 – הגשות (פרטי)');
    setSetting_('DRIVE_FOLDER_ID', folder.getId());
  }
  ensureAnonIds_();
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('גיליון1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  SpreadsheetApp.getUi().alert('ההגדרה הושלמה. עכשיו: למלא את Students (ת"ז, שם, מייל) ואת המועדים ב-Settings, ולפרסם את הסקריפט כ-Web App.');
}

function sendCodes() {
  const s = settings_();
  const ui = SpreadsheetApp.getUi();
  if (s.AUTH_MODE !== 'code') { ui.alert('AUTH_MODE ב-Settings הוא לא code. במצב register הסטודנטים בוחרים סיסמה בעצמם.'); return; }
  ensureAnonIds_();
  const pending = table_(TABS.students).filter(r => !r.secret_hash && r.email);
  if (!pending.length) { ui.alert('אין סטודנטים שממתינים לקוד (או שחסר להם מייל).'); return; }
  const quota = MailApp.getRemainingDailyQuota();
  if (ui.alert('לשלוח קוד ל-' + pending.length + ' סטודנטים? (מכסת מיילים להיום: ' + quota + ')', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  let sent = 0;
  for (const r of pending) {
    if (sent >= quota) break;
    const code = randomToken_(6).toUpperCase();
    const salt = randomToken_(16);
    MailApp.sendEmail({
      to: r.email,
      subject: 'סטטיסטיקה – קוד כניסה למטלה 1',
      body: 'שלום ' + r.name + ',\n\nהקוד האישי שלך לאתר המטלה: ' + code +
        '\nנכנסים עם תעודת זהות והקוד.' + (s.SITE_URL ? '\n\n' + s.SITE_URL : '') + '\n\nבהצלחה!'
    });
    updateRow_(TABS.students, r._row, { secret_hash: hash_(salt, code), salt: salt, registered_at: new Date() });
    sent++;
  }
  ui.alert('נשלחו ' + sent + ' קודים.' + (sent < pending.length ? ' השאר יישלחו כשתריצו שוב (המכסה היומית נגמרה).' : ''));
}

function assignReviewers() {
  const ui = SpreadsheetApp.getUi();
  const s = settings_();
  if (table_(TABS.reviews).length) { ui.alert('כבר יש שיפוטים שהוגשו. הקצאה מחדש תמחק אותם, ולכן היא חסומה.'); return; }
  if (table_(TABS.assignments).length &&
    ui.alert('כבר קיימת הקצאה. להחליף אותה?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  ensureAnonIds_();
  const roster = {};
  table_(TABS.students).forEach(r => { roster[r.student_id] = true; });
  const questions = table_(TABS.questions).map(r => ({
    id: r.question_id, authors: authorsOf_(r).filter(x => roster[x])
  }));
  const reviewers = [];
  questions.forEach(q => q.authors.forEach(a => reviewers.push(a)));
  const k = Number(s.REVIEWS_PER_STUDENT) || 4;
  let res;
  try {
    res = allocateReviews_(questions, reviewers, k);
  } catch (e) {
    ui.alert('לא ניתן להקצות: ' + e.message); return;
  }
  const sh = sheet_(TABS.assignments);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (res.rows.length) {
    sh.getRange(2, 1, res.rows.length, 4).setValues(res.rows.map(r => [r.reviewer, r.question, r.position, '']));
  }
  const loads = Object.keys(res.loads).map(id => res.loads[id]);
  ui.alert('הוקצו ' + reviewers.length + ' שופטים ל-' + questions.length + ' שאלות. כל שאלה נשפטת על ידי ' +
    Math.min.apply(null, loads) + (res.spread ? '–' + Math.max.apply(null, loads) : '') + ' שופטים.' +
    '\nהשיפוט נפתח במועד REVIEW_OPEN (או מיד, אם הוא ריק).');
}

function refreshFlags() {
  const keep = {};
  table_(TABS.flags).forEach(r => { keep[r.question_id + '|' + r.reviewer_id] = r; });
  const rows = table_(TABS.reviews).filter(r => truthy_(r.flagged)).map(function (r) {
    const old = keep[r.question_id + '|' + r.reviewer_id];
    return [r.question_id, r.reviewer_id, r.flag_text, old ? old.confirmed : '', old ? old.ta_note : ''];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const sh = sheet_(TABS.flags);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).clearContent().clearDataValidations();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, 5).setValues(rows);
    sh.getRange(2, 4, rows.length, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build());
  }
  SpreadsheetApp.getUi().alert(rows.length + ' סימוני טעות. בעמודה confirmed: TRUE אם יש טעות אמיתית בפתרון, FALSE אם אין. אחר כך: חישוב ציונים.');
}

function computeGrades() {
  const s = settings_();
  const students = table_(TABS.students);
  const assignments = table_(TABS.assignments);
  const notes = {};
  table_(TABS.notes).forEach(r => { notes[r.reviewer_id] = true; });
  const reviews = table_(TABS.reviews);
  const doneCount = {};
  reviews.forEach(r => { doneCount[r.reviewer_id] = (doneCount[r.reviewer_id] || 0) + 1; });
  const assignedCount = {};
  assignments.forEach(a => { assignedCount[a.reviewer_id] = (assignedCount[a.reviewer_id] || 0) + 1; });
  const completed = Object.keys(assignedCount).filter(sid => notes[sid] && doneCount[sid] === assignedCount[sid]);
  const flags = table_(TABS.flags);
  const confirmed = flags.filter(f => truthy_(f.confirmed));
  const unchecked = flags.filter(f => String(f.confirmed) === '');
  const ui = SpreadsheetApp.getUi();
  if (unchecked.length && ui.alert(unchecked.length + ' סימוני טעות עוד לא נבדקו (confirmed ריק) ויחושבו כ-FALSE. להמשיך?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const res = computeGrades_({
    questions: table_(TABS.questions).map(r => ({ id: r.question_id, authors: authorsOf_(r) })),
    students: students.map(r => r.student_id),
    assignments: assignments.map(a => ({ reviewer: a.reviewer_id, question: a.question_id })),
    reviews: reviews.filter(r => completed.indexOf(r.reviewer_id) >= 0)
      .map(r => ({ reviewer: r.reviewer_id, question: r.question_id, rank: r.rank, score: r.score })),
    completedReviewers: completed,
    errorQuestions: confirmed.map(f => f.question_id),
    confirmedFlags: confirmed.map(f => ({ reviewer: f.reviewer_id, question: f.question_id })),
    bonusPerFlag: Number(s.BONUS_PER_FLAG), bonusCap: Number(s.BONUS_CAP)
  });
  const round = v => v == null ? '' : Math.round(v * 1000) / 1000;
  const rows = students.map(function (st) {
    const g = res.students[st.student_id];
    return [st.student_id, st.name, g.question || '', g.valid, round(g.meanRank), round(g.meanScore), g.nReviews,
      g.tier, g.reviewComplete, g.competitive, g.bonus, g.total, g.note];
  });
  const sh = sheet_(TABS.grades);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');
  }
  ui.alert('הציונים חושבו בגיליון Grades. כדי שהסטודנטים יראו אותם: RESULTS_PUBLISHED = TRUE ב-Settings.');
}

function exportData() {
  ensureAnonIds_();
  const students = table_(TABS.students);
  const anon = {};
  students.forEach(r => { anon[r.student_id] = r.anon_id; });
  const qn = table_(TABS.questionnaire);
  const questions = table_(TABS.questions);
  const reviews = table_(TABS.reviews);
  const assignments = table_(TABS.assignments);
  const qOf = {};
  questions.forEach(q => authorsOf_(q).forEach(sid => { qOf[sid] = q.question_id; }));
  const agg = {};
  reviews.forEach(function (r) {
    const a = agg[r.question_id] = agg[r.question_id] || { scores: [], ranks: [] };
    a.scores.push(Number(r.score)); a.ranks.push(Number(r.rank));
  });
  const given = {};
  reviews.forEach(function (r) {
    const g = given[r.reviewer_id] = given[r.reviewer_id] || { scores: [], flags: 0 };
    g.scores.push(Number(r.score)); if (truthy_(r.flagged)) g.flags++;
  });
  const mean = a => a && a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : 'NA';

  const head1 = ['student', 'work_mode', 'gender', 'age', 'height_cm', 'study_hours',
    'screen_est_min', 'screen_actual_min', 'predicted_score', 'received_mean_score', 'received_mean_rank',
    'n_reviews_received', 'given_mean_score', 'flags_given'];
  const rows1 = shuffled_(qn, Math.random).map(function (r) {
    const q = qOf[r.student_id];
    const a = q ? agg[q] : null;
    const g = given[r.student_id];
    return [anon[r.student_id], r.work_mode, r.gender, r.age, r.height_cm, r.study_hours,
      r.screen_est_min, r.screen_actual_min, r.predicted_score,
      a ? mean(a.scores) : 'NA', a ? mean(a.ranks) : 'NA', a ? a.scores.length : 0,
      g ? mean(g.scores) : 'NA', g ? g.flags : 0];
  });
  writeTable_(TABS.exportStudents, head1, rows1);

  const opened = {};
  assignments.forEach(a => { opened[a.reviewer_id + '|' + a.question_id] = !!a.solution_opened_at; });
  const head2 = ['reviewer', 'question', 'position', 'score', 'rank', 'unsolved', 'flagged', 'solution_opened'];
  const rows2 = shuffled_(reviews, Math.random).map(r => [anon[r.reviewer_id], r.question_id, r.position, r.score, r.rank,
    truthy_(r.unsolved), truthy_(r.flagged), !!opened[r.reviewer_id + '|' + r.question_id]]);
  writeTable_(TABS.exportReviews, head2, rows2);
  SpreadsheetApp.getUi().alert('נוצרו Export_Students ו-Export_Reviews. בלי ת"ז ושמות, בסדר אקראי. להוריד כ-CSV: File ← Download.');
}

function checkPairs() {
  const nameOf = {};
  table_(TABS.students).forEach(r => { nameOf[r.student_id] = r.name; });
  const qn = {};
  table_(TABS.questionnaire).forEach(r => { qn[r.student_id] = r; });
  const issues = [];
  const questions = table_(TABS.questions);
  const seen = {};
  questions.forEach(function (q) {
    const authors = authorsOf_(q);
    authors.forEach(function (sid) {
      if (seen[sid]) issues.push(nameOf[sid] + ' רשום ביותר משאלה אחת.');
      seen[sid] = true;
    });
    authors.filter(sid => sid !== q.uploader_id).forEach(function (sid) {
      const p = qn[sid];
      if (!p) issues.push(nameOf[sid] + ' רשום בשאלה של ' + nameOf[q.uploader_id] + ' אבל עוד לא מילא שאלון.');
      else if (authors.indexOf(p.partner_id) < 0) issues.push(nameOf[sid] + ' ציין שותף שלא שייך לשאלה של ' + nameOf[q.uploader_id] + '.');
    });
  });
  Object.keys(qn).forEach(function (sid) {
    const r = qn[sid];
    if (r.work_mode !== 'pair') return;
    const ok = questions.some(q => authorsOf_(q).indexOf(sid) >= 0 && authorsOf_(q).indexOf(r.partner_id) >= 0);
    if (!ok) issues.push(nameOf[sid] + ' סימן עבודה בזוג אבל אין הגשה משותפת.');
  });
  SpreadsheetApp.getUi().alert(issues.length ? issues.join('\n') : 'אין בעיות בזוגות.');
}

/**
 * After a dry run: delete every submission, review and grade, trash the uploaded PDFs,
 * and remove test students (IDs starting with 99999). Real students' rows and codes stay.
 */
function resetTestData() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('איפוס נתוני בדיקה',
    'נמחקים: כל ההגשות, השאלונים, ההקצאות, השיפוטים, הטעויות, הציונים והמשובים, כל הקבצים בתיקיית ההגשות, ' +
    'וסטודנטים שהת"ז שלהם מתחילה ב-99999. כדי לאשר, כתבו: מחק', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK || res.getResponseText().trim() !== 'מחק') { ui.alert('בוטל.'); return; }
  [TABS.questionnaire, TABS.questions, TABS.assignments, TABS.reviews, TABS.notes, TABS.flags, TABS.grades, TABS.feedback].forEach(function (name) {
    const sh = sheet_(name);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(1, sh.getLastColumn())).clearContent().clearDataValidations();
  });
  [TABS.exportStudents, TABS.exportReviews].forEach(function (name) {
    const sh = SpreadsheetApp.getActive().getSheetByName(name);
    if (sh) SpreadsheetApp.getActive().deleteSheet(sh);
  });
  let trashed = 0;
  const folderId = settings_().DRIVE_FOLDER_ID;
  if (folderId) {
    const it = DriveApp.getFolderById(String(folderId)).getFiles();
    while (it.hasNext()) { it.next().setTrashed(true); trashed++; }
  }
  const st = sheet_(TABS.students);
  const rows = table_(TABS.students).filter(r => String(r.student_id).indexOf('99999') === 0).map(r => r._row);
  rows.sort((a, b) => b - a).forEach(r => st.deleteRow(r));
  table_(TABS.students).forEach(function (r) { if (truthy_(r.feedback_done)) updateRow_(TABS.students, r._row, { feedback_done: '' }); });
  ui.alert('האיפוס הושלם. נמחקו ' + rows.length + ' סטודנטי בדיקה ו-' + trashed + ' קבצים.\n' +
    'לפני הפתיחה: להחזיר ב-Settings את AUTH_MODE, את המועדים ואת RESULTS_PUBLISHED = FALSE.');
}

/** Everyone who wrote a question: the uploader, the partner, and a TA-approved third member. */
function authorsOf_(q) {
  return [q.uploader_id, q.partner_id, q.extra_author_id].filter(Boolean);
}

/* =========================== sheet helpers =========================== */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet ' + name + '. Run setup.');
  return sh;
}

function table_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(String);
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(v => v === '' || v == null)) continue;
    const o = { _row: i + 1 };
    head.forEach(function (h, j) { o[h] = row[j]; });
    ['student_id', 'uploader_id', 'partner_id', 'reviewer_id', 'extra_author_id'].forEach(function (k) {
      if (k in o && o[k] !== '') o[k] = normId_(o[k]);
    });
    out.push(o);
  }
  return out;
}

function updateRow_(name, rowIndex, obj) {
  const sh = sheet_(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Object.keys(obj).forEach(function (k) {
    const j = head.indexOf(k);
    if (j >= 0) sh.getRange(rowIndex, j + 1).setValue(obj[k]);
  });
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = head.map(h => (h in obj ? obj[h] : ''));
  const r = sh.getLastRow() + 1;
  const idCols = ['student_id', 'uploader_id', 'partner_id', 'reviewer_id'];
  head.forEach(function (h, j) { if (idCols.indexOf(h) >= 0) sh.getRange(r, j + 1).setNumberFormat('@'); });
  sh.getRange(r, 1, 1, row.length).setValues([row]);
}

function upsert_(name, key, value, obj) {
  const hit = table_(name).find(r => r[key] === value);
  if (hit) updateRow_(name, hit._row, obj); else appendRow_(name, obj);
}

function replaceRowsWhere_(name, pred, newRows) {
  const sh = sheet_(name);
  const head = HEADERS[name];
  const keep = table_(name).filter(r => !pred(r)).map(r => head.map(h => r[h]));
  const all = keep.concat(newRows.map(o => head.map(h => (h in o ? o[h] : ''))));
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (all.length) {
    sh.getRange(2, 1, all.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, all.length, head.length).setValues(all);
  }
}

function writeTable_(name, head, rows) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
}

function settings_() {
  const out = {};
  table_(TABS.settings).forEach(r => { out[String(r.key).trim()] = r.value; });
  out.AUTH_MODE = String(out.AUTH_MODE || 'register').trim().toLowerCase();
  return out;
}

function setSetting_(key, value) {
  const hit = table_(TABS.settings).find(r => r.key === key);
  if (hit) updateRow_(TABS.settings, hit._row, { value: value });
  else sheet_(TABS.settings).appendRow([key, value, '']);
}

function ensureAnonIds_() {
  const used = {};
  const st = table_(TABS.students);
  st.forEach(r => { if (r.anon_id) used[r.anon_id] = true; });
  st.forEach(function (r) {
    if (r.anon_id) return;
    let id;
    do { id = 'S' + randomToken_(6).toUpperCase(); } while (used[id]);
    used[id] = true;
    updateRow_(TABS.students, r._row, { anon_id: id });
  });
}

/* =========================== misc =========================== */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw userError_('השרת עמוס כרגע. נסו שוב בעוד דקה.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function userError_(msg) {
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function asDate_(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function iso_(v) {
  const d = asDate_(v);
  return d ? d.toISOString() : null;
}

function truthy_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function trashQuietly_(id) {
  try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ }
}
