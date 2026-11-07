import test from 'node:test';
import assert from 'node:assert/strict';
import {grade,sanitizeHistory,filterQuestions,summary,shuffle} from '../dist/core.js';
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
  assert.deepEqual(summary(questions,h),{total:2,done:2,correct:1,wrong:1,rate:50});
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
