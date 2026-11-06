import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDays,shiftMonth,parseDate} from '../public/calendar-model.js';
test('calendar begins on Monday, includes adjacent days and every day exactly once',()=>{
 const grid=calendarDays(2026,10);
 assert.equal(grid.length,42);assert.equal(parseDate(grid[0].value).getDay(),1);
 assert.equal(grid[0].value,'2026-10-26');assert.equal(grid.at(-1).value,'2026-12-06');
 assert.equal(new Set(grid.map(d=>d.value)).size,42);
 assert.deepEqual(grid.filter(d=>d.currentMonth).map(d=>d.day),Array.from({length:30},(_,i)=>i+1));
});
test('month grid handles leap years and year boundaries',()=>{
 assert.equal(calendarDays(2024,1).filter(d=>d.currentMonth).length,29);
 assert.equal(calendarDays(2025,1).filter(d=>d.currentMonth).length,28);
 assert.ok(calendarDays(2027,0).some(d=>d.value==='2026-12-31'));
});
test('month and year navigation clamps dates without overflowing the target month',()=>{
 assert.equal(shiftMonth('2026-01-31',1),'2026-02-28');
 assert.equal(shiftMonth('2024-01-31',1),'2024-02-29');
 assert.equal(shiftMonth('2024-02-29',12),'2025-02-28');
 assert.equal(shiftMonth('2026-12-31',1),'2027-01-31');
 assert.equal(shiftMonth('2026-03-31',-1),'2026-02-28');
});
