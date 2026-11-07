export function grade(selected, answers) {
  const a = [...new Set(selected)].sort();
  const b = [...new Set(answers)].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export function answerKeys(question) {
  return question?.referenceStatus === 'confirmed' ? question.referenceAnswers : question?.answers;
}
export function canGrade(question) {
  if (!question) return false;
  if (question.referenceStatus && question.referenceStatus !== 'confirmed') return false;
  if (!question.referenceStatus && question.answerStatus && question.answerStatus !== 'provided') return false;
  if (!['single', 'multiple'].includes(question.type)) return false;
  const keys = (question.options || []).map(option => option.key);
  const answers = answerKeys(question);
  return keys.length >= 2 && new Set(keys).size === keys.length &&
    Array.isArray(answers) && answers.length > 0 && new Set(answers).size === answers.length &&
    answers.every(answer => keys.includes(answer)) &&
    (question.type !== 'single' || answers.length === 1);
}
export function gradeQuestion(selected, question) {
  return canGrade(question) ? grade(selected, answerKeys(question)) : null;
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
    const reviewOnly = !canGrade(q);
    if ((!selected.length && !(reviewOnly && h.reviewed === true)) || (q.type === 'single' && selected.length > 1)) continue;
    result[q.id] = {selected, correct: gradeQuestion(selected, q), attempts: Number.isFinite(h.attempts) ? Math.max(1, Math.floor(h.attempts)) : 1, at: typeof h.at === 'string' ? h.at : ''};
    if (reviewOnly && h.reviewed === true) result[q.id].reviewed = true;
  }
  return result;
}
export function filterQuestions(questions, history, filters, view) {
  return questions.filter(q =>
    (filters.module === 'all' || q.module === filters.module) &&
    (filters.chapter === 'all' || q.chapter === Number(filters.chapter)) &&
    (filters.type === 'all' || q.type === filters.type) &&
    (!filters.referenceOnly || !!q.referenceStatus) &&
    (!filters.unanswered || !history[q.id]) &&
    (view !== 'wrong' || (history[q.id] && history[q.id].correct === false))
  );
}
export function summary(questions, history) {
  const done = questions.filter(q => history[q.id]);
  const correct = done.filter(q => history[q.id].correct === true).length;
  const wrong = done.filter(q => history[q.id].correct === false).length;
  const graded = correct + wrong;
  return {total: questions.length, done: done.length, correct, wrong, graded, ungraded: done.length - graded, rate: graded ? Math.round(correct / graded * 100) : null};
}
export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i=out.length-1; i>0; i--) { const j=Math.floor(random()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
