import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resizeTaskDates} from '../public/gantt-dates.js';
import {prepareChange} from '../public/backend.js';
const task={id:'a',title:'Task',person:'',status:'active',start:'2026-11-04',end:'2026-11-06',note:'Status',milestones:[{date:'2026-11-05',label:'Review'}],context:'Goal',links:[{title:'Brief',url:'https://example.com/brief'}],attachments:[]};
const resize=(task,edge,days)=>resizeTaskDates(task,edge,days,'2026-11-04','2026-10-01','2026-12-31');
test('bar edges snap to days, clamp to one day and preserve task context and checkpoints',()=>{
 const extended=resize(task,'end',3);assert.equal(extended.end,'2026-11-09');assert.equal(task.end,'2026-11-06');
 assert.deepEqual(resize(task,'start',-2),{...task,start:'2026-11-02'});
 assert.equal(resize(task,'end',-30).end,task.start);
 assert.equal(resize(task,'start',30).start,task.end);
 assert.equal(resize(task,'end',200).end,'2026-12-31');
 assert.equal(resize(task,'start',-200).start,'2026-10-01');
 assert.deepEqual(extended.links,task.links);assert.deepEqual(extended.milestones,task.milestones);assert.equal(extended.context,task.context);
 const saved=prepareChange({revision:1,tasks:[task],trash:[]},{action:'upsert',baseRevision:1,task:extended});
 assert.deepEqual(saved.state.tasks[0],extended);
 assert.throws(()=>prepareChange({revision:2,tasks:[task],trash:[]},{action:'upsert',baseRevision:1,task:extended}),e=>e.code===409);
});
test('resizing a deadline with unknown start does not invent a start date',()=>{
 const implicit={...task,start:''};
 assert.equal(resize(implicit,'end',2).start,'');assert.equal(resize(implicit,'end',-20).end,'2026-11-04');
 assert.equal(resize(implicit,'start',0).start,'');assert.equal(resize(implicit,'start',-1).start,'2026-11-03');
 assert.equal(resize({...task,start:'2026-10-31',end:'2026-11-01'},'start',-1).start,'2026-10-30');
});
