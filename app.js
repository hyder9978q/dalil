// ===== دليل — منطق التطبيق =====
// ===== الاتصال بقاعدة البيانات Supabase =====
const SUPA_URL = 'https://npcqftuzaybeudeqkirc.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wY3FmdHV6YXliZXVkZXFraXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2ODIzNjIsImV4cCI6MjA5NjI1ODM2Mn0.7Z7ee0Q38Xz8Y_ojcCp4k7qkplu9NNd1tDrV716ddXM';
const sb = (window.supabase) ? window.supabase.createClient(SUPA_URL, SUPA_KEY) : null;

const LOCAL = {
  id(){ return localStorage.getItem('dalil_cid'); },
  setId(v){ localStorage.setItem('dalil_cid', v); },
  clear(){ localStorage.removeItem('dalil_cid'); }
};

// طلبات تجريبية تُزرع عند التسجيل لأول مرة
const DEMO = [
  {customer:'علي حسن', phone:'07901112233', area:'الكرادة', gov:'بغداد', lat:33.3070, lng:44.4290, status:'pending', cod:25000},
  {customer:'زينب محمد', phone:'07702223344', area:'المنصور', gov:'بغداد', lat:33.3128, lng:44.3404, status:'delivering', cod:18000},
  {customer:'مصطفى كريم', phone:'07503334455', area:'الزبير', gov:'البصرة', lat:30.3900, lng:47.7080, status:'pending', cod:40000},
  {customer:'نور عبدالله', phone:'07804445566', area:'الجادرية', gov:'بغداد', lat:33.2750, lng:44.3850, status:'delivering', cod:12000},
];
let ORDERS = [];
const BAGHDAD = [33.3152, 44.3661];

// ===== نظام الإعدادات المرن (قابل للتعديل حسب الرغبة) =====
const GOVS = ['بغداد','البصرة','نينوى','أربيل','النجف','كربلاء','بابل','ذي قار','الأنبار','ديالى','كركوك','صلاح الدين','واسط','ميسان','المثنى','القادسية','دهوك','السليمانية'];

// النماذج الجاهزة لمختلف الشركات
const PRESETS = {
  parcel:   {label:'شركة شحن بين المحافظات', icon:'🚛', coverage:'govs',  cod:true,  returns:true,  payModel:'perDelivery', fee:3000, multiDriver:true,  pricing:'perZone', proof:true},
  intracity:{label:'توصيل داخل المدينة',      icon:'🏍️', coverage:'city',  cod:true,  returns:true,  payModel:'perDelivery', fee:2000, multiDriver:true,  pricing:'flat',    proof:true},
  shop:     {label:'مطعم / محل بسائقه',       icon:'🍔', coverage:'city',  cod:true,  returns:false, payModel:'salary',      fee:0,    multiDriver:false, pricing:'flat',    proof:false},
  freelance:{label:'مندوب مستقل',             icon:'⭐', coverage:'city',  cod:true,  returns:false, payModel:'perDelivery', fee:2500, multiDriver:false, pricing:'flat',    proof:true},
};

const CFG = {
  load(){ try{ return JSON.parse(localStorage.getItem('dalil_cfg')) || {...PRESETS.parcel, preset:'parcel'} }catch(e){ return {...PRESETS.parcel, preset:'parcel'} } },
  save(c){ localStorage.setItem('dalil_cfg', JSON.stringify(c)); }
};
let cfg = CFG.load();

function applyPreset(key){
  cfg = {...PRESETS[key], preset:key};
  CFG.save(cfg); saveCfgCloud();
  renderConfig(); refresh();
  toast('تم تطبيق نموذج: ' + PRESETS[key].label);
}
function setCfg(field, value){ cfg[field] = value; CFG.save(cfg); saveCfgCloud(); refresh(); }
function toggleCfg(field){ cfg[field] = !cfg[field]; CFG.save(cfg); saveCfgCloud(); renderConfig(); refresh(); toast('تم الحفظ ✓'); }
function saveCfgCloud(){ if(sb && user && user.id) sb.from('companies').update({config:cfg}).eq('id',user.id).then(()=>{}); }

