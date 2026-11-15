/*
 * Demo mode for the assignment page: an in-memory stand-in for the Apps Script API.
 * Loaded only when API_URL is empty or the page is opened with ?demo. Nothing is saved.
 * Any ID with 5–9 digits and any password of 6+ characters work.
 */
(() => {
  const now = Date.now();
  const day = 864e5;
  const roster = ['נועה כהן', 'איתי לוי', 'מאיה פרץ', 'יונתן מזרחי'].map(name => ({ name }));
  let phase = 'submit';
  let st = null;

  const reset = () => {
    st = {
      me: { name: 'סטודנט/ית לדוגמה', anon: 'S999' },
      questionnaire: null, question: null,
      review: {
        items: ['QA1', 'QB2', 'QC3', 'QD4'].map((q, i) => ({ question: q, position: i + 1, score: '', unsolved: false, flagged: false, flagText: '', rank: '' })),
        justification: '', submitted_at: null
      },
      feedback: { done: false },
      results: { valid: 3, competitive: 1, tier: 1, reviewComplete: true, bonus: 0.5, total: 4.5, meanScore: 71.4, nReviews: 6 }
    };
  };
  reset();

  const phases = {
    submit: { canSubmit: true, canReview: false, reviewVisible: false, resultsPublished: false, name: 'submit' },
    review: { canSubmit: false, canReview: true, reviewVisible: true, resultsPublished: false, name: 'review' },
    results: { canSubmit: false, canReview: false, reviewVisible: true, resultsPublished: true, name: 'results' }
  };
  const deadlines = () => ({
    submit: new Date(now + (phase === 'submit' ? 6 : -3) * day).toISOString(),
    reviewOpen: new Date(now + (phase === 'submit' ? 7 : -2) * day).toISOString(),
    review: new Date(now + (phase === 'submit' ? 14 : phase === 'review' ? 5 : -1) * day).toISOString()
  });
  const state = () => Object.assign({
    phase: phases[phase], deadlines: deadlines(),
    limits: { maxFileMb: 10, minJustification: 80, minFlag: 15 }
  }, {
    me: st.me, questionnaire: st.questionnaire, question: st.question,
    review: phases[phase].reviewVisible ? st.review : undefined,
    feedback: { open: phases[phase].reviewVisible, done: st.feedback.done },
    results: phases[phase].resultsPublished ? st.results : undefined
  });

  // a one-page PDF that says which file it is
  const pdf = (text) => {
    const body = 'BT /F1 28 Tf 72 720 Td (' + text + ') Tj ET';
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let out = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const x = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
    return btoa(out);
  };

  const wait = (v) => new Promise(r => setTimeout(() => r(v), 250));
  const fail = (error) => wait({ ok: false, error });

  async function DemoAPI(req) {
    switch (req.action) {
      case 'config': return wait({ ok: true, authMode: 'code', deadlines: deadlines(), phase: phases[phase] });
      case 'register':
      case 'login':
        if (String(req.secret || '').length < 6) return fail('בהדגמה: סיסמה של 6 תווים לפחות.');
        return wait({ ok: true, state: state() });
      case 'state': return wait({ ok: true, state: state() });
      case 'submitStageA': {
        if (!phases[phase].canSubmit) return fail('ההגשה לשלב א סגורה.');
        const key = (n) => String(n || '').trim().split(/\s+/).sort().join(' ');
        const partner = req.workMode === 'pair' ? roster.find(r => key(r.name) === key(req.partnerName)) : null;
        if (req.workMode === 'pair' && !partner) return fail('אין בקורס סטודנט בשם "' + req.partnerName + '". (בהדגמה: ' + roster.map(r => r.name).join(', ') + ')');
        if (req.files || (req.workMode === 'alone' && st.question)) {
          if (!req.files && !st.question) return fail('יש להעלות את קובץ השאלה ואת קובץ הפתרון.');
          st.question = { id: 'QX9', uploader: st.me.name, partner: partner ? partner.name : '', iAmUploader: true, updated_at: new Date().toISOString() };
        } else if (req.workMode === 'pair') {
          st.question = { id: 'QX9', uploader: partner.name, partner: st.me.name, iAmUploader: false, updated_at: new Date().toISOString() };
        } else return fail('יש להעלות את קובץ השאלה ואת קובץ הפתרון.');
        st.questionnaire = Object.assign({}, req.questionnaire, { work_mode: req.workMode, partner: partner ? partner.name : '', submitted_at: new Date().toISOString() });
        return wait({ ok: true, state: state() });
      }
      case 'file': {
        return wait({ ok: true, name: req.question + '-' + req.kind + '.pdf', data: pdf('Demo ' + req.kind + ' ' + req.question) });
      }
      case 'submitFeedback': {
        if (st.feedback.done) return fail('כבר שלחתם משוב. תודה!');
        if (!(req.learned >= 1 && req.learned <= 5 && req.fairness >= 1 && req.fairness <= 5)) return fail('בחרו ערך בין 1 ל-5.');
        st.feedback.done = true;
        return wait({ ok: true, state: state() });
      }
      case 'submitReview': {
        if (!phases[phase].canReview) return fail('שלב השיפוט סגור.');
        req.items.forEach(x => {
          const it = st.review.items.find(i => i.question === x.question);
          Object.assign(it, { score: x.score, unsolved: x.unsolved, flagged: x.flagged, flagText: x.flagText, rank: req.ranking.indexOf(x.question) + 1 });
        });
        st.review.justification = req.justification;
        st.review.submitted_at = new Date().toISOString();
        return wait({ ok: true, state: state() });
      }
      default: return fail('פעולה לא מוכרת');
    }
  }
  DemoAPI.setPhase = (p) => { phase = p; };
  window.DemoAPI = DemoAPI;
})();
