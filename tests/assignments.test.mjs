import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validTeam,validAssignments,initials,loadMix,assignmentSegments,assignmentSlices,sliceHoursLabel,sliceHours,sliceLabel} from '../public/assignments.js';
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

test('parallel people share time slices; handovers start new ones',()=>{
 const crew=[...team,{id:'dima',name:'Дима'}];
 const parallel={...task,assignments:[
  {id:'d',personId:'dima',start:'2026-11-09',end:'2026-11-20',hours:6},
  {id:'i',personId:'ilya',start:'2026-11-12',end:'2026-11-15',hours:2},
  {id:'m',personId:'masha',start:'2026-11-16',end:'2026-11-20',hours:6}]};
 const slices=assignmentSlices(parallel,crew,'2026-11-09','2026-11-20');
 assert.deepEqual(slices.map(s=>[s.offset,s.length,s.members.map(m=>m.person.id).join('+')]),
  [[0,3,'dima'],[3,4,'dima+ilya'],[7,5,'dima+masha']]);
 assert.equal(sliceHoursLabel(slices[0].members),'6 ч');
 assert.equal(sliceHoursLabel(slices[1].members),'6 + 2 ч');
 assert.equal(sliceHoursLabel(slices[2].members),'по 6 ч');
 assert.equal(sliceLabel(slices[1].members),'Дима, Илья · 6 + 2 ч');
 const many=n=>Array.from({length:n},(_,i)=>({person:{id:'p'+i,name:'P'+i},assignment:{hours:4}}));
 assert.equal(sliceLabel(many(3)),'3 человека · 12 ч');assert.equal(sliceLabel(many(5)),'5 человек · 20 ч');
 assert.equal(sliceHours(slices[1].members),8);assert.equal(loadMix(sliceHours(slices[2].members)),100);
 // Sequential work keeps one slice per person, and gaps stay empty.
 assert.deepEqual(assignmentSlices(task,team,'2026-11-09','2026-11-20').map(s=>[s.offset,s.length,s.members.length]),[[0,6,1],[6,6,1]]);
 const gap={...task,assignments:[{id:'a',personId:'ilya',start:'2026-11-09',end:'2026-11-10',hours:8},{id:'b',personId:'ilya',start:'2026-11-14',end:'2026-11-15',hours:8}]};
 assert.deepEqual(assignmentSlices(gap,team,'2026-11-09','2026-11-20').map(s=>[s.offset,s.length]),[[0,2],[5,2]]);
});
