// Team roster and per-task assignments. Pure helpers shared by the browser, backend and tests.
export const HOUR_OPTIONS=[8,7,6,5,4,3,2,1];
export const MAX_TEAM=100,MAX_ASSIGNMENTS=50,MAX_PHOTO=24000;
// Avatar colours: background and the readable ink on top of it.
export const AVATAR_COLORS={yellow:['#f5d24d','#3d3108'],blue:['#80b9ef','#0c2f52'],pink:['#eda7cf','#4b1530'],green:['#a7d7b1','#173d20'],coral:['#f2a185','#4a1b0c'],violet:['#b9a3e8','#26215c'],gray:['#c9ced6','#22262c'],black:['#2b2d31','#ffffff']};
const validPhoto=v=>v===undefined||(typeof v==='string'&&v.length<=MAX_PHOTO&&/^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(v));
const stamp=s=>Date.parse(s+'T12:00:00Z');
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(stamp(s))&&new Date(stamp(s)).toISOString().slice(0,10)===s;
const validHours=h=>typeof h==='number'&&Number.isFinite(h)&&h>0&&h<=24&&Math.round(h*2)===h*2;
const text=(v,max)=>typeof v==='string'&&v.length<=max;

export function validTeam(team){
 if(team===undefined)return true;
 return Array.isArray(team)&&team.length<=MAX_TEAM&&new Set(team.map(p=>p?.id)).size===team.length
  &&team.every(p=>p&&text(p.id,128)&&p.id.length>0&&text(p.name,200)&&p.name.trim().length>0&&(p.hours===undefined||validHours(p.hours))
   &&(p.color===undefined||Object.hasOwn(AVATAR_COLORS,p.color))&&validPhoto(p.photo));
}
export function validAssignments(task){
 if(task.assignments===undefined)return true;
 const list=task.assignments;
 return Array.isArray(list)&&list.length<=MAX_ASSIGNMENTS&&new Set(list.map(a=>a?.id)).size===list.length
  &&list.every(a=>a&&text(a.id,128)&&a.id.length>0&&text(a.personId,128)&&a.personId.length>0
   &&validDate(a.start)&&validDate(a.end)&&a.start<=a.end&&validHours(a.hours));
}

export function initials(name){
 const words=String(name||'').trim().split(/\s+/).filter(Boolean);
 return ((words[0]?.[0]||'?')+(words[1]?.[0]||'')).toUpperCase();
}
export const firstName=name=>String(name||'').trim().split(/\s+/)[0]||'';
export const hoursLabel=h=>(Number.isInteger(h)?h:String(h).replace('.',','))+' ч';

// How strongly a segment is tinted, by absolute hours per day: a full 8-hour day
// reads as the task colour, fewer hours fade only slightly so segments stay related.
export const FULL_DAY=8;
export function loadMix(hours){
 const ratio=Math.max(0,Math.min(1,hours/FULL_DAY));
 return Math.round(62+38*ratio);
}

// Default colour for people created before colours existed: stable per id.
export function avatarColor(person){
 if(person?.color&&AVATAR_COLORS[person.color])return AVATAR_COLORS[person.color];
 const keys=Object.keys(AVATAR_COLORS).slice(0,6),sum=[...String(person?.id||'')].reduce((n,c)=>n+c.charCodeAt(0),0);
 return AVATAR_COLORS[keys[sum%keys.length]];
}

// People on a task, in assignment order, without duplicates.
export function taskPeople(task,team){
 const people=new Map((team||[]).map(p=>[p.id,p])),seen=new Set(),result=[];
 for(const a of [...(task.assignments||[])].sort((a,b)=>a.start.localeCompare(b.start)))
  if(people.has(a.personId)&&!seen.has(a.personId)){seen.add(a.personId);result.push(people.get(a.personId))}
 return result;
}
// Plain-text summary stored in the legacy `person` field (filters, passports, backups).
export function personSummary(task,team){
 const people=taskPeople(task,team);
 if(!people.length)return task.person&&task.person!=='Не назначен'?task.person:'Не назначен';
 return people.map(p=>p.name).join(', ').slice(0,200);
}

// Segments of the visible bar range [from,to] (inclusive dates), in day offsets from `from`.
export function assignmentSegments(task,team,from,to){
 const people=new Map((team||[]).map(p=>[p.id,p]));
 const days=(a,b)=>Math.round((stamp(a)-stamp(b))/86400000);
 const total=days(to,from)+1;
 return (task.assignments||[])
  .filter(a=>people.has(a.personId)&&a.end>=from&&a.start<=to)
  .sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end))
  .map(a=>{const start=a.start<from?from:a.start,end=a.end>to?to:a.end;
   return {assignment:a,person:people.get(a.personId),offset:days(start,from),length:days(end,start)+1,total,clippedStart:a.start<from}});
}
