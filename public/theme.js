// Resolve before CSS loads to avoid flashing the wrong theme.
(() => {
 const key='team-dashboard-theme',modes=['light','dark','system'],system=matchMedia('(prefers-color-scheme: dark)');
 let preference='system';
 try{const saved=localStorage.getItem(key);if(modes.includes(saved))preference=saved}catch{}
 function apply(){
  const resolved=preference==='system'?(system.matches?'dark':'light'):preference;
  document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===preference)));
  const name={light:'Светлая',dark:'Тёмная',system:'Как в системе'}[preference];
  document.querySelectorAll('.theme-picker summary').forEach(b=>{b.title=`Тема: ${name}`;b.setAttribute('aria-label',`Выбрать тему. Сейчас: ${name}`)});
 }
 apply();system.addEventListener('change',()=>{if(preference==='system')apply()});
 window.addEventListener('storage',e=>{if(e.key===key||e.key===null){preference=modes.includes(e.newValue)?e.newValue:'system';apply()}});
 document.addEventListener('DOMContentLoaded',()=>{
  const picker=document.querySelector('.theme-picker'),auth=document.querySelector('.auth-screen');
  if(picker&&auth){const copy=picker.cloneNode(true);copy.classList.add('auth-theme-picker');auth.append(copy)}apply();
  document.addEventListener('click',e=>{
   const b=e.target.closest('[data-theme-choice]');
   if(b){preference=b.dataset.themeChoice;try{localStorage.setItem(key,preference)}catch{}apply();const menu=b.closest('details');menu.open=false;menu.querySelector('summary').focus()}
   document.querySelectorAll('.theme-picker[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false});
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.theme-picker[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus()})});
 });
})();
