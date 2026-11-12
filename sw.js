/* يحفظ صفحات النظام على الهاتف لتفتح حتى عند انقطاع الإنترنت */
const C='dalil-track-v1';
const SHELL=['/driver.html','/scan.js','/config.js','/'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin===location.origin){
    // الشبكة أولاً حتى تصل التحديثات، والنسخة المحفوظة عند الانقطاع
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})
      .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(u.pathname.startsWith('/driver')?caches.match('/driver.html'):(u.pathname==='/'||u.pathname==='/index.html')?caches.match('/'):Response.error()))));
  }else if(u.host==='unpkg.com'){
    // مكتبات ثابتة الإصدار: من الذاكرة أولاً
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})));
  }
});
