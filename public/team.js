// Team roster dialog, task assignees and the assignment layer inside Gantt bars.
function personById(id){return team.find(p=>p.id===id)}
function hourOptions(selected){return [...new Set([...HOUR_OPTIONS,selected].filter(Boolean))].sort((a,b)=>b-a)
 .map(h=>`<option value="${h}" ${h===selected?'selected':''}>${hoursLabel(h)}${h===8?' · полный день':h===4?' · половина дня':''}</option>`).join('')}
function avatar(person,extra=''){
 const [bg,ink]=avatarColor(person);
 return person.photo?`<img class="assignee-avatar${extra}" src="${esc(person.photo)}" alt="" aria-hidden="true">`:`<span class="assignee-avatar${extra}" style="--avatar-bg:${bg};--avatar-ink:${ink}" aria-hidden="true">${esc(initials(person.name))}</span>`;
}

function assignmentLayer(task,from,to){
 const slices=assignmentSlices(task,team,from,to);
 if(!slices.length)return {className:'',layer:'',lead:'',chips:'',nameStyle:''};
 const pct=n=>n/slices[0].total*100;
 // Parallel people share one label: a small avatar stack, first names and hours.
 const stack=members=>{const shown=members.slice(0,3),more=members.length-shown.length;
  return `<span class="assignee-stack">${shown.map(m=>avatar(m.person)).join('')}${more?`<span class="assignee-avatar assignee-more">+${more}</span>`:''}</span>`};
 const chip=s=>`${stack(s.members)}<span class="assignee-label">${esc(sliceLabel(s.members))}</span>`;
 const layer=`<span class="assignment-layer" aria-hidden="true">${slices.map((s,i)=>{
  const prev=slices[i-1],joined=prev&&prev.offset+prev.length===s.offset;
  return `<span class="assignment-segment${joined?' is-handover':''}" style="left:${pct(s.offset)}%;width:${pct(s.length)}%;--load:${loadMix(sliceHours(s.members))}%"></span>`;
 }).join('')}</span>`;
 // Every slice gets its own label; layoutAssignmentLabels decides which one rides
 // next to the title at the visible edge and which ones shrink or hide.
 const lead='<span class="assignee-chip is-lead" aria-hidden="true" hidden></span>';
 const chips=slices.map(s=>`<span class="assignee-chip" aria-hidden="true" data-id="${esc(s.key)}" data-from="${pct(s.offset)}" data-to="${pct(s.offset+s.length)}" style="left:calc(${pct(s.offset)}% + 6px)">${chip(s)}</span>`).join('');
 return {className:'has-assignments',layer,lead,chips,nameStyle:''};
}

