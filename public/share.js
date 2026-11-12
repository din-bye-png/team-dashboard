import {createClient} from '@supabase/supabase-js';
import {safeMaterialUrl} from './task-materials.js';
const $=selector=>document.querySelector(selector);
const token=location.hash.match(/^#token=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
const statuses={active:'В работе',blocked:'На стопе',waiting:'Ожидаем вводных',done:'Готово'};
const date=value=>value?new Date(value+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'Не указано';
function showError(message){$('#passport').hidden=true;$('#pageStatus').textContent=message;$('#pageStatus').hidden=false}
function addText(parent,tag,value){const node=document.createElement(tag);node.textContent=value;parent.append(node);return node}
function render(task){
 $('#taskTitle').textContent=task.title;document.title=task.title+' · Паспорт задачи';
 $('#taskPerson').textContent=task.person||'Не назначен';$('#taskStatus').textContent=statuses[task.status]||task.status;
 $('#taskStart').textContent=date(task.start);$('#taskEnd').textContent=date(task.end);
 $('#taskContext').textContent=task.context||'Описание пока не добавлено.';
 $('#taskNote').textContent=task.note||'Примечаний пока нет.';
 const links=$('#taskLinks');links.replaceChildren();
 for(const item of task.links||[]){const url=safeMaterialUrl(item.url);if(!url)continue;const row=document.createElement('li');addText(row,'strong',item.title||new URL(url).hostname);const anchor=addText(row,'a',url);anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';links.append(row)}
 $('#noLinks').hidden=!!links.children.length;
 const milestones=$('#taskMilestones');milestones.replaceChildren();
 for(const item of [...(task.milestones||[])].sort((a,b)=>a.date.localeCompare(b.date))){const row=document.createElement('li');addText(row,'strong',item.label);const time=addText(row,'time',date(item.date));time.dateTime=item.date;milestones.append(row)}
 $('#noMilestones').hidden=!!milestones.children.length;
 $('#updatedAt').textContent='Обновлено '+new Date(task.updatedAt).toLocaleString('ru-RU');
 $('#pageStatus').hidden=true;$('#passport').hidden=false;
}
async function boot(){
 if(!token){showError('Ссылка на задачу недействительна.');return}
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey)){showError('Паспорт временно недоступен.');return}
 try{
  const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,detectSessionInUrl:false,autoRefreshToken:false}});
  const {data,error}=await client.rpc('dashboard_public_task',{p_token:token});
  if(error||!data){showError('Паспорт не найден или ссылка отключена.');return}
  render(data);
 }catch{showError('Не удалось загрузить паспорт. Проверьте соединение.')}
}
boot();
