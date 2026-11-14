/* Offline cache. Bump V when assets change. Pages/css/js: network first (updates arrive), assets: cache first. */
var V='tc-deck-g5';
self.addEventListener('install',function(e){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
function ranged(req,res){var m=/bytes=(\d*)-(\d*)/.exec(req.headers.get('range')||'');if(!m||res.status!==200)return Promise.resolve(res);
 return res.blob().then(function(b){var n=b.size,s=m[1]?+m[1]:0,en=m[2]?Math.min(+m[2],n-1):n-1;
  return new Response(b.slice(s,en+1),{status:206,statusText:'Partial Content',headers:{'Content-Type':res.headers.get('Content-Type')||'video/mp4','Content-Range':'bytes '+s+'-'+en+'/'+n,'Content-Length':String(en-s+1),'Accept-Ranges':'bytes'}})})}
self.addEventListener('fetch',function(e){var r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 var isAsset=/\/assets\//.test(r.url);
 if(isAsset){e.respondWith(caches.open(V).then(function(c){return c.match(r.url).then(function(hit){
   if(hit)return ranged(r,hit);
   var plain=r.headers.get('range')?new Request(r.url):r;   // always cache the whole file, never a slice
   return fetch(plain).then(function(res){if(res.status===200)c.put(r.url,res.clone());return ranged(r,res)})})}))}
 else{e.respondWith(fetch(r).then(function(res){if(res.status===200){var cp=res.clone();caches.open(V).then(function(c){c.put(r,cp)})}return res}).catch(function(){return caches.match(r).then(function(h){return h||caches.match(r,{ignoreSearch:true})})}))}});
