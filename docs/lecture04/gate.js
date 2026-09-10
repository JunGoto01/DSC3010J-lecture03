const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const utf8=new TextEncoder(),text=new TextDecoder();
const entry=new URL('./',location.href),storage='l04-entry-v1:'+entry.pathname;
const pack=await fetch(new URL('lesson.enc.json',entry)).then(r=>{if(!r.ok)throw Error('教材を取得できません。');return r.json();});
const mime=name=>({js:'text/javascript',css:'text/css',html:'text/html',json:'application/json',csv:'text/csv',png:'image/png',zip:'application/zip',R:'text/plain',md:'text/plain'}[name.split('.').pop()]||'application/octet-stream');
async function unlock(keyBytes,token){
  const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['decrypt']);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(pack.iv)},key,decode(pack.data));
  const files=JSON.parse(text.decode(raw)),assets={};
  for(const [name,data]of Object.entries(files))if(!name.endsWith('.html'))assets[name]=URL.createObjectURL(new Blob([decode(data)],{type:mime(name)}));
  const page=new URL(location.href).searchParams.get('page')||'index.html';
  if(!Object.hasOwn(files,page)||!page.endsWith('.html'))throw Error('ページが見つかりません。');
  const doc=new DOMParser().parseFromString(text.decode(decode(files[page])),'text/html');
  const pageUrl=new URL(page,entry);
  const resolve=value=>{
    if(!value||value.startsWith('#'))return value;
    const u=new URL(value,pageUrl);if(u.origin!==entry.origin||!u.pathname.startsWith(entry.pathname))return value;
    const name=decodeURIComponent(u.pathname.slice(entry.pathname.length));
    if(name.endsWith('.html')&&Object.hasOwn(files,name)){const dest=new URL(entry);dest.searchParams.set('page',name);dest.hash=u.hash;return dest.href;}
    return assets[name]||value;
  };
  for(const el of doc.querySelectorAll('[href],[src]')){
    if(el.hasAttribute('download')&&!el.getAttribute('download'))el.setAttribute('download',el.getAttribute('href').split('/').pop());
    for(const attr of ['href','src'])if(el.hasAttribute(attr))el.setAttribute(attr,resolve(el.getAttribute(attr)));
  }
  const bootstrap=doc.createElement('script');bootstrap.textContent='window.COURSE_ASSETS='+JSON.stringify(assets)+';window.COURSE_ACCESS_TOKEN='+JSON.stringify(token)+';window.COURSE_ENTRY='+JSON.stringify(entry.href)+';';doc.head.prepend(bootstrap);
  const logout=doc.createElement('button');logout.textContent='退室';logout.style.cssText='position:fixed;bottom:12px;right:12px;z-index:10000;padding:8px 16px;background:white;border:1px solid #147c78;border-radius:6px;color:#147c78;cursor:pointer';logout.setAttribute('onclick',`sessionStorage.removeItem(${JSON.stringify(storage)});location.href=${JSON.stringify(entry.href)}`);doc.body.append(logout);
  // Store a derived decryption key only in this tab, for twelve hours; never the password.
  try{sessionStorage.setItem(storage,JSON.stringify({key:encode(keyBytes),token,expires:Date.now()+12*60*60*1000,salt:pack.salt}));}catch{}
  document.open();document.write('<!doctype html>'+doc.documentElement.outerHTML);document.close();
}
document.querySelector('#login').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button'),message=document.querySelector('#message');button.disabled=true;message.textContent='教材を開いています…';
  try{
    const password=document.querySelector('#password').value;
    const material=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:decode(pack.salt),iterations:pack.iterations,hash:'SHA-256'},material,256);
    const token=[...new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode('lecture04:'+password)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    await unlock(new Uint8Array(bits),token);
  }catch{message.textContent='パスワードを確認してください。読み込めない場合は教員にお知らせください。';button.disabled=false;}
};
try{const saved=JSON.parse(sessionStorage.getItem(storage)||'null');if(saved&&saved.expires>Date.now()&&saved.salt===pack.salt)await unlock(decode(saved.key),saved.token);else sessionStorage.removeItem(storage);}catch{sessionStorage.removeItem(storage);}