// Keeps the title and assignee labels from overlapping at any scroll position.
// Positions come from CSS: the title group is sticky at the visible left edge and every
// other label sits at the start of its own segment. This only toggles states:
// - the person beside the title is whoever's segment is under it right now;
// - that label shrinks to the avatar, then hides, when the title needs the room;
// - a later label shrinks to the avatar if its segment is narrow and hides while the
//   title group passes over it; the deadline date hides when the title reaches it.
// Fits one label into `room` pixels: names are shortened letter by letter (with an
// ellipsis), then only the avatars remain, and the label hides only when not even
// the avatars fit. Returns the width it now takes.
function fitAssigneeLabel(chip,room,extra=0){
 const stack=chip.querySelector('.assignee-stack'),label=chip.querySelector('.assignee-label');
 chip.classList.remove('is-compact','is-hidden');if(label)label.style.maxWidth='';
 const stackWidth=(stack?stack.offsetWidth:0)+extra;
 if(room<stackWidth){chip.classList.add('is-hidden');return 0}
 if(!label)return stackWidth;
 const labelRoom=room-stackWidth-5,natural=label.scrollWidth;
 if(labelRoom<16){chip.classList.add('is-compact');return stackWidth}
 if(labelRoom<natural)label.style.maxWidth=labelRoom+'px';
 return stackWidth+5+Math.min(natural,labelRoom);
}
function layoutAssignmentLabels(bar){
 const width=bar.clientWidth,name=bar.querySelector('.bar-name'),slot=bar.querySelector('.assignee-chip.is-lead'),title=bar.querySelector('.bar-title'),detail=bar.querySelector('.bar-detail');
 if(!width||!name||!slot||!title)return;
 const box=bar.getBoundingClientRect(),gap=8;
 const segments=[...bar.querySelectorAll('.assignee-chip[data-from]')].map(chip=>({chip,from:Number(chip.dataset.from)/100*width,to:Number(chip.dataset.to)/100*width}));
 const start=name.getBoundingClientRect().left-box.left,titleWidth=title.scrollWidth,sliding=start>15;
 // The person beside the title is whoever's segment lies under that label itself.
 const at=x=>segments.find(s=>s.from<=x+1&&s.to>x+1);
 const current=at(start+titleWidth+gap)||at(start);
 if(current){if(slot.dataset.for!==current.chip.dataset.id){slot.innerHTML=current.chip.innerHTML;slot.dataset.for=current.chip.dataset.id}slot.hidden=false}
 else{slot.hidden=true;slot.dataset.for=''}
 if(detail)detail.classList.remove('is-hidden');
 let detailLeft=detail&&detail.offsetParent?detail.getBoundingClientRect().left-box.left:width-14;
 // The date gives way first when the title itself needs the room.
 if(detail&&detail.offsetParent&&start+Math.min(titleWidth,96)+gap>detailLeft){detail.classList.add('is-hidden');detailLeft=width-14}
 // The lead label gets what the title leaves before the next person's label (or the
 // date), shrinking letter by letter as that label comes closer (9px: divider).
 const next=segments.filter(s=>s!==current&&s.from>start+1).reduce((m,s)=>Math.min(m,s.from+6),Infinity);
 if(!slot.hidden)fitAssigneeLabel(slot,Math.min(detailLeft,next)-gap-start-titleWidth-gap,9);
 if(slot.classList.contains('is-hidden')){slot.classList.remove('is-hidden');slot.hidden=true}
 const groupEnd=name.getBoundingClientRect().right-box.left;
 if(detail&&detail.offsetParent&&groupEnd+gap>detailLeft){detail.classList.add('is-hidden');detailLeft=width-14}
 const end=detail&&!detail.classList.contains('is-hidden')?detailLeft-gap:width-14;
 for(const s of segments){
  s.chip.style.clipPath='';
  if(s===current||s.to<=start+1){s.chip.classList.remove('is-compact');s.chip.classList.add('is-hidden');continue}
  // While the bar sits still a covered label moves just past the title. While the title
  // slides, labels stay put and the title passes over them like a curtain, letter by letter.
  let left=s.from+6;
  if(!sliding&&left<groupEnd+gap)left=groupEnd+gap;
  s.chip.style.left=left===s.from+6?`calc(${s.chip.dataset.from}% + 6px)`:left+'px';
  const taken=fitAssigneeLabel(s.chip,Math.min(s.to,end)-left-6);
  const covered=groupEnd+gap-left;
  if(sliding&&covered>0){if(covered>=taken)s.chip.classList.add('is-hidden');else s.chip.style.clipPath=`inset(0 0 0 ${covered}px)`}
 }
}

function assignmentTooltip(task){
 const rows=(task.assignments||[]).filter(a=>personById(a.personId)).sort((a,b)=>a.start.localeCompare(b.start));
 if(!rows.length)return '';
 return `<ul class="tooltip-assignees">${rows.map(a=>{const p=personById(a.personId);return `<li>${avatar(p)}<span>${esc(p.name)} · ${hoursLabel(a.hours)}<small>${fmt(a.start)} — ${fmt(a.end)}</small></span></li>`}).join('')}</ul>`;
}

