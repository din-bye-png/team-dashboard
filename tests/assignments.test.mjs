import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validTeam,validAssignments,initials,loadMix,assignmentSegments} from '../public/assignments.js';
import {validState,prepareChange} from '../public/backend.js';

const team=[{id:'ilya',name:'Илья Краснов',hours:8},{id:'masha',name:'Маша',hours:4}];
const task={id:'t',title:'Гайд',person:'',status:'active',start:'2026-11-09',end:'2026-11-20',note:'',milestones:[],
 assignments:[{id:'a2',personId:'masha',start:'2026-11-15',end:'2026-11-20',hours:4},{id:'a1',personId:'ilya',start:'2026-11-09',end:'2026-11-14',hours:8}]};

test('team and assignment validation',()=>{
 assert.equal(validTeam(team),true);assert.equal(validTeam(undefined),true);
 assert.equal(validTeam([{id:'x',name:'Без часов',color:'pink'}]),true);
 assert.equal(validTeam([{id:'x',name:'A',color:'neon'}]),false);
 for(const bad of [[{id:'x',name:' ',hours:8}],[{id:'x',name:'A',hours:0}],[{id:'x',name:'A',hours:30}],[{id:'x',name:'A',hours:2.3}],[team[0],team[0]]])assert.equal(validTeam(bad),false);
 assert.equal(validAssignments(task),true);assert.equal(validAssignments({}),true);
 for(const patch of [{end:'2026-11-01'},{start:'2026-02-30'},{hours:0},{personId:''}])
  assert.equal(validAssignments({assignments:[{...task.assignments[0],...patch}]}),false);
});

test('segments are ordered, clipped to the visible range and skip removed people',()=>{
 const segments=assignmentSegments(task,team,'2026-11-10','2026-11-18');
 assert.deepEqual(segments.map(s=>[s.person.id,s.offset,s.length,s.clippedStart]),[['ilya',0,5,true],['masha',5,4,false]]);
 assert.equal(assignmentSegments(task,[team[1]],'2026-11-09','2026-11-20').length,1);
 assert.equal(assignmentSegments(task,team,'2026-12-01','2026-12-10').length,0);
});

test('fill strength follows absolute hours per day and stays subtle',()=>{
 assert.equal(loadMix(8),100);assert.equal(loadMix(4),81);assert.equal(loadMix(12),100);assert.ok(loadMix(1)>=62);
 assert.ok(loadMix(2)<loadMix(4)&&loadMix(4)<loadMix(6));
 assert.equal(initials('илья краснов'),'ИК');assert.equal(initials('Маша'),'М');
});

test('team changes are versioned with the plan and survive task edits',()=>{
 let plan={revision:0,tasks:[],trash:[],team:[]};
 for(const body of [{action:'team',team},{action:'upsert',task},{action:'delete',id:'t'},{action:'restoreTask',id:'t'}]){
  const {state}=prepareChange(plan,{...body,baseRevision:plan.revision});plan={revision:plan.revision+1,...state};
 }
 assert.deepEqual(plan.team,team);assert.deepEqual(plan.tasks[0].assignments,task.assignments);
 assert.equal(validState({tasks:[],trash:[],team:[{id:'x',name:'',hours:8}]}),false);
 assert.throws(()=>prepareChange(plan,{action:'team',team:[{id:'x',name:'',hours:8}],baseRevision:plan.revision}));
});

test('restoring a version or a JSON file brings back missing people without removing anyone',()=>{
 const plan={revision:5,tasks:[task],trash:[],team:[team[1],{id:'new',name:'Новичок'}]};
 const {state}=prepareChange(plan,{action:'restoreVersion',revision:3,baseRevision:5},{tasks:[task],trash:[],team});
 assert.deepEqual(state.team.map(p=>p.id),['masha','new','ilya']);
 const fromFile=prepareChange(plan,{action:'replace',tasks:[task],team:[team[0]],baseRevision:5}).state;
 assert.deepEqual(fromFile.team.map(p=>p.id),['masha','new','ilya']);
 assert.deepEqual(prepareChange(plan,{action:'replace',tasks:[task],baseRevision:5}).state.team,plan.team);
 assert.throws(()=>prepareChange(plan,{action:'replace',tasks:[task],team:[{id:'x',name:''}],baseRevision:5}));
});
