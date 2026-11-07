import {grade, sanitizeHistory, filterQuestions, summary, shuffle} from './core.js';
const $ = s => document.querySelector(s);
const KEY = 'icu.study.v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, byId, history = {}, pool = [], index = 0, view = 'practice', mode = 'sequence';
let filters = {module:'all',chapter:'all',type:'all',unanswered:false};
let selected = new Set(), submitted = false, toastTimer, restored = null;
let canSave = true;

function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,2600); }
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({version:1,history,filters,mode,queue:pool.map(q=>q.id),current:pool[index]?.id,view}));
  } catch { canSave=false; $('#storage-warning').hidden=false; $('#save-hint').textContent='当前浏览器无法保存记录，本次仍可正常作答'; }
}
function stats() {
  const s=summary(data.questions,history);
  $('#stat-done').textContent=s.done; $('#stat-total').textContent=s.total;
  $('#stat-rate').textContent=s.rate===null?'—':s.rate+'%';
  $('#stat-wrong').textContent=s.wrong; $('#wrong-nav').textContent=s.wrong;
  $('#overall-fill').style.width=(s.done/s.total*100)+'%';
}
function activeModule() { return data.modules.find(m=>m.id===filters.module); }
function moduleButtons() {
  const all=[{id:'all',title:'全部范围',short:'全部',chapters:[]}].concat(data.modules);
  $('#module-list').innerHTML=all.map(m=>{
    const qs=m.id==='all'?data.questions:data.questions.filter(q=>q.module===m.id), s=summary(qs,history);
    return `<button class="module-button ${filters.module===m.id?'active':''}" data-module="${esc(m.id)}" aria-pressed="${filters.module===m.id}"><span>${esc(m.title)}</span><small>${s.done}/${s.total}</small></button>`;
  }).join('');
  $('#mobile-modules').innerHTML=all.map(m=>`<button class="mobile-module ${filters.module===m.id?'active':''}" data-module="${esc(m.id)}" aria-pressed="${filters.module===m.id}">${esc(m.short)}</button>`).join('');
  document.querySelectorAll('[data-module]').forEach(b=>b.addEventListener('click',()=>{
    filters.module=b.dataset.module;filters.chapter='all';mode='sequence';renderChapterOptions();rebuild();
  }));
}
function renderChapterOptions() {
  const chapters=data.chapters.filter(c=>filters.module==='all'||c.module===filters.module);
  if(!chapters.some(c=>String(c.chapter)===filters.chapter))filters.chapter='all';
  $('#chapter-filter').innerHTML='<option value="all">'+(filters.module==='all'?'全部 60 章':'本模块全部章节')+'</option>'+chapters.map(c=>`<option value="${c.chapter}">第${c.chapter}章 · ${esc(c.title)}</option>`).join('');
  $('#chapter-filter').value=filters.chapter;
  $('#type-filter').value=filters.type;$('#unanswered-only').checked=filters.unanswered;
  $('#unanswered-only').disabled=view==='wrong';
}
function rebuild(restoreId=null) {
  const available=filterQuestions(data.questions,history,filters,view);
  pool=mode==='random'?shuffle(available).slice(0,20):available;
  index=Math.max(0,pool.findIndex(q=>q.id===restoreId));
  moduleButtons();renderQuestion();save();
}
function setView(next) {
  const resumeId=view==='progress'&&next==='practice'?pool[index]?.id:null;
  view=next;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('#progress-view').hidden=view!=='progress';$('#practice-view').hidden=view==='progress';
  if(view==='progress'){renderProgress();save();return;}
  if(view==='wrong') filters.unanswered=false;
  renderChapterOptions();mode='sequence';rebuild(resumeId);
}
function renderQuestion() {
  stats();
  const q=pool[index];
  const scope=filters.chapter==='all'?(activeModule()?.title||'全部范围'):'第'+filters.chapter+'章';
  $('#session-label').textContent=(view==='wrong'?'错题复习':mode==='random'?'随机练习 · '+pool.length+'题':'顺序练习')+' · '+scope+(filters.unanswered?' · 本轮未做题':'');
  $('#sequence-button').hidden=mode!=='random';
  $('#question-card').hidden=!q;$('#empty-state').hidden=!!q;$('#question-nav').hidden=!q;
  if(!q){
    $('#empty-title').textContent=view==='wrong'?'这个范围没有待复习错题':filters.unanswered?'这个范围已经练完了':'当前筛选没有题目';
    $('#empty-message').textContent=view==='wrong'?'答错的题会留在这里，再次答对后自动移出。可以继续练习其他知识点。':'调整章节或题型，继续下一组练习。';return;
  }
  selected=new Set(history[q.id]?.selected||[]); submitted=!!history[q.id];
  $('#question-card').innerHTML=`<div class="question-meta"><div class="question-tags"><span class="pill ${q.type==='multiple'?'multiple':''}">${q.type==='single'?'单选题':'多选题'}</span><span class="difficulty">${esc(q.difficulty)}</span></div><span class="question-id">${esc(q.id.toUpperCase())}</span></div><div class="chapter-name">第 ${q.chapter} 章 · ${esc(q.chapterTitle)}</div><h2 id="question-title">${esc(q.stem)}</h2><p class="instruction">${q.type==='single'?'请选择一个最佳答案，点击后查看解析。':'可选择多个答案，选完后提交；漏选、多选均计为错误。'}</p><div class="options" role="group" aria-label="答案选项"></div><div class="submit-row" id="submit-row" ${q.type==='single'?'hidden':''}><small id="selection-count"></small><button class="primary-button" id="submit-answer">提交答案</button></div><div id="feedback-slot"></div>`;
  if(q.type==='multiple')$('#submit-answer').addEventListener('click',submit);
  paintOptions(); if(submitted)showFeedback(false);
  $('#position-label').textContent=(index+1)+' / '+pool.length;
  $('#prev-button').disabled=index===0;
  $('#next-button').textContent=index===pool.length-1?'查看进度 →':'下一题 →';
}
function paintOptions() {
  const q=pool[index];
  $('.options').innerHTML=q.options.map(o=>{
    const chosen=selected.has(o.key), correct=submitted&&q.answers.includes(o.key), wrong=submitted&&chosen&&!correct;
    let status=correct?(chosen?'正确':'正确 · 漏选'):(wrong?'选错':'');
    // For a single-choice mistake the unselected right answer is simply labeled correct.
    if(q.type==='single'&&correct&&!chosen)status='正确答案';
    return `<button class="option ${q.type} ${chosen?'selected':''} ${correct?'correct':''} ${wrong?'wrong':''}" data-option="${o.key}" aria-pressed="${chosen}" ${submitted?'disabled':''}><span class="option-letter">${o.key}</span><span class="option-text">${esc(o.text)}</span>${status?`<span class="option-state">${status}</span>`:''}</button>`;
  }).join('');
  document.querySelectorAll('[data-option]').forEach(b=>b.addEventListener('click',()=>{
    if(submitted)return;const key=b.dataset.option;
    if(q.type==='single'){selected=new Set([key]);submit();}
    else {selected.has(key)?selected.delete(key):selected.add(key);paintOptions();}
  }));
  if(q.type==='multiple'){
    $('#selection-count').textContent='已选 '+selected.size+' 项';$('#submit-answer').disabled=selected.size===0;$('#submit-row').hidden=submitted;
  }
}
function submit() {
  if(submitted||selected.size===0)return;
  const q=pool[index], old=history[q.id];submitted=true;
  history[q.id]={selected:[...selected].sort(),correct:grade([...selected],q.answers),attempts:(old?.attempts||0)+1,at:new Date().toISOString()};
  paintOptions();showFeedback(true);stats();moduleButtons();save();
}
function sourceMarkup(sources) {
  const seen=new Set();
  return sources.map(s=>{
    if(s.tableText){
      const key=s.page+':'+s.tableText;if(seen.has(key))return '';seen.add(key);
      return `<blockquote><span class="source-page">删减版 PDF · 第 ${s.page} 页 · 原表/公式整理</span><p>${esc(s.tableText)}</p></blockquote>`;
    }
    return `<blockquote><span class="source-page">删减版 PDF · 第 ${s.page} 页</span><p>“${esc(s.quote)}”</p></blockquote>`;
  }).join('');
}
function showFeedback(announce) {
  const q=pool[index], correct=grade([...selected],q.answers);
  const missed=q.answers.filter(a=>!selected.has(a)), extras=[...selected].filter(a=>!q.answers.includes(a));
  const detail=correct?'这道题的关键条件，你判断对了。':q.type==='multiple'?[missed.length?'漏选 '+missed.join('、'):'',extras.length?'多选/错选 '+extras.join('、'):''].filter(Boolean).join('；'):'看看哪个条件改变了判断。';
  $('#feedback-slot').innerHTML=`<section class="feedback" aria-label="作答反馈与教材知识"><div class="result-banner ${correct?'':'incorrect'}" role="status"><span class="result-symbol" aria-hidden="true">${correct?'✓':'×'}</span><div><strong>${correct?'回答正确':'本题未答对'}</strong><small>${esc(detail)}</small></div></div><p class="answer-line">你的答案 <b>${[...selected].sort().join('、')}</b>　 ·　 正确答案 <b>${q.answers.join('、')}</b></p><h3 class="explanation-heading">答案解析</h3><p class="rationale">${esc(q.rationale)}</p><div class="knowledge-box"><strong>这一题，记住这一点</strong><p>${esc(q.knowledge)}</p></div><div class="source-heading"><h3>教材原文摘录</h3><small>来源：《实用重症医学》第2版</small></div>${sourceMarkup(q.sources)}${q.note?`<div class="version-note"><b>版本提示</b> · ${esc(q.note)}</div>`:''}<div class="feedback-actions"><button class="quiet-button" id="retry-question">↻ 遮住解析，再答一次</button></div></section>`;
  $('#retry-question').addEventListener('click',()=>{selected=new Set();submitted=false;$('#feedback-slot').innerHTML='';paintOptions();$('#question-title').scrollIntoView({behavior:'smooth',block:'start'});});
  if(announce){
    const banner=$('.result-banner');
    if(banner.getBoundingClientRect().bottom>innerHeight-15)banner.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }
}
function navigate(delta) {
  if(delta>0&&index===pool.length-1){setView('progress');$('#main').scrollIntoView({behavior:'smooth'});return;}
  index=Math.min(pool.length-1,Math.max(0,index+delta));renderQuestion();save();$('#question-card').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderProgress() {
  stats();
  $('#progress-grid').innerHTML=data.modules.map(m=>{
    const s=summary(data.questions.filter(q=>q.module===m.id),history);
    return `<article class="progress-card"><div class="progress-card-head"><h3>${esc(m.title)}</h3><span>${s.done} / ${s.total} 题</span></div><div class="progress-track" aria-hidden="true"><i style="width:${s.done/s.total*100}%"></i></div><div class="progress-card-foot"><span>最近答对 ${s.correct} 题 · 待复习 ${s.wrong} 题</span><button class="quiet-button" data-practice-module="${esc(m.id)}">去练习 →</button></div></article>`;
  }).join('');
  document.querySelectorAll('[data-practice-module]').forEach(b=>b.addEventListener('click',()=>{filters={module:b.dataset.practiceModule,chapter:'all',type:'all',unanswered:false};setView('practice');}));
}
function bindings() {
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('.brand').addEventListener('click',e=>{e.preventDefault();setView('practice');});
  $('#chapter-filter').addEventListener('change',e=>{filters.chapter=e.target.value;mode='sequence';rebuild();});
  $('#type-filter').addEventListener('change',e=>{filters.type=e.target.value;mode='sequence';rebuild();});
  $('#unanswered-only').addEventListener('change',e=>{filters.unanswered=e.target.checked;mode='sequence';rebuild();});
  $('#random-button').addEventListener('click',()=>{mode='random';rebuild();if(pool.length)toast('已随机抽取 '+pool.length+' 题');});
  $('#sequence-button').addEventListener('click',()=>{mode='sequence';rebuild();});
  $('#prev-button').addEventListener('click',()=>navigate(-1));$('#next-button').addEventListener('click',()=>navigate(1));
  $('#empty-reset').addEventListener('click',()=>{filters={module:'all',chapter:'all',type:'all',unanswered:false};setView('practice');});
  $('#continue-practice').addEventListener('click',()=>setView('practice'));
  $('#reset-progress').addEventListener('click',()=>{
    if(confirm('清空当前浏览器的全部答题记录和错题？此操作无法撤销。')){history={};save();renderProgress();toast('本机学习记录已清空');}
  });
}
$('#about-open').addEventListener('click',()=>$('#about-dialog').showModal());
$('#about-close').addEventListener('click',()=>$('#about-dialog').close());
$('#about-done').addEventListener('click',()=>$('#about-dialog').close());
$('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

async function init() {
  try{
    const response=await fetch('questions.json');if(!response.ok)throw Error('题库加载失败');data=await response.json();
    if(!Array.isArray(data.questions)||!data.questions.length)throw Error('题库尚未准备好');
    byId=new Map(data.questions.map(q=>[q.id,q]));
    try{restored=JSON.parse(localStorage.getItem(KEY)||'null');localStorage.setItem(KEY+'.check','1');localStorage.removeItem(KEY+'.check');}catch{canSave=false;$('#storage-warning').hidden=false;}
    history=sanitizeHistory(restored?.history,data.questions);
    if(restored?.filters){
      const f=restored.filters;
      filters.module=data.modules.some(m=>m.id===f.module)?f.module:'all';
      filters.chapter=data.chapters.some(c=>String(c.chapter)===String(f.chapter))?String(f.chapter):'all';
      filters.type=['single','multiple'].includes(f.type)?f.type:'all';filters.unanswered=!!f.unanswered;
    }
    view=['wrong','progress'].includes(restored?.view)?restored.view:'practice';
    if(view==='wrong')filters.unanswered=false;
    bindings();renderChapterOptions();mode=restored?.mode==='random'?'random':'sequence';
    rebuild(restored?.current);
    if(mode==='random'&&Array.isArray(restored?.queue)){
      const available=new Set(filterQuestions(data.questions,history,{...filters,unanswered:false},view).map(q=>q.id));
      const restoredPool=[...new Set(restored.queue)].filter(id=>available.has(id)&&byId.has(id)).slice(0,20).map(id=>byId.get(id));
      if(restoredPool.length){pool=restoredPool;index=Math.max(0,pool.findIndex(q=>q.id===restored.current));renderQuestion();save();}
    }
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('#progress-view').hidden=view!=='progress';$('#practice-view').hidden=view==='progress';if(view==='progress')renderProgress();
    if(!canSave)$('#save-hint').textContent='当前浏览器无法保存记录，本次仍可正常作答';
  }catch(e){
    $('#question-card').innerHTML='<div class="loading">题库暂时未能载入。请检查网络后重试。<br><button id="reload-data" class="primary-button" style="margin-top:18px">重新载入</button></div>';
    $('#reload-data').addEventListener('click',()=>location.reload());
    console.error('Question bank could not be loaded:',e);
  }
}
init();
