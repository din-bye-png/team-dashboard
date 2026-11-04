import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialKind,safeMaterialUrl,MAX_FILE_SIZE} from '../public/task-materials.js';
import {validTask,prepareChange} from '../public/backend.js';
const task={id:'example',title:'Task',person:'',status:'active',start:'',end:'',note:'',milestones:[]};
const attachment={name:'guide.pdf',type:'application/pdf',size:100,path:'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001'};
test('recognizes material types and rejects executable/credential URLs',()=>{
 for(const [item,kind] of [[{url:'https://www.figma.com/design/a'},'figma'],[{url:'https://figma.com.evil.example/a'},'link'],[{url:'https://docs.google.com/document/a'},'document'],[{url:'https://drive.google.com/drive/folders/a'},'folder'],[{name:'a.PDF'},'pdf'],[{name:'photo.webp'},'image'],[{name:'data.xlsx'},'spreadsheet'],[{name:'source.zip'},'archive'],[{name:'unknown.bin'},'file']])assert.equal(materialKind(item),kind);
 for(const url of ['javascript:alert(1)','data:text/html,a','file:///tmp/a',['https:','','user:pass@example.com'].join('/')])assert.equal(safeMaterialUrl(url),null);
});
test('context and material metadata survive edits, trash and restore; legacy tasks remain valid',()=>{
 assert.equal(validTask(task),true);
 const enriched={...task,context:'Goal and important details',links:[{title:'Design',url:'https://figma.com/design/a'}],attachments:[attachment]};
 assert.equal(validTask(enriched),true);
 const saved=prepareChange({revision:0,tasks:[task],trash:[]},{action:'upsert',baseRevision:0,task:enriched}).state;
 const removed=prepareChange({revision:1,...saved},{action:'delete',baseRevision:1,id:task.id}).state;
 const restored=prepareChange({revision:2,...removed},{action:'restoreTask',baseRevision:2,id:task.id}).state;
 assert.deepEqual(restored.tasks[0],enriched);
 for(const patch of [{context:null},{context:'a'.repeat(20001)},{links:[{title:'Unsafe',url:'javascript:alert(1)'}]},{attachments:[{...attachment,size:MAX_FILE_SIZE+1}]},{attachments:[{...attachment,path:'../a'}]}])assert.equal(validTask({...task,...patch}),false);
});