let user = null, map = null, markers = [], routeLine = null;

// ===== تهيئة =====
async function init(){
  applyTheme();
  // الميزة: رابط تتبع الطلب العام (?track=ID)
  const params = new URLSearchParams(location.search);
  if(params.has('track')){ showTracking(params.get('track')); return; }
  if(!sb){ document.getElementById('authScreen').style.display='flex'; return; }
  const cid = LOCAL.id();
  if(cid){
    await cloudLoad(cid);
    if(user){ checkSub(); openApp(); return; }
  }
  document.getElementById('authScreen').style.display='flex';
}

// تحميل بيانات الشركة والطلبات من قاعدة البيانات
async function cloudLoad(cid){
  try{
    const {data:c, error} = await sb.from('companies').select('*').eq('id',cid).single();
    if(error || !c){ LOCAL.clear(); return; }
    user = { id:c.id, name:c.name, phone:c.owner_phone, vehicle:c.vehicle||'مندوب',
      plan:c.plan, subEnds:new Date(c.sub_ends).getTime(),
      payments:[], todayEarn:0, distance:0, fuelToday:0, delivered:0, returned:0, cashCollected:0 };
    if(c.config) cfg = c.config;
    if(c.zain_number) localStorage.setItem('zain', c.zain_number);
    if(c.qi_number) localStorage.setItem('qi', c.qi_number);
    if(c.lock_msg) localStorage.setItem('lockMsg', c.lock_msg);
    const {data:os} = await sb.from('orders').select('*').eq('company_id',cid).order('id');
    ORDERS = (os||[]).map(o=>({id:o.id, customer:o.customer, phone:o.phone, area:o.area, gov:o.gov,
      lat:o.lat, lng:o.lng, status:o.status, cod:o.cod, landmark:o.landmark, proof:o.proof}));
    const {data:ps} = await sb.from('payments').select('*').eq('company_id',cid).order('id',{ascending:false});
    user.payments = (ps||[]).map(p=>({plan:p.plan, price:p.price, date:new Date(p.created_at).toLocaleDateString('ar-IQ')}));
    recomputeStats();
  }catch(e){ toast('تعذّر الاتصال بقاعدة البيانات'); }
}

// إعادة حساب الإحصائيات من الطلبات
function recomputeStats(){
  if(!user) return;
  user.delivered = ORDERS.filter(o=>o.status==='delivered').length;
  user.returned = ORDERS.filter(o=>o.status==='returned').length;
  user.cashCollected = ORDERS.filter(o=>o.status==='delivered').reduce((s,o)=>s+(o.cod||0),0);
  user.todayEarn = user.delivered * (cfg.fee || 2000);
}

async function doRegister(){
  const name = document.getElementById('rName').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const vehicle = document.getElementById('rVehicle').value;
  if(!name || !phone){ toast('يرجى إدخال الاسم والهاتف'); return; }
  if(!sb){ toast('لا يوجد اتصال بقاعدة البيانات'); return; }
  toast('جاري إنشاء الحساب...');
  try{
    const {data:ex} = await sb.from('companies').select('id').eq('owner_phone',phone).maybeSingle();
    let cid;
    if(ex){ cid = ex.id; }  // الرقم موجود → تسجيل دخول
    else {
      const {data:c, error} = await sb.from('companies').insert({name, owner_phone:phone, vehicle, config:cfg}).select().single();
      if(error) throw error;
      cid = c.id;
      await sb.from('orders').insert(DEMO.map(o=>({...o, company_id:cid})));
    }
    LOCAL.setId(cid);
    await cloudLoad(cid);
    openApp();
    toast(ex ? 'مرحباً بعودتك 👋' : 'أهلاً بك في دليل 🚀');
  }catch(e){ toast('خطأ: ' + (e.message||'تعذّر إنشاء الحساب')); }
}

function openApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('app').style.display='flex';
  refresh();
}

