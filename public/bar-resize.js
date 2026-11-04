import {resizeTaskDates} from './gantt-dates.js';

const resizeDate=document.createElement('div');
resizeDate.className='resize-date';resizeDate.hidden=true;resizeDate.setAttribute('role','status');document.body.append(resizeDate);
function cancelTaskResize(restore=true){
 const active=taskResize;if(!active)return;
 taskResize=null;cancelAnimationFrame(active.frame);resizeDate.hidden=true;document.body.classList.remove('task-date-resizing');
 if(restore&&active.bar.isConnected){active.bar.style.cssText=active.style;active.bar.className=active.className;active.bar.querySelector('.bar-detail').textContent=active.detail}
 if(scroller.hasPointerCapture(active.pointerId))scroller.releasePointerCapture(active.pointerId);
 if(active.moved){suppressClick=true;setTimeout(()=>suppressClick=false,0)}
}
function previewTaskResize(){
 const active=taskResize;if(!active)return;
 const delta=active.x-active.initialX+scroller.scrollLeft-active.initialScroll;
 if(Math.abs(delta)>3)active.moved=true;
 const days=Math.round(delta/dayWidth);
 active.draft=resizeTaskDates(active.task,active.edge,days,TODAY,calendarStart,day(calendarStart,DAYS-1));
 const start=active.draft.start||TODAY,left=Math.max(0,diff(start,calendarStart)),right=Math.min(DAYS,diff(active.draft.end,calendarStart)+1);
 active.bar.style.left=`calc(${left/DAYS*100}% + 5px)`;active.bar.style.width=`calc(${(right-left)/DAYS*100}% - 10px)`;
 active.bar.classList.toggle('compact',(right-left)*dayWidth-10<150);
 active.bar.querySelector('.bar-detail').textContent=fmt(active.draft.end);
 resizeDate.textContent=(active.edge==='start'?'Начало: ':'Дедлайн: ')+parse(active.draft[active.edge]||TODAY).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
 resizeDate.hidden=false;
 const rect=active.bar.getBoundingClientRect();
 resizeDate.style.left=Math.max(8,Math.min(innerWidth-resizeDate.offsetWidth-8,active.x-resizeDate.offsetWidth/2))+'px';
 resizeDate.style.top=Math.max(8,Math.min(innerHeight-resizeDate.offsetHeight-8,rect.bottom+8))+'px';
}
function scrollTaskResize(){
 const active=taskResize;if(!active)return;
 const rect=scroller.getBoundingClientRect(),labelWidth=parseFloat(getComputedStyle(scroller).getPropertyValue('--label-width'))||200;
 const left=rect.left+labelWidth+24,right=rect.right-24;
 const velocity=active.x<left?-Math.min(12,(left-active.x)/3):active.x>right?Math.min(12,(active.x-right)/3):0;
 if(active.moved&&velocity){scroller.scrollLeft+=velocity;previewTaskResize()}
 active.frame=requestAnimationFrame(scrollTaskResize);
}
scroller.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('[data-resize-edge]');if(!handle)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.button!==0||!e.isPrimary||!ready||saving||uploadingMaterials||taskReorder||$('#editor').open)return;
 const bar=handle.closest('.bar'),task=tasks.find(t=>t.id===bar.closest('.task-row').dataset.taskId);if(!task)return;
 hideFlagTooltip();
 taskResize={pointerId:e.pointerId,task:structuredClone(task),draft:structuredClone(task),edge:handle.dataset.resizeEdge,baseRevision:revision,initialX:e.clientX,x:e.clientX,initialScroll:scroller.scrollLeft,bar,style:bar.style.cssText,className:bar.className,detail:bar.querySelector('.bar-detail').textContent,moved:false};
 scroller.setPointerCapture(e.pointerId);document.body.classList.add('task-date-resizing');previewTaskResize();taskResize.frame=requestAnimationFrame(scrollTaskResize);
},true);
scroller.addEventListener('pointermove',e=>{if(!taskResize||e.pointerId!==taskResize.pointerId)return;taskResize.x=e.clientX;previewTaskResize();e.preventDefault();e.stopImmediatePropagation()},true);
scroller.addEventListener('pointerup',async e=>{
 const active=taskResize;if(!active||e.pointerId!==active.pointerId)return;
 e.preventDefault();e.stopImmediatePropagation();
 active.x=e.clientX;previewTaskResize();
 const task=active.draft,changed=task.start!==active.task.start||task.end!==active.task.end;
 rangeStart=day(calendarStart,Math.round(scroller.scrollLeft/dayWidth));updateRange();cancelTaskResize();
 if(changed&&active.moved){const ok=await change('upsert',{task},active.baseRevision);if(!ok)render()}
},true);
scroller.addEventListener('click',e=>{if(e.target.closest('[data-resize-edge]')){e.preventDefault();e.stopImmediatePropagation()}},true);
scroller.addEventListener('pointercancel',()=>cancelTaskResize());
scroller.addEventListener('lostpointercapture',()=>cancelTaskResize());
window.addEventListener('blur',()=>cancelTaskResize());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&taskResize){e.preventDefault();e.stopImmediatePropagation();cancelTaskResize()}},true);
scroller.addEventListener('keydown',async e=>{
 const handle=e.target.closest('[data-resize-edge]');
 if(!handle||!['ArrowLeft','ArrowRight'].includes(e.key))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(!ready||saving||uploadingMaterials||taskResize||taskReorder)return;
 const task=tasks.find(t=>t.id===handle.closest('.task-row').dataset.taskId),edge=handle.dataset.resizeEdge;
 const updated=resizeTaskDates(task,edge,(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?7:1),TODAY,calendarStart,day(calendarStart,DAYS-1));
 if(task.start===updated.start&&task.end===updated.end)return;
 if(await change('upsert',{task:updated})){const row=taskRows().find(row=>row.dataset.taskId===task.id);row?.querySelector(`[data-resize-edge="${edge}"]`)?.focus({preventScroll:true})}
},true);
