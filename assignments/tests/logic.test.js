// Unit tests for reviewer allocation and grading. Run: node assignments/tests/logic.test.js
const L = require('../apps-script/Logic.gs');
const assert = require('assert');
function rngSeed(s){return ()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296;}}
// mix of pairs and singles
for (const [nPairs,nSingles] of [[20,15],[0,30],[30,1],[3,0],[2,1]]) {
  const qs=[];let sid=0;
  for(let i=0;i<nPairs;i++) qs.push({id:'P'+i,authors:['s'+sid++,'s'+sid++]});
  for(let i=0;i<nSingles;i++) qs.push({id:'S'+i,authors:['s'+sid++]});
  const reviewers=qs.flatMap(q=>q.authors);
  let res;
  try { res=L.allocateReviews_(qs,reviewers,4,rngSeed(7)); }
  catch(e){ console.log(nPairs,nSingles,'->',e.message); continue; }
  const own={}; qs.forEach(q=>q.authors.forEach(a=>own[a]=q.id));
  const per={};
  res.rows.forEach(r=>{assert.notStrictEqual(own[r.reviewer],r.question,'own question');(per[r.reviewer]=per[r.reviewer]||new Set()).add(r.question)});
  Object.values(per).forEach(s=>assert.strictEqual(s.size,4,'4 distinct'));
  assert.strictEqual(Object.keys(per).length,reviewers.length);
  console.log(`pairs=${nPairs} singles=${nSingles} Q=${qs.length} R=${reviewers.length} loads ${Math.min(...Object.values(res.loads))}-${Math.max(...Object.values(res.loads))}`);
}
// grading
const qs=[{id:'A',authors:['1','2']},{id:'B',authors:['3']},{id:'C',authors:['4']},{id:'D',authors:['5']},{id:'E',authors:['6']},{id:'F',authors:['7']}];
const reviews=[];const mk=(q,ranks)=>ranks.forEach((r,i)=>reviews.push({reviewer:'x'+i,question:q,rank:r,score:50}));
mk('A',[1,1]);mk('B',[2,2]);mk('C',[2,2]);mk('D',[3,3]);mk('E',[4,4]);mk('F',[4,3]);
const g=L.computeGrades_({questions:qs,students:['1','2','3','4','5','6','7','8'],
  assignments:[{reviewer:'1',question:'B'},{reviewer:'2',question:'B'}],
  reviews,completedReviewers:['1'],errorQuestions:['E'],confirmedFlags:[{reviewer:'1',question:'E'},{reviewer:'1',question:'F'},{reviewer:'1',question:'D'}]});
for(const [k,v] of Object.entries(g.students)) console.log(k,v.question,v.valid,v.tier,v.competitive,v.bonus,v.total,v.note);
// tiers: sorted A1,B2,C2,D3,F3.5,E4 ; n=6 cut1=2 cut2=4 -> A2,B2,C1->tie with B ->2, D1, F0, E0
assert.strictEqual(g.questions.C.tier,2); assert.strictEqual(g.questions.D.tier,1); assert.strictEqual(g.questions.F.tier,0);
assert.strictEqual(g.students['2'].competitive,0); // assigned but not completed
assert.strictEqual(g.students['1'].total,3+2+1); // bonus capped
assert.strictEqual(g.students['6'].valid,0);
assert.strictEqual(g.students['8'].total,0);
// PDF metadata stripping (Info dictionary + XMP), length preserved
const sample = '%PDF-1.7\n1 0 obj\n<< /Author (Itai \\(TA\\) Levi) /Title <FEFF05D0> /Producer (Word) >>\nendobj\n' +
  '2 0 obj << /Length 200 >> stream\n<x:xmpmeta><dc:creator><rdf:Seq><rdf:li>Itai Levi</rdf:li></rdf:Seq></dc:creator>' +
  '<rdf:Description pdf:Author="Itai Levi" pdf:Producer="Word"/></x:xmpmeta>\nendstream endobj\n%%EOF';
const before = Array.from(Buffer.from(sample, 'latin1'));
const after = Buffer.from(L.stripPdfMeta_(before.slice()).map(b => b & 255)).toString('latin1');
assert.strictEqual(after.length, sample.length);
assert.ok(!after.includes('Itai') && !after.includes('Levi'), after);
assert.ok(after.includes('/Producer (Word)') && after.includes('pdf:Producer="Word"') && after.includes('<rdf:li>') && after.includes('/Title <'), after);
console.log('ALL OK');
