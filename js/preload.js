/* Loading screen: fetch + decode everything, warm every slide once, then wait for a key/click (which also lets the clips autoplay). */
(function(){
var L=document.getElementById('loader'),fill=document.getElementById('lfill'),pct=document.getElementById('lpct'),msg=document.getElementById('lmsg');
if(!L)return;
if(/[?&]skip/.test(location.search)){L.parentNode.removeChild(L);return}   // ?skip = no loading screen (for testing)
var ready=false;
function open(){ready=true;msg.textContent='READY';L.classList.add('ready')}
addEventListener('keydown',function(e){
 if(e.ctrlKey||e.metaKey||e.altKey||e.key==='F5'||e.key==='F11'||e.key==='F12')return;
 if(!L.parentNode)return;
 e.stopImmediatePropagation();e.preventDefault();if(ready)begin()},true);
addEventListener('click',function(e){
 if(!L.parentNode)return;
 e.stopImmediatePropagation();e.preventDefault();if(ready)begin()},true);
function begin(){L.classList.add('go');setTimeout(function(){if(L.parentNode)L.parentNode.removeChild(L)},700);
 [].forEach.call(document.querySelectorAll('.slide.on video.loop'),function(v){var p=v.play();if(p&&p.catch)p.catch(function(){})})}

var urls=[],seen={};
function add(u){if(!u)return;var a=document.createElement('a');a.href=u;u=a.href;if(!seen[u]){seen[u]=1;urls.push(u)}}
[].forEach.call(document.querySelectorAll('img[src]'),function(i){add(i.getAttribute('src'))});
[].forEach.call(document.querySelectorAll('video'),function(v){if(v.getAttribute('poster'))add(v.getAttribute('poster'));if(v.classList.contains('loop')&&v.getAttribute('src'))add(v.getAttribute('src'))});
add('assets/fonts/m5x7.ttf');
var trailer=window.__trailerSrc?window.__trailerSrc():null;   // the quality this browser will play; cached before the screen opens
if(trailer)add(trailer);   // cache the trailer before the screen opens
var done=0,total=urls.length+2;
function tick(){done++;var p=Math.min(100,Math.round(done/total*100));fill.style.transform='scaleX('+p/100+')';pct.textContent=p+'%'}
function load(u){return fetch(u).then(function(r){return r.blob()}).then(function(b){if(/\.(png|gif|jpg|jpeg)(\?|$)/i.test(u)&&window.createImageBitmap){return createImageBitmap(b).catch(function(){})}}).catch(function(){}).then(tick)}

function warm(){   // show every slide once behind the loader so images are decoded and layers are painted
 var sl=[].slice.call(document.querySelectorAll('.slide')),was=sl.map(function(s){return s.classList.contains('on')});
 sl.forEach(function(s){s.classList.add('on')});
 var imgs=[].slice.call(document.querySelectorAll('.slide img')).map(function(i){return i.decode?i.decode().catch(function(){}):0});
 return Promise.all(imgs).then(function(){return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})}).then(function(){
  sl.forEach(function(s,k){if(!was[k])s.classList.remove('on')});tick()})}
function loops(){   // buffer the gameplay clips
 var vs=[].slice.call(document.querySelectorAll('video.loop'));
 return Promise.all(vs.map(function(v){return new Promise(function(r){if(v.readyState>=3)return r();v.addEventListener('canplay',r,{once:true});v.load();setTimeout(r,6000)})})).then(tick)}

function reg(){if(!('serviceWorker' in navigator)||location.protocol.indexOf('http')!==0)return Promise.resolve();
 return navigator.serviceWorker.register('sw.js').then(function(){return navigator.serviceWorker.ready}).then(function(){
  return new Promise(function(r){if(navigator.serviceWorker.controller)return r();navigator.serviceWorker.addEventListener('controllerchange',r,{once:true});setTimeout(r,1500)})}).catch(function(){})}

reg().then(function(){
 return Promise.all(urls.map(load)).then(loops).then(warm)
}).then(function(){
 open();
});
setTimeout(function(){if(!ready)open()},90000);   // never trap the presenter on a slow network
})();
