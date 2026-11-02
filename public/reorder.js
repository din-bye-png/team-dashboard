// Drag only from the task column; calendar dragging remains horizontal scrolling.
const taskRows=()=>[...$('#gantt').querySelectorAll('.task-row')];
function clearReorderMarkers(){taskRows().forEach(row=>row.classList.remove('reorder-before','reorder-after','reorder-source'))}
function reorderTarget(){
 const active=taskReorder;if(!active?.moved)return;
 const rows=taskRows().filter(row=>row.dataset.taskId!==active.id);
 clearReorderMarkers();
 taskRows().find(row=>row.dataset.taskId===active.id)?.classList.add('reorder-source');
 const before=rows.find(row=>{const r=row.getBoundingClientRect();return active.y<r.top+r.height/2});
 const anchor=before||rows.at(-1);
 active.anchorId=anchor?.dataset.taskId;active.placement=before?'before':'after';
 anchor?.classList.add(before?'reorder-before':'reorder-after');
 active.ghost.style.transform=`translate3d(${active.left}px,${active.y-active.offsetY}px,0)`;
}
function autoScrollReorder(){
 if(!taskReorder?.moved)return;
 const r=scroller.getBoundingClientRect(),top=r.top+56+28,bottom=r.bottom-28;
 const velocity=taskReorder.y<top?-Math.min(12,(top-taskReorder.y)/3):taskReorder.y>bottom?Math.min(12,(taskReorder.y-bottom)/3):0;
 if(velocity){scroller.scrollTop+=velocity;reorderTarget()}
 taskReorder.frame=requestAnimationFrame(autoScrollReorder);
}
function cancelTaskReorder(){
 const active=taskReorder;if(!active)return;
 taskReorder=null;cancelAnimationFrame(active.frame);active.ghost?.remove();clearReorderMarkers();document.body.classList.remove('task-reordering');
 if(scroller.hasPointerCapture(active.pointerId))scroller.releasePointerCapture(active.pointerId);
 if(active.moved){suppressClick=true;setTimeout(()=>suppressClick=false,0)}
}
scroller.addEventListener('pointerdown',e=>{
 const column=e.target.closest('.task-label-cell');
 if(!column||!ready||saving||e.button!==0||(!e.isPrimary)||e.pointerType!=='mouse'&&!e.target.closest('.task-drag-handle'))return;
 const row=column.closest('.task-row'),r=column.getBoundingClientRect();
 taskReorder={id:row.dataset.taskId,pointerId:e.pointerId,baseRevision:revision,startX:e.clientX,startY:e.clientY,y:e.clientY,left:r.left,width:r.width,height:r.height,offsetY:e.clientY-r.top,moved:false};
});
scroller.addEventListener('pointermove',e=>{
 const active=taskReorder;if(!active||active.pointerId!==e.pointerId)return;
 if(!active.moved&&Math.hypot(e.clientX-active.startX,e.clientY-active.startY)<6)return;
 if(!active.moved){
  active.moved=true;hideFlagTooltip();scroller.setPointerCapture(e.pointerId);document.body.classList.add('task-reordering');
  const column=taskRows().find(row=>row.dataset.taskId===active.id).querySelector('.task-label-cell');
  active.ghost=column.cloneNode(true);active.ghost.className='task-reorder-ghost';active.ghost.setAttribute('aria-hidden','true');active.ghost.inert=true;
  active.ghost.style.width=active.width+'px';active.ghost.style.height=active.height+'px';document.body.append(active.ghost);
  active.frame=requestAnimationFrame(autoScrollReorder);
 }
 active.y=e.clientY;reorderTarget();e.preventDefault();
});
scroller.addEventListener('pointerup',async e=>{
 const active=taskReorder;if(!active||active.pointerId!==e.pointerId)return;
 const r=scroller.getBoundingClientRect(),inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
 cancelTaskReorder();
 if(active.moved&&inside&&active.anchorId)await change('move',{id:active.id,anchorId:active.anchorId,placement:active.placement},active.baseRevision);
});
scroller.addEventListener('pointercancel',cancelTaskReorder);
scroller.addEventListener('lostpointercapture',cancelTaskReorder);
window.addEventListener('blur',cancelTaskReorder);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&taskReorder){e.preventDefault();cancelTaskReorder();return}
 const handle=e.target.closest('.task-drag-handle');
 if(!handle||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key)||!ready||saving)return;
 e.preventDefault();
 const ids=taskRows().map(row=>row.dataset.taskId),index=ids.indexOf(handle.dataset.move),up=e.key==='ArrowUp',anchorId=ids[index+(up?-1:1)];
 if(anchorId)change('move',{id:handle.dataset.move,anchorId,placement:up?'before':'after'}).then(ok=>{if(ok)[...document.querySelectorAll('.task-drag-handle')].find(button=>button.dataset.move===handle.dataset.move)?.focus()});
});
