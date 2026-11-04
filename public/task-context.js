let draftLinks=[],draftAttachments=[],uploadingMaterials=false;
const sizeLabel=size=>size<1024?size+' Б':size<1048576?(size/1024).toFixed(0)+' КБ':(size/1048576).toFixed(1)+' МБ';
function resizeTaskContext(){
 if(!$('#editor').open)return;
 const field=$('#taskContext');
 field.style.height='auto';
 field.style.height=(field.scrollHeight+field.offsetHeight-field.clientHeight)+'px';
}
$('#taskContext').addEventListener('input',resizeTaskContext);
let contextWidth=0;
new ResizeObserver(entries=>{
 const width=entries[0].contentRect.width;
 if(width&&width!==contextWidth){contextWidth=width;resizeTaskContext()}
}).observe($('#taskContext'));
function resetTaskContext(task={}){
 draftLinks=structuredClone(task.links||[]);draftAttachments=structuredClone(task.attachments||[]);
 $('#form').elements.context.value=task.context||'';$('#linkComposer').hidden=true;$('#linkTitle').value='';$('#linkUrl').value='';$('#attachmentInput').value='';$('#linkError').hidden=true;
 renderMaterials();
}
function renderMaterials(){
 const linkCount=draftLinks.filter(link=>!link.removed).length;
 $('#linkCount').textContent=linkCount?'· '+linkCount:'';
 const attachmentCount=draftAttachments.filter(file=>!file.removed).length;
 $('#attachmentCount').textContent=attachmentCount?'· '+attachmentCount:'';
 $('#taskLinks').innerHTML=draftLinks.length?draftLinks.map((link,i)=>link.removed?`<div class="material-row material-removed">${materialIcon(link)}<div class="material-info"><strong>${esc(link.title||new URL(link.url).hostname)}</strong><small role="status">Ссылка убрана из задачи</small></div><button type="button" class="restore-material" data-restore-link="${i}" aria-label="Вернуть ссылку ${esc(link.title)}">↶ Вернуть</button></div>`:`<div class="material-row">${materialIcon(link)}<div class="material-info"><strong>${esc(link.title||new URL(link.url).hostname)} ↗</strong><a href="${esc(safeMaterialUrl(link.url)||'#')}" target="_blank" rel="noopener noreferrer">${esc(link.url)}</a></div><button type="button" data-copy-link="${i}" aria-label="Копировать ссылку ${esc(link.title)}">Копировать</button><button type="button" class="remove-material" data-remove-link="${i}" aria-label="Убрать ссылку ${esc(link.title)}">×</button></div>`).join(''):'<p class="material-empty">Добавьте макет, бриф или папку проекта — всё будет под рукой.</p>';
 $('#taskAttachments').innerHTML=draftAttachments.length?draftAttachments.map((file,i)=>file.removed?`<div class="material-row material-removed">${materialIcon(file)}<div class="material-info"><strong>${esc(file.name)}</strong><small role="status">Файл убран из задачи</small></div><button type="button" class="restore-material" data-restore-file="${i}" aria-label="Вернуть файл ${esc(file.name)}">↶ Вернуть</button></div>`:`<div class="material-row">${materialIcon(file)}<div class="material-info"><strong>${esc(file.name)}</strong><small>${esc(file.name.split('.').pop().toUpperCase())} · ${sizeLabel(file.size)}${file.pendingFile?' · К сохранению':''}</small></div><button type="button" data-download-file="${i}" aria-label="Скачать ${esc(file.name)}">↓ Скачать</button><button type="button" class="remove-material" data-remove-file="${i}" aria-label="Убрать файл ${esc(file.name)}">×</button></div>`).join(''):'<p class="material-empty">Прикрепите документы, PDF, изображения и другие файлы.</p>';
}
async function copyText(value){try{await navigator.clipboard.writeText(value);toast('Скопировано')}catch{toast('Не удалось скопировать. Проверьте доступ к буферу обмена.')}}
$('#addLink').onclick=()=>{if(draftLinks.filter(link=>!link.removed).length>=30){toast('Можно прикрепить до 30 ссылок');return}$('#linkComposer').hidden=false;$('#linkTitle').focus()};
$('#cancelLink').onclick=()=>{$('#linkComposer').hidden=true;$('#linkTitle').value='';$('#linkUrl').value='';$('#linkError').hidden=true};
function addDraftLink(){
 const url=safeMaterialUrl($('#linkUrl').value.trim());
 if(!url){$('#linkError').textContent='Укажите полную ссылку, начиная с https:// или http://';$('#linkError').hidden=false;$('#linkUrl').focus();return false}
 if(draftLinks.filter(link=>!link.removed).length>=30){toast('Можно прикрепить до 30 ссылок');return false}
 draftLinks.unshift({title:$('#linkTitle').value.trim()||new URL(url).hostname,url});$('#cancelLink').click();renderMaterials();return true;
}
$('#saveLink').onclick=addDraftLink;
$('#linkComposer').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addDraftLink()}});
$('#taskLinks').onclick=e=>{
 if(uploadingMaterials||saving)return;
 const remove=e.target.closest('[data-remove-link]'),restore=e.target.closest('[data-restore-link]'),copy=e.target.closest('[data-copy-link]');
 if(remove){const index=Number(remove.dataset.removeLink);draftLinks[index].removed=true;renderMaterials();$('#taskLinks').querySelector(`[data-restore-link="${index}"]`).focus()}
 if(restore){
  if(draftLinks.filter(link=>!link.removed).length>=30){toast('Чтобы вернуть ссылку, освободите одно из 30 мест');return}
  const index=Number(restore.dataset.restoreLink);delete draftLinks[index].removed;renderMaterials();$('#taskLinks').querySelector(`[data-remove-link="${index}"]`).focus();
 }
 if(copy)copyText(draftLinks[Number(copy.dataset.copyLink)].url);
};
$('#attachFiles').onclick=()=>$('#attachmentInput').click();
$('#attachmentInput').onchange=e=>{
 if(!ready||saving||uploadingMaterials){e.target.value='';return}
 const addedFiles=[];
 for(const file of e.target.files){
  if(draftAttachments.filter(file=>!file.removed).length+addedFiles.length>=20){toast('Можно прикрепить до 20 файлов');break}
  if(file.size>MAX_FILE_SIZE){toast('Файл «'+file.name+'» больше 20 МБ');continue}
  if(file.name.length>255){toast('Название файла слишком длинное');continue}
  addedFiles.push({name:file.name,size:file.size,type:file.type||'application/octet-stream',pendingFile:file});
 }
 draftAttachments.unshift(...addedFiles);e.target.value='';renderMaterials();
};
function downloadAttachment(blob,name){const url=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
$('#taskAttachments').onclick=async e=>{
 if(uploadingMaterials||saving)return;
 const remove=e.target.closest('[data-remove-file]'),restore=e.target.closest('[data-restore-file]'),button=e.target.closest('[data-download-file]');
 if(remove){const index=Number(remove.dataset.removeFile);draftAttachments[index].removed=true;renderMaterials();$('#taskAttachments').querySelector(`[data-restore-file="${index}"]`).focus()}
 if(restore){
  if(draftAttachments.filter(file=>!file.removed).length>=20){toast('Чтобы вернуть файл, освободите одно из 20 мест');return}
  const index=Number(restore.dataset.restoreFile);delete draftAttachments[index].removed;renderMaterials();$('#taskAttachments').querySelector(`[data-remove-file="${index}"]`).focus();
 }
 if(button){const file=draftAttachments[Number(button.dataset.downloadFile)],epoch=authEpoch;button.disabled=true;try{const blob=file.pendingFile||await backend.downloadAttachment(file.path);if(epoch===authEpoch)downloadAttachment(blob,file.name)}catch(error){toast(error.message)}finally{button.disabled=false}}
};
async function uploadTaskAttachments(){
 const epoch=authEpoch;
 for(const file of draftAttachments){
  if(file.removed||!file.pendingFile)continue;
  const path=await backend.uploadAttachment(file.pendingFile);
  if(epoch!==authEpoch)throw new Error('Сеанс завершён');
  file.path=path;delete file.pendingFile;
 }
 return draftAttachments.filter(file=>!file.removed).map(({name,size,type,path})=>({name,size,type,path}));
}
$('#copySummary').onclick=()=>{
 const f=$('#form').elements;
 const milestones=[...$('#milestones').children].map(row=>row.children[0].value+' — '+row.children[1].value);
 copyText([f.title.value,f.person.value+' · '+statusLabel[f.status.value],f.end.value?'Дедлайн: '+f.end.value:'',f.context.value,f.note.value,...draftLinks.filter(link=>!link.removed).map(l=>l.title+': '+l.url),...draftAttachments.filter(file=>!file.removed).map(a=>'Файл: '+a.name),...milestones].filter(Boolean).join('\n\n'));
};
$('#copyTaskLink').onclick=()=>{const url=new URL(location.href);url.hash='task='+encodeURIComponent(editing);copyText(url.href)};
let shareToken=null,shareBusy=false,shareRequest=0;
function publicShareURL(){const url=new URL('share.html',location.href);url.hash='token='+shareToken;return url.href}
function renderTaskShare(){
 const published=!!shareToken;
 $('#shareToggle').textContent=published?'Отключить ссылку':'Создать ссылку';
 $('#shareToggle').disabled=shareBusy||saving||uploadingMaterials;
 $('#shareCopy').hidden=!published;$('#shareOpen').hidden=!published;
 if(published)$('#shareOpen').href=publicShareURL();else $('#shareOpen').removeAttribute('href');
}
async function loadTaskShare(id){
 const request=++shareRequest;shareToken=null;shareBusy=!!id;$('#taskShare').hidden=!id;
 if(!id)return;
 $('#shareStatus').textContent='Проверяем доступ к паспорту…';renderTaskShare();
 try{
  const token=await backend.getTaskShare(id);
  if(request!==shareRequest||editing!==id||!$('#editor').open)return;
  shareToken=token;$('#shareStatus').textContent=token?'Ссылка активна. Страница обновляется после сохранения задачи.':'Ссылка ещё не создана. Опубликуйте задачу, когда контекст будет готов.';
 }catch(error){if(request===shareRequest)$('#shareStatus').textContent=error.message}
 finally{if(request===shareRequest){shareBusy=false;renderTaskShare()}}
}
$('#shareToggle').onclick=async()=>{
 if(shareBusy||saving||uploadingMaterials||!ready)return;
 const id=editing,enabled=!shareToken;
 if(!enabled&&!confirm('Отключить публичную ссылку? Старый адрес перестанет открываться.'))return;
 const request=++shareRequest;shareBusy=true;renderTaskShare();
 try{
  const token=await backend.setTaskShare(id,enabled);
  if(request!==shareRequest||editing!==id||!$('#editor').open)return;
  shareToken=token;$('#shareStatus').textContent=token?'Ссылка активна. Несохранённые изменения появятся после сохранения задачи.':'Ссылка отключена. Старый адрес больше не работает.';
  toast(token?'Паспорт опубликован':'Публичная ссылка отключена');
 }catch(error){if(request===shareRequest){$('#shareStatus').textContent=error.message;toast(error.message)}}
 finally{if(request===shareRequest){shareBusy=false;renderTaskShare()}}
};
$('#shareCopy').onclick=()=>{if(shareToken)copyText(publicShareURL())};
$('#editor').addEventListener('cancel',e=>{if(saving||uploadingMaterials)e.preventDefault()});
// Dismiss only when both the press and click are outside the dialog.
// Selecting text inside and releasing over the backdrop keeps the draft open.
let taskBackdropPress=false;
function outsideTaskDialog(e){const r=$('#editor').getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom}
$('#editor').addEventListener('pointerdown',e=>{taskBackdropPress=e.button===0&&e.target===$('#editor')&&outsideTaskDialog(e)});
$('#editor').addEventListener('pointercancel',()=>{taskBackdropPress=false});
$('#editor').addEventListener('click',e=>{const dismiss=taskBackdropPress&&e.target===$('#editor')&&outsideTaskDialog(e);taskBackdropPress=false;if(dismiss)$('#close').click()});
$('#editor').addEventListener('close',()=>{shareRequest++;shareToken=null;$('#taskShare').hidden=true;resetTaskContext()});
let handledTaskHash='';
function openLinkedTask(){if(!ready||!location.hash.startsWith('#task=')||handledTaskHash===location.hash)return;handledTaskHash=location.hash;let id;try{id=decodeURIComponent(location.hash.slice(6))}catch{return}if(tasks.some(t=>t.id===id))edit(id);else toast('Задача не найдена в текущем плане')}
window.addEventListener('hashchange',()=>{handledTaskHash='';openLinkedTask()});
