(function(){
var m=document.getElementById('qrm'),link=document.getElementById('repo');if(!m||!link)return;
var URL_=link.href;
function open_(){m.classList.add('on');document.getElementById('qx').focus()}
function close_(){m.classList.remove('on');link.blur()}
window.__qrOpen=function(){return m.classList.contains('on')};
link.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();open_()});
m.addEventListener('click',function(e){e.stopPropagation();if(e.target===m)close_()});
document.getElementById('qx').addEventListener('click',function(e){e.stopPropagation();close_()});
addEventListener('keydown',function(e){if(e.key==='Escape'&&m.classList.contains('on')){e.preventDefault();close_()}},true);
var cb=document.getElementById('qcopy');
cb.addEventListener('click',function(e){e.stopPropagation();
 function ok(){cb.textContent='Copied!';setTimeout(function(){cb.textContent='Copy link'},1600)}
 function fb(){var t=document.createElement('textarea');t.value=URL_;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy');ok()}catch(x){}t.remove()}
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(URL_).then(ok,fb);else fb()});
var sb=document.getElementById('qshare');
if(navigator.share)sb.addEventListener('click',function(e){e.stopPropagation();navigator.share({title:'Tyrone Clinton builds',url:URL_}).catch(function(){})});
else sb.style.display='none';
document.getElementById('qopen').addEventListener('click',function(e){e.stopPropagation()});
})();
