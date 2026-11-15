/* Phone remote, laptop side. P or the phone button opens the pairing popup.
   Transport: ntfy.sh relays the pairing (hello/offer/answer); commands and state then go over a direct
   WebRTC DataChannel. The relay stays as the fallback when the direct link cannot form. */
(function(){
var T=window.TCR,SS='tcRemoteCode',QRLIB='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
if(!T)return;
var code=null,rel=null,relUp=false,cur=null,started=false,stT=null,tickT=null,pop=null,btn=null,qrReady=null,popOpen=false;
var prevOpen=window.__qrOpen;
window.__qrOpen=function(){return popOpen||(prevOpen?prevOpen():false)};   // while a popup is open the deck keys stay quiet

/* ---------- what the phone sees ---------- */
function stateMsg(withClock){
 var d=window.__deck,i=d?d.at():0,sl=document.querySelectorAll('.slide')[i],n=window.__notes?window.__notes(i):{},
  c=document.getElementById('count'),h=sl&&sl.querySelector('h1,h2');
 var m={t:'state',i:i,c:c?c.textContent:(i+1)+'',title:n.h||(h?h.textContent.replace(/^\d+/,''):'Slide '+(i+1)),notes:n.s||''};
 if(withClock&&window.__tinfo){var x=window.__tinfo();m.clock=x.clock;m.pace=x.pace;m.late=x.late;m.lim=x.lim;m.limMin=x.limMin}
 return m}
function directOpen(p){return !!(p&&p.dc&&p.dc.readyState==='open')}
function phoneUp(){return !!(cur&&(directOpen(cur)||Date.now()-cur.seen<75000))}
function send(m,p){p=p||cur;if(!p)return;
 if(directOpen(p)){try{p.dc.send(JSON.stringify(m));return}catch(e){}}
 if(rel&&m.t!=='offer')rel.post(m)}
function sendState(withClock){if(cur&&phoneUp())send(stateMsg(withClock))}
function schedState(){clearTimeout(stT);stT=setTimeout(sendState,120)}   // one message per slide change, even on a fast double tap

/* ---------- commands: the same functions the keyboard uses ---------- */
function cmd(a){var d=window.__deck;if(!d)return;
 if(a==='next')d.go(d.at()+1);
 else if(a==='prev')d.go(d.at()-1);
 else if(a==='first')d.go(0);
 else if(a==='last')d.go(d.len-1);
 else if(a==='notes')window.dispatchEvent(new KeyboardEvent('keydown',{key:'n'}));
 else if(a==='timer')sendState(true);
 else if(a==='timeup'){if(window.__setLimit)window.__setLimit(1);sendState(true)}
 else if(a==='timedown'){if(window.__setLimit)window.__setLimit(-1);sendState(true)}
 else if(a==='sync')sendState()}
function handle(m,p){
 if(!m||!m.t)return;
 if(p){p.seen=Date.now()}
 if(m.t==='cmd'){if(!p&&cur&&m.id&&m.id!==cur.id)return;
  if(!p){if(!cur&&m.id){cur={id:m.id,seen:Date.now(),hello:0};ui()}else if(cur)cur.seen=Date.now()}
  cmd(m.a);ui()}
 else if(m.t==='bye'){if(!cur||(m.id&&m.id!==cur.id))return;dropPeer(false)}}

/* ---------- pairing ---------- */
function closePc(p){if(!p)return;try{p.dc&&p.dc.close()}catch(e){}try{p.pc&&p.pc.close()}catch(e){}p.dc=null;p.pc=null}
function dropPeer(sayBye){if(cur&&sayBye)send({t:'bye'});closePc(cur);cur=null;ui()}
function offerTo(id){
 closePc(cur);
 var p=cur={id:id,pc:null,dc:null,hello:Date.now(),seen:Date.now()};
 ui();
 if(!window.RTCPeerConnection)return;
 try{
  var pc=p.pc=new RTCPeerConnection({iceServers:T.ice}),dc=p.dc=pc.createDataChannel('tc');
  dc.onopen=function(){if(cur!==p)return;p.seen=Date.now();ui();sendState()};
  dc.onclose=function(){if(cur===p)ui()};
  dc.onmessage=function(e){try{handle(JSON.parse(e.data),p)}catch(x){}};
  pc.onconnectionstatechange=function(){if(cur===p)ui()};
  pc.createOffer().then(function(o){return pc.setLocalDescription(o)}).then(function(){return T.gather(pc,2500)}).then(function(){
   if(cur!==p||!pc.localDescription)return;
   rel&&rel.post({t:'offer',to:id,sdp:T.trim(pc.localDescription.sdp)})}).catch(function(){})
 }catch(e){}}
function onRelay(m){
 if(m.t==='hello'&&m.id){
  if(cur&&cur.id===m.id&&Date.now()-cur.hello<8000)return;   // the phone repeats hello every 10 s until it hears from us
  offerTo(m.id);
  sendState();
 }
 else if(m.t==='answer'){if(cur&&cur.id===m.id&&cur.pc&&cur.pc.signalingState==='have-local-offer')cur.pc.setRemoteDescription({type:'answer',sdp:m.sdp}).catch(function(){}) }
 else if(m.t==='cmd'||m.t==='bye')handle(m,null)}

/* ---------- session ---------- */
function getCode(){try{return sessionStorage.getItem(SS)}catch(e){return null}}
function setCode(c){try{if(c)sessionStorage.setItem(SS,c);else sessionStorage.removeItem(SS)}catch(e){}}
function begin(){
 if(started)return;started=true;
 if(!code){code=T.clean(getCode());if(code.length!==6){code=T.code();setCode(code)}}
 rel=T.open(code,onRelay,function(up){relUp=up;ui()});
 tickT=setInterval(ui,5000);ui()}
function end(){   // closes the connection but remembers the code
 if(cur)send({t:'bye'});
 closePc(cur);cur=null;if(rel)rel.close();rel=null;relUp=false;started=false;clearInterval(tickT);ui()}
function newCode(){
 if(cur)send({t:'bye'});
 closePc(cur);cur=null;if(rel)rel.close();rel=null;relUp=false;started=false;clearInterval(tickT);
 setCode(null);code=null;begin();paintCode()}

/* ---------- popup ---------- */
function linkFor(c){return new URL('remote?c='+c,location.href).href}
function shortLink(){var u=new URL('remote',location.href);return u.host+u.pathname}
function loadQR(){return qrReady||(qrReady=new Promise(function(res,rej){
 if(window.qrcode)return res();
 var s=document.createElement('script');s.src=QRLIB;s.onload=res;s.onerror=function(){qrReady=null;rej()};document.head.appendChild(s)}))}
function paintCode(){
 if(!pop)return;
 pop.querySelector('.rcode').textContent=code?code.split('').join(' '):'------';
 pop.querySelector('.rlink').textContent=shortLink();
 var img=pop.querySelector('img'),note=pop.querySelector('.rnote');img.style.visibility='hidden';
 note.textContent=location.protocol==='file:'?'Open the deck from its web address to use the remote.':'';
 if(!code)return;
 var c=code;loadQR().then(function(){if(c!==code)return;var q=window.qrcode(0,'M');q.addData(linkFor(c));q.make();img.src=q.createDataURL(8,2);img.style.visibility='visible'},
  function(){note.textContent='QR library could not load: type the code on the remote page instead.'})}
function ui(){
 var up=phoneUp(),direct=directOpen(cur),t;
 if(!started)t='Remote is off';
 else if(!relUp&&!direct)t='Connecting to relay...';
 else if(!cur)t='Waiting for the phone...';
 else if(!up)t='Phone not responding';
 else t='Phone connected  ·  '+(direct?'direct ✓':'relay');
 if(pop)pop.querySelector('.rstat').textContent=t;
 if(btn){btn.classList.toggle('live',started&&up);btn.title='Phone remote (P)'+(started&&up?' - connected':'')}}
function build(){
 if(pop)return;
 btn=document.createElement('button');btn.id='rbtn';btn.type='button';btn.textContent='📱';btn.title='Phone remote (P)';
 btn.addEventListener('click',function(e){e.stopPropagation();toggle()});document.body.appendChild(btn);
 pop=document.createElement('div');pop.id='rmt';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Phone remote');
 pop.innerHTML='<div class="qbox"><button class="rx" type="button" aria-label="Close">&times;</button><h3>Phone remote</h3>'+
  '<img alt="QR code for the remote page"><div class="rcode"></div><div class="rlink"></div><div class="rnote"></div><div class="rstat"></div>'+
  '<div class="qbtns"><button type="button" class="rnew">New code</button><button type="button" class="rstop">Stop remote</button></div></div>';
 document.body.appendChild(pop);
 pop.addEventListener('click',function(e){e.stopPropagation();if(e.target===pop)close()});
 pop.querySelector('.rx').addEventListener('click',function(e){e.stopPropagation();close()});
 pop.querySelector('.rnew').addEventListener('click',function(e){e.stopPropagation();newCode()});
 pop.querySelector('.rstop').addEventListener('click',function(e){e.stopPropagation();end();close()});
}
function open_(){build();begin();paintCode();ui();popOpen=true;pop.classList.add('on');pop.querySelector('.rx').focus()}
function close(){popOpen=false;if(pop)pop.classList.remove('on');if(btn)btn.blur()}
function toggle(){popOpen?close():open_()}

addEventListener('keydown',function(e){
 if(e.key==='Escape'&&popOpen){e.preventDefault();close();return}
 if((e.key==='p'||e.key==='P')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/INPUT|TEXTAREA/.test((e.target||{}).tagName||'')){
  if(prevOpen&&prevOpen()&&!popOpen)return;   // the QR-of-the-game popup is open
  e.preventDefault();toggle()}},true);

/* a slide change on the laptop, from the keyboard, a click or the phone, all arrive here */
var prev=window.__slide;
window.__slide=function(n){if(prev)prev(n);if(started)schedState()};
window.addEventListener('pagehide',function(){if(cur&&started)send({t:'bye'})});
window.addEventListener('DOMContentLoaded',build);
if(document.readyState!=='loading')build();
})();
