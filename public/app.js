const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=s=>new Date(s+'T12:00:00'),iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,day=(s,n)=>{let d=parse(s);d.setDate(d.getDate()+n);return iso(d)},diff=(a,b)=>Math.round((parse(a)-parse(b))/86400000),fmt=s=>parse(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}),TODAY=iso(new Date()),BASE=TODAY;
let tasks=[],team=[],view='all',rangeStart=day(TODAY,-((parse(TODAY).getDay()+6)%7)),editing=null;
let radarHoverId=null,radarFocusId=null;
let taskReorder=null;
let taskResize=null;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(parse(s))&&iso(parse(s))===s;
function valid(data){return Array.isArray(data)&&data.length<=500&&data.every(t=>t&&validMaterials(t)&&validAssignments(t)&&typeof t.id==='string'&&typeof t.title==='string'&&typeof t.person==='string'&&typeof t.note==='string'&&['active','blocked','waiting','done'].includes(t.status)&&(!t.start||validDate(t.start))&&(!t.end||validDate(t.end))&&(!t.start||!t.end||t.start<=t.end)&&Array.isArray(t.milestones)&&t.milestones.every(m=>validDate(m.date)&&typeof m.label==='string'))&&new Set(data.map(t=>t.id)).size===data.length}

const plural=(n,[one,few,many])=>n+' '+(n%10===1&&n%100!==11?one:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?few:many);
const taskCountLabel=n=>plural(n,['задача','задачи','задач']);
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2500)}
const PALETTE=['yellow','blue','pink','green','coral','violet'];
const colors=t=>{const name=PALETTE[[...t.id].reduce((n,c)=>n+c.charCodeAt(0),0)%PALETTE.length];return [`var(--task-${name})`,`var(--task-${name}-soft)`,'var(--on-pastel)']};
const statusLabel={active:'В работе',blocked:'На стопе',waiting:'Ожидаем вводных',done:'Готово'};
const taskFilters=[
 {id:'all',label:'Всего задач',matches:()=>true},
 {id:'active',label:'В работе',matches:t=>t.status==='active'},
 {id:'blocked',label:'На стопе',matches:t=>t.status==='blocked'},
 {id:'waiting',label:'Ожидаем вводных',matches:t=>t.status==='waiting'},
 {id:'done',label:'Готово',matches:t=>t.status==='done'},
];
import {statIcons} from './filter-icons.js';
import {initPickers,syncPickers,closePickers} from './pickers.js';
const DAYS=98;let calendarStart=day(rangeStart,-42),dayWidth=60;
const visibleDays=()=>matchMedia('(max-width:680px)').matches?7:14;
function updateRange(){ $('#range').textContent=`${fmt(rangeStart)} — ${fmt(day(rangeStart,visibleDays()-1))} ${parse(rangeStart).getFullYear()}`; }
function render(){
if(taskResize)cancelTaskResize(false);
if(typeof hideFlagTooltip==='function'&&typeof tooltipAnchor!=='undefined')hideFlagTooltip();
calendarStart=day(rangeStart,-42);
const labelWidth=parseFloat(getComputedStyle($('.scroll')).getPropertyValue('--label-width'))||200;
dayWidth=Math.max(22,($('.scroll').clientWidth-labelWidth)/visibleDays());
$('#gantt').style.width=(labelWidth+DAYS*dayWidth)+'px';
$('#gantt').style.setProperty('--days',DAYS);
const personTasks=tasks;
const visible=personTasks.filter(taskFilters.find(filter=>filter.id===view).matches);
const taskCount=visible.length;
$('#gantt').style.setProperty('--row-height',Math.max(48,($('.scroll').clientHeight-60)/Math.max(taskCount,9))+'px');
$('#stats').innerHTML=taskFilters.map(filter=>`<button type="button" class="stat${view===filter.id?' is-selected':''}" data-task-filter="${filter.id}" aria-pressed="${view===filter.id}" aria-controls="gantt"><span class="stat-caption">${statIcons[filter.id]}${filter.label}</span><strong>${personTasks.filter(filter.matches).length}</strong></button>`).join('');
renderTeamButton();
updateRange();
let dates=Array.from({length:DAYS},(_,i)=>day(calendarStart,i)),todayIndex=diff(TODAY,calendarStart);let html='<div class="grid-head"><div class="head-label">Задача / статус</div><div class="dates">'+dates.map(d=>`<div class="date ${[0,6].includes(parse(d).getDay())?'weekend':''} ${d===TODAY?'current':''}"><b>${parse(d).getDate()}</b><span>${parse(d).toLocaleDateString('ru-RU',{weekday:'short'})}</span></div>`).join('')+'</div></div>';
for(const t of visible){let[c,bg,ink]=colors(t),style=`--color:${c};--tint:${bg};--bar-ink:${ink}`,start=t.start||BASE;let left=Math.max(0,diff(start,calendarStart)),right=Math.min(DAYS,diff(t.end,calendarStart)+1);let bar='';
if(t.end&&right>left&&diff(start,calendarStart)<DAYS){const detail=t.status==='blocked'?'На стопе':fmt(t.end);const compact=(right-left)*dayWidth-10<150;const crew=assignmentLayer(t,day(calendarStart,left),day(calendarStart,right-1));bar=`<div class="bar ${t.status} ${compact?'compact':''} ${crew.className}" style="left:calc(${left/DAYS*100}% + 5px);width:calc(${(right-left)/DAYS*100}% - 10px)" tabindex="0" role="button" aria-label="${esc(t.title)}: открыть задачу">${crew.layer}<span class="bar-name" style="${crew.nameStyle}"><span class="bar-title">${esc(t.title)}</span>${crew.lead}</span>${crew.chips}<span class="bar-detail">${esc(detail)}</span>${diff(start,calendarStart)>=0?`<span class="bar-resize-handle resize-start" data-resize-edge="start" role="slider" tabindex="0" aria-label="Начало задачи ${esc(t.title)}" aria-valuemin="${diff(calendarStart,'1970-01-01')}" aria-valuemax="${diff(t.end,'1970-01-01')}" aria-valuenow="${diff(start,'1970-01-01')}" aria-valuetext="${esc(fmt(start))}" title="Потяните, чтобы изменить начало"></span>`:''}${diff(t.end,calendarStart)<DAYS?`<span class="bar-resize-handle resize-end" data-resize-edge="end" role="slider" tabindex="0" aria-label="Дедлайн задачи ${esc(t.title)}" aria-valuemin="${diff(start,'1970-01-01')}" aria-valuemax="${diff(day(calendarStart,DAYS-1),'1970-01-01')}" aria-valuenow="${diff(t.end,'1970-01-01')}" aria-valuetext="${esc(fmt(t.end))}" title="Потяните, чтобы изменить дедлайн"></span>`:''}</div>`}

if(!t.end)bar=`<span class="undated" tabindex="0" role="button" aria-label="${esc(t.title)}: открыть задачу">Дедлайн не указан</span>`;
let flags=t.milestones.filter(m=>diff(m.date,calendarStart)>=0&&diff(m.date,calendarStart)<DAYS).map(m=>`<button class="checkpoint${m.date<TODAY?' is-past':''}" data-edit="${esc(t.id)}" style="left:${(diff(m.date,calendarStart)+.5)/DAYS*100}%" data-tooltip-label="${esc(m.label)}" data-tooltip-date="${esc(fmt(m.date))}" data-tooltip-task="${esc(t.title)}" aria-label="${esc(m.label)} · ${fmt(m.date)}">⚑</button>`).join('');
html+=`<div class="task-row" data-task-id="${esc(t.id)}" style="${style}"><div class="task-label-cell"><button class="task-drag-handle" aria-label="Переместить ${esc(t.title)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-move="${esc(t.id)}"><svg viewBox="0 0 12 18" aria-hidden="true"><path d="M3 3h.01M9 3h.01M3 9h.01M9 9h.01M3 15h.01M9 15h.01"/></svg></button><button class="task-label" data-edit="${esc(t.id)}"><div><div class="task-title">${esc(t.title)}</div><div class="task-meta"><span class="status-badge">${statusLabel[t.status]}${t.end&&t.end<TODAY&&t.status!=='done'?' · <span class="is-overdue">Просрочена</span>':''}</span></div></div></button></div><div class="track" data-edit="${esc(t.id)}">${dates.map(d=>`<div class="cell ${[0,6].includes(parse(d).getDay())?'weekend':''} ${d===TODAY?'current':''}"></div>`).join('')}${todayIndex>=0&&todayIndex<DAYS?`<div class="today-line" style="left:${(todayIndex+.5)/DAYS*100}%"></div>`:''}${bar}${flags}</div></div>`;
}
$('#gantt').innerHTML=html+(visible.length?'':'<p class="gantt-empty">Задач по этому фильтру нет.</p>');
$('.scroll').scrollLeft=42*dayWidth;$('#gantt').style.setProperty('--calendar-offset',$('.scroll').scrollLeft+'px');
const events=visible.filter(t=>t.status!=='done').flatMap(t=>[...t.milestones,...(t.end&&!t.milestones.some(m=>m.date===t.end)?[{date:t.end,label:'Дедлайн'}]:[])].map(m=>({...m,task:t}))).filter(m=>m.date>=TODAY).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
let lastDate='';
$('#radar').innerHTML=events.length?events.map(e=>{const[c,bg,ink]=colors(e.task);let heading=e.date!==lastDate?`<h3 class="radar-date">${e.date===TODAY?'Сегодня · ':''}${parse(e.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</h3>`:'';lastDate=e.date;return heading+`<button class="event" title="${esc(e.label)} · ${esc(e.task.title)}" data-edit="${esc(e.task.id)}" style="--tint:${bg};--color:${c};--bar-ink:${ink}"><span class="event-flag" aria-hidden="true">⚑</span><span class="event-info">${esc(e.label)}<small>${esc(e.task.title)} · ${esc(taskPeopleLabel(e.task))}</small></span></button>`}).join(''):'<p class="small">Предстоящих событий нет.</p>';
updateLinkedTask();updateBarLabels();syncPickers();
$('.radar-subtitle').textContent=view==='all'?'Ближайшие события':'События · '+taskFilters.find(f=>f.id===view).label;
$('#prev').setAttribute('aria-label','Назад на '+visibleDays()+' дней');$('#next').setAttribute('aria-label','Вперёд на '+visibleDays()+' дней');

}
function addMilestone(m={date:'',label:''}){let row=document.createElement('div');row.className='milestone-row';row.innerHTML=`<input type="date" required aria-label="Дата чекпойнта" value="${esc(m.date)}"><input required aria-label="Название чекпойнта" placeholder="Например, показ клиенту" value="${esc(m.label)}"><button type="button" aria-label="Удалить чекпойнт">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('#milestones').append(row);initPickers(row)}
function edit(id){if(!ready||saving)return;editRevision=revision;$('#editWarning').hidden=true;editing=id||crypto.randomUUID();let t=tasks.find(t=>t.id===id)||{title:'',person:'',status:'active',start:'',end:'',note:'',milestones:[]};$('#form').reset();for(let k of ['title','status','start','end','note'])$('#form').elements[k].value=t[k]||'';$('#editTitle').textContent=id?t.title:'Новая задача';$('#delete').hidden=!id;$('#milestones').innerHTML='';t.milestones.forEach(addMilestone);resetTaskContext(t);resetAssignments(t);$('#copyTaskLink').hidden=!id;$('#editor').showModal();resizeTaskContext();syncPickers($('#form'));markTaskDraftClean();$('#form').elements.title.focus({preventScroll:true});loadTaskShare(id)}
$('#radar').onclick=e=>{const item=e.target.closest('[data-edit]');if(item)edit(item.dataset.edit)};
$('#gantt').onclick=e=>{const target=e.target.closest('[data-edit]');if(target)edit(target.dataset.edit)};
$('#add').onclick=()=>edit();$('#close').onclick=()=>{if(!saving&&!uploadingMaterials)requestTaskClose()};$('#addMilestone').onclick=()=>addMilestone();
$('#stats').onclick=e=>{
 const button=e.target.closest('[data-task-filter]');
 if(!button||button.dataset.taskFilter===view)return;
 if(taskReorder)cancelTaskReorder();
 view=button.dataset.taskFilter;render();
 $('#stats').querySelector(`[data-task-filter="${view}"]`).focus({preventScroll:true});
};
$('#prev').onclick=()=>{rangeStart=day(rangeStart,-visibleDays());render()};$('#next').onclick=()=>{rangeStart=day(rangeStart,visibleDays());render()};$('#today').onclick=()=>{rangeStart=day(TODAY,-((parse(TODAY).getDay()+6)%7));render()};

const scroller=$('.scroll');let scrollFrame=0;scroller.addEventListener('scroll',()=>{if(taskReorder||taskResize||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(taskResize)return;$('#gantt').style.setProperty('--calendar-offset',scroller.scrollLeft+'px');const offset=Math.round(scroller.scrollLeft/dayWidth);rangeStart=day(calendarStart,offset);updateRange();updateBarLabels();if(offset<10||offset>DAYS-25){const before=scroller.scrollLeft,fraction=before-offset*dayWidth;render();scroller.scrollLeft+=fraction;$('#gantt').style.setProperty('--calendar-offset',scroller.scrollLeft+'px');if(drag)drag.scroll+=scroller.scrollLeft-before;}});},{passive:true});
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
 if(!anchor||drag?.moved||taskReorder?.moved||taskResize||anchor.closest('[data-resize-edge]'))return;
 if(tooltipAnchor===anchor&&!flagTooltip.hidden)return;
 hideFlagTooltip();tooltipAnchor=anchor;anchor.setAttribute('aria-describedby',flagTooltip.id);
 if(anchor.matches('.bar,.undated')){
  const task=tasks.find(t=>t.id===anchor.closest('.task-row')?.dataset.taskId);
  if(!task){hideFlagTooltip();return}
  flagTooltip.innerHTML=`<strong>${esc(task.title)}</strong>${assignmentTooltip(task)}<p class="task-comment">${esc(task.note.trim()||'Примечаний пока нет')}</p>`;
 }else flagTooltip.innerHTML=`<strong>${esc(anchor.dataset.tooltipLabel)}</strong><span>${esc(anchor.dataset.tooltipDate)} · ${esc(anchor.dataset.tooltipTask)}</span>`;
 flagTooltip.hidden=false;
 const r=anchor.getBoundingClientRect(),t=flagTooltip.getBoundingClientRect();
 // Position against the visible part of a long task bar.
 const board=$('.scroll').getBoundingClientRect(),labelWidth=parseFloat(getComputedStyle($('.scroll')).getPropertyValue('--label-width'))||200;
 const left=Math.max(r.left,board.left+labelWidth),right=Math.min(r.right,board.right);
 flagTooltip.style.left=Math.max(10,Math.min(window.innerWidth-t.width-10,(left+right)/2-t.width/2))+'px';
 flagTooltip.style.top=Math.max(10,Math.min(window.innerHeight-t.height-10,r.top-t.height-10>=10?r.top-t.height-10:r.bottom+10))+'px';
}
const tooltipTarget=e=>e.target.closest('[data-resize-edge]')?null:e.target.closest('.checkpoint,.bar,.undated');
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

// Titles stick to the visible edge with CSS (position: sticky), so they move with the
// scroll itself. Script only switches which assignee labels show, never their positions.
function updateBarLabels(){
 for(const bar of document.querySelectorAll('.bar')){
  if(bar.classList.contains('has-assignments')){layoutAssignmentLabels(bar);continue}
  // Plain bars: the deadline date gives way when the sliding title reaches it.
  const name=bar.querySelector('.bar-name'),detail=bar.querySelector('.bar-detail');if(!name||!detail)continue;
  detail.classList.remove('is-hidden');
  if(detail.offsetParent&&name.getBoundingClientRect().right+8>detail.getBoundingClientRect().left)detail.classList.add('is-hidden');
 }
}

initPickers(document);
