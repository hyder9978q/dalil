/* ماسح ملصقات التحميل: كاميرا الهاتف (BarcodeDetector أو jsQR) أو قارئ باركود USB كلوحة مفاتيح */
(function(){
  const CSS='.scn{position:fixed;inset:0;background:#000;z-index:60;display:flex;flex-direction:column;color:#fff;font-family:Tajawal,system-ui,sans-serif}'+
  '.scn .cam{position:relative;flex:1;min-height:0;overflow:hidden}.scn video{width:100%;height:100%;object-fit:cover;display:block}'+
  '.scn .frame{position:absolute;left:50%;top:50%;width:64vmin;height:64vmin;max-width:340px;max-height:340px;transform:translate(-50%,-50%);border:3px solid rgba(255,255,255,.9);border-radius:18px;box-shadow:0 0 0 2000px rgba(0,0,0,.35)}'+
  '.scn .top{position:absolute;top:0;left:0;right:0;padding:14px;font-weight:800;font-size:17px;text-align:center;background:linear-gradient(rgba(0,0,0,.7),transparent)}'+
  '.scn .bar{padding:12px 14px 18px;display:flex;flex-direction:column;gap:9px;background:#0B1F4D}'+
  '.scn .msg{font-weight:800;font-size:17px;min-height:26px;line-height:1.4}.scn .msg.ok{color:#34D399}.scn .msg.bad{color:#F87171}'+
  '.scn .row{display:flex;gap:8px}.scn input{flex:1;min-width:0;font:inherit;font-size:16px;padding:11px;border-radius:10px;border:0;direction:ltr}'+
  '.scn button{font:inherit;font-weight:800;font-size:15px;padding:11px 16px;border-radius:10px;border:0;background:#fff;color:#0B1F4D;cursor:pointer}'+
  '.scn .flash{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s}.scn .flash.ok{background:rgba(16,185,129,.35);opacity:1}.scn .flash.bad{background:rgba(239,68,68,.4);opacity:1}';
  let lib=null;
  function needLib(){
    if(window.jsQR)return Promise.resolve();
    if(!lib)lib=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';s.onload=res;s.onerror=()=>{lib=null;rej()};document.head.appendChild(s)});
    return lib;
  }
  async function detector(){
    try{if('BarcodeDetector' in window){const f=await BarcodeDetector.getSupportedFormats();if(f.includes('qr_code'))return new BarcodeDetector({formats:['qr_code']})}}catch(e){}
    return null;
  }
  window.openScanner=function(o){
    if(!document.getElementById('scnCss')){const st=document.createElement('style');st.id='scnCss';st.textContent=CSS;document.head.appendChild(st)}
    const el=document.createElement('div');el.className='scn';el.setAttribute('role','dialog');
    el.innerHTML='<div class="cam"><video playsinline muted></video><div class="frame"></div><div class="flash"></div><div class="top"></div></div>'+
      '<div class="bar"><div class="msg" aria-live="polite">وجّه الكاميرا إلى ملصق الطلب</div>'+
      '<div class="row"><input type="text" inputmode="text" autocomplete="off" placeholder="أو اكتب الرمز / استخدم قارئ الباركود" aria-label="رمز الملصق"><button data-k="ok">إدخال</button></div>'+
      '<button data-k="close">إنهاء المسح</button></div>';
    document.body.appendChild(el);
    const video=el.querySelector('video'),msg=el.querySelector('.msg'),top=el.querySelector('.top'),flash=el.querySelector('.flash'),inp=el.querySelector('input');
    let stream=null,alive=true,last='',lastAt=0,det=null,busy=false;
    const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
    function status(){try{top.textContent=o.status?o.status():(o.title||'')}catch(e){}}
    async function handle(code){
      code=String(code||'').trim();if(!code||busy)return;
      const now=Date.now();if(code===last&&now-lastAt<2500)return;last=code;lastAt=now;
      busy=true;let r;try{r=await o.onCode(code)}catch(e){r={ok:false,text:'تعذّر الحفظ. تحقق من الإنترنت.'}}busy=false;
      r=r||{ok:false,text:''};msg.textContent=r.text;msg.className='msg '+(r.ok?'ok':'bad');
      flash.className='flash '+(r.ok?'ok':'bad');setTimeout(()=>flash.className='flash',300);
      try{navigator.vibrate&&navigator.vibrate(r.ok?60:[90,60,90])}catch(e){}
      status();
    }
    async function loop(){
      if(!alive)return;
      try{
        if(video.readyState>=2&&!busy){
          if(det){const c=await det.detect(video);if(c&&c[0])await handle(c[0].rawValue)}
          else if(window.jsQR){
            const w=Math.min(720,video.videoWidth),h=Math.round(video.videoHeight*w/video.videoWidth);
            if(w&&h){cv.width=w;cv.height=h;cx.drawImage(video,0,0,w,h);const img=cx.getImageData(0,0,w,h);const c=jsQR(img.data,w,h,{inversionAttempts:'dontInvert'});if(c&&c.data)await handle(c.data)}
          }
        }
      }catch(e){}
      setTimeout(loop,180);
    }
    function close(){alive=false;if(stream)stream.getTracks().forEach(t=>t.stop());el.remove();o.onClose&&o.onClose()}
    el.addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(!b)return;if(b.dataset.k==='close')close();else{handle(inp.value);last='';inp.value='';inp.focus()}});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();last='';handle(inp.value);inp.value=''}});
    status();
    (async()=>{
      det=await detector();
      if(!det)try{await needLib()}catch(e){msg.textContent='تعذّر تحميل قارئ الرموز. استخدم الإدخال اليدوي.';msg.className='msg bad'}
      try{
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
        if(!alive){stream.getTracks().forEach(t=>t.stop());return}
        video.srcObject=stream;await video.play().catch(()=>{});loop();
      }catch(e){msg.textContent='تعذّر فتح الكاميرا. اسمح بالكاميرا من إعدادات المتصفح، أو استخدم قارئ الباركود.';msg.className='msg bad';el.querySelector('.cam').style.flex='0 0 60px';inp.focus()}
    })();
    return {close,status};
  };
  window.parseLabel=function(code){
    code=String(code||'').trim();
    const m=/^D1\|(\d{4}-\d{2}-\d{2})\|([A-Za-z0-9]{3,20})$/.exec(code);
    if(m)return {day:m[1],id:m[2]};
    if(/^[a-z0-9]{5,12}$/.test(code))return {day:null,id:code};
    return null;
  };
})();
