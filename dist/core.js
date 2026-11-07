export function grade(selected, answers) {
  const a = [...new Set(selected)].sort();
  const b = [...new Set(answers)].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export function sanitizeHistory(raw, questions) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const q of questions) {
    const h = raw[q.id];
    if (!h || !Array.isArray(h.selected)) continue;
    const valid = q.options.map(o => o.key);
    if (h.selected.some(v => !valid.includes(v))) continue;
    const selected = [...new Set(h.selected)];
    if (!selected.length || (q.type === 'single' && selected.length !== 1)) continue;
    result[q.id] = {selected, correct: grade(selected, q.answers), attempts: Number.isFinite(h.attempts) ? Math.max(1, Math.floor(h.attempts)) : 1, at: typeof h.at === 'string' ? h.at : ''};
  }
  return result;
}
export function filterQuestions(questions, history, filters, view) {
  return questions.filter(q =>
    (filters.module === 'all' || q.module === filters.module) &&
    (filters.chapter === 'all' || q.chapter === Number(filters.chapter)) &&
    (filters.type === 'all' || q.type === filters.type) &&
    (!filters.unanswered || !history[q.id]) &&
    (view !== 'wrong' || (history[q.id] && !history[q.id].correct))
  );
}
export function summary(questions, history) {
  const done = questions.filter(q => history[q.id]);
  const correct = done.filter(q => history[q.id].correct).length;
  return {total: questions.length, done: done.length, correct, wrong: done.length - correct, rate: done.length ? Math.round(correct / done.length * 100) : null};
}
export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i=out.length-1; i>0; i--) { const j=Math.floor(random()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