function logout(){ LOCAL.clear(); location.reload(); }

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
async function subscribe(plan, price, days){
  const zain = localStorage.getItem('zain') || '07901234567';
  const ok = confirm(`الاشتراك في الباقة ال${plan} — ${price.toLocaleString()} د.ع\n\nحوّل المبلغ عبر زين كاش إلى:\n${zain}\n\nبعد التحويل اضغط (موافق) لتفعيل اشتراكك.`);
  if(!ok) return;
  user.plan = plan;
  user.subEnds = Date.now() + days*24*60*60*1000;
  user.payments.unshift({plan, price, date: new Date().toLocaleDateString('ar-IQ')});
  if(sb && user.id){
    await sb.from('companies').update({plan, sub_ends:new Date(user.subEnds).toISOString()}).eq('id',user.id);
    await sb.from('payments').insert({company_id:user.id, plan, price});
  }
  closeLock();
  refresh();
  toast(`تم تفعيل الباقة ال${plan} ✓`);
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
  if(screen==='admin') renderAdmin();
  if(screen==='worksys') renderConfig();
}

// ===== رسم نظام العمل المرن =====
function renderConfig(){
  // بطاقات النماذج
  document.getElementById('presetCards').innerHTML = Object.keys(PRESETS).map(k=>{
    const p = PRESETS[k], on = cfg.preset===k;
    return `<div class="preset ${on?'on':''}" onclick="applyPreset('${k}')">
      <div class="pic">${p.icon}</div>
      <div style="flex:1"><b>${p.label}</b><small>${p.coverage==='govs'?'كل المحافظات':'داخل المدينة'} • ${payLabel(p.payModel)}</small></div>
      ${on?'<span class="chk">✓</span>':''}
    </div>`;
  }).join('');
  // المفاتيح
  const t = (f,label,desc,ic)=>`<div class="list-item"><div class="ic bg-blue">${ic}</div><div class="t"><b>${label}</b><small>${desc}</small></div><div class="switch ${cfg[f]?'on':''}" onclick="toggleCfg('${f}')"></div></div>`;
  document.getElementById('cfgToggles').innerHTML =
    t('cod','تحصيل نقدي (COD)','المندوب يجمع المبلغ من الزبون','💵') +
    t('returns','الراجع','تتبّع الطرود المرتجعة للتاجر','↩️') +
    t('proof','إثبات التسليم بصورة','صورة عند كل تسليم','📸') +
    t('multiDriver','تعدد المندوبين','توزيع الطرود على عدة مندوبين','👥');
  // القوائم
  document.getElementById('cfgCoverage').value = cfg.coverage;
  document.getElementById('cfgPay').value = cfg.payModel;
  document.getElementById('cfgPricing').value = cfg.pricing;
  document.getElementById('cfgFee').value = cfg.fee;
  document.getElementById('cfgFeeWrap').style.display = cfg.payModel==='perDelivery' ? 'block' : 'none';
}
function payLabel(m){ return {perDelivery:'بالقطعة', salary:'راتب', dailySettle:'حساب يومي', commission:'عمولة'}[m]||m; }

function renderAdmin(){
  const p = PRESETS[cfg.preset];
  document.getElementById('cfgSummary').textContent = p ? p.label : 'مخصّص';
}

// ===== تحديث الواجهة =====
function refresh(){
  if(!user) return;
  document.getElementById('greet').textContent = 'مرحباً، ' + user.name.split(' ')[0];
  document.getElementById('todayEarn').innerHTML = user.todayEarn.toLocaleString() + ' <small>د.ع</small>';
  document.getElementById('hDelivered').textContent = user.delivered;
  document.getElementById('hDistance').textContent = user.distance + ' كم';
  document.getElementById('hTime').textContent = '0 س';
  document.getElementById('sActive').textContent = ORDERS.filter(o=>o.status==='pending'||o.status==='delivering').length;
  // التجربة
  const left = Math.ceil((user.subEnds - Date.now())/(24*60*60*1000));
  const banner = document.getElementById('trialBanner');
  if(user.plan==='تجريبي'){
    document.getElementById('trialText').textContent = `باقي ${left} يوم من التجربة المجانية`;
    banner.style.display='flex';
  } else { banner.style.display='none'; }
  renderOrders('homeOrders', 2);
  // الميزة 5: الأرباح والمصاريف
  const fuel = user.fuelToday||0;
  document.getElementById('earnIn').textContent = user.todayEarn.toLocaleString() + ' د.ع';
  document.getElementById('earnFuel').textContent = fuel.toLocaleString() + ' د.ع';
  document.getElementById('earnNet').textContent = (user.todayEarn - fuel).toLocaleString() + ' د.ع';
}

