// ===== دليل — منطق التطبيق =====
const DB = {
  get k(){return 'dalil_user'},
  load(){try{return JSON.parse(localStorage.getItem(this.k))}catch(e){return null}},
  save(u){localStorage.setItem(this.k,JSON.stringify(u))},
  clear(){localStorage.removeItem(this.k)}
};

// بيانات طلبات تجريبية (تُستبدل بقاعدة بيانات حقيقية لاحقاً)
const ORDERS = [
  {id:1, customer:'علي حسن', phone:'07901112233', area:'الكرادة', lat:33.3070, lng:44.4290, status:'pending'},
  {id:2, customer:'زينب محمد', phone:'07702223344', area:'المنصور', lat:33.3128, lng:44.3404, status:'delivering'},
  {id:3, customer:'مصطفى كريم', phone:'07503334455', area:'زيونة', lat:33.3300, lng:44.4490, status:'pending'},
  {id:4, customer:'نور عبدالله', phone:'07804445566', area:'الجادرية', lat:33.2750, lng:44.3850, status:'delivering'},
];
const BAGHDAD = [33.3152, 44.3661];

let user = null, map = null, markers = [], routeLine = null;

// ===== تهيئة =====
function init(){
  user = DB.load();
  if(user){ checkSub(); openApp(); }
  else { document.getElementById('authScreen').style.display='flex'; }
  applyTheme();
}

function doRegister(){
  const name = document.getElementById('rName').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const vehicle = document.getElementById('rVehicle').value;
  if(!name || !phone){ toast('يرجى إدخال الاسم والهاتف'); return; }
  const now = Date.now();
  user = {
    name, phone, vehicle,
    created: now,
    trialEnds: now + 3*24*60*60*1000, // 3 أيام
    subEnds: now + 3*24*60*60*1000,
    plan: 'تجريبي',
    todayEarn: 0, delivered: 0, distance: 0, payments: []
  };
  DB.save(user);
  openApp();
  toast('أهلاً بك في دليل 🚀');
}

function openApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('app').style.display='flex';
  refresh();
}

function logout(){ DB.clear(); location.reload(); }

// ===== الاشتراك والقفل =====
function checkSub(){
  if(!user) return;
  if(Date.now() > user.subEnds){ showLock(); }
}
function showLock(){
  document.getElementById('lockMsg').textContent =
    localStorage.getItem('lockMsg') || 'انتهت تجربتك المجانية. اختر باقة لمواصلة استخدام دليل.';
  document.getElementById('lockScreen').classList.add('show');
}
function closeLock(){ document.getElementById('lockScreen').classList.remove('show'); }
function subscribe(plan, price, days){
  user.plan = plan;
  user.subEnds = Date.now() + days*24*60*60*1000;
  user.payments.unshift({plan, price, date: new Date().toLocaleDateString('ar-IQ')});
  DB.save(user);
  closeLock();
  refresh();
  toast(`تم الاشتراك في الباقة ال${plan} ✓`);
}

// ===== التنقل =====
function go(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('s-'+screen).classList.add('active');
  document.querySelectorAll('.nav button[data-s]').forEach(b=>{
    b.classList.toggle('active', b.dataset.s===screen);
  });
  if(screen==='map') setTimeout(initMap, 100);
  if(screen==='orders') renderOrders('allOrders');
  if(screen==='wallet') renderWallet();
  if(screen==='settings') renderSettings();
}

// ===== تحديث الواجهة =====
function refresh(){
  if(!user) return;
  document.getElementById('greet').textContent = 'مرحباً، ' + user.name.split(' ')[0];
  document.getElementById('todayEarn').innerHTML = user.todayEarn.toLocaleString() + ' <small>د.ع</small>';
  document.getElementById('hDelivered').textContent = user.delivered;
  document.getElementById('hDistance').textContent = user.distance + ' كم';
  document.getElementById('hTime').textContent = '0 س';
  document.getElementById('sActive').textContent = ORDERS.filter(o=>o.status!=='delivered').length;
  // التجربة
  const left = Math.ceil((user.subEnds - Date.now())/(24*60*60*1000));
  const banner = document.getElementById('trialBanner');
  if(user.plan==='تجريبي'){
    document.getElementById('trialText').textContent = `باقي ${left} يوم من التجربة المجانية`;
    banner.style.display='flex';
  } else { banner.style.display='none'; }
  renderOrders('homeOrders', 2);
}

function renderOrders(target, limit){
  const el = document.getElementById(target);
  let list = ORDERS.filter(o=>o.status!=='delivered');
  if(limit) list = list.slice(0, limit);
  if(!list.length){ el.innerHTML='<div class="empty"><div class="ic">📭</div>لا توجد طلبات حالياً</div>'; return; }
  el.innerHTML = list.map(o=>`
    <div class="order" onclick="openOrder(${o.id})">
      <div class="num">${o.id}</div>
      <div class="info">
        <b>${o.customer}</b>
        <small>📍 ${o.area} • ${o.phone}</small>
      </div>
      <span class="badge ${o.status==='pending'?'b-pending':'b-delivering'}">${o.status==='pending'?'بالانتظار':'قيد التوصيل'}</span>
    </div>`).join('');
}

function openOrder(id){
  const o = ORDERS.find(x=>x.id===id);
  go('map');
  setTimeout(()=>{ if(map) map.setView([o.lat,o.lng],14); }, 400);
  toast(`📍 ${o.customer} — ${o.area}`);
}

