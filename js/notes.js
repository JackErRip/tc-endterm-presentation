/* Speaker notes. S = speaker window (notes, next slide, timer), N = notes on this screen. Budget: 10:00 */
(function(){
var N=[
{t:20,h:'Title',s:"Hi, we're Special Forces of 3: Aldrien, Kurt and Zenon. Our game is Tyrone Clinton: Wants to Go Home, a souls-like about a guy who did not sign up for any of this and just wants to go home."},
{t:45,h:'The Game',s:"Three pillars: tough bosses, three lands, and a world that doesn't hold your hand. Dark fantasy, but played for laughs, because Tyrone insults everyone and doesn't care. Let the three loops play while you talk."},
{t:50,h:'Character & Animation',s:"Tyrone is a 48 by 48 pixel sprite with five facing directions. Idle is 12 frames at 6 fps. Run is 8 frames at 16. Attack is 5 to 6 frames at 11 to 12 fps. Death is 8 frames at 10. Dodge and hurt are bonus animations at 13 and 14 fps. Zenon made the hit sparks, blood and parry sparks in the corner, and every hit also gets a tiny pause so it feels heavy."},
{t:35,h:'Bosses',s:"Every land ends with a boss that has its own attacks and its own personality. Tekitou Teru is the forgettable one, and he knows it. Art by Kurt."},
{t:30,h:'On the Road',s:"Between every boss the road is not empty: husks, brutes and slimes. Let the clips play."},
{t:55,h:'Boss Fight: Godskin Hunchback',s:"Play the clip. Watch his wind-up before he swings, then dodge or parry and hit back. Every hit has a spark and a tiny pause, which is why it feels heavy."},
{t:30,h:'Tilesets',s:"The tiles are 16 by 16 and the game resolution is 480 by 270. Five sets: plains, desert, mountains, catacombs and the castle, which has five themes. Kurt drew the trees, bushes and flowers in the strip at the bottom."},
{t:30,h:'Across the Land',s:"Plains, desert, mountains, then Johnny's castle. One road home, and a boss at every gate."},
{t:15,h:'Inside the Keep',s:"The castle is crimson and gold with sunlit windows. Every hall ends at Johnny's door. CUT THIS ONE if you are running late."},
{t:50,h:'No Invisible Walls',s:"Most games stop you at the map edge with an invisible wall. We hated that. Here you can walk into the lake, the quicksand or off the cliff. The edge never stops you, it just kills you. Play the three clips."},
{t:40,h:'Level Mock-up: The Castle',s:"This is our animated level mock-up. Fire grates burn on a timer. Statues come alive when you pass. And behind one fake wall there is a secret room."},
{t:30,h:'Meet Mort',s:"Mort is the horse. Whistle and he comes, and you ride him across the land."},
{t:150,h:'Trailer',s:"Press play and say nothing. If you are behind, press Space after about a minute to skip to the end."},
{t:20,h:'Thank You',s:"Thank you. Aldrien led and directed. Kurt did the trees, plants and Tekitou Teru. Zenon did the hit sparks and blood FX. Questions? Short answers: made in Godot 4. Hard but fair, with a funny tone. Next: Android and Steam, then co-op."}
];
var cur=0,t0=0,pop=null,ov=null;
function mmss(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+('0'+s%60).slice(-2)}
function budgetAt(n){var s=0;for(var k=0;k<n;k++)s+=N[k].t;return s}
function html(){var a=N[cur]||{},b=N[cur+1];
 var el=t0?(Date.now()-t0)/1000:0,tgt=budgetAt(cur);
 var d=t0?Math.round(el-tgt):0,late=d>0;
 return {n:(cur+1)+' / '+N.length,h:a.h||'',s:a.s||'',t:mmss(a.t||0),next:b?('Next: '+b.h):'Last slide',
  clock:mmss(el),pace:t0?(late?mmss(d)+' behind':mmss(-d)+' ahead'):'starts on slide 2',late:late}}
function paint(doc){var q=function(i){return doc.getElementById(i)},x=html();
 q('n').textContent=x.n;q('h').textContent=x.h;q('s').textContent=x.s;q('t').textContent='about '+x.t;
 q('x').textContent=x.next;q('c').textContent=x.clock;q('p').textContent=x.pace;q('p').style.color=x.late?'#ff8a8a':'#8fe39a'}
var CSS='body{margin:0;background:#120b1e;color:#f3e9d2;font:22px/1.5 Georgia,serif;padding:24px}#n,#x{color:#9a8fb3;font-size:16px}#h{color:#e8b84a;font-size:30px;margin:6px 0}#s{font-size:30px;line-height:1.45;margin:18px 0}#t{color:#9a8fb3;font-size:16px}#c{font-size:54px;color:#e8b84a;font-family:monospace}#p{font-size:20px;font-family:monospace}';
var BODY='<div id=n></div><div id=h></div><div id=t></div><div id=s></div><div id=x></div><hr><span id=c></span> <span id=p></span>';
function ensureOv(){if(ov)return ov;ov=document.createElement('div');
 ov.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99999;display:none;box-sizing:border-box;padding:18px 32px;background:rgba(10,6,20,.94);border-top:2px solid #e8b84a';
 ov.innerHTML='<style>#ov *{all:revert}</style>'+'<div id=ovb></div>';ov.id='ov';document.body.appendChild(ov);return ov}
function paintOv(){if(!ov||ov.style.display==='none')return;var x=html();
 ov.firstChild.nextSibling.innerHTML='<div style="font:600 20px Georgia;color:#e8b84a">'+x.n+' - '+x.h+' <span style="color:#9a8fb3;font-weight:400">('+x.t+', '+x.clock+', '+x.pace+')</span></div><div style="font:28px/1.4 Georgia;color:#f3e9d2;margin-top:8px">'+x.s+'</div>'}
function refresh(){if(pop&&!pop.closed&&pop.document.getElementById('s'))paint(pop.document);paintOv()}
window.__slide=function(n){cur=n;if(n>=1&&!t0)t0=Date.now();refresh()};
setInterval(refresh,1000);
addEventListener('keydown',function(e){var k=e.key;
 if(k==='s'||k==='S'){if(pop&&!pop.closed){pop.focus();return}
  pop=window.open('','speaker','width=760,height=620');if(!pop){alert('Allow pop-ups to use the speaker window, or press N.');return}
  pop.document.write('<title>Speaker</title><style>'+CSS+'</style>'+BODY);pop.document.close();refresh()}
 else if(k==='n'||k==='N'){ensureOv();ov.style.display=ov.style.display==='none'?'block':'none';paintOv()}});
})();
