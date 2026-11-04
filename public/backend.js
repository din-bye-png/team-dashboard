import {createClient} from '@supabase/supabase-js';
import {expiredMessage} from './auth-link.js';
import {validMaterials,MAX_FILE_SIZE} from './task-materials.js';

export function configured(config) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl)
    && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.workspaceId);
}

const fail = message => { throw new Error(message); };
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function validTask(t) {
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  return !!t && text(t.id,128)&&!!t.id && text(t.title,500)&&!!t.title.trim()
    && text(t.person,200)&&text(t.note,10000)&&['active','blocked','waiting','done'].includes(t.status)
    && text(t.start,10)&&text(t.end,10)&&(!t.start||validDate(t.start))&&(!t.end||validDate(t.end))
    && (!t.start||!t.end||t.start<=t.end)&&Array.isArray(t.milestones)&&t.milestones.length<=100
    && t.milestones.every(m=>m&&validDate(m.date)&&text(m.label,500))&&validMaterials(t);
}
export function validState(state) {
  return !!state && Array.isArray(state.tasks)&&state.tasks.length<=500&&state.tasks.every(validTask)
    && new Set(state.tasks.map(t=>t.id)).size===state.tasks.length
    && Array.isArray(state.trash)&&state.trash.length<=1000
    && state.trash.every(item=>validTask(item.task)&&typeof item.deletedAt==='string'&&!isNaN(Date.parse(item.deletedAt)))
    && new TextEncoder().encode(JSON.stringify(state)).length<=1_000_000;
}

export function prepareChange(plan, body, restored, now=new Date().toISOString()) {
  if (body.baseRevision!==plan.revision) {
    const error=new Error('План изменился у коллеги. Проверьте новую версию.');
    error.code=409;error.plan=plan;throw error;
  }
  const state=structuredClone({tasks:plan.tasks,trash:plan.trash});
  const cutoff=new Date(Date.parse(now)-30*86400000).toISOString();
  state.trash=state.trash.filter(x=>x.deletedAt>=cutoff);
  let reason;
  switch(body.action) {
    case 'upsert': {
      if(!validTask(body.task))fail('Проверьте поля задачи и даты');
      const task=structuredClone(body.task),exists=state.tasks.some(t=>t.id===task.id);
      state.tasks=exists?state.tasks.map(t=>t.id===task.id?task:t):[...state.tasks,task];
      state.trash=state.trash.filter(x=>x.task.id!==task.id);
      reason=exists?'Изменена задача':'Добавлена задача';break;
    }
    case 'move': {
      if(!['before','after'].includes(body.placement)||body.id===body.anchorId)fail('Некорректный порядок');
      const task=state.tasks.find(t=>t.id===body.id);
      if(!task||!state.tasks.some(t=>t.id===body.anchorId))fail('Задача не найдена');
      state.tasks=state.tasks.filter(t=>t.id!==body.id);
      const index=state.tasks.findIndex(t=>t.id===body.anchorId)+(body.placement==='after'?1:0);
      state.tasks.splice(index,0,task);reason='Изменён порядок задач';break;
    }
    case 'delete': {
      const task=state.tasks.find(t=>t.id===body.id);if(!task)fail('Задача не найдена');
      state.tasks=state.tasks.filter(t=>t.id!==body.id);state.trash.push({task,deletedAt:now});
      reason='Задача перемещена в корзину';break;
    }
    case 'restoreTask': {
      const item=state.trash.find(x=>x.task.id===body.id);
      if(!item||state.tasks.some(t=>t.id===body.id))fail('Задача недоступна для восстановления');
      state.tasks.push(item.task);state.trash=state.trash.filter(x=>x.task.id!==body.id);
      reason='Задача восстановлена';break;
    }
    case 'replace':
    case 'restoreVersion': {
      const incoming=body.action==='replace'?body.tasks:restored?.tasks;
      if(!Array.isArray(incoming)||!incoming.every(validTask))fail('Некорректные задачи');
      for(const task of state.tasks)if(!incoming.some(t=>t.id===task.id))state.trash.push({task,deletedAt:now});
      state.tasks=structuredClone(incoming);state.trash=state.trash.filter(x=>!incoming.some(t=>t.id===x.task.id));
      reason=body.action==='replace'?'План восстановлен из файла':'Восстановлена версия плана';break;
    }
    default: fail('Неизвестное действие');
  }
  if(!validState(state))fail('Некорректный или слишком большой план');
  return {state,reason};
}