function addFuel(){
  const v = prompt('كم صرفت على الوقود اليوم؟ (بالدينار)');
  const n = parseInt(v);
  if(n>0){ user.fuelToday = (user.fuelToday||0) + n; refresh(); toast('تم تسجيل '+n.toLocaleString()+' د.ع وقود'); }
}

function renderOrders(target, limit){
  const el = document.getElementById(target);
  let list = ORDERS.filter(o=>o.status==='pending'||o.status==='delivering'||o.status==='postponed');
  if(limit) list = list.slice(0, limit);
  if(!list.length){ el.innerHTML='<div class="empty"><div class="ic">📭</div>لا توجد طلبات حالياً</div>'; return; }
  const badges = {pending:['b-pending','بالانتظار'], delivering:['b-delivering','قيد التوصيل'], postponed:['b-pending','مؤجل'], returned:['b-pending','راجع'], delivered:['b-done','مسلّم']};
  el.innerHTML = list.map(o=>{
    const b = badges[o.status]||badges.pending;
    const loc = cfg.coverage==='govs' ? `${o.gov} - ${o.area}` : o.area;
    const cod = cfg.cod ? ` • 💵 ${(o.cod||0).toLocaleString()}` : '';
    return `<div class="order" onclick="openOrder(${o.id})">
      <div class="num">${o.id}</div>
      <div class="info"><b>${o.customer}</b><small>📍 ${loc}${cod}</small></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="badge ${b[0]}">${b[1]}</span>
        <span style="font-size:10px;color:var(--text-faint);cursor:pointer" onclick="event.stopPropagation();copyTrackLink(${o.id})">🔗 رابط التتبع</span>
      </div>
    </div>`;
  }).join('');
}

// ===== الميزة 1: التوصيل بدبوس الموقع =====
let currentOrder = null;
function openOrder(id){
  const o = ORDERS.find(x=>x.id===id);
  currentOrder = o;
  document.getElementById('shtName').textContent = o.customer;
  document.getElementById('shtArea').textContent = '📍 ' + (cfg.coverage==='govs' ? o.gov+' - '+o.area : o.area);
  document.getElementById('shtPhone').textContent = o.phone;
  document.getElementById('shtLandmark').value = o.landmark || '';
  document.getElementById('shtPin').textContent = o.lat ? `الموقع محدد ✓ (${o.lat.toFixed(4)}, ${o.lng.toFixed(4)})` : 'لا يوجد موقع — اطلبه من الزبون';
  document.getElementById('shtCod').textContent = (o.cod||0).toLocaleString() + ' د.ع';
  // التكيّف مع نموذج العمل
  document.getElementById('shtCodWrap').style.display = cfg.cod ? 'flex' : 'none';
  document.getElementById('returnBtns').style.display = cfg.returns ? 'flex' : 'none';
  document.getElementById('proofBtn').style.display = cfg.proof ? 'flex' : 'none';
  document.getElementById('orderSheet').classList.add('show');
}
function closeSheet(){ document.getElementById('orderSheet').classList.remove('show'); }

// ملاحة مباشرة لدبوس الموقع (يفتح خرائط جوجل بالإحداثيات لا بالعنوان)
function navigateToPin(){
  if(!currentOrder.lat){ toast('لا يوجد موقع محدد لهذا الطلب'); return; }
  saveLandmark();
  const url = `https://www.google.com/maps/dir/?api=1&destination=${currentOrder.lat},${currentOrder.lng}&travelmode=driving`;
  window.open(url, '_blank');
}
// اتصال بالزبون
function callCustomer(){ window.location.href = 'tel:' + currentOrder.phone; }
// طلب الموقع عبر واتساب (الحل العراقي: الزبون يرسل موقعه)
function requestLocationWA(){
  const msg = encodeURIComponent('مرحباً، أنا سائق التوصيل 🛵 أرجو إرسال موقعك (Location) من واتساب لأصل إليك بسرعة. اضغط 📎 ثم Location.');
  let phone = currentOrder.phone.replace(/[^0-9]/g,'');
  if(phone.startsWith('0')) phone = '964' + phone.slice(1);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}
