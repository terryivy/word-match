/* 单词消消乐 v1.0 — 游戏逻辑 */
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };

/* ========== 数据 ========== */
var WORDS = [];
(window.WORD_DECKS||[]).forEach(function(deck){
  (deck.words||[]).forEach(function(w){ WORDS.push({w:w.w, cn:w.cn, phon:w.phon||""}); });
});
var GRAMMAR_QS = [];
(window.GRAMMAR||[]).forEach(function(t){
  (t.quiz||[]).forEach(function(q){ GRAMMAR_QS.push({topic:t.title, q:q.q, options:q.options, answer:q.answer, explain:q.explain}); });
});

var SAVE_KEY = "wm_save_v1";
var save = {unlocked:1, stars:{}, best:0};
try{ var s = JSON.parse(localStorage.getItem(SAVE_KEY)); if(s) save = s; }catch(e){}
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){} }

var MAX_LEVEL = 30;
function pairsFor(lv){ return Math.min(6 + Math.floor((lv-1)/2)*2, 12); }
function parTime(lv){ return pairsFor(lv)*9; }

/* ========== 音效（WebAudio 合成） ========== */
var AC = null, muted = false;
function ac(){
  if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  if(AC && AC.state === "suspended") AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, when){
  if(muted) return;
  var c = ac(); if(!c) return;
  when = when || 0;
  var o = c.createOscillator(), g = c.createGain();
  o.type = type || "sine"; o.frequency.value = freq;
  var t = c.currentTime + when;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol||0.22, t+0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t+dur+0.05);
}
var SFX = {
  tap:function(){ tone(520,0.07,"triangle",0.15); },
  select:function(){ tone(660,0.09,"sine",0.18); tone(880,0.09,"sine",0.12,0.05); },
  match:function(combo){ // 连击越高音调越高
    var base = 523 + Math.min(combo,12)*32;
    tone(base,0.12,"triangle",0.25); tone(base*1.25,0.14,"triangle",0.2,0.07); tone(base*1.5,0.2,"sine",0.18,0.14);
  },
  miss:function(){ tone(196,0.22,"sawtooth",0.16); tone(147,0.28,"sawtooth",0.14,0.08); },
  hint:function(){ tone(1046,0.15,"sine",0.18); tone(1318,0.2,"sine",0.15,0.1); },
  star:function(i){ tone(880+i*220,0.25,"triangle",0.22); },
  win:function(){ var n=[523,659,784,1046,784,1046]; n.forEach(function(f,i){ tone(f,0.22,"triangle",0.22,i*0.11); }); },
  grammarOk:function(){ tone(784,0.12,"sine",0.2); tone(1174,0.22,"sine",0.2,0.09); },
  grammarNo:function(){ tone(330,0.18,"square",0.12); }
};
function setMuted(m){
  muted = m;
  ["btn-sound","btn-sound-home"].forEach(function(id){ var b=$(id); if(b) b.textContent = m?"🔇":"🔊"; });
}
$("btn-sound").onclick = function(e){ e.stopPropagation(); setMuted(!muted); if(!muted) SFX.tap(); };
$("btn-sound-home").onclick = function(){ setMuted(!muted); if(!muted) SFX.tap(); };