// Task card: one row per assignment.
function addAssignment(a){
 if(!team.length){toast('Сначала добавьте людей в команду в меню «···» → «Команда»');openTeam();return}
 const rows=[...$('#assignments').children],last=rows.at(-1),f=$('#form').elements;
 if(!a){
  // Hours are set per task; a new row starts from a full day or the previous row's hours.
  const person=team[0],start=last?day(last.querySelector('[data-field="end"]').value,1):(f.start.value||TODAY);
  const end=f.end.value&&f.end.value>=start?f.end.value:start;
  const hours=last?Number(last.querySelector('[data-field="hours"]').value):FULL_DAY;
  a={id:crypto.randomUUID(),personId:person.id,start,end,hours};
 }
 const row=document.createElement('div');row.className='assignment-row';row.dataset.id=a.id;
 const people=[...team];if(!personById(a.personId))people.unshift({id:a.personId,name:'Удалён из команды',hours:a.hours});
 row.innerHTML=`<span class="assignment-person"><select data-field="person" aria-label="Исполнитель">${people.map(p=>`<option value="${esc(p.id)}" ${p.id===a.personId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></span><span class="assignment-hours"><select data-field="hours" aria-label="Часов в день">${hourOptions(a.hours)}</select></span><button type="button" class="assignment-remove" aria-label="Убрать исполнителя">×</button><span class="assignment-start"><input data-field="start" type="date" required aria-label="Начало работы" value="${esc(a.start)}"></span><span class="assignment-end"><input data-field="end" type="date" required aria-label="Конец работы" value="${esc(a.end)}"></span>`;
 row.querySelector('.assignment-remove').onclick=()=>row.remove();
 $('#assignments').append(row);initPickers(row);
}
function resetAssignments(task={}){
 $('#assignments').replaceChildren();(task.assignments||[]).forEach(addAssignment);
 // Tasks created before assignees existed keep their old free-text owner until someone is assigned.
 const legacy=!task.assignments?.length&&task.person&&task.person!=='Не назначен'?task.person:'';
 $('#legacyPerson').hidden=!legacy;$('#legacyPerson').textContent=legacy?'Раньше ответственным был указан: '+legacy+'. Добавьте исполнителя из команды.':'';
}
// Toolbar button: a small stack of team avatars that opens the roster.
function renderTeamButton(){
 const shown=team.slice(0,3);
 $('#teamButton').innerHTML=`${shown.length?`<span class="team-stack">${shown.map(p=>avatar(p)).join('')}</span>`:'<span class="team-stack-empty" aria-hidden="true">+</span>'}<span class="team-button-label">Команда</span>${team.length?`<span class="team-button-count">${team.length}</span>`:''}`;
 $('#teamButton').setAttribute('aria-label',team.length?`Команда: ${team.length} чел. Открыть состав`:'Команда: пока никого. Добавить людей');
}
// Labels and summaries built from assignees (with the legacy text as a fallback).
function taskPeopleLabel(task){
 const people=taskPeople(task,team);
 return people.length?people.map(p=>firstName(p.name)).join(', '):personSummary(task,team);
}
function collectAssignments(){
 return [...$('#assignments').children].map(row=>({id:row.dataset.id,personId:row.querySelector('[data-field="person"]').value,start:row.querySelector('[data-field="start"]').value,end:row.querySelector('[data-field="end"]').value,hours:Number(row.querySelector('[data-field="hours"]').value)}));
}
$('#addAssignment').onclick=()=>addAssignment();

// Roster dialog: the only place where people are named and given an avatar (colour or a small photo).
// Hours are not set here: they belong to each task assignment.
const colorSwatches=()=>Object.entries(AVATAR_COLORS).map(([key,[bg]])=>`<button type="button" class="avatar-swatch" data-color="${key}" style="--swatch:${bg}" aria-label="Цвет ${key}"></button>`).join('');
function rowPerson(row){return {id:row.dataset.id,name:row.querySelector('[data-field="name"]').value.trim(),...(row.dataset.color?{color:row.dataset.color}:{}),...(row.photo?{photo:row.photo}:{})}}
function refreshRowAvatar(row){
 const p=rowPerson(row);row.querySelector('.avatar-picker summary').innerHTML=avatar({...p,name:p.name||'?'});
 row.querySelector('.avatar-remove-photo').hidden=!row.photo;
 row.querySelectorAll('.avatar-swatch').forEach(b=>b.setAttribute('aria-pressed',String(!row.photo&&b.dataset.color===(row.dataset.color||Object.keys(AVATAR_COLORS).find(k=>AVATAR_COLORS[k]===avatarColor(p))))));
}
async function photoDataURL(file){
 if(!file.type.startsWith('image/'))throw new Error('Выберите картинку');
 const bitmap=await createImageBitmap(file),size=96,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const side=Math.min(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');
 ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);
 for(const quality of [.85,.7,.55,.4]){const url=canvas.toDataURL('image/jpeg',quality);if(url.length<=MAX_PHOTO)return url}
 throw new Error('Не удалось уменьшить фото');
}
function teamRow(p={id:crypto.randomUUID(),name:''}){
 const row=document.createElement('div');row.className='team-row';row.dataset.id=p.id;
 if(p.color)row.dataset.color=p.color;row.photo=p.photo||'';
 row.innerHTML=`<details class="avatar-picker"><summary aria-label="Цвет или фото"></summary><div class="avatar-panel"><div class="avatar-swatches">${colorSwatches()}</div><label class="avatar-upload">Загрузить фото<input type="file" accept="image/*" hidden></label><button type="button" class="avatar-remove-photo">Убрать фото</button></div></details><input data-field="name" maxlength="200" placeholder="Имя и фамилия" aria-label="Имя" value="${esc(p.name)}"><button type="button" class="team-remove" aria-label="Убрать из команды" title="Убрать из команды"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>`;
 row.querySelector('[data-field="name"]').addEventListener('input',()=>refreshRowAvatar(row));
 row.querySelector('.avatar-swatches').onclick=e=>{const b=e.target.closest('[data-color]');if(!b)return;row.dataset.color=b.dataset.color;row.photo='';refreshRowAvatar(row);row.querySelector('.avatar-picker').open=false};
 row.querySelector('.avatar-upload input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{row.photo=await photoDataURL(file);refreshRowAvatar(row);row.querySelector('.avatar-picker').open=false}catch(error){toast(error.message)}};
 row.querySelector('.avatar-remove-photo').onclick=()=>{row.photo='';refreshRowAvatar(row)};
 row.querySelector('.team-remove').onclick=()=>{
  const used=tasks.filter(t=>(t.assignments||[]).some(a=>a.personId===p.id)).length;
  if(used&&!confirm(`${p.name||'Этот человек'} назначен в задачах: ${used}. Эти назначения перестанут показываться на Ганте. Убрать?`))return;
  row.remove();
 };
 $('#teamList').append(row);initPickers(row);refreshRowAvatar(row);return row;
}
$('#teamList').addEventListener('toggle',e=>{if(e.target.matches?.('.avatar-picker')&&e.target.open)$('#teamList').querySelectorAll('.avatar-picker[open]').forEach(d=>{if(d!==e.target)d.open=false})},true);
$('#teamDialog').addEventListener('click',e=>{if(!e.target.closest('.avatar-picker'))$('#teamList').querySelectorAll('.avatar-picker[open]').forEach(d=>d.open=false)});
function openTeam(){
 $('.more').open=false;$('#teamList').replaceChildren();team.forEach(p=>teamRow(p));
 if(!team.length)teamRow();
 $('#teamError').hidden=true;$('#teamDialog').showModal();
}
$('#teamButton').onclick=openTeam;
$('#addTeamMember').onclick=()=>teamRow().querySelector('[data-field="name"]').focus();
$('#closeTeam').onclick=()=>$('#teamDialog').close();
$('#cancelTeam').onclick=()=>$('#teamDialog').close();
$('#teamForm').onsubmit=async e=>{
 e.preventDefault();
 const next=[...$('#teamList').children].map(rowPerson).filter(p=>p.name);
 if(!validTeam(next)){$('#teamError').textContent='Проверьте имена.';$('#teamError').hidden=false;return}
 const before=revision;
 if(await change('team',{team:next})){
  if(editRevision===before)editRevision=revision;
  $('#teamDialog').close();
  // Refresh person lists in an open task card without losing chosen values.
  if($('#editor').open){const draft=collectAssignments();resetAssignments({assignments:draft,person:tasks.find(t=>t.id===editing)?.person})}
 }
};