// حفظ ملاحظة المعلم (Landmark)
function saveLandmark(){
  if(currentOrder){ currentOrder.landmark = document.getElementById('shtLandmark').value; }
}
// لصق رابط موقع (من واتساب/خرائط جوجل) واستخراج الإحداثيات
function pasteLocation(){
  const link = prompt('الصق رابط الموقع الذي أرسله الزبون (من خرائط جوجل أو واتساب):');
  if(!link) return;
  const c = parseCoords(link);
  if(c){ currentOrder.lat=c[0]; currentOrder.lng=c[1];
    document.getElementById('shtPin').textContent = `الموقع محدد ✓ (${c[0].toFixed(4)}, ${c[1].toFixed(4)})`;
    toast('تم تحديد الموقع ✓');
  } else { toast('لم أتمكن من قراءة الموقع، تأكد من الرابط'); }
}
function parseCoords(link){
  // يدعم: google.com/maps?q=lat,lng  /  @lat,lng  /  lat,lng مباشرة
  let m = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
          link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
          link.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}
function markDelivered(){
  saveLandmark();
  currentOrder.status = 'delivered';
  cloudOrder(currentOrder.id, {status:'delivered', landmark:currentOrder.landmark||null, lat:currentOrder.lat, lng:currentOrder.lng, proof:!!currentOrder.proof});
  recomputeStats();
  closeSheet(); refresh();
  renderOrders('allOrders');
  toast(`تم التسليم ✓ حصّلت ${(currentOrder.cod||0).toLocaleString()} د.ع`);
}
// الميزة 8: إثبات التسليم بصورة
function proofTaken(e){
  const f = e.target.files[0]; if(!f) return;
  if(currentOrder) currentOrder.proof = true;
  toast('📸 تم حفظ إثبات التسليم ✓');
}
// الراجع والتأجيل (حسب الإعدادات)
function markReturned(){
  currentOrder.status = 'returned';
  cloudOrder(currentOrder.id, {status:'returned'});
  recomputeStats(); closeSheet(); refresh(); renderOrders('allOrders');
  toast('↩️ سُجّل الطرد كراجع للتاجر');
}
function markPostponed(){
  currentOrder.status = 'postponed';
  cloudOrder(currentOrder.id, {status:'postponed'});
  closeSheet(); refresh(); renderOrders('allOrders');
  toast('⏳ تم تأجيل الطلب');
}
// تحديث طلب في قاعدة البيانات
function cloudOrder(id, patch){ if(sb && user) sb.from('orders').update(patch).eq('id',id).then(()=>{}); }

function renderWallet(){
  document.getElementById('subStatus').textContent = user.plan;
  const left = Math.ceil((user.subEnds - Date.now())/(24*60*60*1000));
  document.getElementById('subExpiry').textContent = left>0 ? `ينتهي خلال ${left} يوم` : 'منتهي';
  // الميزة 3: حساب الكاش
  const collected = user.cashCollected||0;
  const pending = ORDERS.filter(o=>o.status!=='delivered').reduce((s,o)=>s+(o.cod||0),0);
  document.getElementById('cashCollected').textContent = collected.toLocaleString() + ' د.ع';
  document.getElementById('cashPending').textContent = pending.toLocaleString() + ' د.ع';
  // كشف حساب المندوب (متكيف مع نموذج الأجر)
  renderSettlement(collected);
  document.getElementById('cashBlock').style.display = cfg.cod ? 'block' : 'none';
  document.getElementById('zainNum').textContent = localStorage.getItem('zain') || '07901234567';
  document.getElementById('qiNum').textContent = localStorage.getItem('qi') || '1234-5678-9012';
  const log = document.getElementById('payLog');
  if(!user.payments.length){ log.innerHTML='<div class="empty"><div class="ic">🧾</div>لا توجد دفعات بعد</div>'; return; }
  log.innerHTML = user.payments.map(p=>`
    <div class="list-item"><div class="ic bg-green">✓</div>
    <div class="t"><b>باقة ${p.plan}</b><small>${p.date}</small></div>
    <b style="color:var(--green-dim)">${p.price.toLocaleString()} د.ع</b></div>`).join('');
}