/* ========== 粒子系统（canvas） ========== */
var fx = $("fx"), fctx = fx.getContext("2d"), parts = [];
function sizeFx(){ fx.width = innerWidth*devicePixelRatio; fx.height = innerHeight*devicePixelRatio; fctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
sizeFx(); addEventListener("resize", sizeFx);
var COLORS = ["#ffd54f","#ff6b9d","#4facfe","#3ddc5f","#c58bff","#ff9a3c","#00f2fe"];
function spawn(x,y,n,opt){
  opt = opt||{};
  for(var i=0;i<n;i++){
    var a = Math.random()*Math.PI*2, sp = (opt.power||7)*(0.4+Math.random()*0.8);
    parts.push({
      x:x, y:y,
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - (opt.up||2),
      g:opt.gravity==null?0.28:opt.gravity,
      life:1, decay:0.008+Math.random()*0.014,
      size:(opt.size||6)*(0.6+Math.random()*0.8),
      color:opt.color||COLORS[(Math.random()*COLORS.length)|0],
      shape:opt.shape||(Math.random()<0.4?"circle":"rect"),
      rot:Math.random()*Math.PI*2, vr:(Math.random()-0.5)*0.3
    });
  }
}
function explosion(x,y,big){ spawn(x,y,big?26:14,{power:big?9:7,up:3}); }
function confettiStorm(n){
  for(var i=0;i<(n||120);i++){
    parts.push({x:Math.random()*innerWidth, y:-20-Math.random()*innerHeight*0.3,
      vx:(Math.random()-0.5)*2, vy:2+Math.random()*3, g:0.03, life:1, decay:0.004+Math.random()*0.004,
      size:5+Math.random()*7, color:COLORS[(Math.random()*COLORS.length)|0],
      shape:Math.random()<0.5?"rect":"circle", rot:Math.random()*6, vr:(Math.random()-0.5)*0.25});
  }
}
function sparkle(x,y){ spawn(x,y,10,{power:4,up:1,gravity:0.08,size:4,color:"#fff7c2"}); }
function fxLoop(){
  fctx.clearRect(0,0,innerWidth,innerHeight);
  for(var i=parts.length-1;i>=0;i--){
    var p = parts[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.vx*=0.985; p.life-=p.decay; p.rot+=p.vr;
    if(p.life<=0 || p.y>innerHeight+40){ parts.splice(i,1); continue; }
    fctx.save(); fctx.globalAlpha = Math.max(p.life,0); fctx.translate(p.x,p.y); fctx.rotate(p.rot);
    fctx.fillStyle = p.color;
    if(p.shape==="circle"){ fctx.beginPath(); fctx.arc(0,0,p.size/2,0,6.29); fctx.fill(); }
    else fctx.fillRect(-p.size/2,-p.size/3,p.size,p.size*0.66);
    fctx.restore();
  }
  requestAnimationFrame(fxLoop);
}
fxLoop();

/* 背景气泡 */
(function(){
  var box = $("bg-bubbles");
  for(var i=0;i<14;i++){
    var b = document.createElement("i");
    var s = 14+Math.random()*46;
    b.style.cssText = "width:"+s+"px;height:"+s+"px;left:"+Math.random()*100+"%;animation-duration:"+(9+Math.random()*14)+"s;animation-delay:"+(-Math.random()*14)+"s";
    box.appendChild(b);
  }
})();

/* ========== 飘字 & 横幅 ========== */
function floatText(x,y,text){
  var d = document.createElement("div");
  d.className = "float-score"; d.textContent = text;
  d.style.left = (x-30)+"px"; d.style.top = (y-20)+"px";
  $("float-layer").appendChild(d);
  setTimeout(function(){ d.remove(); }, 1050);
}
function banner(text){
  var d = document.createElement("div");
  d.className = "combo-banner"; d.textContent = text;
  $("banner-layer").appendChild(d);
  setTimeout(function(){ d.remove(); }, 1150);
}

/* ========== 屏幕 & 弹窗 ========== */
function show(id){
  document.querySelectorAll(".screen").forEach(function(s){ s.classList.remove("active"); });
  $(id).classList.add("active");
}
function modal(html){
  $("modal-box").innerHTML = html;
  $("modal-mask").classList.remove("hidden");
}
function closeModal(){ $("modal-mask").classList.add("hidden"); }

/* ========== 吉祥物 ========== */
var SPEECH = {
  start:["加油！把它们配成对吧！","我看好你哦！","来消除所有单词吧！"],
  combo3:["太棒了！继续！","连击的感觉真好！","你真是个天才！"],
  combo5:["🔥 无人能挡！","哇哦！超厉害！"],
  miss:["哎呀，再想想~","没关系，慢慢来！","这个有点难呢"],
  hint:["看！它们在发光！"],
  win:["🎉 全部消除了！","你是最棒的！"]
};
function say(key){
  var arr = SPEECH[key]; if(!arr) return;
  $("speech").textContent = arr[(Math.random()*arr.length)|0];
}
function mascot(mood){
  var m = $("mini-mascot");
  m.classList.remove("happy","sad","dance");
  void m.offsetWidth;
  if(mood) m.classList.add(mood);
}

/* ========== 游戏状态 ========== */
var G = null;
function newGame(level){
  var pairs = pairsFor(level);
  var pool = WORDS.slice();
  // 洗牌取词
  for(var i=pool.length-1;i>0;i--){ var j=(Math.random()*(i+1))|0; var t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
  var picked = pool.slice(0, pairs);
  var tiles = [];
  picked.forEach(function(wd, idx){
    tiles.push({id:idx, kind:"en", text:wd.w, sub:wd.phon});
    tiles.push({id:idx, kind:"cn", text:wd.cn, sub:""});
  });
  for(var k=tiles.length-1;k>0;k--){ var j2=(Math.random()*(k+1))|0; var t2=tiles[k]; tiles[k]=tiles[j2]; tiles[j2]=t2; }
  G = {level:level, pairs:pairs, tiles:tiles, picked:picked,
       sel:null, matched:0, mistakes:0, combo:0, maxCombo:0,
       score:0, hints:3, startTime:Date.now(), elapsed:0, timerId:null, over:false};
  renderBoard();
  $("hud-level").textContent = level;
  $("hud-score").textContent = "0";
  $("hint-count").textContent = "3";
  updateCombo(); updateProgress();
  say("start"); mascot("");
  show("screen-game");
  // 计时
  clearInterval(G.timerId);
  G.timerId = setInterval(function(){
    if(!G || G.over) return;
    G.elapsed = Math.floor((Date.now()-G.startTime)/1000);
    var m = Math.floor(G.elapsed/60), s = G.elapsed%60;
    $("hud-time").textContent = m+":"+(s<10?"0":"")+s;
  }, 500);
}
function colsFor(){
  var land = innerWidth > innerHeight;
  var t = G.pairs*2;
  if(land) return t<=12?4 : t<=16?4 : t<=20?5 : 6;
  return t<=12?3 : t<=16?4 : t<=20?4 : 5;
}
function renderBoard(){
  var b = $("board");
  b.innerHTML = "";
  b.style.gridTemplateColumns = "repeat("+colsFor()+",1fr)";
  G.tiles.forEach(function(t, i){
    var d = document.createElement("button");
    d.className = "tile "+t.kind;
    d.style.animationDelay = (i*0.035)+"s";
    var long = t.text.length > 6 ? " long" : "";
    d.innerHTML = '<span class="tw'+long+'">'+escapeHtml(t.text)+'</span>' +
                  (t.sub?'<span class="ph">'+escapeHtml(t.sub)+'</span>':"");
    d.onclick = function(){ onTile(d, t); };
    t.el = d;
    b.appendChild(d);
  });
}
function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function tileCenter(el){
  var r = el.getBoundingClientRect();
  return {x:r.left+r.width/2, y:r.top+r.height/2};
}
function onTile(el, t){
  if(G.over || el.classList.contains("gone") || el.classList.contains("matched")) return;
  ac();
  if(G.sel && G.sel.t === t){ // 取消选择
    el.classList.remove("selected"); G.sel = null; SFX.tap(); return;
  }
  if(!G.sel){
    G.sel = {el:el, t:t};
    el.classList.add("selected"); SFX.select();
    return;
  }
  var a = G.sel; G.sel = null;
  a.el.classList.remove("selected");
  if(a.t.id === t.id && a.t.kind !== t.kind){
    doMatch(a, {el:el, t:t});
  } else {
    doMismatch(a, {el:el, t:t});
  }
}
function doMatch(a, b){
  G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
  var pts = 100 + (G.combo-1)*25;
  G.score += pts;
  $("hud-score").textContent = G.score;
  [a,b].forEach(function(o){ o.el.classList.add("matched"); });
  var c1 = tileCenter(a.el), c2 = tileCenter(b.el);
  var mx = (c1.x+c2.x)/2, my = (c1.y+c2.y)/2;
  explosion(c1.x, c1.y, G.combo>=5); explosion(c2.x, c2.y, G.combo>=5);
  sparkle(mx, my);
  floatText(mx, my, "+"+pts);
  SFX.match(G.combo);
  updateCombo(); updateProgress();
  mascot("happy"); setTimeout(function(){ if(G&&!G.over) mascot(""); }, 700);
  // 连击横幅
  if(G.combo===3){ banner("三连击！"); say("combo3"); }
  else if(G.combo===5){ banner("五连击！🔥"); say("combo5"); SFX.hint(); }
  else if(G.combo===8){ banner("八连击！⚡"); }
  else if(G.combo===10){ banner("十连击！🌈"); confettiStorm(40); }
  else if(G.combo>10 && G.combo%5===0){ banner(G.combo+"连击！🌈"); confettiStorm(40); }
  else if(G.combo>=3 && G.combo%3===0){ say("combo3"); }
  setTimeout(function(){
    [a,b].forEach(function(o){ o.el.classList.add("gone"); o.el.classList.remove("matched"); });
    G.matched++;
    updateProgress();
    if(G.matched >= G.pairs) levelClear();
  }, 420);
}
function doMismatch(a, b){
  G.mistakes++; G.combo = 0; updateCombo();
  [a,b].forEach(function(o){ o.el.classList.add("mismatch"); });
  var board = $("board");
  board.classList.remove("shake"); void board.offsetWidth; board.classList.add("shake");
  SFX.miss();
  mascot("sad"); say("miss");
  setTimeout(function(){
    [a,b].forEach(function(o){ o.el.classList.remove("mismatch"); });
    if(G&&!G.over) mascot("");
  }, 650);
}
function updateCombo(){
  var m = $("combo-meter"), t = $("combo-text");
  t.textContent = "连击 x"+G.combo;
  m.classList.toggle("hot", G.combo>=3 && G.combo<8);
  m.classList.toggle("super", G.combo>=8);
}
function updateProgress(){
  $("progress-fill").style.width = (G.matched/G.pairs*100)+"%";
  $("progress-text").textContent = G.matched+" / "+G.pairs;
}

/* 提示 */
$("btn-hint").onclick = function(){
  if(!G || G.over || G.hints<=0) return;
  var remain = G.tiles.filter(function(t){ return !t.el.classList.contains("gone"); });
  if(remain.length<2) return;
  var pick = remain[(Math.random()*remain.length)|0];
  var mate = remain.filter(function(t){ return t.id===pick.id && t!==pick; })[0];
  if(!mate) return;
  G.hints--; $("hint-count").textContent = G.hints;
  [pick.el, mate.el].forEach(function(el){ el.classList.add("hint-flash"); setTimeout(function(){ el.classList.remove("hint-flash"); }, 1100); });
  SFX.hint(); say("hint");
};

/* 暂停 */
$("btn-pause").onclick = function(){
  if(!G || G.over) return;
  clearInterval(G.timerId);
  modal('<h2>⏸ 休息一下</h2><p>第 '+G.level+' 关 · 已消除 '+G.matched+'/'+G.pairs+'</p>'+
    '<div class="modal-btns"><button class="big-btn primary" id="m-resume">▶ 继续</button>'+
    '<button class="big-btn ghost" id="m-quit">🏠 回首页</button></div>');
  $("m-resume").onclick = function(){
    closeModal(); SFX.tap();
    G.startTime = Date.now() - G.elapsed*1000;
    G.timerId = setInterval(function(){
      if(!G || G.over) return;
      G.elapsed = Math.floor((Date.now()-G.startTime)/1000);
      var m = Math.floor(G.elapsed/60), s = G.elapsed%60;
      $("hud-time").textContent = m+":"+(s<10?"0":"")+s;
    }, 500);
  };
  $("m-quit").onclick = function(){ closeModal(); SFX.tap(); goHome(); };
};

/* ========== 过关：语法加分关 ========== */
function levelClear(){
  G.over = true; clearInterval(G.timerId);
  SFX.win(); confettiStorm(140);
  mascot("dance"); say("win");
  banner("过关！🎉");
  setTimeout(function(){ grammarBonus(); }, 1400);
}
var usedGrammar = [];
function grammarBonus(){
  var qs = GRAMMAR_QS.filter(function(q,i){ return usedGrammar.indexOf(i)<0; });
  if(qs.length < 2){ usedGrammar = []; qs = GRAMMAR_QS.slice(); }
  var idxs = [];
  while(idxs.length<2 && qs.length){
    var i = (Math.random()*qs.length)|0;
    idxs.push(qs[i]); qs.splice(i,1);
  }
  var gi = 0, bonus = 0;
  function ask(){
    if(gi >= idxs.length){ showResult(bonus); return; }
    var q = idxs[gi];
    var html = '<h2>📚 语法加分题 '+(gi+1)+'/'+idxs.length+'</h2>'+
      '<div class="grammar-q">'+escapeHtml(q.q)+'</div><div class="grammar-opts">';
    q.options.forEach(function(op, oi){
      html += '<button class="grammar-opt" data-i="'+oi+'">'+escapeHtml(op)+'</button>';
    });
    modal(html+'</div><div id="g-exp"></div>');
    var btns = document.querySelectorAll(".grammar-opt");
    btns.forEach(function(b){
      b.onclick = function(){
        var ok = +b.getAttribute("data-i") === q.answer;
        btns.forEach(function(x){
          x.onclick = null;
          if(+x.getAttribute("data-i")===q.answer) x.classList.add("correct");
        });
        if(ok){
          bonus += 150; G.score += 150;
          $("hud-score").textContent = G.score;
          SFX.grammarOk();
          var r = b.getBoundingClientRect();
          explosion(r.left+r.width/2, r.top+r.height/2, false);
          floatText(r.left+r.width/2, r.top, "+150");
        } else {
          b.classList.add("wrong"); SFX.grammarNo();
        }
        $("g-exp").innerHTML = '<div class="grammar-explain">💡 '+escapeHtml(q.explain)+'</div>'+
          '<div class="modal-btns"><button class="big-btn primary" id="g-next">'+(gi+1>=idxs.length?"看成绩 →":"下一题 →")+'</button></div>';
        $("g-next").onclick = function(){ SFX.tap(); gi++; ask(); };
      };
    });
  }
  ask();
}

/* ========== 结算 ========== */
function showResult(bonus){
  var lv = G.level, pairs = G.pairs;
  var stars = 1;
  if(G.mistakes===0 && G.elapsed<=parTime(lv)) stars = 3;
  else if(G.mistakes<=pairs) stars = 2;
  save.stars[lv] = Math.max(save.stars[lv]||0, stars);
  if(lv+1 <= MAX_LEVEL) save.unlocked = Math.max(save.unlocked, lv+1);
  save.best = Math.max(save.best, G.score);
  persist(); renderHomeBest();
  for(var i=0;i<stars;i++) setTimeout(function(k){ return function(){ SFX.star(k); }; }(i), 400+i*380);
  setTimeout(function(){ confettiStorm(60); }, 600);
  var starHtml = "";
  for(var s2=0;s2<3;s2++) starHtml += "<span>"+(s2<stars?"⭐":"☆")+"</span>";
  var review = G.picked.map(function(w){ return "<div><b>"+escapeHtml(w.w)+"</b> "+escapeHtml(w.phon||"")+"<br>"+escapeHtml(w.cn)+"</div>"; }).join("");
  var nextBtn = lv < MAX_LEVEL
    ? '<button class="big-btn primary" id="m-next">▶ 下一关</button>'
    : '<button class="big-btn primary" id="m-next">🏆 全部通关！再玩一次</button>';
  modal('<h2>🎉 第 '+lv+' 关完成！</h2>'+
    '<div class="star-row">'+starHtml+'</div>'+
    '<div class="stat-line"><span>⭐ 得分 <b>'+G.score+'</b></span><span>🔥 最高连击 <b>x'+G.maxCombo+'</b></span><span>⏱ 用时 <b>'+fmtTime(G.elapsed)+'</b></span></div>'+
    (bonus?'<p>📚 语法加分 +'+bonus+'</p>':"")+
    '<p style="margin-bottom:4px">📖 本关单词回顾</p><div class="review-list">'+review+'</div>'+
    '<div class="modal-btns">'+nextBtn+
    '<button class="big-btn" id="m-replay">🔁 重玩本关</button>'+
    '<button class="big-btn ghost" id="m-home">🏠 首页</button></div>');
  $("m-next").onclick = function(){ SFX.tap(); closeModal(); newGame(lv<MAX_LEVEL?lv+1:1); };
  $("m-replay").onclick = function(){ SFX.tap(); closeModal(); newGame(lv); };
  $("m-home").onclick = function(){ SFX.tap(); closeModal(); goHome(); };
}
function fmtTime(s){ var m=Math.floor(s/60); s=s%60; return m+":"+(s<10?"0":"")+s; }

/* ========== 首页 / 选关 ========== */
function renderHomeBest(){ $("home-best").textContent = save.best; }
function goHome(){ if(G) clearInterval(G.timerId); G=null; renderHomeBest(); show("screen-home"); }
$("btn-start").onclick = function(){ SFX.tap(); newGame(Math.min(save.unlocked, MAX_LEVEL)); };
$("btn-levels").onclick = function(){ SFX.tap(); renderLevels(); show("screen-levels"); };
$("btn-levels-back").onclick = function(){ SFX.tap(); goHome(); };
$("btn-how").onclick = function(){
  SFX.tap();
  modal('<h2>❓ 玩法说明</h2>'+
    '<p>🎯 点一张 <b style="color:#7fd4ff">英文</b> 卡，再点一张 <b style="color:#ffb3c7">中文</b> 卡，配对成功就消除！</p>'+
    '<p>🔥 连续配对成功攒 <b>连击</b>，分数越来越高，音效也越来越嗨！</p>'+
    '<p>💡 卡住了就点 <b>💡提示</b>，每关有 3 次机会。</p>'+
    '<p>📚 过关后有 <b>语法加分题</b>，答对加 150 分！</p>'+
    '<p>⭐ 零失误快速过关拿 <b>三星</b>！</p>'+
    '<div class="modal-btns"><button class="big-btn primary" id="m-ok">知道了！</button></div>');
  $("m-ok").onclick = function(){ SFX.tap(); closeModal(); };
};
function renderLevels(){
  var g = $("level-grid"); g.innerHTML = "";
  for(var lv=1; lv<=MAX_LEVEL; lv++){
    (function(l){
      var b = document.createElement("button");
      var locked = l > save.unlocked;
      b.className = "level-cell"+(locked?" locked":"")+(l===Math.min(save.unlocked,MAX_LEVEL)?" current":"");
      var st = save.stars[l]||0, sh = "";
      for(var i=0;i<3;i++) sh += i<st?"⭐":"☆";
      b.innerHTML = locked ? "🔒" : l+'<span class="stars">'+sh+'</span>';
      if(!locked) b.onclick = function(){ SFX.tap(); newGame(l); };
      g.appendChild(b);
    })(lv);
  }
}

/* 启动 */
renderHomeBest();
$("home-mascot").textContent = "🐱";
document.addEventListener("gesturestart", function(e){ e.preventDefault(); });
addEventListener("orientationchange", function(){ if(G && !G.over) renderBoard(); });
})();
