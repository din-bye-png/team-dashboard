// A task keeps a log of its deadline moves, oldest first: [{from,to,at}].
// The first entry's `from` is the original deadline; `at` is the day of the change.
export const MAX_SHIFTS=50;
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const days=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/86400000);

export function validShifts(t){
  const log=t?.deadlineShifts;
  return log===undefined||Array.isArray(log)&&log.length<=MAX_SHIFTS
    &&log.every(s=>s&&isDate(s.from)&&isDate(s.to)&&isDate(s.at)&&s.from!==s.to);
}

// The log to store when `prev` (the saved task, if any) becomes `task`.
// Several moves on the same day collapse into one, so dragging a bar back and
// forth does not fill the log; a move undone the same day leaves no trace.
export function recordShift(prev,task,today){
  const log=(prev?.deadlineShifts||[]).map(s=>({...s}));
  if(!prev?.end||!task.end||prev.end===task.end)return log;
  const last=log.at(-1);
  if(last&&last.at===today&&last.to===prev.end){last.to=task.end;if(last.from===last.to)log.pop();}
  else log.push({from:prev.end,to:task.end,at:today});
  if(log.length>MAX_SHIFTS)log.splice(1,log.length-MAX_SHIFTS);
  return log;
}

export function shiftSummary(t){
  const log=t?.deadlineShifts;
  if(!log?.length||!t.end)return null;
  return {original:log[0].from,days:days(t.end,log[0].from),log};
}

export const shiftLabel=n=>n?'перенос '+(n>0?'+':'−')+Math.abs(n)+' д':'';