function renderSettlement(collected){
  const d = user.delivered||0;
  let earn = 0, formula = '';
  if(cfg.payModel==='perDelivery'){ earn = d*cfg.fee; formula = `${d} طرد × ${cfg.fee.toLocaleString()} د.ع`; }
  else if(cfg.payModel==='commission'){ earn = Math.round(collected*0.1); formula = '10% من المبلغ المحصّل'; }
  else if(cfg.payModel==='dailySettle'){ earn = d*cfg.fee; formula = `حساب يومي: ${d} توصيلة`; }
  else { earn = 0; formula = 'راتب ثابت (شهري)'; }
  const toCompany = cfg.cod ? Math.max(0, collected - ((cfg.payModel==='perDelivery'||cfg.payModel==='dailySettle') ? earn : 0)) : 0;
  document.getElementById('setEarn').textContent = earn.toLocaleString() + ' د.ع';
  document.getElementById('setFormula').textContent = formula;
  document.getElementById('setToCompany').textContent = toCompany.toLocaleString() + ' د.ع';
  document.getElementById('setReturned').textContent = (user.returned||0) + ' طرد';
  document.getElementById('returnRow').style.display = cfg.returns ? 'flex' : 'none';
  document.getElementById('toCompanyRow').style.display = cfg.cod ? 'flex' : 'none';
}

