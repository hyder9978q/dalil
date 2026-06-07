const CACHE='dalil-v16';
const TILES='dalil-tiles';
const ASSETS=['./','./index.html','./app.js','./manifest.json','./style.json','./style.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE&&x!==TILES).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  // الميزة 4: تخزين بلاطات الخريطة للعمل بدون انترنت
  if(u.includes('tile.openstreetmap.org') || u.includes('basemaps.cartocdn.com') || u.includes('tiles.openfreemap.org')){
    e.respondWith(caches.open(TILES).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(res=>{c.put(e.request,res.clone());return res}).catch(()=>r))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
