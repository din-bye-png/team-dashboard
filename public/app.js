const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=s=>new Date(s+'T12:00:00'),iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,day=(s,n)=>{let d=parse(s);d.setDate(d.getDate()+n);return iso(d)},diff=(a,b)=>Math.round((parse(a)-parse(b))/86400000),fmt=s=>parse(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}),TODAY=iso(new Date()),BASE=TODAY;
let tasks=[],view='all',rangeStart=day(TODAY,-((parse(TODAY).getDay()+6)%7)),editing=null;
let radarHoverId=null,radarFocusId=null;
let taskReorder=null;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(parse(s))&&iso(parse(s))===s;
function valid(data){return Array.isArray(data)&&data.length<=500&&data.every(t=>t&&typeof t.id==='string'&&typeof t.title==='string'&&typeof t.person==='string'&&typeof t.note==='string'&&['active','blocked','waiting','done'].includes(t.status)&&(!t.start||validDate(t.start))&&(!t.end||validDate(t.end))&&(!t.start||!t.end||t.start<=t.end)&&Array.isArray(t.milestones)&&t.milestones.every(m=>validDate(m.date)&&typeof m.label==='string'))&&new Set(data.map(t=>t.id)).size===data.length}

function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2500)}
const PALETTE=[['#263b4a','#DDEEFF'],['#2c4131','#DDF4DE'],['#50382e','#FFE3D8'],['#4b422b','#FFF0B9']];
const colors=t=>t.status==='blocked'?PALETTE[3]:PALETTE[[...t.id].reduce((n,c)=>n+c.charCodeAt(0),0)%PALETTE.length];
const statusLabel={active:'В работе',blocked:'На стопе',waiting:'Ожидаем вводных',done:'Готово'};
const attention=t=>t.status!=='done'&&(t.status==='blocked'||!t.end||t.end<TODAY);
const DAYS=98;let calendarStart=day(rangeStart,-42),dayWidth=60;
function updateRange(){ $('#range').textContent=`${fmt(rangeStart)} — ${fmt(day(rangeStart,13))} ${parse(rangeStart).getFullYear()}`; }
function render(){
if(typeof hideFlagTooltip==='function'&&typeof tooltipAnchor!=='undefined')hideFlagTooltip();
calendarStart=day(rangeStart,-42);
const labelWidth=parseFloat(getComputedStyle($('.scroll')).getPropertyValue('--label-width'))||200;
dayWidth=Math.max(22,($('.scroll').clientWidth-labelWidth)/14);
$('#gantt').style.width=(labelWidth+DAYS*dayWidth)+'px';
$('#gantt').style.setProperty('--days',DAYS);
const taskCount=tasks.filter(t=>!$('#person').value||t.person===$('#person').value).length;
$('#gantt').style.setProperty('--row-height',Math.max(48,($('.scroll').clientHeight-60)/Math.max(taskCount,9))+'px');
$('#stats').innerHTML=[['Всего задач',tasks.length],['В работе',tasks.filter(t=>t.status==='active').length],['Без срока',tasks.filter(t=>!t.end&&t.status!=='done').length],['На стопе',tasks.filter(t=>t.status==='blocked').length]].map(([label,n])=>`<div class="stat"><span>${label}</span><strong>${n}</strong></div>`).join('');
const people=[...new Set(tasks.map(t=>t.person))],selected=$('#person').value;$('#person').innerHTML='<option value="">Вся команда</option>'+people.map(p=>`<option ${selected===p?'selected':''}>${esc(p)}</option>`).join('');
updateRange();
let dates=Array.from({length:DAYS},(_,i)=>day(calendarStart,i)),todayIndex=diff(TODAY,calendarStart);let html='<div class="grid-head"><div class="head-label">ЗАДАЧА / ОТВЕТСТВЕННЫЙ</div><div class="dates">'+dates.map(d=>`<div class="date ${[0,6].includes(parse(d).getDay())?'weekend':''} ${d===TODAY?'current':''}"><b>${parse(d).getDate()}</b><span>${parse(d).toLocaleDateString('ru-RU',{weekday:'short'})}</span></div>`).join('')+'</div></div>';
let visible=tasks.filter(t=>(!selected||t.person===selected)&&(view==='all'||attention(t)));
for(const t of visible){let[c,bg]=colors(t),style=`--color:${c};--tint:${bg}`,start=t.start||BASE;let left=Math.max(0,diff(start,calendarStart)),right=Math.min(DAYS,diff(t.end,calendarStart)+1);let bar='';
if(t.end&&right>left&&diff(start,calendarStart)<DAYS){const detail=t.status==='blocked'?'На стопе':fmt(t.end);const compact=(right-left)*dayWidth-10<150;bar=`<div class="bar ${t.status} ${compact?'compact':''}" style="left:calc(${left/DAYS*100}% + 5px);width:calc(${(right-left)/DAYS*100}% - 10px)" tabindex="0" role="button" aria-label="${esc(t.title)}: показать комментарий"><span class="bar-name">${esc(t.title)}</span><span class="bar-detail">${esc(detail)}</span></div>`}

if(!t.end)bar=`<span class="undated" tabindex="0" role="button" aria-label="${esc(t.title)}: показать комментарий">${t.status==='waiting'?'↩ Ждём обратную связь':'··· Дедлайн не указан'}</span>`;
let flags=t.milestones.filter(m=>diff(m.date,calendarStart)>=0&&diff(m.date,calendarStart)<DAYS).map(m=>`<button class="checkpoint" data-edit="${esc(t.id)}" style="left:${(diff(m.date,calendarStart)+.5)/DAYS*100}%" data-tooltip-label="${esc(m.label)}" data-tooltip-date="${esc(fmt(m.date))}" data-tooltip-task="${esc(t.title)}" aria-label="${esc(m.label)} · ${fmt(m.date)}">⚑</button>`).join('');
html+=`<div class="task-row" data-task-id="${esc(t.id)}" style="${style}"><div class="task-label-cell"><button class="task-drag-handle" aria-label="Переместить ${esc(t.title)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-move="${esc(t.id)}"><svg viewBox="0 0 12 18" aria-hidden="true"><path d="M3 3h.01M9 3h.01M3 9h.01M9 9h.01M3 15h.01M9 15h.01"/></svg></button><button class="task-label" data-edit="${esc(t.id)}"><div><div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(t.person)} <span class="status-badge">${t.status!=='active'?'· '+statusLabel[t.status]:''}</span></div></div></button></div><div class="track" data-edit="${esc(t.id)}">${dates.map(d=>`<div class="cell ${[0,6].includes(parse(d).getDay())?'weekend':''} ${d===TODAY?'current':''}"></div>`).join('')}${todayIndex>=0&&todayIndex<DAYS?`<div class="today-line" style="left:${(todayIndex+.5)/DAYS*100}%"></div>`:''}${bar}${flags}</div></div>`;
}
$('#gantt').innerHTML=html+(visible.length?'':'<p style="padding:30px;color:#aaa">Задач по этому фильтру нет.</p>');
$('.scroll').scrollLeft=42*dayWidth;$('#gantt').style.setProperty('--calendar-offset',$('.scroll').scrollLeft+'px');
const events=tasks.filter(t=>t.status!=='done'&&(!selected||t.person===selected)).flatMap(t=>[...t.milestones,...(t.end&&!t.milestones.some(m=>m.date===t.end)?[{date:t.end,label:'Дедлайн'}]:[])].map(m=>({...m,task:t}))).filter(m=>m.date>=TODAY).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
let lastDate='';
$('#radar').innerHTML=events.length?events.map(e=>{const[c,bg]=colors(e.task);let heading=e.date!==lastDate?`<h3 class="radar-date">${e.date===TODAY?'Сегодня · ':''}${parse(e.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</h3>`:'';lastDate=e.date;return heading+`<button class="event" title="${esc(e.label)} · ${esc(e.task.title)}" data-edit="${esc(e.task.id)}" style="--tint:${bg};--color:${c}"><span class="event-flag" aria-hidden="true">⚑</span><span class="event-info">${esc(e.label)}<small>${esc(e.task.title)} · ${esc(e.task.person)}</small></span></button>`}).join(''):'<p class="small">Предстоящих событий нет.</p>';
updateLinkedTask();

}
function addMilestone(m={date:'',label:''}){let row=document.createElement('div');row.className='milestone-row';row.innerHTML=`<input type="date" required aria-label="Дата чекпойнта" value="${esc(m.date)}"><input required aria-label="Название чекпойнта" placeholder="Например, показ клиенту" value="${esc(m.label)}"><button type="button" aria-label="Удалить чекпойнт">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('#milestones').append(row)}
function edit(id){if(!ready||saving)return;editRevision=revision;$('#editWarning').hidden=true;editing=id||crypto.randomUUID();let t=tasks.find(t=>t.id===id)||{title:'',person:'',status:'active',start:'',end:'',note:'',milestones:[]};$('#form').reset();for(let k of ['title','person','status','start','end','note'])$('#form').elements[k].value=t[k]||'';$('#editTitle').textContent=id?t.title:'Новая задача';$('#delete').hidden=!id;$('#milestones').innerHTML='';t.milestones.forEach(addMilestone);$('#editor').showModal()}
$('#radar').onclick=e=>{const item=e.target.closest('[data-edit]');if(item)edit(item.dataset.edit)};
$('#gantt').onclick=e=>{const target=e.target.closest('[data-edit]');if(target)edit(target.dataset.edit)};
$('#add').onclick=()=>edit();$('#close').onclick=()=>$('#editor').close();$('#addMilestone').onclick=()=>addMilestone();
$('#person').onchange=render;
$('#prev').onclick=()=>{rangeStart=day(rangeStart,-14);render()};$('#next').onclick=()=>{rangeStart=day(rangeStart,14);render()};$('#today').onclick=()=>{rangeStart=day(TODAY,-((parse(TODAY).getDay()+6)%7));render()};

const scroller=$('.scroll');let scrollFrame=0;scroller.addEventListener('scroll',()=>{if(taskReorder||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;$('#gantt').style.setProperty('--calendar-offset',scroller.scrollLeft+'px');const offset=Math.round(scroller.scrollLeft/dayWidth);rangeStart=day(calendarStart,offset);updateRange();if(offset<10||offset>DAYS-25)render();});},{passive:true});
// Touch and trackpad scrolling keep browser-native inertia; mouse drag follows the pointer.
let drag=null,suppressClick=false;
scroller.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('.task-label-cell,.head-label'))return;drag={id:e.pointerId,x:e.clientX,scroll:scroller.scrollLeft,moved:false};});
scroller.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;if(!drag.moved&&Math.abs(dx)<7)return;if(!drag.moved){drag.moved=true;scroller.setPointerCapture(e.pointerId);scroller.classList.add('dragging');}scroller.scrollLeft=drag.scroll-dx;e.preventDefault();});
function finishDrag(e){if(!drag||e.pointerId!==drag.id)return;if(drag.moved){suppressClick=true;setTimeout(()=>suppressClick=false,0);}drag=null;scroller.classList.remove('dragging');}
scroller.addEventListener('pointerup',finishDrag);scroller.addEventListener('pointercancel',finishDrag);scroller.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
scroller.addEventListener('wheel',e=>{if(e.shiftKey&&!e.deltaX&&e.deltaY){e.preventDefault();scroller.scrollLeft+=e.deltaY;}},{passive:false});
let resizeFrame;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(render)});

// Render outside the scrolling calendar so edge flags never clip their tooltip.
const flagTooltip=document.createElement('div');flagTooltip.id='flag-tooltip';flagTooltip.className='flag-tooltip';flagTooltip.setAttribute('role','tooltip');flagTooltip.hidden=true;document.body.append(flagTooltip);
let tooltipAnchor=null;
function hideFlagTooltip(){if(tooltipAnchor)tooltipAnchor.removeAttribute('aria-describedby');tooltipAnchor=null;flagTooltip.hidden=true;}
function showFlagTooltip(anchor){
 if(!anchor||drag?.moved||taskReorder?.moved)return;
 if(tooltipAnchor===anchor&&!flagTooltip.hidden)return;
 hideFlagTooltip();tooltipAnchor=anchor;anchor.setAttribute('aria-describedby',flagTooltip.id);
 if(anchor.matches('.bar,.undated')){
  const task=tasks.find(t=>t.id===anchor.closest('.task-row')?.dataset.taskId);
  if(!task){hideFlagTooltip();return}
  flagTooltip.innerHTML=`<strong>${esc(task.title)}</strong><p class="task-comment">${esc(task.note.trim()||'Комментариев пока нет')}</p>`;
 }else flagTooltip.innerHTML=`<strong>${esc(anchor.dataset.tooltipLabel)}</strong><span>${esc(anchor.dataset.tooltipDate)} · ${esc(anchor.dataset.tooltipTask)}</span>`;
 flagTooltip.hidden=false;
 const r=anchor.getBoundingClientRect(),t=flagTooltip.getBoundingClientRect();
 // Position against the visible part of a long task bar.
 const board=$('.scroll').getBoundingClientRect(),labelWidth=parseFloat(getComputedStyle($('.scroll')).getPropertyValue('--label-width'))||200;
 const left=Math.max(r.left,board.left+labelWidth),right=Math.min(r.right,board.right);
 flagTooltip.style.left=Math.max(10,Math.min(window.innerWidth-t.width-10,(left+right)/2-t.width/2))+'px';
 flagTooltip.style.top=Math.max(10,Math.min(window.innerHeight-t.height-10,r.top-t.height-10>=10?r.top-t.height-10:r.bottom+10))+'px';
}
const tooltipTarget=e=>e.target.closest('.checkpoint,.bar,.undated');
$('#gantt').addEventListener('pointerover',e=>{const anchor=tooltipTarget(e);if(anchor&&e.pointerType!=='touch')showFlagTooltip(anchor)});
$('#gantt').addEventListener('pointerout',e=>{const anchor=tooltipTarget(e);if(anchor&&!anchor.contains(e.relatedTarget))hideFlagTooltip()});
$('#gantt').addEventListener('focusin',e=>{const anchor=tooltipTarget(e);if(anchor)showFlagTooltip(anchor)});
$('#gantt').addEventListener('focusout',hideFlagTooltip);
$('#gantt').addEventListener('keydown',e=>{if(e.target.matches('.bar,.undated')&&['Enter',' '].includes(e.key)){e.preventDefault();edit(e.target.closest('.task-row').dataset.taskId)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideFlagTooltip()});document.addEventListener('pointerdown',hideFlagTooltip);window.addEventListener('scroll',hideFlagTooltip,true);window.addEventListener('resize',hideFlagTooltip);

function updateLinkedTask(){const id=radarHoverId||radarFocusId;document.querySelectorAll('.task-row').forEach(row=>row.classList.toggle('is-linked',row.dataset.taskId===id));}
const radarPanel=$('#radar');
radarPanel.addEventListener('pointerover',e=>{const card=e.target.closest('.event');if(!card||e.pointerType==='touch')return;radarHoverId=card.dataset.edit;updateLinkedTask()});
radarPanel.addEventListener('pointerout',e=>{const card=e.target.closest('.event');if(card&&!card.contains(e.relatedTarget)){radarHoverId=null;updateLinkedTask()}});
radarPanel.addEventListener('pointerleave',()=>{radarHoverId=null;updateLinkedTask()});
radarPanel.addEventListener('focusin',e=>{const card=e.target.closest('.event');radarFocusId=card?.dataset.edit||null;updateLinkedTask()});
radarPanel.addEventListener('focusout',e=>{radarFocusId=e.relatedTarget?.closest?.('.event')?.dataset.edit||null;updateLinkedTask()});
