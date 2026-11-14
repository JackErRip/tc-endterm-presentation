/* Trailer quality: 4K60 / 1080p60 (both H.265) with a 1080p60 H.264 fallback. Picks the best this browser plays; buttons + Q switch it. */
(function(){
var v=document.getElementById('trailer');if(!v)return;
var VER='?v=h';
var Q=[
 {k:'4k',label:'4K 60',src:'assets/video/trailer_4k60.mp4'+VER,type:'video/mp4; codecs="hvc1"'},
 {k:'hd',label:'1080p 60',src:'assets/video/trailer_1080p60_hevc.mp4'+VER,type:'video/mp4; codecs="hvc1"'},
 {k:'avc',label:'1080p 60 H.264',src:'assets/video/trailer_1080p60.mp4'+VER,type:'video/mp4'}
];
var probe=document.createElement('video');
Q=Q.filter(function(q){return probe.canPlayType(q.type)});
if(!Q.length)return;
var cur=null;
function stored(){try{return localStorage.getItem('tcq')}catch(e){return null}}
function save(k){try{localStorage.setItem('tcq',k)}catch(e){}}
function auto(){var big=Math.max(screen.width,screen.height)*(window.devicePixelRatio||1)>=3000;
 var want=big?'4k':'hd';for(var i=0;i<Q.length;i++)if(Q[i].k===want)return Q[i];return Q[0]}
function find(k){for(var i=0;i<Q.length;i++)if(Q[i].k===k)return Q[i]}
cur=find(stored())||auto();
function set(q,keep){var t=keep?v.currentTime:0,was=!v.paused;cur=q;save(q.k);
 v.src=q.src;v.load();
 if(keep&&t){v.addEventListener('loadedmetadata',function f(){v.currentTime=t;if(was)v.play().catch(function(){});v.removeEventListener('loadedmetadata',f)})}
 mark();fetch(q.src).catch(function(){})}
var bar=document.createElement('div');bar.className='tq';
var btns=Q.map(function(q){var b=document.createElement('button');b.textContent=q.label;b.onclick=function(e){e.stopPropagation();set(q,true)};bar.appendChild(b);return b});
function mark(){btns.forEach(function(b,i){b.className=Q[i]===cur?'on':''})}
v.parentNode.parentNode.appendChild(bar);
v.src=cur.src;mark();
addEventListener('keydown',function(e){if(e.key!=='q'&&e.key!=='Q')return;if(!v.closest('.slide.on'))return;set(Q[(Q.indexOf(cur)+1)%Q.length],true)});
window.__trailerSrc=function(){return cur.src};
})();
