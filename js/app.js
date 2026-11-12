(function(){
var st=document.getElementById('stage'),sl=[].slice.call(document.querySelectorAll('.slide')),i=0,hud=document.getElementById('hud'),bar=document.getElementById('bar');
function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);st.style.transformOrigin='0 0';st.style.left='50%';st.style.top='50%';
 st.style.marginLeft=0;st.style.transform='translate(-'+960*s+'px,-'+540*s+'px) scale('+s+')'}
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
if(st.animate)document.documentElement.classList.add('mo');
var EASE='cubic-bezier(.65,0,.25,1)',DUR=950,running=null;

/* ---------- real morph: things that exist on both slides travel and resize into place ---------- */
function R(el){var r=el.getBoundingClientRect(),S=st.getBoundingClientRect(),s=S.width/1920;
 return{x:(r.left-S.left)/s,y:(r.top-S.top)/s,w:r.width/s,h:r.height/s}}
function base(el){return (el.getAttribute('src')||'').split('/').pop()}
function morphable(img){return !img.classList.contains('bg')&&!img.closest('p')}
function pairs(a,b){
 var out=[],used=[];
 var ta=a.querySelector('h1,h2'),tb=b.querySelector('h1,h2');
 if(ta&&tb)out.push({kind:'text',a:ta,b:tb});
 var ia=[].slice.call(a.querySelectorAll('img')).filter(morphable),ib=[].slice.call(b.querySelectorAll('img')).filter(morphable);
 ib.forEach(function(y){for(var k=0;k<ia.length;k++){if(used.indexOf(ia[k])<0&&base(ia[k])===base(y)){used.push(ia[k]);out.push({kind:'img',a:ia[k],b:y});break}}});
 var ba=[].slice.call(a.querySelectorAll('.card,.cell')),bb=[].slice.call(b.querySelectorAll('.card,.cell'));
 for(var k=0;k<Math.min(ba.length,bb.length);k++)out.push({kind:'box',a:ba[k],b:bb[k]});
 return out}
function px(n){return n+'px'}
function ghost(src,kind){
 var g=src.cloneNode(kind!=='box');g.removeAttribute('id');
 var cs=getComputedStyle(src);
 g.style.position='absolute';g.style.margin='0';g.style.zIndex='6';g.style.pointerEvents='none';g.style.visibility='visible';
 g.style.animation='none';g.style.boxSizing='border-box';g.style.transform='none';
 if(kind==='text'){g.style.whiteSpace='nowrap';g.style.width='auto';g.style.height='auto'}
 else{g.style.maxWidth='none';if(kind==='img')g.style.objectFit=cs.objectFit}
 return g}
function frame(r,kind,fs){var f={left:px(r.x),top:px(r.y)};if(kind!=='text'){f.width=px(r.w);f.height=px(r.h)}if(kind==='text')f.fontSize=fs;return f}
function mix(a,b,t){var o={};Object.keys(a).forEach(function(k){var x=parseFloat(a[k]),y=parseFloat(b[k]);o[k]=(x+(y-x)*t)+'px'});return o}
function finishNow(){if(running){running();running=null}}
function hide(el,kind){
 if(kind==='box'){var o={bg:el.style.background,bc:el.style.borderColor};el.style.background='transparent';el.style.borderColor='transparent';return function(){el.style.background=o.bg;el.style.borderColor=o.bc}}
 var v=el.style.visibility;el.style.visibility='hidden';return function(){el.style.visibility=v}}

function apply(n){sl.forEach(function(e,k){e.classList.toggle('on',k===n);if(k!==n){var v=e.querySelector('video');if(v)v.pause()}});
 i=n;hud.textContent=(n+1)+' / '+sl.length;bar.style.width=((n+1)/sl.length*100)+'%';try{location.hash=n+1}catch(e){}}

