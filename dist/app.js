import {answerKeys, canGrade, gradeQuestion, sanitizeHistory, filterQuestions, summary, shuffle} from './core.js?v=7';
const $ = s => document.querySelector(s);
const KEY = 'icu.study.v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bankInfo = {focus:{title:'考点专项模拟',short:'考点专项',file:'focus-questions.json',description:'依据完整版教材与课程考点 · 95 考点 · 600 单选 / 400 多选'},mock:{title:'原有模拟题',short:'原有模拟',file:'questions.json',description:'依据《实用重症医学》第2版指定删减范围 · 60 章'},past:{title:'历年真题（用户提供）',short:'历年真题',file:'past-papers.json',description:'来源：《危急重症题.doc》 · 按原文件顺序分组'}};
let banks={}, bank='mock', data, byId, history={}, unavailableHistory={}, pool=[], index=0, view='practice', mode='sequence', bankStates={};
let filters={module:'all',chapter:'all',point:'all',type:'all',unanswered:false,referenceOnly:false};
let selected=new Set(), submitted=false, toastTimer, restored=null, canSave=true;
const isPast = () => bank==='past';
const isFocus = () => bank==='focus';
const emptyFilters = () => ({module:'all',chapter:'all',point:'all',type:'all',unanswered:false,referenceOnly:false});
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2600);}
function snapshot(){return {filters:{...filters},mode,queue:pool.map(q=>q.id),current:pool[index]?.id,view};}
function save(){
  bankStates[bank]=snapshot();
  try{localStorage.setItem(KEY,JSON.stringify({version:2,bank,history:{...unavailableHistory,...history},bankStates,...snapshot()}));}
  catch{canSave=false;$('#storage-warning').hidden=false;$('#save-hint').textContent='当前浏览器无法保存记录，本次仍可正常作答';}
}
function stats(){
  const s=summary(data.questions,history);
  $('#stat-done').textContent=s.done;$('#stat-total').textContent=s.total;
  $('#stat-rate').textContent=s.rate===null?'—':s.rate+'%';
  $('#rate-caption').textContent=isPast()?'答案一致率（可判分题）':'最近作答正确率';
  $('#stat-wrong').textContent=s.wrong;$('#wrong-nav').textContent=s.wrong;
  $('#overall-fill').style.width=(s.total?s.done/s.total*100:0)+'%';
  $('#ungraded-stats').hidden=!(s.ungraded>0);
  $('#ungraded-stats').textContent='另有 '+(s.ungraded||0)+' 题已查看；因条件不全或版本差异，不计分。';
}
function renderBankControls(){
  $('#bank-list').innerHTML=Object.entries(bankInfo).map(([id,info])=>`<button class="bank-button ${id===bank?'active':''}" data-bank="${id}" aria-pressed="${id===bank}" ${banks[id]?'':'disabled'}><span>${esc(info.title)}</span><strong>${banks[id]?banks[id].questions.length+' 题':'暂未加载'}</strong></button>`).join('');
  document.querySelectorAll('[data-bank]').forEach(b=>b.addEventListener('click',()=>setBank(b.dataset.bank)));
  $('#bank-description').textContent=bankInfo[bank].description+(isPast()&&data.questions.some(q=>q.referenceStatus)?' · 已为 '+data.questions.filter(q=>q.referenceStatus).length+' 道疑义题补充参考答案与依据':'');
  $('#bank-era-note').hidden=!isPast();$('#reference-only-label').hidden=!isPast();
  $('#side-scope-hint').textContent=isPast()?'按原题顺序':isFocus()?'按考点巩固':'按章节巩固';
  $('#scope-filter-label').textContent=isPast()?'题目分组':isFocus()?'考点':'章节';
  $('#progress-bank-title').textContent=bankInfo[bank].title+' · 学习进度';
  $('#progress-description').textContent=isPast()?'按各题标注的原答案或参考答案记录最近一次提交；有歧义或条件不全的题不计分。':'统计每题最近一次提交。答错的知识点，值得再看一眼。';
  $('#reset-progress').textContent='清空本题库记录';
  $('#type-filter').innerHTML='<option value="all">全部题型</option><option value="single">单选题</option><option value="multiple">多选题</option>'+(data.questions.some(q=>q.type==='unknown')?'<option value="unknown">待核对题型</option>':'');
  renderNotes();
}
function restoreSession(state={}){
  const f=state.filters||{};
  filters={module:data.modules.some(m=>m.id===f.module)?f.module:'all',chapter:data.chapters.some(c=>String(c.chapter)===String(f.chapter))?String(f.chapter):'all',point:isFocus()&&data.points?.some(p=>p.id===f.point)?f.point:'all',type:['single','multiple','unknown'].includes(f.type)?f.type:'all',unanswered:!!f.unanswered,referenceOnly:isPast()&&!!f.referenceOnly};
  view=['wrong','progress'].includes(state.view)?state.view:'practice';
  if(view==='wrong')filters.unanswered=false;
  mode=state.mode==='random'?'random':'sequence';
  renderChapterOptions();
  const available=filterQuestions(data.questions,history,filters,view);
  pool=mode==='random'?shuffle(available).slice(0,20):available;
  if(mode==='random'&&Array.isArray(state.queue)){
    const allowed=new Set(filterQuestions(data.questions,history,{...filters,unanswered:false},view).map(q=>q.id));
    const restoredPool=[...new Set(state.queue)].filter(id=>allowed.has(id)&&byId.has(id)).slice(0,20).map(id=>byId.get(id));
    if(restoredPool.length)pool=restoredPool;
  }
  index=Math.max(0,pool.findIndex(q=>q.id===state.current));
  moduleButtons();renderQuestion();updateViewVisibility();if(view==='progress')renderProgress();save();
}
function setBank(next){
  if(next===bank||!banks[next])return;
  bankStates[bank]=snapshot();bank=next;data=banks[bank];
  renderBankControls();restoreSession(bankStates[bank]||{});
}
function activeModule(){return data.modules.find(m=>m.id===filters.module);}
function moduleButtons(){
  const all=[{id:'all',title:'全部范围',short:'全部',chapters:[]}].concat(data.modules);
  $('#module-list').innerHTML=all.map(m=>{const qs=m.id==='all'?data.questions:data.questions.filter(q=>q.module===m.id),s=summary(qs,history);return `<button class="module-button ${filters.module===m.id?'active':''}" data-module="${esc(m.id)}" aria-pressed="${filters.module===m.id}"><span>${esc(m.title)}</span><small>${s.done}/${s.total}</small></button>`;}).join('');
  $('#mobile-modules').innerHTML=all.map(m=>`<button class="mobile-module ${filters.module===m.id?'active':''}" data-module="${esc(m.id)}" aria-pressed="${filters.module===m.id}">${esc(m.short)}</button>`).join('');
  document.querySelectorAll('[data-module]').forEach(b=>b.addEventListener('click',()=>{filters.module=b.dataset.module;filters.chapter='all';filters.point='all';mode='sequence';renderChapterOptions();rebuild();}));
}
function renderChapterOptions(){
  if(isFocus()){
    const points=data.points.filter(p=>filters.module==='all'||p.module===filters.module);
    if(!points.some(p=>p.id===filters.point))filters.point='all';
    filters.chapter='all';
    $('#chapter-filter').innerHTML='<option value="all">'+(filters.module==='all'?'全部 95 个考点':'本专题全部考点')+'</option>'+points.map(p=>`<option value="${esc(p.id)}">${esc(p.id+' · '+p.title)}</option>`).join('');
    $('#chapter-filter').value=filters.point;
  }else{
    const chapters=data.chapters.filter(c=>filters.module==='all'||c.module===filters.module);
    if(!chapters.some(c=>String(c.chapter)===filters.chapter))filters.chapter='all';
    const allLabel=isPast()?'全部题目分组':filters.module==='all'?'全部 '+data.chapters.length+' 章':'本模块全部章节';
    $('#chapter-filter').innerHTML='<option value="all">'+allLabel+'</option>'+chapters.map(c=>`<option value="${c.chapter}">${isPast()?'':'第'+c.chapter+'章 · '}${esc(c.title)}</option>`).join('');
    $('#chapter-filter').value=filters.chapter;
  }
  $('#type-filter').value=filters.type;
  $('#reference-only').checked=!!filters.referenceOnly;$('#unanswered-only').checked=filters.unanswered;$('#unanswered-only').disabled=view==='wrong';
}
function rebuild(restoreId=null){
  const available=filterQuestions(data.questions,history,filters,view);
  pool=mode==='random'?shuffle(available).slice(0,20):available;index=Math.max(0,pool.findIndex(q=>q.id===restoreId));
  moduleButtons();renderQuestion();save();
}
function updateViewVisibility(){
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('#progress-view').hidden=view!=='progress';$('#practice-view').hidden=view==='progress';
}
function setView(next){
  const resumeId=view==='progress'&&next==='practice'?pool[index]?.id:null;
  view=next;updateViewVisibility();
  if(view==='progress'){renderProgress();save();return;}
  if(view==='wrong')filters.unanswered=false;
  renderChapterOptions();mode='sequence';rebuild(resumeId);
}
function renderQuestion(){
  stats();const q=pool[index];
  const chapter=data.chapters.find(c=>String(c.chapter)===filters.chapter);
  const scope=isFocus()?(filters.point==='all'?(activeModule()?.title||'全部考点'):'考点 '+filters.point):filters.chapter==='all'?(activeModule()?.title||'全部范围'):(isPast()?chapter?.title||'所选分组':'第'+filters.chapter+'章');
  $('#session-label').textContent=bankInfo[bank].short+' · '+(view==='wrong'?'错题复习':mode==='random'?'随机练习 · '+pool.length+'题':'顺序练习')+' · '+scope+(filters.unanswered?' · 本轮未做题':'')+(filters.referenceOnly?' · 补充参考答案':'');
  $('#sequence-button').hidden=mode!=='random';
  $('#question-card').hidden=!q;$('#empty-state').hidden=!!q;$('#question-nav').hidden=!q;
  if(!q){$('#empty-title').textContent=view==='wrong'?'这个范围没有待复习错题':filters.unanswered?'这个范围已经练完了':'当前筛选没有题目';$('#empty-message').textContent=view==='wrong'?'待核对题不进入错题；已计分的错题再次答对后自动移出。':'调整分组或题型，继续下一组练习。';return;}
  selected=new Set(history[q.id]?.selected||[]);submitted=!!history[q.id];
  const noOptions=!q.options?.length, unknown=q.type==='unknown';
  const typeLabel=q.type==='single'?'单选题':q.type==='multiple'?'多选题':'题型待核对';
  const sourceLabel=isPast()?`${esc(q.source?.section||'原文件')} · 原题号 ${esc(q.source?.number??'—')} · 收录序号 ${esc(q.source?.ordinal??'—')}`:`${isFocus()?`考点 ${esc(q.pointId)} · ${esc(q.pointTitle)}<br>`:''}第 ${q.chapter} 章 · ${esc(q.chapterTitle)}`;
  const instruction=noOptions?'这道题的选项格式不完整，可查看原题与参考说明；暂不计分。':unknown?'题型或选项存在疑义，可选择后查看参考说明；暂不计分。':q.type==='single'?'请选择一个答案，点击后查看反馈。':'可选择多个答案，选完后提交；可判分题须全部选对。';
  $('#question-card').innerHTML=`<div class="question-meta"><div class="question-tags"><span class="pill bank-pill">${bankInfo[bank].short}</span><span class="pill ${q.type==='multiple'?'multiple':''}">${typeLabel}</span>${q.referenceStatus?'<span class="pill reference-pill">已补参考答案</span>':''}${!canGrade(q)?'<span class="pill review-pill">条件待核对 · 不计分</span>':`<span class="difficulty">${esc(q.difficulty)}</span>`}</div><span class="question-id">${esc(q.id.toUpperCase())}</span></div><div class="chapter-name">${sourceLabel}</div><h2 id="question-title">${esc(q.stem||'原题格式待核对，请查看来源内容')}</h2><p class="instruction">${instruction}</p><div class="options" role="group" aria-label="答案选项"></div><div class="submit-row" id="submit-row" ${q.type==='single'&&!noOptions?'hidden':''}><small id="selection-count"></small><button class="primary-button" id="submit-answer">${noOptions?'查看原题':canGrade(q)?'提交答案':'查看原题与标记'}</button></div><div id="feedback-slot"></div>`;
  $('#submit-answer').addEventListener('click',submit);paintOptions();if(submitted)showFeedback(false);
  $('#position-label').textContent=(index+1)+' / '+pool.length;$('#prev-button').disabled=index===0;$('#next-button').textContent=index===pool.length-1?'查看进度 →':'下一题 →';
}
function paintOptions(){
  const q=pool[index],gradable=canGrade(q), answerLabel=q.referenceStatus?'参考答案':'原答案';
  $('.options').innerHTML=(q.options||[]).map(o=>{
    const chosen=selected.has(o.key),correct=submitted&&gradable&&answerKeys(q).includes(o.key),wrong=submitted&&gradable&&chosen&&!correct;
    let status=correct?(isPast()?(chosen?answerLabel:answerLabel+' · 未选'):(chosen?'正确':'正确 · 漏选')):(wrong?(isPast()?'与'+answerLabel+'不同':'选错'):'');
    if(q.type==='single'&&correct&&!chosen)status=isPast()?answerLabel:'正确答案';
    return `<button class="option ${q.type} ${chosen?'selected':''} ${correct?'correct':''} ${wrong?'wrong':''}" data-option="${esc(o.key)}" aria-pressed="${chosen}" ${submitted?'disabled':''}><span class="option-letter">${esc(o.key)}</span><span class="option-text">${esc(o.text)}</span>${status?`<span class="option-state">${status}</span>`:''}</button>`;
  }).join('');
  document.querySelectorAll('[data-option]').forEach(b=>b.addEventListener('click',()=>{if(submitted)return;const key=b.dataset.option;if(q.type==='single'){selected=new Set([key]);submit();}else{selected.has(key)?selected.delete(key):selected.add(key);paintOptions();}}));
  if(q.type!=='single'||!q.options?.length){$('#selection-count').textContent=q.options?.length?'已选 '+selected.size+' 项':'原题仅供查阅';$('#submit-answer').disabled=!!q.options?.length&&selected.size===0;$('#submit-row').hidden=submitted;}
}
function submit(){
  const q=pool[index],noOptions=!q.options?.length;
  if(submitted||(!noOptions&&selected.size===0))return;
  const old=history[q.id];submitted=true;
  history[q.id]={selected:[...selected].sort(),correct:gradeQuestion([...selected],q),attempts:(old?.attempts||0)+1,at:new Date().toISOString(),...(noOptions?{reviewed:true}:{})};
  paintOptions();showFeedback(true);stats();moduleButtons();save();
}
function sourceMarkup(sources=[]){
  const seen=new Set();return sources.map(s=>{
    const content=s.tableText||s.quote, key=s.page+':'+content;
    if(seen.has(key))return '';seen.add(key);
    const label=s.bookPage?`完整版 PDF · 第 ${esc(s.page)} 页 / 书内第 ${esc(s.bookPage)} 页`:`删减版 PDF · 第 ${esc(s.page)} 页`;
    return `<blockquote><span class="source-page">${label}${s.tableText?' · 原表/公式整理':''}</span><p>${s.tableText?esc(content):'“'+esc(content)+'”'}</p></blockquote>`;
  }).join('');
}
function referenceSourcesMarkup(sources=[]){
  return sources.map(s=>{
    const title=esc(s.title||'参考依据');
    const url=typeof s.url==='string'&&/^https?:\/\//.test(s.url)?s.url:null;
    const pages=Array.isArray(s.pdfPages)?s.pdfPages.join('、'):s.pdfPages;
    return `<li>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`:title}${pages?` · 删减版 PDF 第 ${esc(pages)} 页`:''}${s.excerpt?`<p>${esc(s.excerpt)}</p>`:''}</li>`;
  }).join('');
}
function pastFeedback(q,correct){
  const ungraded=correct===null, hasReference=!!q.referenceStatus;
  const title=ungraded?(hasReference?'参考答案已补充，本题暂不计分':'原答案待核对，暂不计分'):hasReference?(correct?'与参考答案一致':'与参考答案不一致'):(correct?'与原文件答案一致':'与原文件答案不一致');
  const answerText=(q.rawAnswers?.length?q.rawAnswers:q.answers||[]).join('、')||'未提供明确答案';
  const detail=hasReference?(ungraded?'原题存在条件缺失、选项歧义或版本差异，请阅读下方参考结论。':'本题按下方参考答案判分，原文件标记保留供对照。'):ungraded?(q.answerNote||'保留原题供核对，不纳入一致率和错题统计。'):'本题按上传文件的答案标记反馈，未据此核定现行临床标准。';
  const raw=q.source?.raw||'';
  const reference=hasReference?`<div class="knowledge-box reference-answer"><strong>补充参考答案${!ungraded?' · '+esc(answerKeys(q).join('、')):''}</strong><p>${esc(q.referenceAnswerText)}</p></div><h3 class="explanation-heading">核对说明</h3><p class="rationale">${esc(q.referenceRationale)}</p>${q.referenceSources?.length?`<h3 class="explanation-heading">参考依据</h3><ul class="reference-sources">${referenceSourcesMarkup(q.referenceSources)}</ul>`:''}`:`<h3 class="explanation-heading">原文件解析</h3><p class="rationale">${esc(q.rationale||'原文件未附独立解析。请结合教材核对，不将原答案标记直接视为现行临床结论。')}</p>${q.knowledge?`<div class="knowledge-box"><strong>原文件知识点</strong><p>${esc(q.knowledge)}</p></div>`:''}`;
  return `<section class="feedback" aria-label="作答反馈与原题来源"><div class="result-banner ${ungraded?'neutral':correct?'':'incorrect'}" role="status"><span class="result-symbol" aria-hidden="true">${ungraded?'?':correct?'✓':'×'}</span><div><strong>${title}</strong><small>${esc(detail)}</small></div></div><p class="answer-line">你的选择 <b>${[...selected].sort().join('、')||'已查看原题'}</b><br>${hasReference?'原文件标记（供对照）':ungraded?'原文件标记（待核对）':'原文件答案'} <b>${esc(answerText)}</b></p>${reference}${!hasReference&&!ungraded&&q.answerNote?`<div class="version-note">${esc(q.answerNote)}</div>`:''}<details class="original-source"><summary>查看原题及答案标记</summary><p class="source-page">${esc(q.source?.document||'危急重症题.doc')} · ${esc(q.source?.section||'原文件')} · 原题号 ${esc(q.source?.number??'—')} · 收录序号 ${esc(q.source?.ordinal??'—')}</p><pre>${esc(raw||'原题内容未能提取')}</pre></details>${q.note?`<div class="version-note"><b>原题提示</b> · ${esc(q.note)}</div>`:''}<div class="feedback-actions"><button class="quiet-button" id="retry-question">↻ 遮住反馈，再练一次</button></div></section>`;
}
function showFeedback(announce){
  const q=pool[index],correct=gradeQuestion([...selected],q);
  if(isPast())$('#feedback-slot').innerHTML=pastFeedback(q,correct);
  else{
    const missed=q.answers.filter(a=>!selected.has(a)),extras=[...selected].filter(a=>!q.answers.includes(a));
    const detail=correct?'这道题的关键条件，你判断对了。':q.type==='multiple'?[missed.length?'漏选 '+missed.join('、'):'',extras.length?'多选/错选 '+extras.join('、'):''].filter(Boolean).join('；'):'看看哪个条件改变了判断。';
    $('#feedback-slot').innerHTML=`<section class="feedback" aria-label="作答反馈与教材知识"><div class="result-banner ${correct?'':'incorrect'}" role="status"><span class="result-symbol" aria-hidden="true">${correct?'✓':'×'}</span><div><strong>${correct?'回答正确':'本题未答对'}</strong><small>${esc(detail)}</small></div></div><p class="answer-line">你的答案 <b>${[...selected].sort().join('、')}</b>　 ·　 正确答案 <b>${q.answers.join('、')}</b></p><h3 class="explanation-heading">答案解析</h3><p class="rationale">${esc(q.rationale)}</p><div class="knowledge-box"><strong>这一题，记住这一点</strong><p>${esc(q.knowledge)}</p></div><div class="source-heading"><h3>教材原文摘录</h3><small>来源：《实用重症医学》第2版</small></div>${sourceMarkup(q.sources)}${q.note?`<div class="version-note"><b>版本提示</b> · ${esc(q.note)}</div>`:''}<div class="feedback-actions"><button class="quiet-button" id="retry-question">↻ 遮住解析，再答一次</button></div></section>`;
  }
  $('#retry-question').addEventListener('click',()=>{selected=new Set();submitted=false;$('#feedback-slot').innerHTML='';paintOptions();$('#question-title').scrollIntoView({behavior:'smooth',block:'start'});});
  if(announce){const banner=$('.result-banner');if(banner.getBoundingClientRect().bottom>innerHeight-15)banner.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
}
function navigate(delta){if(delta>0&&index===pool.length-1){setView('progress');$('#main').scrollIntoView({behavior:'smooth'});return;}index=Math.min(pool.length-1,Math.max(0,index+delta));renderQuestion();save();$('#question-card').scrollIntoView({behavior:'smooth',block:'start'});}
function renderProgress(){
  stats();$('#progress-grid').innerHTML=data.modules.map(m=>{const s=summary(data.questions.filter(q=>q.module===m.id),history);return `<article class="progress-card"><div class="progress-card-head"><h3>${esc(m.title)}</h3><span>${s.done} / ${s.total} 题</span></div><div class="progress-track" aria-hidden="true"><i style="width:${s.total?s.done/s.total*100:0}%"></i></div><div class="progress-card-foot"><span>${isPast()?'与答案一致':'最近答对'} ${s.correct} 题 · 待复习 ${s.wrong} 题${s.ungraded?' · 已看不计分 '+s.ungraded+' 题':''}</span><button class="quiet-button" data-practice-module="${esc(m.id)}">去练习 →</button></div></article>`;}).join('');
  document.querySelectorAll('[data-practice-module]').forEach(b=>b.addEventListener('click',()=>{filters={...emptyFilters(),module:b.dataset.practiceModule};setView('practice');}));
}
function renderNotes(){
  const notes=data.notes||[];$('#supplement-notes').hidden=!isPast()||!notes.length;
  $('#notes-title').textContent='原文件附加复习笔记 · '+notes.length+' 条';
  $('#notes-list').innerHTML=notes.map(n=>`<details class="supplement-item"><summary>${esc(n.number)}. ${esc(n.title||'原文笔记')}</summary><p>${esc(n.text)}</p>${n.reviewNote||n.note||n.issue||n.reason?`<div class="version-note">${esc(n.reviewNote||n.note||n.issue||n.reason)}</div>`:''}</details>`).join('');
}
function bindings(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('.brand').addEventListener('click',e=>{e.preventDefault();setView('practice');});
  $('#chapter-filter').addEventListener('change',e=>{if(isFocus())filters.point=e.target.value;else filters.chapter=e.target.value;mode='sequence';rebuild();});
  $('#type-filter').addEventListener('change',e=>{filters.type=e.target.value;mode='sequence';rebuild();});
  $('#reference-only').addEventListener('change',e=>{filters.referenceOnly=e.target.checked;mode='sequence';rebuild();});
  $('#unanswered-only').addEventListener('change',e=>{filters.unanswered=e.target.checked;mode='sequence';rebuild();});
  $('#random-button').addEventListener('click',()=>{mode='random';rebuild();if(pool.length)toast('已从'+bankInfo[bank].short+'随机抽取 '+pool.length+' 题');});
  $('#sequence-button').addEventListener('click',()=>{mode='sequence';rebuild();});
  $('#prev-button').addEventListener('click',()=>navigate(-1));$('#next-button').addEventListener('click',()=>navigate(1));
  $('#empty-reset').addEventListener('click',()=>{filters=emptyFilters();setView('practice');});
  $('#continue-practice').addEventListener('click',()=>setView('practice'));
  $('#reset-progress').addEventListener('click',()=>{if(confirm('清空当前浏览器中“'+bankInfo[bank].title+'”的答题记录和错题？其他题库的记录会保留。此操作无法撤销。')){for(const q of data.questions)delete history[q.id];save();renderProgress();toast('当前题库的本机记录已清空');}});
}
function closeAbout(){const d=$('#about-dialog');if(typeof d.close==='function')d.close();else d.removeAttribute('open');}
$('#about-open').addEventListener('click',()=>{const d=$('#about-dialog');if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');});
$('#about-close').addEventListener('click',closeAbout);$('#about-done').addEventListener('click',closeAbout);
$('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeAbout();}});
async function loadBank(file){const response=await fetch(file+'?v=7');if(!response.ok)throw Error(file+' 加载失败');const loaded=await response.json();if(!Array.isArray(loaded.questions)||!loaded.questions.length)throw Error(file+' 尚未准备好');return loaded;}
async function init(){
  try{
    const bankIds=Object.keys(bankInfo);
    const results=await Promise.allSettled(bankIds.map(id=>loadBank(bankInfo[id].file)));
    for(const [i,id] of bankIds.entries())if(results[i].status==='fulfilled')banks[id]=results[i].value;
    if(!Object.keys(banks).length)throw Error('题库暂时无法加载');
    const failures=bankIds.filter(id=>!banks[id]);
    if(failures.length){$('#bank-load-warning').hidden=false;$('#bank-load-warning').textContent=failures.map(id=>bankInfo[id].title).join('、')+' 暂未加载，其他题库仍可使用。稍后刷新页面重试。';}
    const allQuestions=Object.values(banks).flatMap(b=>b.questions);byId=new Map(allQuestions.map(q=>[q.id,q]));
    try{restored=JSON.parse(localStorage.getItem(KEY)||'null');localStorage.setItem(KEY+'.check','1');localStorage.removeItem(KEY+'.check');}catch{canSave=false;$('#storage-warning').hidden=false;}
    history=sanitizeHistory(restored?.history,allQuestions);
    if(restored?.history&&typeof restored.history==='object'&&!Array.isArray(restored.history))for(const [id,h] of Object.entries(restored.history))if(!byId.has(id))unavailableHistory[id]=h;
    bankStates=restored?.bankStates&&typeof restored.bankStates==='object'&&!Array.isArray(restored.bankStates)?restored.bankStates:{};
    const oldBank=Object.prototype.hasOwnProperty.call(bankInfo,restored?.bank)?restored.bank:restored?'mock':'focus';
    if(!bankStates[oldBank]&&restored)bankStates[oldBank]={filters:restored.filters,mode:restored.mode,queue:restored.queue,current:restored.current,view:restored.view};
    bank=banks[oldBank]?oldBank:bankIds.find(id=>banks[id]);data=banks[bank];
    $('#bank-total-label').textContent=Object.keys(banks).map(id=>banks[id].questions.length+' '+bankInfo[id].short).join(' / ');
    $('#about-past-count').textContent=banks.past?banks.past.questions.length:'—';
    bindings();renderBankControls();restoreSession(bankStates[bank]||{});
    if(!canSave)$('#save-hint').textContent='当前浏览器无法保存记录，本次仍可正常作答';
  }catch(e){$('#question-card').innerHTML='<div class="loading">题库暂时未能载入。请检查网络后重试。<br><button id="reload-data" class="primary-button" style="margin-top:18px">重新载入</button></div>';$('#reload-data').addEventListener('click',()=>location.reload());console.error('Question bank could not be loaded:',e);}
}
init();
