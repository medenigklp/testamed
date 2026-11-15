/* testamed — internetsiz çalışma (service worker)
   · Uygulama sayfası: önce internetten (en güncel sürüm); internet yoksa ya da 4 sn'de gelmezse cihazdaki kopyadan.
   · PDF kütüphaneleri ve yazı tipleri: ilk açılışta cihaza kaydedilir, sonra hep cihazdan.
   · version.json ve sw.js her zaman internetten (güncelleme denetimi bozulmasın). */
const CACHE='testamed-v1';
const SHELL=new URL('./',self.registration.scope).href;
const SCOPE_PATH=new URL(SHELL).pathname;
const LIBS=[
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
const okShell=r=>!!r && r.ok && !r.redirected && (r.type==='basic' || r.type==='default');

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    try{
      const c=await caches.open(CACHE);
      try{ const r=await fetch(new Request(SHELL,{cache:'reload'})); if(okShell(r)) await c.put(SHELL,r); }catch(_){}
      await Promise.all(LIBS.map(async u=>{
        try{ if(await c.match(u,{ignoreVary:true})) return; const r=await fetch(u,{mode:'cors',credentials:'omit'}); if(r && r.ok) await c.put(u,r); }catch(_){}
      }));
    }catch(_){}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    try{ const ks=await caches.keys(); await Promise.all(ks.filter(k=>k.indexOf('testamed-')===0 && k!==CACHE).map(k=>caches.delete(k))); }catch(_){}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  let url; try{ url=new URL(req.url); }catch(_){ return; }
  if(url.origin===self.location.origin){
    if(/\/(version\.json|sw\.js)$/.test(url.pathname)) return;            // her zaman internetten
    if(url.pathname.indexOf(SCOPE_PATH)!==0) return;
    const isPage=req.mode==='navigate' || url.pathname===SCOPE_PATH || url.pathname===SCOPE_PATH+'index.html';
    if(!isPage) return;
    // tarayıcı önbelleğini her açılışta doğrula (değişmediyse 304, çok hızlı) → internet varken hep en güncel sürüm
    let upd=Promise.resolve(), fresh;
    try{ fresh=new Request(req.url,{cache:(req.cache==='reload'?'reload':'no-cache'),credentials:'same-origin',redirect:'follow'}); }catch(_){ fresh=req; }
    const net=fetch(fresh).then(r=>{
      if(okShell(r)){ const cp=r.clone(); upd=caches.open(CACHE).then(c=>c.put(SHELL,cp)).catch(()=>{}); }
      return r;
    });
    e.respondWith(page(net));
    e.waitUntil(net.then(()=>upd,()=>{}));
    return;
  }
  if(url.hostname==='cdnjs.cloudflare.com' || url.hostname==='fonts.gstatic.com'){ e.respondWith(cacheFirst(req)); return; }
  if(url.hostname==='fonts.googleapis.com'){ e.respondWith(staleWhileRevalidate(req,e)); return; }
});

async function page(net){
  let cached=null;
  try{ const c=await caches.open(CACHE); cached=await c.match(SHELL); }catch(_){}
  if(!cached) return net.catch(()=>offline());
  return new Promise(res=>{
    let done=false; const fin=r=>{ if(!done){ done=true; res(r); } };
    const tm=setTimeout(()=>fin(cached),4000);
    net.then(r=>{ clearTimeout(tm); fin(r && r.ok ? r : cached); },()=>{ clearTimeout(tm); fin(cached); });
  });
}
async function cacheFirst(req){
  let c=null;
  try{ c=await caches.open(CACHE); const m=await c.match(req.url,{ignoreVary:true}); if(m) return m; }catch(_){}
  const r=await fetch(req);
  if(c && r && (r.ok || r.type==='opaque')){ try{ await c.put(req.url,r.clone()); }catch(_){} }
  return r;
}
async function staleWhileRevalidate(req,e){
  let c=null, m=null;
  try{ c=await caches.open(CACHE); m=await c.match(req.url,{ignoreVary:true}); }catch(_){}
  const net=fetch(req).then(r=>{ if(c && r && (r.ok || r.type==='opaque')) return c.put(req.url,r.clone()).then(()=>r,()=>r); return r; });
  if(m){ e.waitUntil(net.catch(()=>{})); return m; }
  return net;
}
function offline(){
  return new Response('<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>testamed</title><body style="font:16px/1.5 -apple-system,system-ui,sans-serif;padding:28px;color:#0E1A17;background:#F5F7F2">'+
    '<h2 style="margin:0 0 8px">İnternet yok</h2><p>testamed bu cihaza henüz kaydedilmemiş. İnternete bağlanınca bir kez aç; sonra internetsiz de çalışır.</p>'+
    '<p><button onclick="location.reload()" style="font:600 16px system-ui;padding:12px 18px;border-radius:12px;border:0;background:#1E7A3C;color:#fff">Yeniden dene</button></p></body></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
}
