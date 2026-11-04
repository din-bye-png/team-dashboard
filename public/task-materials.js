// Shared task context and material helpers. No task data is stored in the bundle.
export const MAX_FILE_SIZE=20*1024*1024;
export function safeMaterialUrl(value){
  try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}
}
export function materialKind(item){
  if(item.url){
    const host=new URL(safeMaterialUrl(item.url)||'https://invalid.local').hostname;
    if(host==='figma.com'||host.endsWith('.figma.com'))return 'figma';
    if(host==='docs.google.com')return 'document';
    if(host==='drive.google.com')return 'folder';
  }
  const ext=(item.name||item.url?.split(/[?#]/)[0]||'').split('.').pop().toLowerCase();
  if(ext==='pdf'||item.type==='application/pdf')return 'pdf';
  if(['png','jpg','jpeg','gif','webp','svg','avif','heic'].includes(ext)||item.type?.startsWith('image/'))return 'image';
  if(['doc','docx','txt','rtf','odt'].includes(ext))return 'document';
  if(['xls','xlsx','csv','ods'].includes(ext))return 'spreadsheet';
  if(['zip','rar','7z','gz'].includes(ext))return 'archive';
  return item.url?'link':'file';
}
const paths={
  document:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4M10 12h5M10 16h5"/>',
  pdf:'<path d="M6 2h9l4 4v16H6z"/><path d="M15 2v5h4"/><text x="12.5" y="17" text-anchor="middle" stroke="none" fill="currentColor" font-size="6" font-weight="700">PDF</text>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 6-6 4 4 3-3 4 4"/>',
  archive:'<path d="M6 2h9l4 4v16H6zM15 2v5h4M11 3v2m0 2v2m0 2v2m0 2v3h3v-3z"/>',
  spreadsheet:'<path d="M6 2h9l4 4v16H6zM15 2v5h4"/><path d="M9 11h7v8H9zM9 15h7M12.5 11v8"/>',
  folder:'<path d="M3 7V5h7l2 3h9v12H3z"/>',
  link:'<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 0)"/>',
  file:'<path d="M6 2h9l4 4v16H6zM15 2v5h4"/>',
  figma:'<path fill="#f24e1e" d="M8 2a4 4 0 0 0 0 8h4V2z"/><path fill="#ff7262" d="M12 2h4a4 4 0 0 1 0 8h-4z"/><path fill="#a259ff" d="M8 10a4 4 0 0 0 0 8h4v-8z"/><circle fill="#1abcfe" cx="16" cy="14" r="4"/><path fill="#0acf83" d="M8 18a4 4 0 1 0 4 4v-4z"/>'
};
export function materialIcon(item){const kind=materialKind(item);return `<span class="material-icon icon-${kind}" aria-hidden="true"><svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${kind==='figma'?'style="stroke:none"':''}>${paths[kind]}</svg></span>`}
export function validMaterials(t){
  return (t.context===undefined||(typeof t.context==='string'&&t.context.length<=20000))
    && (t.links===undefined||(Array.isArray(t.links)&&t.links.length<=30&&t.links.every(l=>l&&typeof l.title==='string'&&l.title.length<=200&&typeof l.url==='string'&&l.url.length<=2000&&safeMaterialUrl(l.url))))
    && (t.attachments===undefined||(Array.isArray(t.attachments)&&t.attachments.length<=20&&t.attachments.every(a=>a&&typeof a.name==='string'&&a.name.length>0&&a.name.length<=255&&typeof a.path==='string'&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(a.path)&&typeof a.type==='string'&&a.type.length<=200&&Number.isInteger(a.size)&&a.size>=0&&a.size<=MAX_FILE_SIZE)));
}
