let revision=0,editRevision=0,ready=false,saving=false,polling=false,archiveRevision=0;
let fileHandle=null,fileRevision=-1,fileQueue=Promise.resolve();
const syncStatus=$('#syncStatus');
function status(message,error=false){syncStatus.textContent=message;syncStatus.classList.toggle('error-text',error)}
function controls(){ $('#add').disabled=!ready||saving;$('#import').disabled=!ready||saving;$('#form').querySelectorAll('button').forEach(b=>b.disabled=saving); }
let authEpoch=0;
const authLink=consumeAuthLink(window.location,window.history);
const backend=createBackend(config);
async function api(path,body){
 const started=authEpoch;
 if(!backend)throw new Error('Подключение пока не настроено');
 const result=await backend.api(path,body);
 if(started!==authEpoch)throw new Error('Сеанс завершён');
 return result;
}
function applyPlan(plan){if(!plan||plan.revision<revision)return;if(taskReorder)cancelTaskReorder();const changed=!ready||revision!==plan.revision;tasks=plan.tasks;revision=plan.revision;ready=true;if(changed)render();controls();status('Общий план · версия '+revision);}
async function refresh(){
 if(polling||saving||taskReorder)return;polling=true;
 try{const {plan}=await api('plan');if(plan){const changed=plan.revision!==revision;applyPlan(plan);if(changed&&$('#editor').open){$('#editWarning').textContent='План обновился у коллеги. Ваш текст остаётся в форме; при сохранении проверим конфликт.';$('#editWarning').hidden=false}queueFile()}}
 catch(error){status(error.message||'Нет связи с сервером',true)}finally{polling=false}
}
async function change(action,payload={},baseRevision=revision){
 if(saving||!ready)return false;saving=true;controls();status('Сохраняем на сервере…');
 try{const {plan}=await api('change',{action,baseRevision,...payload});applyPlan(plan);toast('Сохранено в общем плане');queueFile();return true}
 catch(error){
  if(error.plan)applyPlan(error.plan);
  if(error.code===409&&$('#editor').open){
   const current=tasks.find(t=>t.id===editing);
   $('#editWarning').textContent=error.message+(current?' Текущая задача на сервере: '+current.title+' · '+current.person+' · '+(current.end||'без срока')+'. Ваши поля сохранены. Сверьте их и нажмите «Сохранить» повторно.':' Ваши поля сохранены. Проверьте план перед повторным сохранением.');
   $('#editWarning').hidden=false;editRevision=revision;
  }
  status(error.message,true);toast(error.message);return false;
 }finally{saving=false;controls()}
}
$('#form').onsubmit=async e=>{
 e.preventDefault();if(!ready||saving)return;
 const f=e.target.elements;
 if(f.start.value&&f.end.value&&f.start.value>f.end.value){toast('Дедлайн должен быть не раньше начала');return}
 const task={id:editing||crypto.randomUUID(),title:f.title.value.trim(),person:f.person.value.trim()||'Не назначен',status:f.status.value,start:f.start.value,end:f.end.value,note:f.note.value,milestones:[...$('#milestones').children].map(row=>({date:row.children[0].value,label:row.children[1].value.trim()}))};
 if(!task.title)return;
 if(await change('upsert',{task},editRevision))$('#editor').close();
};
$('#delete').onclick=async()=>{if(confirm('Переместить задачу в корзину на 30 дней?')&&await change('delete',{id:editing},editRevision))$('#editor').close()};
function download(data,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#export').onclick=async()=>{try{download(await api('backup'),'team-plan-'+TODAY+'.json');toast('Резервная копия скачана')}catch(error){toast(error.message)}};
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{
 try{
  const file=e.target.files[0];if(!file)return;if(file.size>30_000_000)throw new Error('Файл слишком большой');
  const data=JSON.parse(await file.text()),incoming=Array.isArray(data)?data:data.tasks;
  if(!valid(incoming))throw new Error('Некорректный файл плана');
  if(confirm('Восстановить '+incoming.length+' задач из файла в общий план для всей команды? Текущая версия останется в истории.'))await change('replace',{tasks:incoming});
 }catch(error){toast(error.message||'Не удалось прочитать файл')}finally{e.target.value=''}
};
async function loadArchive(){
 $('#versionPreview').hidden=true;
 try{
  const data=await api('history');archiveRevision=data.revision;
  $('#trashList').innerHTML=data.trash.length?data.trash.map(item=>`<div class="archive-row"><div><strong>${esc(item.task.title)}</strong><small>Удалена ${new Date(item.deletedAt).toLocaleString('ru-RU')}</small></div><button data-restore-task="${esc(item.task.id)}">Вернуть</button></div>`).join(''):'<p class="small">Корзина пуста</p>';
  $('#versionList').innerHTML=data.versions.length?data.versions.map(v=>`<div class="archive-row"><div><strong>Версия ${v.revision}</strong><small>${esc(v.reason)} · ${new Date(v.created_at).toLocaleString('ru-RU')}</small></div><button data-version="${v.revision}">Посмотреть</button></div>`).join(''):'<p class="small">История пока пуста</p>';
 }catch(error){toast(error.message)}
}
$('#history').onclick=()=>{$('.more').open=false;$('#archive').showModal();loadArchive()};$('#closeArchive').onclick=()=>$('#archive').close();$('#refreshArchive').onclick=loadArchive;
$('#trashList').onclick=async e=>{const button=e.target.closest('[data-restore-task]');if(button&&await change('restoreTask',{id:button.dataset.restoreTask},archiveRevision))loadArchive()};
$('#versionList').onclick=async e=>{
 const button=e.target.closest('[data-version]');if(!button)return;
 try{
  const v=await api('version?revision='+button.dataset.version),preview=$('#versionPreview');
  preview.innerHTML=`<h3>Версия ${v.revision} · ${v.tasks.length} задач</h3><ul>${v.tasks.map(t=>`<li>${esc(t.title)} — ${esc(t.person)} · ${esc(t.end||'без срока')}</li>`).join('')}</ul><button id="restoreVersion" class="primary">Восстановить эту версию</button>`;preview.hidden=false;
  $('#restoreVersion').onclick=async()=>{if(confirm('Восстановить весь план из версии '+v.revision+' для всей команды? Текущий план останется в истории.')&&await change('restoreVersion',{revision:v.revision},archiveRevision))loadArchive()};preview.scrollIntoView({block:'nearest'});
 }catch(error){toast(error.message)}
};
// File access is opt-in and kept only in memory for this signed-in session.
function fileStatus(message){$('#fileStatus').textContent=message;$('#localFile').textContent=fileHandle?'Файл: '+fileHandle.name:'Файл на компьютере';$('#disconnectFile').hidden=!fileHandle}
async function writeLocalFile(){
 const handle=fileHandle;if(!handle||!ready||fileRevision===revision)return;
 if(await handle.queryPermission({mode:'readwrite'})!=='granted'){$('#resumeFile').hidden=false;fileStatus('Нужно разрешение на запись в '+handle.name);return}
 const backup=await api('backup');if(fileHandle!==handle)return;
 const stream=await handle.createWritable();try{await stream.write(JSON.stringify(backup,null,2));await stream.close()}catch(error){await stream.abort().catch(()=>{});throw error}
 fileRevision=backup.revision;$('#resumeFile').hidden=true;fileStatus(handle.name+' · версия '+fileRevision+' · записано '+new Date().toLocaleTimeString('ru-RU'));
}
function queueFile(){fileQueue=fileQueue.then(writeLocalFile).catch(error=>{fileStatus('Файл не обновлён: '+error.message);$('#resumeFile').hidden=!fileHandle});return fileQueue}
$('#localFile').onclick=()=>{$('.more').open=false;$('#fileDialog').showModal()};$('#closeFile').onclick=()=>$('#fileDialog').close();
$('#chooseFile').onclick=async()=>{
 try{
  if(!window.showSaveFilePicker){toast('Для автозаписи откройте сайт в Chrome или Edge');return}
  const handle=await window.showSaveFilePicker({suggestedName:'team-plan-backup.json',types:[{description:'Резервная копия плана',accept:{'application/json':['.json']}}]});
  fileHandle=handle;fileRevision=-1;fileStatus('Записываем '+handle.name+'…');
  await queueFile();
 }catch(error){if(error.name!=='AbortError')fileStatus('Не удалось выбрать файл: '+error.message)}
};
$('#resumeFile').onclick=async()=>{try{if(fileHandle&&await fileHandle.requestPermission({mode:'readwrite'})==='granted'){fileRevision=-1;await queueFile()}}catch(error){fileStatus(error.message)}};
$('#disconnectFile').onclick=async()=>{fileHandle=null;fileRevision=-1;await fileQueue;$('#resumeFile').hidden=true;fileStatus('Файл отключён. Уже записанная копия осталась на компьютере.')};
$('#fileSupport').textContent=window.showSaveFilePicker?'Сайт записывает только выбранный вами файл.':'В этом браузере автозапись недоступна. Можно скачать копию через меню или открыть сайт в Chrome/Edge.';
$('#chooseFile').disabled=!window.showSaveFilePicker;
async function boot(){
 controls();render();
 try{const {plan}=await api('plan');if(!plan)throw new Error('План не настроен администратором');applyPlan(plan);return true;}
 catch(error){ready=false;controls();status(error.message,true);return false;}
}
function clearPrivateView(){
 authEpoch++;ready=false;revision=0;editRevision=0;archiveRevision=0;tasks=[];editing=null;
 fileHandle=null;fileRevision=-1;cancelTaskReorder();hideFlagTooltip();flagTooltip.innerHTML='';
 for(const dialog of document.querySelectorAll('dialog'))if(dialog.open)dialog.close();
 $('#form').reset();$('#milestones').replaceChildren();$('#editWarning').textContent='';
 for(const id of ['trashList','versionList','versionPreview'])$('#'+id).replaceChildren();
 $('#person').value='';render();controls();$('#dashboard').hidden=true;$('#authScreen').hidden=false;
 $('#authForm').reset();$('#toast').textContent='';fileStatus('Файл не выбран');
 $('#passwordForm').reset();$('#passwordForm').hidden=true;$('#authForm').hidden=false;$('#passwordError').textContent='';
}
if(backend)backend.onSignedOut(clearPrivateView);
else{
 $('#authError').textContent='Подключение ещё не настроено. Обратитесь к администратору.';
 $('#authForm').querySelector('button').disabled=true;
}
$('#authForm').onsubmit=async event=>{
 event.preventDefault();if(!backend)return;
 const button=event.target.querySelector('button');button.disabled=true;$('#authError').textContent='';
 const email=event.target.elements.email.value.trim(),password=event.target.elements.password.value;
 event.target.elements.password.value='';
 try{
  await backend.signIn(email,password);
  if(!await boot())throw new Error('План недоступен. Обратитесь к администратору.');
  $('#authScreen').hidden=true;$('#dashboard').hidden=false;render();
 }catch(error){await backend.signOut();clearPrivateView();$('#authError').textContent=error.message;}
 finally{button.disabled=false;}
};
$('#logout').onclick=async()=>{clearPrivateView();await backend.signOut();};
$('#cancelPassword').onclick=async()=>{clearPrivateView();await backend.signOut();};
$('#passwordForm').onsubmit=async event=>{
 event.preventDefault();if(!backend)return;
 const form=event.target,button=form.querySelector('[type="submit"]');
 const password=form.elements.password.value,confirmation=form.elements.confirmation.value;
 $('#passwordError').textContent='';
 if(password!==confirmation){$('#passwordError').textContent='Пароли не совпадают.';return;}
 button.disabled=true;
 try{
  await backend.setPassword(password);
  // The password is now saved even if workspace access has not been assigned yet.
  form.reset();
  const email=$('#authForm').elements.email.value;
  await backend.signOut();clearPrivateView();$('#authForm').elements.email.value=email;
  $('#authError').textContent='Пароль сохранён. Войдите с новым паролем.';
 }catch(error){$('#passwordError').textContent=error.message;}
 finally{button.disabled=false;}
};
async function initializeAuthLink(){
 if(!authLink||!backend)return;
 const button=$('#authForm').querySelector('button');button.disabled=true;
 $('#authError').textContent='Проверяем ссылку…';
 try{
  const result=await backend.acceptAuthLink(authLink);
  $('#authError').textContent='';$('#authForm').elements.email.value=result.email;
  if(result.passwordSetup){
   $('#authForm').hidden=true;$('#passwordForm').hidden=false;
   $('#passwordIntro').textContent='Установите пароль для '+result.email+'.';
   $('#passwordForm').elements.password.focus();
  }else{
   await backend.signOut();clearPrivateView();$('#authForm').elements.email.value=result.email;
   $('#authError').textContent='Email подтверждён. Войдите с вашим паролем.';
  }
 }catch(error){await backend.signOut();clearPrivateView();$('#authError').textContent=error.message;}
 finally{
  // Do not retain a second reference to bearer credentials for this page's lifetime.
  delete authLink.access_token;delete authLink.refresh_token;button.disabled=false;
 }
}
initializeAuthLink();
setInterval(()=>{if(ready)refresh();},10000);
window.addEventListener('focus',()=>{if(ready){refresh();queueFile();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready){refresh();queueFile();}});
window.addEventListener('beforeunload',event=>{if(saving){event.preventDefault();event.returnValue='';}});
