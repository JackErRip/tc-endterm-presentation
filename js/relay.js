/* Shared by the deck (js/remote.js) and the phone page (remote.html): ntfy.sh relay + WebRTC helpers. */
(function(){
var A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0 O 1 I L
var T={
 prefix:'tcdeck-remote',
 ice:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}],
 base:function(){try{return localStorage.getItem('tcRelay')||'https://ntfy.sh'}catch(e){return 'https://ntfy.sh'}},   // tcRelay only exists so tests can point at a local relay
 code:function(){var a=new Uint32Array(6),s='';crypto.getRandomValues(a);for(var k=0;k<6;k++)s+=A[a[k]%A.length];return s},
 clean:function(c){var o='';c=(c||'').toUpperCase();for(var k=0;k<c.length&&o.length<6;k++)if(A.indexOf(c[k])>=0)o+=c[k];return o},
 id:function(){var a=new Uint8Array(5),s='';crypto.getRandomValues(a);for(var k=0;k<5;k++)s+=('0'+a[k].toString(16)).slice(-2);return s},
 /* wait for ICE gathering to finish, but never longer than ms */
 gather:function(pc,ms){return new Promise(function(res){
  if(pc.iceGatheringState==='complete')return res();
  var done=false;function fin(){if(done)return;done=true;pc.removeEventListener('icegatheringstatechange',chk);res()}
  function chk(){if(pc.iceGatheringState==='complete')fin()}
  pc.addEventListener('icegatheringstatechange',chk);setTimeout(fin,ms||2500)})},
 /* ntfy caps a message at 4096 bytes: if the SDP is too big, keep the server-reflexive candidates and a few host ones */
 trim:function(sdp){if(sdp.length<3400)return sdp;var host=0;
  return sdp.split('\r\n').filter(function(l){if(l.indexOf('a=candidate')!==0)return true;if(l.indexOf(' typ host')>0)return ++host<=4;return true}).join('\r\n')},
 /* subscribe to <base>/<prefix>-<code>/sse; post(obj) publishes obj as the message text */
 open:function(code,onmsg,onstat){
  var url=T.base()+'/'+T.prefix+'-'+code,es=null,closed=false,up=false,retry=null;
  function start(){if(closed)return;
   try{es=new EventSource(url+'/sse')}catch(e){return}
   es.onopen=function(){up=true;onstat&&onstat(true)};
   es.onerror=function(){if(up){up=false;onstat&&onstat(false)}
    if(es&&es.readyState===2){clearTimeout(retry);retry=setTimeout(start,3000)}};   // EventSource retries by itself unless the server answered with an error
   es.addEventListener('message',function(ev){try{var d=JSON.parse(ev.data);if(d.event&&d.event!=='message')return;var m=JSON.parse(d.message);if(m&&m.t)onmsg(m)}catch(x){}})}
  start();
  return{
   post:function(o){if(closed)return Promise.resolve();return fetch(url,{method:'POST',body:JSON.stringify(o)}).catch(function(){})},
   close:function(){closed=true;clearTimeout(retry);if(es)es.close();es=null}}}
};
window.TCR=T;
})();