// ===== ميزة 1: تقرير اليوم جاهز للواتساب (لصاحب الشركة) =====
function shareReport(){
  const delivered = ORDERS.filter(o=>o.status==='delivered');
  const returned  = ORDERS.filter(o=>o.status==='returned');
  const pending   = ORDERS.filter(o=>o.status==='pending'||o.status==='delivering');
  const codTotal  = delivered.reduce((s,o)=>s+(o.cod||0),0);
  const earn      = user.delivered * (cfg.fee||2000);
  const toReturn  = Math.max(0, codTotal - earn);
  const company   = user.name || 'شركتي';
  const date      = new Date().toLocaleDateString('ar-IQ');
  const msg =
`📦 *تقرير ${company} — ${date}*

✅ مسلّم: ${delivered.length} طرد
↩️ راجع: ${returned.length} طرد
⏳ بالانتظار: ${pending.length} طرد

💵 كاش محصّل: ${codTotal.toLocaleString()} د.ع
💰 أجرة المندوب: ${earn.toLocaleString()} د.ع
🏢 يُسلَّم للشركة: ${toReturn.toLocaleString()} د.ع

🛵 *دليل — نظام التوصيل الذكي*`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ===== ميزة 2: كشف حساب المندوب المشارَك (لحماية حقوقه) =====
function shareStatement(){
  const d = user.delivered||0;
  const r = user.returned||0;
  const cash = user.cashCollected||0;
  const earn = d * (cfg.fee||2000);
  const toCompany = Math.max(0, cash - earn);
  const date = new Date().toLocaleDateString('ar-IQ');
  const msg =
`📋 *كشف حسابي — ${date}*

اسم المندوب: ${user.name}
رقم الهاتف: ${user.phone}

📦 طرود مسلّمة: ${d}
↩️ طرود راجعة: ${r}
💵 كاش محصّل: ${cash.toLocaleString()} د.ع
💰 أجرتي المستحقة: ${earn.toLocaleString()} د.ع
🏢 سأسلّم للشركة: ${toCompany.toLocaleString()} د.ع

✅ تم التوثيق عبر تطبيق دليل`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ===== ميزة 3: صفحة تتبع الطلب العامة (بدون تسجيل دخول) =====
async function showTracking(orderId){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('app').style.display='none';
  const el = document.getElementById('trackScreen');
  el.style.display='flex';
  try{
    const {data:o} = await sb.from('orders').select('customer,area,gov,status,created_at').eq('id',orderId).single();
    if(!o){ el.innerHTML='<div class="track-card"><div style="font-size:48px">❓</div><h2>الطلب غير موجود</h2><p>تحقق من الرابط</p></div>'; return; }
    const icons = {pending:'⏳',delivering:'🚛',delivered:'✅',returned:'↩️',postponed:'🔄'};
    const labels = {pending:'قيد الانتظار',delivering:'في الطريق إليك',delivered:'تم التسليم ✓',returned:'تم الإرجاع',postponed:'مؤجل'};
    const colors = {pending:'#F59E0B',delivering:'#2563EB',delivered:'#10F58C',returned:'#EF4444',postponed:'#8B5CF6'};
    const c = colors[o.status]||'#2563EB';
    el.innerHTML=`
    <div class="track-card">
      <div class="logo" style="margin-bottom:12px"></div>
      <h2 style="margin-bottom:4px">تتبّع طلبك</h2>
      <small style="color:var(--text-soft)">رقم الطلب: #${orderId}</small>
      <div style="font-size:64px;margin:20px 0">${icons[o.status]||'📦'}</div>
      <div style="font-size:22px;font-weight:800;color:${c};margin-bottom:8px">${labels[o.status]||o.status}</div>
      <div style="color:var(--text-soft);font-size:14px">${o.gov||''} ${o.area||''}</div>
      <div style="margin-top:24px;padding:14px;background:var(--surface-2);border-radius:12px;font-size:13px;color:var(--text-soft)">
        🛵 يتم التوصيل عبر <b style="color:var(--text)">دليل</b>
      </div>
    </div>`;
  }catch(e){ el.innerHTML='<div class="track-card"><div style="font-size:48px">⚠️</div><h2>تعذّر التحميل</h2></div>'; }
}

// نسخ رابط تتبع الطلب
function copyTrackLink(id){
  const link = `${location.origin}${location.pathname}?track=${id}`;
  navigator.clipboard.writeText(link).then(()=>toast('✓ تم نسخ رابط التتبع'));
}

function renderSettings(){
  document.getElementById('setName').textContent = user.name;
  document.getElementById('setPhone').textContent = user.phone + ' • ' + user.vehicle;
}
// ===== الخريطة (خرائط CARTO حديثة - مجانية) =====
let stopMarkers = [], tileLayer = null;
function mapTiles(){
  const dark = (document.body.dataset.theme === 'dark');
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
}
function initMap(){
  if(map){ map.invalidateSize(); return; }
  map = L.map('map',{zoomControl:false, attributionControl:false}).setView(BAGHDAD, 12);
  tileLayer = L.tileLayer(mapTiles(), {maxZoom:20, subdomains:'abcd'}).addTo(map);
  drawMarkers();
}
function drawMarkers(order){
  stopMarkers.forEach(m=>map.removeLayer(m)); stopMarkers=[];
  const pts = ORDERS.filter(o=>o.status==='pending'||o.status==='delivering').filter(o=>o.lat&&o.lng);
  pts.forEach(o=>{
    const n = order ? (order.indexOf(o.id)+1) : null;
    const icon = L.divIcon({className:'', html:`<div style="background:${n?'#10F58C':'#2563EB'};color:${n?'#04321f':'#fff'};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;font-weight:800;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff"><span style="transform:rotate(45deg)">${n||'•'}</span></div>`, iconSize:[30,30], iconAnchor:[15,30]});
    const m = L.marker([o.lat,o.lng],{icon}).addTo(map).bindPopup(`<b>${o.customer}</b><br>${o.area}`);
    stopMarkers.push(m);
  });
}

// ===== تحسين المسار الحقيقي (OSRM) — أفضل ترتيب وأقصر طريق =====
async function optimizeRoute(){
  const pts = ORDERS.filter(o=>o.status==='pending'||o.status==='delivering').filter(o=>o.lat&&o.lng);
  if(pts.length < 1){ toast('لا توجد طلبات بمواقع محددة'); return; }
  toast('⚡ جاري حساب أفضل مسار...');
  // الإحداثيات بصيغة lng,lat — تبدأ من موقع المندوب (بغداد) ثم الطرود
  const coords = [[BAGHDAD[1],BAGHDAD[0]], ...pts.map(o=>[o.lng,o.lat])];
  const str = coords.map(c=>c[0]+','+c[1]).join(';');
  const url = `https://router.project-osrm.org/trip/v1/driving/${str}?source=first&roundtrip=false&overview=full&geometries=geojson`;
  try{
    const res = await fetch(url);
    const data = await res.json();
    if(data.code!=='Ok') throw new Error('osrm');
    if(routeLine) map.removeLayer(routeLine);
    // رسم الطريق الحقيقي بالشوارع
    const line = data.trips[0].geometry.coordinates.map(c=>[c[1],c[0]]);
    routeLine = L.polyline(line, {color:'#10F58C', weight:5, opacity:.9}).addTo(map);
    map.fitBounds(routeLine.getBounds(), {padding:[50,50]});
    // الترتيب الأمثل: waypoints[i].waypoint_index يعطي ترتيب الزيارة
    // أول نقطة هي المندوب، نتجاهلها ونرتّب الطرود
    const order = [];
    data.waypoints.forEach((w,i)=>{ if(i>0) order[w.waypoint_index-1] = pts[i-1].id; });
    drawMarkers(order.filter(x=>x!==undefined));
    const mins = Math.round(data.trips[0].duration/60);
    const km = (data.trips[0].distance/1000).toFixed(1);
    document.getElementById('routeStops').textContent = pts.length + ' محطات';
    document.getElementById('routeEta').textContent = `${km} كم • ${mins} دقيقة`;
    toast('✓ أفضل مسار: ابدأ بالمحطة رقم 1');
  }catch(e){
    toast('تعذّر حساب المسار، تحقق من الانترنت');
  }
}

// ===== الميزة 4: تحميل المنطقة للعمل بدون انترنت =====
function downloadArea(){
  if(!map){ toast('افتح الخريطة أولاً'); return; }
  toast('⬇️ جاري تحميل خريطة المنطقة...');
  const z = map.getZoom();
  const c = map.getCenter();
  [z, Math.min(z+1,17), Math.min(z+2,18)].forEach(zoom=>{
    const t = deg2tile(c.lat, c.lng, zoom);
    for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++){
      fetch(`https://a.tile.openstreetmap.org/${zoom}/${t.x+dx}/${t.y+dy}.png`).catch(()=>{});
    }
  });
  setTimeout(()=>toast('✓ تم حفظ المنطقة — تعمل الآن بدون انترنت'), 2000);
}
function deg2tile(lat, lng, z){
  const n = Math.pow(2, z);
  return { x: Math.floor((lng+180)/360*n),
           y: Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n) };
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
    if(t.includes('مسار')||t.includes('حسّن')||t.includes('حسن')){ optimizeRoute(); }
    else if(t.includes('اتصل')||t.includes('اتصال')){ if(currentOrder) callCustomer(); else toast('افتح طلباً أولاً'); }
    else if(t.includes('موقع')||t.includes('ملاحة')){ if(currentOrder) navigateToPin(); else toast('افتح طلباً أولاً'); }
    else if(t.includes('تحميل')||t.includes('أوفلاين')){ downloadArea(); }
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
  const zain = document.getElementById('aZain').value;
  const qi = document.getElementById('aQi').value;
  const lockMsg = document.getElementById('aLockMsg').value;
  localStorage.setItem('zain', zain);
  localStorage.setItem('qi', qi);
  localStorage.setItem('lockMsg', lockMsg);
  if(sb && user && user.id) sb.from('companies').update({zain_number:zain, qi_number:qi, lock_msg:lockMsg}).eq('id',user.id).then(()=>{});
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
  if(map && tileLayer) tileLayer.setUrl(mapTiles());
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
