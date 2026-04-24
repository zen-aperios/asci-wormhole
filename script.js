(() => {
  const host = document.querySelector(".ascii-embed");
  const pre = document.getElementById("ascii");

  const CFG = {
    fpsCap: 30,
    chars: Array.from('  .`\'_^\\",:;-~+*il!i><|/\\\\tfjrxnuvczXYUJCLQ0OZmwqpdbkhao#MW&8%B@$'),
    swirl: {
      spinSpeed: 0.6,
      inwardSpeed: 0.9,
      radialFreq: 22.0,
      angularFreq: 5.0,
      coreRadius: 0.06,
      falloff: 3.8,
      warpStrength: 0.18,
      warpScale: 3.0,
      warpTimeScale: 0.18,
    },
    contrastPower: 1.4,
  };

  let cols = 0;
  let rows = 0;
  let cellW = 8;
  let cellH = 14;
  let sShort = 1;
  let t0 = performance.now();
  let lastFrame = 0;
  let paused = false;
  let pausedTimeOffset = 0;
  let currentBgColor = "#05030a";
  let currentFgColor = "#f8edd8";

  const G = [];
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    G[i] = { x: Math.cos(a), y: Math.sin(a) };
  }

  const P = new Uint8Array(512);
  (function seedPerm() {
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    let s = 13371337;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [base[i], base[j]] = [base[j], base[i]];
    }
    for (let i = 0; i < 512; i++) P[i] = base[i & 255];
  })();

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  function grad(ix, iy, x, y) {
    const X = ix & 255;
    const Y = iy & 255;
    const g = G[P[X + P[Y]]];
    return g.x * (x - ix) + g.y * (y - iy);
  }

  function perlin(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = fade(x - x0);
    const sy = fade(y - y0);

    const n00 = grad(x0, y0, x, y);
    const n10 = grad(x1, y0, x, y);
    const n01 = grad(x0, y1, x, y);
    const n11 = grad(x1, y1, x, y);

    return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
  }

  function fbm(x, y, oct = 3, gain = 0.5, lac = 2.0) {
    let v = 0;
    let amp = 1;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      v += amp * perlin(x * f, y * f);
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return v / norm;
  }

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  function measureCell() {
    const span = document.createElement("span");
    span.textContent = "M".repeat(200);
    span.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;white-space:pre;visibility:hidden;";
    const cs = getComputedStyle(pre);
    span.style.font = cs.font;
    span.style.letterSpacing = cs.letterSpacing;
    document.body.appendChild(span);
    const rect = span.getBoundingClientRect();
    document.body.removeChild(span);
    const cw = rect.width / 200;
    const lh = parseFloat(cs.lineHeight) || 12;
    return { cw, lh };
  }

  function computeGrid() {
    const m = measureCell();
    cellW = m.cw;
    cellH = m.lh;

    const r = host.getBoundingClientRect();
    cols = Math.max(1, Math.floor(r.width / cellW));
    rows = Math.max(1, Math.floor(r.height / cellH));
    sShort = Math.min(cols, rows);
  }

  function sampleWormhole(x, y, t) {
    const cx = (x + 0.5 - cols * 0.5) / sShort;
    const cy = (y + 0.5 - rows * 0.5) / sShort;

    const wt = t * CFG.swirl.warpTimeScale;
    const n = fbm(
      cx * CFG.swirl.warpScale + 10.123 + wt,
      cy * CFG.swirl.warpScale - 8.321 - wt,
      3,
      0.55,
      2.1
    );

    const wx = (n - 0.5) * CFG.swirl.warpStrength;
    const wy = (n - 0.5) * CFG.swirl.warpStrength;

    const px = cx + wx;
    const py = cy + wy;

    const r = Math.hypot(px, py) + 1e-6;
    const ang = Math.atan2(py, px);

    const spin = ang + t * CFG.swirl.spinSpeed;
    const radialPhase = r * CFG.swirl.radialFreq - t * CFG.swirl.inwardSpeed;
    const angularPhase = spin * CFG.swirl.angularFreq;

    let v = 0.5 + 0.5 * Math.sin(radialPhase + angularPhase);

    const coreFactor = 1 - clamp(r / CFG.swirl.coreRadius, 0, 1);
    v = v * 0.7 + coreFactor * 0.9;

    const edgeFalloff = Math.exp(-r * CFG.swirl.falloff);
    v *= edgeFalloff;

    v = Math.pow(clamp(v, 0, 1), CFG.contrastPower);
    return v;
  }

  function charForValue(v) {
    const arr = CFG.chars;
    const idx = Math.max(0, Math.min(arr.length - 1, Math.floor(v * (arr.length - 1))));
    return arr[idx];
  }

  function render(now) {
    if (now - lastFrame < 1000 / CFG.fpsCap) {
      requestAnimationFrame(render);
      return;
    }
    lastFrame = now;

    const effectiveNow = paused ? t0 + pausedTimeOffset : now;
    const t = (effectiveNow - t0) / 1000;

    let out = "";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = sampleWormhole(x, y, t);
        const ch = v < 0.012 ? " " : charForValue(v);
        out += ch;
      }
      if (y < rows - 1) out += "\n";
    }

    pre.textContent = out;
    requestAnimationFrame(render);
  }

  function bindSlider(id, object, key, format = (v) => v.toFixed(2)) {
    const input = document.getElementById(id);
    const label = document.getElementById(id + "Val");
    if (!input) return;
    input.value = object[key];
    if (label) label.textContent = format(object[key]);
    input.addEventListener("input", () => {
      const val = parseFloat(input.value);
      object[key] = val;
      if (label) label.textContent = format(val);
    });
  }

  function initUI() {
    bindSlider("contrastPower", CFG, "contrastPower", (v) => v.toFixed(2));

    const opacitySlider = document.getElementById("opacitySlider");
    if (opacitySlider) {
      const currentOpacity = parseFloat(getComputedStyle(pre).opacity) || 0.28;
      opacitySlider.value = currentOpacity;
      opacitySlider.addEventListener("input", () => {
        const v = opacitySlider.value;
        pre.style.opacity = v;
        document.documentElement.style.setProperty("--opacity", v);
      });
    }

    const bgInput = document.getElementById("bgColor");
    const fgInput = document.getElementById("fgColor");
    if (bgInput) {
      bgInput.value = currentBgColor;
      bgInput.addEventListener("input", () => {
        currentBgColor = bgInput.value;
        document.documentElement.style.setProperty("--bg", currentBgColor);
      });
    }
    if (fgInput) {
      fgInput.value = currentFgColor;
      fgInput.addEventListener("input", () => {
        currentFgColor = fgInput.value;
        document.documentElement.style.setProperty("--fg", currentFgColor);
      });
    }

    bindSlider("spinSpeed", CFG.swirl, "spinSpeed", (v) => v.toFixed(2));
    bindSlider("inwardSpeed", CFG.swirl, "inwardSpeed", (v) => v.toFixed(2));
    bindSlider("radialFreq", CFG.swirl, "radialFreq", (v) => v.toFixed(1));
    bindSlider("angularFreq", CFG.swirl, "angularFreq", (v) => v.toFixed(1));
    bindSlider("coreRadius", CFG.swirl, "coreRadius", (v) => v.toFixed(3));
    bindSlider("falloff", CFG.swirl, "falloff", (v) => v.toFixed(1));
    bindSlider("warpStrength", CFG.swirl, "warpStrength", (v) => v.toFixed(2));
    bindSlider("warpScale", CFG.swirl, "warpScale", (v) => v.toFixed(1));
    bindSlider("warpTimeScale", CFG.swirl, "warpTimeScale", (v) => v.toFixed(2));

    const pauseToggle = document.getElementById("pauseToggle");
    if (pauseToggle) {
      pauseToggle.addEventListener("change", () => {
        if (pauseToggle.checked) {
          paused = true;
          pausedTimeOffset = performance.now() - t0;
        } else {
          paused = false;
          t0 = performance.now() - pausedTimeOffset;
        }
      });
    }

    const uiPanel = document.getElementById("uiPanel");
    const uiToggle = document.getElementById("uiToggle");
    if (uiToggle && uiPanel) {
      uiToggle.addEventListener("click", () => {
        const hidden = uiPanel.classList.toggle("hidden");
        uiToggle.querySelector("span").textContent = hidden ? "✺" : "✳︎";
      });
    }

    const exportBtn = document.getElementById("exportBtn");
    const exportField = document.getElementById("exportField");
    if (exportBtn && exportField) {
      exportBtn.addEventListener("click", () => {
        const snippet = buildEmbedSnippet();
        exportField.value = snippet;
        exportField.focus();
        exportField.select();
        try {
          document.execCommand("copy");
        } catch (e) {}
      });
    }
  }

  function buildEmbedSnippet() {
    const opacitySlider = document.getElementById("opacitySlider");
    const opacity = opacitySlider ? parseFloat(opacitySlider.value || "0.28") : 0.28;
    const cfg = CFG;
    const sw = CFG.swirl;

    const snippet = `<!-- ASCII Wormhole Embed -->
<style>
  :root{
    --bg:${currentBgColor};
    --fg:${currentFgColor};
    --opacity:${opacity.toFixed(2)};
  }
  html,body{
    height:100%;
    margin:0;
    background:var(--bg);
    overflow:hidden;
  }
  .ascii-embed{
    position:fixed;
    inset:0;
    overflow:hidden;
  }
  pre.ascii-pre{
    position:absolute;
    inset:0;
    margin:0;
    overflow:hidden;
    color:var(--fg);
    background:transparent;
    opacity:var(--opacity);
    font:11px/11px ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
    white-space:pre;
    user-select:none;
    letter-spacing:.3px;
  }
</style>
<div class="ascii-embed">
  <pre class="ascii-pre" id="ascii" aria-hidden="true"></pre>
</div>
<script>
(function(){
  const host=document.querySelector(".ascii-embed");
  const pre=document.getElementById("ascii");
  const CFG={
    fpsCap:${cfg.fpsCap},
    chars:${JSON.stringify(CFG.chars)},
    swirl:{
      spinSpeed:${sw.spinSpeed},
      inwardSpeed:${sw.inwardSpeed},
      radialFreq:${sw.radialFreq},
      angularFreq:${sw.angularFreq},
      coreRadius:${sw.coreRadius},
      falloff:${sw.falloff},
      warpStrength:${sw.warpStrength},
      warpScale:${sw.warpScale},
      warpTimeScale:${sw.warpTimeScale}
    },
    contrastPower:${cfg.contrastPower}
  };
  let cols=0,rows=0,cellW=8,cellH=14,sShort=1;
  let t0=performance.now();
  let lastFrame=0;
  const G=[];
  for(let i=0;i<256;i++){const a=i/256*Math.PI*2;G[i]={x:Math.cos(a),y:Math.sin(a)};}
  const P=new Uint8Array(512);
  (function seedPerm(){
    const base=new Uint8Array(256);
    for(let i=0;i<256;i++)base[i]=i;
    let s=13371337;
    const rnd=()=>((s=(s*1664525+1013904223)>>>0)/0xffffffff);
    for(let i=255;i>0;i--){
      const j=(rnd()*(i+1))|0;
      [base[i],base[j]]=[base[j],base[i]];
    }
    for(let i=0;i<512;i++)P[i]=base[i&255];
  })();
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  const lerp=(a,b,t)=>a+(b-a)*t;
  function grad(ix,iy,x,y){
    const X=ix&255,Y=iy&255;
    const g=G[P[X+P[Y]]];
    return g.x*(x-ix)+g.y*(y-iy);
  }
  function perlin(x,y){
    const x0=Math.floor(x),y0=Math.floor(y);
    const x1=x0+1,y1=y0+1;
    const sx=fade(x-x0),sy=fade(y-y0);
    const n00=grad(x0,y0,x,y);
    const n10=grad(x1,y0,x,y);
    const n01=grad(x0,y1,x,y);
    const n11=grad(x1,y1,x,y);
    return lerp(lerp(n00,n10,sx),lerp(n01,n11,sx),sy);
  }
  function fbm(x,y,oct=3,gain=0.5,lac=2.0){
    let v=0,amp=1,f=1,norm=0;
    for(let i=0;i<oct;i++){
      v+=amp*perlin(x*f,y*f);
      norm+=amp;
      amp*=gain;
      f*=lac;
    }
    return v/norm;
  }
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  function measureCell(){
    const span=document.createElement("span");
    span.textContent="M".repeat(200);
    span.style.cssText="position:absolute;left:-9999px;top:-9999px;white-space:pre;visibility:hidden;";
    const cs=getComputedStyle(pre);
    span.style.font=cs.font;
    span.style.letterSpacing=cs.letterSpacing;
    document.body.appendChild(span);
    const rect=span.getBoundingClientRect();
    document.body.removeChild(span);
    const cw=rect.width/200;
    const lh=parseFloat(cs.lineHeight)||12;
    return{cw,lh};
  }
  function computeGrid(){
    const m=measureCell();
    cellW=m.cw;
    cellH=m.lh;
    const r=host.getBoundingClientRect();
    cols=Math.max(1,Math.floor(r.width/cellW));
    rows=Math.max(1,Math.floor(r.height/cellH));
    sShort=Math.min(cols,rows);
  }
  function sampleWormhole(x,y,t){
    const cx=(x+0.5-cols*0.5)/sShort;
    const cy=(y+0.5-rows*0.5)/sShort;
    const wt=t*CFG.swirl.warpTimeScale;
    const n=fbm(
      cx*CFG.swirl.warpScale+10.123+wt,
      cy*CFG.swirl.warpScale-8.321-wt,
      3,0.55,2.1
    );
    const wx=(n-0.5)*CFG.swirl.warpStrength;
    const wy=(n-0.5)*CFG.swirl.warpStrength;
    const px=cx+wx;
    const py=cy+wy;
    const r=Math.hypot(px,py)+1e-6;
    const ang=Math.atan2(py,px);
    const spin=ang+t*CFG.swirl.spinSpeed;
    const radialPhase=r*CFG.swirl.radialFreq-t*CFG.swirl.inwardSpeed;
    const angularPhase=spin*CFG.swirl.angularFreq;
    let v=0.5+0.5*Math.sin(radialPhase+angularPhase);
    const coreFactor=1-clamp(r/CFG.swirl.coreRadius,0,1);
    v=v*0.7+coreFactor*0.9;
    const edgeFalloff=Math.exp(-r*CFG.swirl.falloff);
    v*=edgeFalloff;
    v=Math.pow(clamp(v,0,1),CFG.contrastPower);
    return v;
  }
  function charForValue(v){
    const arr=CFG.chars;
    const idx=Math.max(0,Math.min(arr.length-1,Math.floor(v*(arr.length-1))));
    return arr[idx];
  }
  function render(now){
    if((now-lastFrame)<1000/CFG.fpsCap){
      requestAnimationFrame(render);
      return;
    }
    lastFrame=now;
    const t=(now-t0)/1000;
    let out="";
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const v=sampleWormhole(x,y,t);
        const ch=v<0.012?" ":charForValue(v);
        out+=ch;
      }
      if(y<rows-1)out+=String.fromCharCode(10);
    }
    pre.textContent=out;
    requestAnimationFrame(render);
  }
  new ResizeObserver(()=>computeGrid()).observe(host);
  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(computeGrid);
  }
  computeGrid();
  requestAnimationFrame(render);
})();
<\/script>`;
    return snippet.replace(/\n\s+/g, "");
  }

  new ResizeObserver(() => computeGrid()).observe(host);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      computeGrid();
    });
  }
  computeGrid();
  initUI();
  requestAnimationFrame(render);
})();