function go(n){n=Math.max(0,Math.min(sl.length-1,n));finishNow();if(n===i)return;
 if(!document.documentElement.classList.contains('mo')){apply(n);return}
 var from=sl[i],to=sl[n],ps=pairs(from,to);
 ps.forEach(function(p){p.ra=R(p.a);p.fa=getComputedStyle(p.a).fontSize});   // measure the old slide before anything moves
 var ghosts=[],restores=[],anims=[];
 from.classList.add('out');
 apply(n);
 ps.forEach(function(p){p.rb=R(p.b);p.fb=getComputedStyle(p.b).fontSize});
 ps.forEach(function(p){
  var same=p.kind==='img',fA=frame(p.ra,p.kind,p.fa),fB=frame(p.rb,p.kind,p.fb);
  var ga=ghost(p.a,p.kind),gb=ghost(p.b,p.kind);
  Object.keys(fA).forEach(function(k){ga.style[k]=fA[k];gb.style[k]=fA[k]});
  restores.push(hide(p.a,p.kind),hide(p.b,p.kind));
  st.appendChild(ga);if(!same)st.appendChild(gb);ghosts.push(ga,gb);
  var o={duration:DUR,easing:EASE,fill:'both'};
  if(same){
   anims.push(ga.animate([fA,fB],o));ga.src=p.b.getAttribute('src');   // one picture, A's rect to B's rect
  }else{
   var half=p.kind==='text'?mix(fA,fB,.5):mix(fA,fB,.5);if(p.kind==='text')half.fontSize=fA.fontSize;
   // the old thing travels and fades out in the second half; the new thing travels and fades in over it
   anims.push(ga.animate([Object.assign({opacity:1},fA),Object.assign({opacity:1,offset:.5},half),Object.assign({opacity:0},fB)],o));
   gb.style.opacity='0';
   anims.push(gb.animate([Object.assign({opacity:0},fA),Object.assign({opacity:1},fB)],o));
  }});
 anims.push(from.animate([{opacity:1},{opacity:0}],{duration:520,easing:'ease-in',fill:'both'}));   // everything that did not travel dissolves
 enter(to,ps.map(function(p){return p.b}),ps);
 var done=false;
 function end(){if(done)return;done=true;ghosts.forEach(function(g){g.remove()});restores.forEach(function(r){r()});
  from.classList.remove('out');anims.forEach(function(a){try{a.cancel()}catch(e){}});if(running===end)running=null}
 running=end;
 Promise.all(anims.map(function(a){return a.finished})).then(end,end);
 setTimeout(end,DUR+450)}

function enter(slide,matched,ps){var skip=/(^| )(shade)( |$)/,els=[],k=0;
 [].slice.call(slide.children).forEach(function(c){if(c.matches('h1,h2')||skip.test(c.className))return;
  if(c.classList.contains('bg')){try{c.animate([{opacity:0},{opacity:1}],{duration:800,delay:200,easing:'ease-out',fill:'backwards'})}catch(x){}return}
  if(c.classList.contains('stg'))[].slice.call(c.children).forEach(function(x){els.push(x)});else els.push(c)});
 els.forEach(function(e){
  if(matched.indexOf(e)>=0){k=k;return}   // a box that travelled: its contents are handled below
  try{e.animate([{opacity:0,transform:'translateY(34px)'},{opacity:1,transform:'none'}],{duration:800,delay:420+k*75,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'})}catch(x){}k++});
 ps.forEach(function(p){if(p.kind==='box')[].slice.call(p.b.children).forEach(function(ch){   // a travelled box: its contents arrive once it has landed
  try{ch.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}],{duration:520,delay:DUR*.62,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'})}catch(x){}})})}

addEventListener('resize',fit);
addEventListener('keydown',function(e){var k=e.key;if(e.target.tagName==='VIDEO'&&(k===' '))return;
 if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();go(i+1)}
 else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();go(i-1)}
 else if(k==='Home')go(0);else if(k==='End')go(sl.length-1);
 else if(k==='f'||k==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
addEventListener('click',function(e){if(e.target.closest('video'))return;go(e.clientX<innerWidth*.25?i-1:i+1)});
fit();var h=parseInt((location.hash||'').slice(1));apply(h>0?Math.min(h-1,sl.length-1):0);
})();
