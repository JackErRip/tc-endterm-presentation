(function(){
var st=document.getElementById('stage'),sl=[].slice.call(document.querySelectorAll('.slide')),i=0,
 count=document.getElementById('count'),bar=document.getElementById('bar');
var S=1;
function fit(){S=Math.min(innerWidth/1920,innerHeight/1080);
 st.style.transform='translate('+(innerWidth-1920*S)/2+'px,'+(innerHeight-1080*S)/2+'px) scale('+S+')'}
var MORPH=!!st.animate;   // reduced-motion is deliberately not honoured: the morph is part of the talk
var EASE='cubic-bezier(.65,0,.25,1)',DUR=900,running=null;

/* ---------- morph: things two slides share (title, same picture, cards) travel into place ----------
   Ghosts are laid out ONCE at their final box and only transform/opacity animate, so no frame
   triggers layout, paint or re-raster; the compositor moves already-drawn layers. */
var SR;
function R(el){var r=el.getBoundingClientRect();return{x:(r.left-SR.left)/S,y:(r.top-SR.top)/S,w:r.width/S,h:r.height/S}}
function textR(el){var g=document.createRange();g.selectNodeContents(el);var t=g.getBoundingClientRect(),b=R(el);
 return{x:(t.left-SR.left)/S,y:b.y,w:t.width/S,h:b.h}}
function base(el){return (el.getAttribute('src')||'').split('/').pop()}
function morphable(img){return !img.classList.contains('bg')&&!img.closest('p,#foot')}
function pairs(a,b){
 var out=[],used=[];
 var ta=a.querySelector('h1,h2'),tb=b.querySelector('h1,h2');
 if(ta&&tb)out.push({kind:'text',a:ta,b:tb});
 var ia=[].slice.call(a.querySelectorAll('img')).filter(morphable),ib=[].slice.call(b.querySelectorAll('img')).filter(morphable);
 ib.forEach(function(y){for(var k=0;k<ia.length;k++){if(used.indexOf(ia[k])<0&&base(ia[k])===base(y)){used.push(ia[k]);out.push({kind:'img',a:ia[k],b:y});break}}});
 var ba=[].slice.call(a.querySelectorAll('.card,.cell')),bb=[].slice.call(b.querySelectorAll('.card,.cell'));
 for(var k=0;k<Math.min(ba.length,bb.length);k++)out.push({kind:'box',a:ba[k],b:bb[k]});
 return out}
function T(dx,dy,sx,sy){return 'translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')'}
function ghost(src,kind,r,fs){
 var g=src.cloneNode(kind!=='box');g.removeAttribute('id');g.className+=' ghost';
 var s=g.style;s.position='absolute';s.left=r.x+'px';s.top=r.y+'px';s.visibility='visible';s.opacity='';
 if(kind==='text'){s.fontSize=fs;s.whiteSpace='nowrap';s.lineHeight=getComputedStyle(src).lineHeight}
 else{s.width=r.w+'px';s.height=r.h+'px';s.maxWidth='none';s.maxHeight='none'}
 if(kind==='img'){s.objectFit=getComputedStyle(src).objectFit;s.background='transparent'}
 return g}
function hide(el,kind){
 if(kind==='box'){var o={bg:el.style.background,bc:el.style.borderColor,sh:el.style.boxShadow};el.style.background='transparent';el.style.borderColor='transparent';el.style.boxShadow='none';
  return function(){el.style.background=o.bg;el.style.borderColor=o.bc;el.style.boxShadow=o.sh}}
 var v=el.style.visibility;el.style.visibility='hidden';return function(){el.style.visibility=v}}
function finishNow(){if(running){running();running=null}}

function apply(n){sl.forEach(function(e,k){e.classList.toggle('on',k===n);if(k!==n){var v=e.querySelector('video');if(v&&!v.paused)v.pause()}});
 [].slice.call(sl[n].querySelectorAll('video.loop')).forEach(function(v){var p=v.play();if(p&&p.catch)p.catch(function(){})});
 [].slice.call(document.querySelectorAll('.slide:not(.on) video.loop')).forEach(function(v){v.pause()});
 i=n;st.classList.toggle('bare',sl[n].classList.contains('bare'));
 count.textContent=(n+1)+' / '+sl.length;bar.style.transform='scaleX('+((n+1)/sl.length)+')';
 try{history.replaceState(null,'','#'+(n+1))}catch(e){}
 clearTimeout(warmT);warmT=setTimeout(function(){warm(n+1);warm(n-1)},DUR+500)}

/* decode the neighbours' pictures while the presenter is talking, so the next transition
   does not start with an image decode (the browser may evict decodes made long ago) */
var warmT,posters={};
function warm(k){var s=sl[k];if(!s)return;
 [].slice.call(s.querySelectorAll('img')).forEach(function(im){if(im.decode)im.decode().catch(function(){})});
 var v=s.querySelector('video[poster]');if(v){var p=posters[v.poster]||(posters[v.poster]=new Image());if(!p.src)p.src=v.poster;if(p.decode)p.decode().catch(function(){})}}

function go(n){n=Math.max(0,Math.min(sl.length-1,n));finishNow();if(n===i)return;
 if(!MORPH){apply(n);return}
 var from=sl[i],to=sl[n],ps=pairs(from,to);SR=st.getBoundingClientRect();
 ps.forEach(function(p){p.ra=p.kind==='text'?textR(p.a):R(p.a);p.fa=parseFloat(getComputedStyle(p.a).fontSize)});   // measure the old slide before anything changes
 from.classList.add('out');
 apply(n);
 ps.forEach(function(p){p.rb=p.kind==='text'?textR(p.b):R(p.b);p.fb=parseFloat(getComputedStyle(p.b).fontSize)});
 var ghosts=[],restores=[],anims=[],o={duration:DUR,easing:EASE,fill:'both'},frag=document.createDocumentFragment(),under=document.createDocumentFragment();
 ps.forEach(function(p){
  var a=p.ra,b=p.rb;if(!a.w||!b.w||!a.h||!b.h)return;
  if(p.kind==='text'){   // old title travels and fades out early, new title travels and fades in late: short overlap, no smear
   var k=p.fb/p.fa,ga=ghost(p.a,'text',a,p.fa+'px'),gb=ghost(p.b,'text',b,p.fb+'px'),dx=b.x-a.x,dy=b.y-a.y;
   var at=function(t){return T(dx*t,dy*t,1+(k-1)*t,1+(k-1)*t)},          // A's ghost at progress t
       bt=function(t){var s=(1+(k-1)*t)/k;return T(-dx*(1-t),-dy*(1-t),s,s)};   // B's ghost, same spot and size
   frag.appendChild(ga);frag.appendChild(gb);ghosts.push(ga,gb);
   anims.push([ga,[{transform:at(0),opacity:1},{transform:at(.2),opacity:1,offset:.2},{transform:at(.5),opacity:0,offset:.5},{transform:at(1),opacity:0}]],
              [gb,[{transform:bt(0),opacity:0},{transform:bt(.4),opacity:0,offset:.4},{transform:bt(.75),opacity:1,offset:.75},{transform:bt(1),opacity:1}]]);
  }else{   // img (same picture) and box (card -> card): one ghost at B's final box, scaled from A's box
   var g=ghost(p.b,p.kind,b);ghosts.push(g);
   if(p.kind==='box'){g.style.zIndex='2';under.appendChild(g)}else frag.appendChild(g);   // cards travel UNDER the new slide's content, so their text can fade in on top
   anims.push([g,[{transform:T(a.x-b.x,a.y-b.y,a.w/b.w,a.h/b.h)},{transform:T(0,0,1,1)}]]);
  }
  restores.push(hide(p.a,p.kind),hide(p.b,p.kind));   // hide only after cloning, or the clone copies the hidden look
 });

 var first=[].slice.call(to.children).filter(function(c){return !c.classList.contains('bg')&&!c.classList.contains('shade')})[0];
 to.insertBefore(under,first||null);
 st.appendChild(frag);   // one DOM insert, one layout; then every animation starts in the same frame
 var run=anims.map(function(x){return x[0].animate(x[1],o)});
 run.push(from.animate([{opacity:1},{opacity:0}],{duration:480,easing:'ease-in',fill:'both'}));   // whatever did not travel dissolves
 enter(to,ps,run);
 var done=false;
 function end(){if(done)return;done=true;ghosts.forEach(function(g){g.remove()});restores.forEach(function(r){r()});
  from.classList.remove('out');run.forEach(function(a){try{a.cancel()}catch(e){}});if(running===end)running=null}
 running=end;
 Promise.all(run.map(function(a){return a.finished})).then(end,end);
 setTimeout(end,DUR+400)}

/* animated elements keep their own compositor layer after the animation, so when the staggered
   entrances finish one by one the browser does not re-raster the whole slide each time */
function pin(e){e.style.willChange='transform,opacity'}
function enter(slide,ps,run){var els=[],k=0,boxes=ps.filter(function(p){return p.kind==='box'}).map(function(p){return p.b}),
 moved=ps.filter(function(p){return p.kind!=='text'}).map(function(p){return p.b});
 function holds(c){return moved.some(function(b){return c.contains(b)})}   // c is, or contains, something that travelled
 function walk(c){if(moved.indexOf(c)>=0)return;   // travelled things land by themselves
  if(c.classList.contains('stg')||holds(c))[].slice.call(c.children).forEach(walk);else els.push(c)}
 [].slice.call(slide.children).forEach(function(c){if(c.matches('h1,h2')||c.classList.contains('shade')||c.classList.contains('ghost'))return;
  if(c.classList.contains('bg')){pin(c);run.push(c.animate([{opacity:0},{opacity:1}],{duration:700,delay:150,easing:'ease-out',fill:'backwards'}));return}
  walk(c)});
 els.forEach(function(e){pin(e);
  e.animate([{opacity:0,transform:'translateY(32px)'},{opacity:1,transform:'none'}],{duration:700,delay:380+k*70,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'});k++});
 boxes.forEach(function(b){[].slice.call(b.children).forEach(function(ch){if(holds(ch))return;pin(ch);   // a travelled box: its contents arrive once it has landed
  ch.animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'none'}],{duration:480,delay:DUR*.6,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'})})})}

addEventListener('resize',fit);
addEventListener('keydown',function(e){var k=e.key;if(e.target.tagName==='VIDEO'&&k===' ')return;
 if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();go(i+1)}
 else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();go(i-1)}
 else if(k==='Home')go(0);else if(k==='End')go(sl.length-1);
 else if(k==='f'||k==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
addEventListener('click',function(e){if(e.target.closest('video'))return;go(e.clientX<innerWidth*.25?i-1:i+1)});
fit();var h=parseInt((location.hash||'').slice(1));apply(h>0?Math.min(h-1,sl.length-1):0);
requestAnimationFrame(function(){requestAnimationFrame(function(){st.classList.add('ready')})});
})();
