import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual editor guard with form and dialog boundaries stubbed.
const source=readFileSync(new URL('../public/task-context.js',import.meta.url),'utf8');
const guard=source.slice(source.indexOf("let taskDraftBaseline='';"),source.indexOf('const discardDraft='));
function editor(){
 const form={fields:[['title','Название'],['context','Контекст']]};
 const modal={open:true,close(){this.open=false}};
 const discard={open:false,showModal(){this.open=true}};
 const nodes={'#form':form,'#editor':modal,'#linkTitle':{value:''},'#linkUrl':{value:''}};
 const milestones=[{value:'2026-11-12'},{value:'Показ'}];
 const context=vm.createContext({$:s=>nodes[s],document:{querySelectorAll:()=>milestones},FormData:class{constructor(f){return f.fields}},draftLinks:[],draftAttachments:[],saving:false,uploadingMaterials:false,discardDraft:discard});
 vm.runInContext(guard,context);
 context.markTaskDraftClean();
 return {context,form,modal,discard,milestones};
}
test('unchanged and reverted drafts close without prompting; changed text stays open',()=>{
 const e=editor();
 e.form.fields[0][1]='Другое название';e.context.requestTaskClose();
 assert.equal(e.modal.open,true);assert.equal(e.discard.open,true);
 e.discard.open=false;e.form.fields[0][1]='Название';e.context.requestTaskClose();
 assert.equal(e.modal.open,false);assert.equal(e.discard.open,false);
});
test('checkpoint, link, attachment and unfinished link changes protect the draft',()=>{
 for(const change of [e=>e.milestones[0].value='2026-11-13',e=>e.context.draftLinks.push({title:'Макет',url:'https://example.com'}),e=>e.context.draftAttachments.push({name:'brief.pdf',size:1024}),e=>vm.runInContext("$('#linkUrl').value='https://example.com'",e.context)]){
  const e=editor();change(e);e.context.requestTaskClose();
  assert.equal(e.modal.open,true);assert.equal(e.discard.open,true);
 }
});
test('saving and uploading cannot be interrupted by closing',()=>{
 for(const state of ['saving','uploadingMaterials']){
  const e=editor();e.context[state]=true;e.context.requestTaskClose();
  assert.equal(e.modal.open,true);assert.equal(e.discard.open,false);
 }
});