function renderWallet(){
  document.getElementById('subStatus').textContent = user.plan;
  const left = Math.ceil((user.subEnds - Date.now())/(24*60*60*1000));
  document.getElementById('subExpiry').textContent = left>0 ? `ينتهي خلال ${left} يوم` : 'منتهي';
  document.getElementById('zainNum').textContent = localStorage.getItem('zain') || '07901234567';
  document.getElementById('qiNum').textContent = localStorage.getItem('qi') || '1234-5678-9012';
  const log = document.getElementById('payLog');
  if(!user.payments.length){ log.innerHTML='<div class="empty"><div class="ic">🧾</div>لا توجد دفعات بعد</div>'; return; }
  log.innerHTML = user.payments.map(p=>`
    <div class="list-item"><div class="ic bg-green">✓</div>
    <div class="t"><b>باقة ${p.plan}</b><small>${p.date}</small></div>
    <b style="color:var(--green-dim)">${p.price.toLocaleString()} د.ع</b></div>`).join('');
}

function renderSettings(){
  document.getElementById('setName').textContent = user.name;
  document.getElementById('setPhone').textContent = user.phone + ' • ' + user.vehicle;
}

// ===== الخريطة (مجانية - OpenStreetMap) =====
function initMap(){
  if(map){ map.invalidateSize(); return; }
  map = L.map('map',{zoomControl:false}).setView(BAGHDAD, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  ORDERS.filter(o=>o.status!=='delivered').forEach(o=>{
    const m = L.marker([o.lat,o.lng]).addTo(map).bindPopup(`<b>${o.customer}</b><br>${o.area}`);
    markers.push(m);
  });
}

// ترتيب المحطات حسب الأقرب (محاكاة Route Optimization)
function optimizeRoute(){
  const pts = ORDERS.filter(o=>o.status!=='delivered');
  if(routeLine) map.removeLayer(routeLine);
  const coords = [BAGHDAD, ...pts.map(o=>[o.lat,o.lng])];
  routeLine = L.polyline(coords, {color:'#10F58C', weight:4, opacity:.8, dashArray:'8 6'}).addTo(map);
  map.fitBounds(routeLine.getBounds(), {padding:[60,60]});
  document.getElementById('routeStops').textContent = pts.length + ' محطات';
  document.getElementById('routeEta').textContent = 'وقت الوصول ~ ' + (pts.length*12) + ' دقيقة';
  toast('⚡ تم تحسين المسار حسب أقل وقت');
}

function voiceCmd(){
  if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){
    toast('الأوامر الصوتية غير مدعومة بهذا المتصفح'); return;
  }
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new R(); r.lang='ar-IQ';
  toast('🎙️ تكلم الآن...');
  r.onresult = e=>{
    const t = e.results[0][0].transcript;
    if(t.includes('مسار')||t.includes('حسّن')){ optimizeRoute(); }
    else toast('سمعت: ' + t);
  };
  r.onerror = ()=>toast('لم أسمع شيئاً، حاول مجدداً');
  r.start();
}

// ===== الماسح الذكي (OCR محاكاة) =====
function handleScan(e){
  const f = e.target.files[0]; if(!f) return;
  const img = document.getElementById('scanImg');
  img.src = URL.createObjectURL(f); img.style.display='block';
  document.getElementById('scanZone').style.display='none';
  document.getElementById('scanResult').innerHTML='<div class="card" style="text-align:center"><div class="ic" style="font-size:30px">🔍</div>جاري قراءة الطلب بالذكاء الاصطناعي...</div>';
  setTimeout(()=>{
    document.getElementById('scanResult').innerHTML=`
    <div class="card">
      <div class="section-title" style="margin-top:0">✓ تم استخراج البيانات</div>
      <div class="field"><label>اسم الزبون</label><input value="حسين عادل"></div>
      <div class="field"><label>رقم الهاتف</label><input value="07712345678"></div>
      <div class="field"><label>العنوان</label><input value="بغداد - الكرخ - حي الجامعة"></div>
      <button class="btn btn-green" onclick="addScanned()">➕ إضافة للطلبات</button>
    </div>`;
  }, 1600);
}
function addScanned(){ go('orders'); toast('تم إضافة الطلب ✓'); 
  document.getElementById('scanZone').style.display='flex';
  document.getElementById('scanImg').style.display='none';
  document.getElementById('scanResult').innerHTML='';
}

// ===== الأدمن =====
function saveAdmin(){
  localStorage.setItem('zain', document.getElementById('aZain').value);
  localStorage.setItem('qi', document.getElementById('aQi').value);
  localStorage.setItem('lockMsg', document.getElementById('aLockMsg').value);
  toast('تم حفظ الإعدادات ✓');
}
// مفاتيح التبديل
document.addEventListener('click', e=>{
  if(e.target.classList.contains('switch') && e.target.id!=='swTheme'){
    e.target.classList.toggle('on');
  }
});

// ===== الثيم =====
function toggleTheme(){
  const cur = document.body.dataset.theme;
  const next = cur==='dark'?'light':'dark';
  document.body.dataset.theme = next;
  localStorage.setItem('theme', next);
  applyTheme();
}
function applyTheme(){
  const t = localStorage.getItem('theme') || 'dark';
  document.body.dataset.theme = t;
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = t==='dark'?'☀️':'🌙';
  const sw = document.getElementById('swTheme');
  if(sw) sw.classList.toggle('on', t==='dark');
}

// ===== Toast =====
let toastT;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('show'), 2500);
}

// تسجيل Service Worker (يعمل فقط عند النشر على https)
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

// تشغيل
init();
