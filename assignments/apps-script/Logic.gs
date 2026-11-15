/**
 * Pure logic for the peer-review assignment: reviewer allocation and grading.
 * No Apps Script services are used here, so this file also runs under Node for tests
 * (tools/test_assignment_logic.js).
 */

/** Fisher–Yates shuffle (returns a new array). rng() -> [0,1). */
function shuffled_(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * Allocate k questions to every reviewer.
 *  questions: [{ id, authors: [studentId, ...] }]
 *  reviewers: [studentId, ...]
 * Rules: nobody reviews a question they (or their partner) wrote; every question gets
 * the same number of reviews (max - min <= 1); positions 1..k are in random order.
 * Returns { rows: [{ reviewer, question, position }], loads: {qid: n}, spread }.
 * Throws if there are too few questions to give everyone k foreign questions.
 */
function allocateReviews_(questions, reviewers, k, rng, attempts) {
  rng = rng || Math.random;
  attempts = attempts || 400;
  const authored = {};
  questions.forEach(q => q.authors.forEach(s => { authored[s] = q.id; }));
  let best = null;
  for (let t = 0; t < attempts; t++) {
    const load = {};
    questions.forEach(q => { load[q.id] = 0; });
    const rows = [];
    let ok = true;
    for (const r of shuffled_(reviewers, rng)) {
      const own = authored[r];
      // least-loaded first, random among equals
      const cand = shuffled_(questions.filter(q => q.id !== own), rng)
        .sort((a, b) => load[a.id] - load[b.id]);
      if (cand.length < k) { ok = false; break; }
      const picked = shuffled_(cand.slice(0, k), rng);
      picked.forEach((q, i) => { load[q.id]++; rows.push({ reviewer: r, question: q.id, position: i + 1 }); });
    }
    if (!ok) throw new Error('Not enough questions: every reviewer needs ' + k + ' questions that are not their own.');
    const vals = Object.keys(load).map(id => load[id]);
    const spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
    if (!best || spread < best.spread) best = { rows: rows, loads: load, spread: spread };
    if (spread <= 1) break;
  }
  return best;
}

/**
 * Grades.
 *  input = {
 *    questions: [{ id, authors: [sid] }],
 *    students: [sid],                      every student on the roster
 *    assignments: [{ reviewer, question }],
 *    reviews: [{ reviewer, question, rank, score }],   only from completed review sets
 *    completedReviewers: [sid],            submitted all assigned reviews + justification
 *    errorQuestions: [qid],                TA-confirmed error in the solution
 *    confirmedFlags: [{ reviewer, question }],
 *    bonusPerFlag: 0.5, bonusCap: 1
 *  }
 * Points: 3 for a valid question, 0–2 competitive by tercile of mean rank (1 = best),
 * bonus for confirmed error flags. Ties at a tercile edge all get the higher tier.
 * Competitive points need the student's own review set to be complete.
 */
function computeGrades_(input) {
  const bonusPer = input.bonusPerFlag == null ? 0.5 : input.bonusPerFlag;
  const bonusCap = input.bonusCap == null ? 1 : input.bonusCap;
  const errorQ = {};
  (input.errorQuestions || []).forEach(q => { errorQ[q] = true; });
  const completed = {};
  (input.completedReviewers || []).forEach(s => { completed[s] = true; });
  const assignedCount = {};
  (input.assignments || []).forEach(a => { assignedCount[a.reviewer] = (assignedCount[a.reviewer] || 0) + 1; });

  // per-question aggregates
  const qStats = {};
  input.questions.forEach(q => { qStats[q.id] = { id: q.id, ranks: [], scores: [] }; });
  (input.reviews || []).forEach(r => {
    const s = qStats[r.question];
    if (!s) return;
    if (r.rank != null && r.rank !== '') s.ranks.push(Number(r.rank));
    if (r.score != null && r.score !== '') s.scores.push(Number(r.score));
  });
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  Object.keys(qStats).forEach(id => {
    const s = qStats[id];
    s.n = s.ranks.length;
    s.meanRank = mean(s.ranks);
    s.meanScore = mean(s.scores);
  });

  // terciles over reviewed questions
  const reviewed = Object.keys(qStats).map(id => qStats[id]).filter(s => s.n > 0)
    .sort((a, b) => a.meanRank - b.meanRank);
  const n = reviewed.length;
  const cut1 = Math.ceil(n / 3), cut2 = Math.ceil(2 * n / 3);
  reviewed.forEach((s, i) => { s.tier = i < cut1 ? 2 : i < cut2 ? 1 : 0; });
  const key = v => Math.round(v * 1e9);
  const bestTierByValue = {};
  reviewed.forEach(s => {
    const k = key(s.meanRank);
    bestTierByValue[k] = Math.max(bestTierByValue[k] == null ? -1 : bestTierByValue[k], s.tier);
  });
  reviewed.forEach(s => { s.tier = bestTierByValue[key(s.meanRank)]; });
  Object.keys(qStats).forEach(id => {
    const s = qStats[id];
    if (s.n === 0) { s.tier = 1; s.note = 'not reviewed: given the middle tier'; }
  });

  // bonus per reviewer
  const flagCount = {};
  (input.confirmedFlags || []).forEach(f => { flagCount[f.reviewer] = (flagCount[f.reviewer] || 0) + 1; });

  const authorOf = {};
  input.questions.forEach(q => q.authors.forEach(s => { authorOf[s] = q.id; }));

  const students = {};
  (input.students || []).forEach(sid => {
    const qid = authorOf[sid] || null;
    const s = qid ? qStats[qid] : null;
    const valid = qid ? (errorQ[qid] ? 0 : 3) : 0;
    const reviewDone = !assignedCount[sid] ? !!qid : !!completed[sid];
    const tier = s ? s.tier : 0;
    const competitive = qid && reviewDone ? tier : 0;
    const bonus = Math.min(bonusCap, (flagCount[sid] || 0) * bonusPer);
    students[sid] = {
      question: qid, valid: valid, tier: tier, reviewComplete: reviewDone,
      competitive: competitive, bonus: bonus, total: valid + competitive + bonus,
      meanRank: s ? s.meanRank : null, meanScore: s ? s.meanScore : null, nReviews: s ? s.n : 0,
      note: !qid ? 'no question submitted' : (s && s.note) || ''
    };
  });
  return { questions: qStats, students: students };
}

/**
 * Blank identifying document properties in a PDF, in place: Author, Title, Subject, Keywords
 * (Info dictionary) and the matching XMP fields. Every changed byte becomes a space, so the
 * file length and all xref offsets stay valid. Only uncompressed metadata is reached; that is
 * where Word, Google Docs, LibreOffice and most PDF writers put it.
 *  bytes: array of byte values (signed, as Apps Script gives them, or unsigned). Returns it.
 */
function stripPdfMeta_(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 8192).map(b => b & 255));
  }
  const blank = (from, to) => { for (let i = from; i < to; i++) bytes[i] = 32; };
  // Info dictionary: /Author (literal) or /Author <hex>
  const key = /\/(Author|Title|Subject|Keywords)\s*(\(|<(?!<))/g;
  let m;
  while ((m = key.exec(s))) {
    const start = m.index + m[0].length;
    let i = start;
    if (m[2] === '(') {
      let depth = 1;
      while (i < s.length) {
        const c = s[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) break;
        i++;
      }
    } else {
      i = s.indexOf('>', start);
      if (i < 0) continue;
    }
    blank(start, i);
  }
  // XMP: text inside these elements (markup kept, so the XML stays valid) and attribute forms
  const tags = ['dc:creator', 'dc:title', 'dc:description', 'dc:subject', 'pdf:Author', 'pdf:Title', 'pdf:Keywords', 'pdf:Subject'];
  tags.forEach(function (tag) {
    const re = new RegExp('<' + tag + '(\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
    let x;
    while ((x = re.exec(s))) {
      const innerStart = x.index + x[0].indexOf('>') + 1;
      const inner = x[2];
      let inTag = false;
      for (let j = 0; j < inner.length; j++) {
        const c = inner[j];
        if (c === '<') inTag = true;
        else if (c === '>') inTag = false;
        else if (!inTag && !/\s/.test(c)) bytes[innerStart + j] = 32;
      }
    }
    const attr = new RegExp(tag + '="([^"]*)"', 'g');
    while ((x = attr.exec(s))) {
      const st = x.index + tag.length + 2;
      blank(st, st + x[1].length);
    }
  });
  return bytes;
}

if (typeof module !== 'undefined') module.exports = { allocateReviews_, computeGrades_, shuffled_, stripPdfMeta_ };