export function createBackend(config,clientFactory=createClient) {
  if(!configured(config))return null;
  const client=clientFactory(config.supabaseUrl,config.supabasePublishableKey,{
    auth:{persistSession:false,detectSessionInUrl:false,autoRefreshToken:true},
  });
  let current=null,epoch=0,passwordSetup=false;
  async function rpc(name,params) {
    const started=epoch;
    const {data,error}=await client.rpc(name,{p_workspace:config.workspaceId,...params});
    if(started!==epoch)fail('Сеанс завершён');
    if(error){const e=new Error(error.code==='42501'?'Нет доступа к плану. Обратитесь к администратору.':'Не удалось выполнить запрос. Проверьте соединение и вход.');e.code=error.code;throw e;}
    return data;
  }
  async function snapshot(history=false) {
    const data=await rpc('dashboard_snapshot',{p_history:history});
    current=data.plan;return data;
  }
  async function api(path,body) {
    if(path==='plan')return snapshot();
    if(path==='history'){
      const data=await snapshot(true);
      return {revision:data.plan.revision,trash:data.plan.trash,versions:data.history.map(v=>({revision:v.revision,created_at:v.createdAt,reason:v.reason}))};
    }
    if(path.startsWith('version?')){
      const revision=Number(new URLSearchParams(path.split('?')[1]).get('revision'));
      const {history}=await snapshot(true);const v=history.find(x=>x.revision===revision);
      return v||fail('Версия не найдена');
    }
    if(path==='backup'){
      const {plan,history}=await snapshot(true);
      return {format:'team-plan-backup',formatVersion:1,exportedAt:new Date().toISOString(),...plan,history};
    }
    if(path!=='change')fail('Неизвестный запрос');
    if(!current)await snapshot();
    const started=epoch;
    const restored=body.action==='restoreVersion'?await api('version?revision='+body.revision):null;
    const {state,reason}=prepareChange(current,body,restored);
    try {
      const plan=await rpc('dashboard_save',{p_revision:body.baseRevision,p_content:state,p_reason:reason});
      if(started!==epoch)fail('Сеанс завершён');
      current=plan;return {plan};
    }catch(error){
      if(error.code==='40001'){
        const latest=await snapshot();error.code=409;error.plan=latest.plan;
        error.message='План изменился у коллеги. Проверьте новую версию перед сохранением.';
      }
      throw error;
    }
  }
  return {
    api,
    async getTaskShare(taskId){return rpc('dashboard_task_share_status',{p_task_id:taskId})},
    async setTaskShare(taskId,enabled){return rpc('dashboard_task_share_set',{p_task_id:taskId,p_enabled:enabled})},
    async uploadAttachment(file){
      if(file.size>MAX_FILE_SIZE)fail('Файл больше 20 МБ');
      const started=epoch,path=config.workspaceId+'/'+crypto.randomUUID();
      const {error}=await client.storage.from('task-attachments').upload(path,file,{contentType:'application/octet-stream',upsert:false});
      if(started!==epoch)fail('Сеанс завершён');
      if(error)fail('Не удалось загрузить файл. Проверьте соединение и настройку хранилища.');
      return path;
    },
    async downloadAttachment(path){
      if(!path.startsWith(config.workspaceId+'/'))fail('Файл из другого рабочего пространства');
      const started=epoch,{data,error}=await client.storage.from('task-attachments').download(path);
      if(started!==epoch)fail('Сеанс завершён');
      if(error)fail('Не удалось скачать файл. Проверьте соединение и доступ.');
      return data;
    },
    async acceptAuthLink(link){
      passwordSetup=false;
      if(link.error)fail(link.error);
      const {error}=await client.auth.setSession({access_token:link.access_token,refresh_token:link.refresh_token});
      if(error){await client.auth.signOut({scope:'local'});fail(expiredMessage);}
      const {data,error:userError}=await client.auth.getUser();
      if(userError||!data?.user){await client.auth.signOut({scope:'local'});fail(expiredMessage);}
      passwordSetup=['invite','recovery'].includes(link.type);
      return {passwordSetup,email:data.user.email||''};
    },
    async setPassword(password){
      if(!passwordSetup)fail('Откройте новую ссылку из письма.');
      if(typeof password!=='string'||password.length<8||password.length>1024)fail('Используйте пароль от 8 до 1024 символов.');
      const {error}=await client.auth.updateUser({password});
      if(error)fail(error.code==='weak_password'?'Пароль слишком простой. Используйте более сложный пароль.':'Не удалось сохранить пароль. Проверьте соединение и попробуйте ещё раз.');
      passwordSetup=false;
    },
    async signIn(email,password){
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error)fail('Не удалось войти. Проверьте данные и попробуйте ещё раз.');
    },
    async signOut(){epoch++;current=null;passwordSetup=false;await client.auth.signOut({scope:'local'});},
    onSignedOut(callback){client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){epoch++;current=null;passwordSetup=false;callback();}});},
  };
}
