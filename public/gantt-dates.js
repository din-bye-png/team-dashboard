export function resizeTaskDates(task,edge,days,today,firstDay,lastDay){
 const shift=(value,amount)=>{const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10)};
 const clamp=(value,min,max)=>value<min?min:value>max?max:value;
 const start=task.start||today;
 if(edge==='start')return {...task,start:days===0?task.start:clamp(shift(start,days),firstDay,task.end)};
 return {...task,end:clamp(shift(task.end,days),start>firstDay?start:firstDay,lastDay)};
}
