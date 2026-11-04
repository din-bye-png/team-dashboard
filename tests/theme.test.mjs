import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/theme.js',import.meta.url),'utf8');
function setup({saved=null,dark=false,blocked=false}={}){
 const events={},systemEvents={},documentEvents={},root={dataset:{},style:{}},writes=[];
 const buttons=['light','dark','system'].map(mode=>({dataset:{themeChoice:mode},setAttribute(k,v){this[k]=v}}));
 const summary={setAttribute(k,v){this[k]=v},focus(){}};
 const menu={open:true,querySelector:()=>summary,contains:()=>true};
 const system={matches:dark,addEventListener:(name,fn)=>systemEvents[name]=fn};
 const document={documentElement:root,querySelectorAll:s=>s==='[data-theme-choice]'?buttons:s==='.theme-picker summary'?[summary]:[],querySelector:()=>null,addEventListener:(name,fn)=>documentEvents[name]=fn};
 vm.runInNewContext(source,{document,matchMedia:()=>system,window:{addEventListener:(name,fn)=>events[name]=fn},localStorage:{getItem(){if(blocked)throw Error('Unavailable');return saved},setItem(k,v){if(blocked)throw Error('Unavailable');writes.push([k,v])}}});
 documentEvents.DOMContentLoaded();
 return {root,buttons,writes,system(dark){system.matches=dark;systemEvents.change()},choose(mode){documentEvents.click({target:{closest:()=>({...buttons.find(b=>b.dataset.themeChoice===mode),closest:()=>menu})}})},storage(value){events.storage({key:'team-dashboard-theme',newValue:value})}};
}
test('system default follows OS changes without persisting a resolved override',()=>{
 const app=setup({dark:true});assert.equal(app.root.dataset.theme,'dark');app.system(false);assert.equal(app.root.dataset.theme,'light');assert.deepEqual(app.writes,[]);
});
test('explicit choice persists and stays fixed through system changes; system resumes automatic updates',()=>{
 const app=setup();app.choose('dark');assert.equal(app.root.dataset.theme,'dark');assert.deepEqual(app.writes[0],['team-dashboard-theme','dark']);app.system(false);assert.equal(app.root.dataset.theme,'dark');app.choose('system');assert.equal(app.root.dataset.theme,'light');app.system(true);assert.equal(app.root.dataset.theme,'dark');assert.equal(app.buttons[2]['aria-pressed'],'true');
});
test('saved preferences apply immediately and synchronize across tabs',()=>{
 const app=setup({saved:'dark'});assert.equal(app.root.dataset.theme,'dark');app.storage('light');assert.equal(app.root.dataset.theme,'light');app.storage(null);app.system(true);assert.equal(app.root.dataset.theme,'dark');
});
test('blocked storage and invalid stored values still allow theme switching',()=>{
 for(const options of [{blocked:true},{saved:'unexpected'}]){const app=setup(options);assert.equal(app.root.dataset.theme,'light');app.choose('dark');assert.equal(app.root.dataset.theme,'dark')}
});
