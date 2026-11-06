export const dateValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const parseDate=s=>new Date(s+'T12:00:00');
export function calendarDays(year,month){
 const first=new Date(year,month,1,12),offset=(first.getDay()+6)%7;
 return Array.from({length:42},(_,i)=>{const d=new Date(year,month,1-offset+i,12);return {value:dateValue(d),day:d.getDate(),currentMonth:d.getMonth()===month}});
}
export function shiftMonth(value,amount){
 const d=parseDate(value),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+amount);
 d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return dateValue(d);
}
