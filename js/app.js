(function(){
var st=document.getElementById('stage'),sl=[].slice.call(document.querySelectorAll('.slide')),i=0,hud=document.getElementById('hud'),bar=document.getElementById('bar');
function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);st.style.transform='scale('+s+') translate(-50%,-50%)';st.style.transformOrigin='0 0';st.style.left='50%';st.style.top='50%';
 st.style.marginLeft=0;st.style.transform='translate(-'+960*s+'px,-'+540*s+'px) scale('+s+')'}
var VT=!!document.startViewTransition,named=[];
if(VT)document.documentElement.classList.add('vt-ok');
function nameOf(el,slide){ // the same key on two slides = the same thing, so it morphs
 if(el.matches('h1,h2'))return 'title';
 if(el.matches('.bg'))return 'bgimg';
 if(el.tagName==='IMG'&&el.closest('p'))return null;
 if(el.tagName==='IMG'&&el.getAttribute('src')){return 'i-'+el.getAttribute('src').replace(/[^a-z0-9]/gi,'_')}
 return null}
function tag(slide){untag();var seen={},ci=0;
 [].slice.call(slide.querySelectorAll('h1,h2,.bg')).forEach(function(el){
  var k=nameOf(el,slide);if(!k&&el.matches('.cell,.feat,.card'))k='box'+(ci++);
  if(!k||seen[k])return;seen[k]=1;el.style.viewTransitionName=k;named.push(el)})}
function untag(){named.forEach(function(e){e.style.viewTransitionName=''});named=[]}
function apply(n){sl.forEach(function(e,k){e.classList.toggle('on',k===n);if(k!==n){var v=e.querySelector('video');if(v)v.pause()}});
 i=n;hud.textContent=(n+1)+' / '+sl.length;bar.style.width=((n+1)/sl.length*100)+'%';try{location.hash=n+1}catch(e){}}
function enter(slide){var els=[],skip=/(^| )(bg|shade)( |$)/;
 [].slice.call(slide.children).forEach(function(c){if(c.matches('h1,h2')||skip.test(c.className))return;
  if(c.classList.contains('stg'))[].slice.call(c.children).forEach(function(x){els.push(x)});else els.push(c)});
 els.forEach(function(e,k){try{e.animate([{opacity:0,transform:'translateY(34px)'},{opacity:1,transform:'none'}],{duration:800,delay:260+k*75,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'})}catch(x){}})}
function go(n){n=Math.max(0,Math.min(sl.length-1,n));if(n===i&&sl[i].classList.contains('on'))return;
 if(!VT||!sl[i].classList.contains('on')){apply(n);return}
 document.documentElement.setAttribute('data-dir',n>i?'f':'b');tag(sl[i]);var t;try{t=document.startViewTransition(function(){untag();apply(n);tag(sl[n]);enter(sl[n])})}catch(e){untag();apply(n);return}
 t.finished.then(untag,untag)}
addEventListener('resize',fit);
addEventListener('keydown',function(e){var k=e.key;if(e.target.tagName==='VIDEO'&&(k===' '))return;
 if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'){e.preventDefault();go(i+1)}
 else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'){e.preventDefault();go(i-1)}
 else if(k==='Home')go(0);else if(k==='End')go(sl.length-1);
 else if(k==='f'||k==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
addEventListener('click',function(e){if(e.target.closest('video'))return;go(e.clientX<innerWidth*.25?i-1:i+1)});
fit();var h=parseInt((location.hash||'').slice(1));apply(h>0?Math.min(h-1,sl.length-1):0);
})();
