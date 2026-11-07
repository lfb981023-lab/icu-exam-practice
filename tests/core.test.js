import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {grade,answerKeys,canGrade,gradeQuestion,sanitizeHistory,filterQuestions,summary,shuffle} from '../dist/core.js';
const questions=[{id:'a',type:'single',module:'resp',chapter:45,options:[{key:'A'},{key:'B'},{key:'C'}],answers:['B']},{id:'b',type:'multiple',module:'renal',chapter:54,options:[{key:'A'},{key:'B'},{key:'C'}],answers:['A','C']}];
test('single and multiple grades require the exact complete answer set',()=>{
  assert.equal(grade(['B'],['B']),true);assert.equal(grade(['A'],['B']),false);
  assert.equal(grade(['C','A'],['A','C']),true);assert.equal(grade(['A'],['A','C']),false);
  assert.equal(grade(['A','B','C'],['A','C']),false);assert.equal(grade([],['A']),false);
});
test('stored answers are validated and grades are recomputed',()=>{
  const h=sanitizeHistory({a:{selected:['B'],correct:false,attempts:2},b:{selected:['A'],correct:true,attempts:1},unknown:{selected:['A']}},questions);
  assert.equal(h.a.correct,true);assert.equal(h.b.correct,false);assert.equal(h.unknown,undefined);
  assert.deepEqual(sanitizeHistory({a:{selected:['X']},b:{selected:[]}},questions),{});
});
test('wrong-answer filtering and statistics reflect latest submitted result',()=>{
  let h={a:{selected:['B'],correct:true},b:{selected:['A'],correct:false}};
  const filters={module:'all',chapter:'all',type:'all',unanswered:false};
  assert.deepEqual(filterQuestions(questions,h,filters,'wrong').map(q=>q.id),['b']);
  assert.deepEqual(summary(questions,h),{total:2,done:2,correct:1,wrong:1,graded:2,ungraded:0,rate:50});
  h.b.correct=true;assert.equal(filterQuestions(questions,h,filters,'wrong').length,0);
  assert.equal(filterQuestions(questions,h,{...filters,unanswered:true},'practice').length,0);
});
test('module, chapter and type filters intersect without leaking unrelated questions',()=>{
  assert.deepEqual(filterQuestions(questions,{}, {module:'resp',chapter:'45',type:'single',unanswered:false},'practice').map(q=>q.id),['a']);
  assert.equal(filterQuestions(questions,{}, {module:'resp',chapter:'54',type:'all',unanswered:false},'practice').length,0);
});
test('random practice shuffles a copy with no loss or duplicates',()=>{
  const source=[1,2,3,4,5];const out=shuffle(source,()=>.25);
  assert.deepEqual(source,[1,2,3,4,5]);assert.deepEqual([...out].sort(),source);assert.notDeepEqual(out,source);
});
test('unconfirmed source answers cannot receive a correct or incorrect grade',()=>{
  for(const answerStatus of ['missing','review']) {
    const q={...questions[0],id:'past-'+answerStatus,answerStatus};
    assert.equal(canGrade(q),false);assert.equal(gradeQuestion(['B'],q),null);
    const h=sanitizeHistory({[q.id]:{selected:['B'],correct:true,attempts:1}},[q]);
    assert.equal(h[q.id].correct,null);
    assert.equal(filterQuestions([q],h,{module:'all',chapter:'all',type:'all'},'wrong').length,0);
    assert.deepEqual(summary([q],h),{total:1,done:1,correct:0,wrong:0,graded:0,ungraded:1,rate:null});
  }
  assert.equal(canGrade({...questions[0],answers:[]}),false);
  assert.equal(canGrade({...questions[0],answers:['X']}),false);
});
test('adding a source bank preserves existing progress and accepts ungraded source review',()=>{
  const past={...questions[0],id:'past-doc-0001',answerStatus:'provided'};
  const unscored={...questions[0],id:'past-doc-0002',answerStatus:'missing',type:'unknown',options:[],answers:[]};
  const h=sanitizeHistory({a:{selected:['B'],attempts:3},[past.id]:{selected:['A']},[unscored.id]:{selected:[],reviewed:true,correct:false}},[...questions,past,unscored]);
  assert.equal(h.a.correct,true);assert.equal(h.a.attempts,3);assert.equal(h[past.id].correct,false);assert.equal(h[unscored.id].correct,null);assert.equal(h[unscored.id].reviewed,true);
  assert.equal(summary(questions,h).done,1);assert.equal(summary([past,unscored],h).done,2);
  assert.equal(summary([past,unscored],h).rate,0);
  assert.deepEqual(sanitizeHistory({a:{selected:[],reviewed:true}},questions),{});
});
test('both shipped banks have distinct IDs and ambiguous imported answers stay ungraded',()=>{
  const mock=JSON.parse(readFileSync(new URL('../dist/questions.json',import.meta.url),'utf8'));
  const past=JSON.parse(readFileSync(new URL('../dist/past-papers.json',import.meta.url),'utf8'));
  assert.equal(mock.questions.length,300);assert.equal(past.questions.length,622);assert.equal(past.notes.length,42);
  const all=[...mock.questions,...past.questions];assert.equal(new Set(all.map(q=>q.id)).size,922);
  const references=past.questions.filter(q=>q.referenceStatus);
  assert.equal(references.length,59);
  assert.equal(past.questions.filter(canGrade).length,563+references.filter(q=>q.referenceStatus==='confirmed').length);
  for(const q of past.questions){
    assert.ok(q.source.raw);assert.equal(q.id,'past-doc-'+String(q.source.ordinal).padStart(4,'0'));
    assert.ok(!/\/{2,}/.test(q.stem+q.options.map(o=>o.text).join(' ')));
    if(q.answerStatus!=='provided'){
      assert.deepEqual(q.answers,[]);
      assert.ok(q.referenceAnswerText);assert.ok(q.referenceRationale);assert.ok(q.referenceSources.length);
      assert.ok(q.referenceSources.every(s=>s.title&&(s.url||s.pdfPages)));
      if(q.referenceStatus==='confirmed'){assert.equal(canGrade(q),true);assert.equal(gradeQuestion(q.referenceAnswers,q),true);}
      else assert.equal(gradeQuestion(['A'],q),null);
    }
  }
});
test('confirmed reference answers override disputed keys without overwriting the source',()=>{
  const q={...questions[0],id:'ref',answerStatus:'review',answers:[],rawAnswers:['A'],referenceStatus:'confirmed',referenceAnswers:['C']};
  assert.deepEqual(answerKeys(q),['C']);assert.equal(gradeQuestion(['C'],q),true);assert.equal(gradeQuestion(['A'],q),false);
  assert.deepEqual(q.rawAnswers,['A']);assert.deepEqual(q.answers,[]);
  const h=sanitizeHistory({ref:{selected:['C'],correct:false}},[q]);assert.equal(h.ref.correct,true);
  for(const referenceStatus of ['ambiguous','incomplete','versioned']){
    const conditional={...q,referenceStatus};assert.equal(gradeQuestion(['C'],conditional),null);
  }
  assert.equal(canGrade({...q,referenceAnswers:['Z']}),false);
  const f={module:'all',chapter:'all',type:'all',referenceOnly:true};
  assert.deepEqual(filterQuestions([...questions,q],{},f,'practice').map(x=>x.id),['ref']);
});
