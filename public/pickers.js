import {dateValue,parseDate as parse,calendarDays,shiftMonth} from './calendar-model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>dateValue(new Date());
const chevron='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg>';
const calendarIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M4 10h16"/></svg>';
const controls=new Map();let active=null,sequence=0;
function labelFor(el){return el.getAttribute('aria-label')||[...(el.labels?.[0]?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||el.name||'Выбор'}
function limits(el){
 let min=el.min||'0001-01-01',max=el.max||'9999-12-31';
 if(el.name==='start'&&el.form?.elements.end.value)max=el.form.elements.end.value;
 if(el.name==='end'&&el.form?.elements.start.value)min=el.form.elements.start.value;
 return {min,max};
}
function allowed(el,value){const {min,max}=limits(el);return value>=min&&value<=max}
export function closePickers(restore=false){
 if(!active)return;const {panel,trigger}=active;active=null;
 if(panel.matches(':popover-open'))panel.hidePopover();panel.remove();trigger.setAttribute('aria-expanded','false');
 if(restore&&trigger.isConnected)trigger.focus({preventScroll:true});
}
function update(el){
 const entry=controls.get(el);if(!entry)return;
 const isDate=el.type==='date',value=isDate?(el.value?parse(el.value).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'Выбрать дату'):(el.selectedOptions[0]?.textContent||'Выбрать');
 entry.trigger.innerHTML=`<span>${esc(value)}</span>${isDate?calendarIcon:chevron}`;
 entry.trigger.classList.toggle('is-empty',isDate&&!el.value);entry.trigger.disabled=el.disabled;
 entry.trigger.setAttribute('aria-label',`${entry.label}: ${value}`);
 entry.trigger.setAttribute('aria-invalid',String(!!entry.invalid&&!el.validity.valid));
}
export function syncPickers(root=document){
 for(const [el] of controls){if(!el.isConnected){controls.delete(el);continue}if(root.contains(el))update(el)}
 if(active&&!active.el.isConnected)closePickers();
}
export function initPickers(root=document){
 if(!document.querySelector('link[href*="ui.css"]'))return;
 for(const el of root.querySelectorAll('select,input[type="date"]')){
  if(controls.has(el))continue;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='picker-trigger';
  trigger.setAttribute('aria-haspopup',el.type==='date'?'dialog':'listbox');trigger.setAttribute('aria-expanded','false');
  controls.set(el,{trigger,label:labelFor(el)});el.hidden=true;el.tabIndex=-1;el.after(trigger);
  el.parentElement.classList.add('has-picker');
  trigger.addEventListener('click',()=>active?.el===el?closePickers():open(el));
  trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(el)}});
  el.addEventListener('change',()=>update(el));
  el.addEventListener('invalid',e=>{e.preventDefault();controls.get(el).invalid=true;update(el);trigger.focus();open(el)});
 }
 syncPickers(root);
}
function position(){
 if(!active)return;const r=active.trigger.getBoundingClientRect(),p=active.panel;
 p.style.width=(active.el.type==='date'?Math.min(304,innerWidth-24):Math.min(Math.max(r.width,210),innerWidth-24))+'px';
 const box=p.getBoundingClientRect();
 p.style.left=Math.max(12,Math.min(r.left,innerWidth-box.width-12))+'px';
 const below=innerHeight-r.bottom-8,above=r.top-8;
 p.style.top=Math.max(12,below>=box.height||below>=above?Math.min(r.bottom+8,innerHeight-box.height-12):r.top-box.height-8)+'px';
}
function commit(value){
 const el=active.el;el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
 closePickers(true);
}
function open(el){
 if(el.disabled)return;closePickers();
 document.querySelectorAll('.theme-picker[open],.more[open],.task-menu[open]').forEach(m=>m.open=false);
 const {trigger,label}=controls.get(el),panel=document.createElement('div');panel.className='picker-popover';panel.popover='manual';panel.id='picker-panel-'+(++sequence);
 panel.setAttribute('role',el.type==='date'?'dialog':'listbox');panel.setAttribute('aria-label',label);
 (el.closest('dialog')||document.body).append(panel);trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','true');
 let initial=el.value||today();if(el.type==='date'){const bounds=limits(el);initial=initial<bounds.min?bounds.min:initial>bounds.max?bounds.max:initial}
 active={el,trigger,panel,month:parse(el.type==='date'?initial:today()),cursor:initial,stage:'days'};
 render();panel.showPopover();position();focusCurrent();
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-option')){commit(b.dataset.option);return}
  if(b.dataset.date){commit(b.dataset.date);return}
  const a=b.dataset.action;
  if(a==='clear'){commit('');return}if(a==='today'){commit(today());return}
  if(a==='previous'||a==='next')active.month=new Date(active.month.getFullYear(),active.month.getMonth()+(a==='next'?1:-1),1,12);
  if(a==='months')active.stage=active.stage==='days'?'months':'days';
  if(a==='year-previous'||a==='year-next')active.month.setFullYear(active.month.getFullYear()+(a==='year-next'?1:-1));
  if(b.hasAttribute('data-month')){active.month=new Date(active.month.getFullYear(),Number(b.dataset.month),1,12);active.stage='days'}
  render();position();const target=panel.querySelector(`[data-action="${a}"]`);if(target)target.focus();else focusCurrent();
 });
}
function focusCurrent(){if(!active)return;(active.panel.querySelector('[tabindex="0"]')||active.panel.querySelector('button:not(:disabled)'))?.focus({preventScroll:true})}
function render(){
 const {el,panel,month}=active;
 if(el.type!=='date'){
  panel.innerHTML=[...el.options].map(o=>`<button type="button" class="picker-option" role="option" aria-selected="${o.selected}" data-option="${esc(o.value)}" tabindex="${o.selected?0:-1}" ${o.disabled?'disabled':''}><span>${esc(o.textContent)}</span><span class="picker-check" aria-hidden="true">${o.selected?'✓':''}</span></button>`).join('');return;
 }
 const year=month.getFullYear(),m=month.getMonth();panel.classList.add('calendar-picker');
 const title=month.toLocaleDateString('ru-RU',{month:'long'})+' '+year;
 let content='';
 if(active.stage==='months'){
  content=`<div class="calendar-year"><button type="button" data-action="year-previous" aria-label="Предыдущий год">‹</button><strong aria-live="polite">${year}</strong><button type="button" data-action="year-next" aria-label="Следующий год">›</button></div><div class="calendar-months">`+Array.from({length:12},(_,i)=>`<button type="button" data-month="${i}" aria-pressed="${m===i}">${new Date(year,i,1).toLocaleDateString('ru-RU',{month:'short'})}</button>`).join('')+'</div>';
 }else{
  const days=calendarDays(year,m),selectable=days.filter(d=>d.currentMonth&&allowed(el,d.value));
  const focused=days.some(d=>d.currentMonth&&d.value===active.cursor&&allowed(el,d.value))?active.cursor:selectable[0]?.value;
  content='<div class="calendar-weekdays" aria-hidden="true">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(s=>`<span>${s}</span>`).join('')+'</div><div class="calendar-days" role="group" aria-label="Дни месяца">'+days.map(d=>`<button type="button" data-date="${d.value}" class="calendar-day${d.currentMonth?'':' outside'}${d.value===today()?' is-today':''}" aria-label="${parse(d.value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}" aria-pressed="${d.value===el.value}" ${d.value===today()?'aria-current="date"':''} tabindex="${d.value===focused?0:-1}" ${allowed(el,d.value)?'':'disabled'}>${d.day}</button>`).join('')+'</div>';
 }
 panel.innerHTML=`<div class="calendar-heading"><button type="button" data-action="previous" aria-label="Предыдущий месяц">‹</button><button type="button" data-action="months" class="calendar-title" aria-live="polite">${esc(title)}</button><button type="button" data-action="next" aria-label="Следующий месяц">›</button></div>${content}<div class="calendar-footer"><button type="button" data-action="clear" ${el.required?'disabled':''}>Очистить</button><button type="button" data-action="today" ${allowed(el,today())?'':'disabled'}>Сегодня</button></div>`;
}
document.addEventListener('pointerdown',e=>{if(active&&!active.panel.contains(e.target)&&!active.trigger.contains(e.target))closePickers()},true);
document.addEventListener('keydown',e=>{
 if(!active)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePickers(true);return}
 if(!active.panel.contains(e.target))return;
 if(active.el.type!=='date'&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
  e.preventDefault();const items=[...active.panel.querySelectorAll('[data-option]:not(:disabled)')],i=items.indexOf(document.activeElement);
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();return;
 }
 if(e.target.dataset.date&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)){
  e.preventDefault();const value=e.target.dataset.date,d=parse(value),weekday=(d.getDay()+6)%7;
  if(e.key.startsWith('Page'))active.cursor=shiftMonth(value,(e.key==='PageDown'?1:-1)*(e.shiftKey?12:1));
  else {d.setDate(d.getDate()+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday}[e.key]));active.cursor=dateValue(d)}
  if(!allowed(active.el,active.cursor)){active.cursor=value;return}
  active.month=parse(active.cursor);render();position();focusCurrent();
 }
 if(e.key==='Tab'){
  const items=[...active.panel.querySelectorAll('button:not(:disabled)')].filter(b=>b.tabIndex>=0),i=items.indexOf(document.activeElement);
  if((e.shiftKey&&i===0)||(!e.shiftKey&&i===items.length-1)){e.preventDefault();closePickers(true)}
 }
},true);
document.addEventListener('focusin',e=>{if(active&&!active.panel.contains(e.target)&&e.target!==active.trigger)closePickers()});
document.addEventListener('reset',e=>queueMicrotask(()=>syncPickers(e.target)));
document.addEventListener('close',()=>closePickers(),true);
document.addEventListener('scroll',()=>{if(active){if(!active.panel.contains(document.activeElement))closePickers();else position()}},true);
window.addEventListener('resize',position);
