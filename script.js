/* ---------- ค่ากำหนด Firebase ของโปรเจกต์ call-staff-app ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyB0eoxfiHA4Fa_8526aWcnHygogfNsVBqI",
  authDomain: "call-staff-app.firebaseapp.com",
  projectId: "call-staff-app",
  storageBucket: "call-staff-app.firebasestorage.app",
  messagingSenderId: "205128987928",
  appId: "1:205128987928:web:b9efe078e4dce5f4f0da6d",
  measurementId: "G-PJG2LNKRBP"
};

/* ---------- ข้อมูลพื้นฐาน ---------- */
const DEPTS = [
  { id: "elec", n: "เครื่องใช้ไฟฟ้า", ic: "💡" },
  { id: "tools", n: "เครื่องมือช่าง", ic: "🔧" },
  { id: "paint", n: "สีและตกแต่ง", ic: "🎨" },
  { id: "bath", n: "สุขภัณฑ์", ic: "🚿" }
];

const STAFF = [
  { id: "s1", n: "คุณสมชาย", dept: "elec" },
  { id: "s2", n: "คุณมานี", dept: "elec" },
  { id: "s3", n: "คุณวิชัย", dept: "tools" },
  { id: "s4", n: "คุณปราณี", dept: "tools" },
  { id: "s5", n: "คุณธนา", dept: "paint" },
  { id: "s6", n: "คุณนภา", dept: "paint" },
  { id: "s7", n: "คุณกิตติ", dept: "bath" },
  { id: "s8", n: "คุณสุดา", dept: "bath" }
];

const ZONES = {
  "z-a": { n: "โซน A", d: "ทางเข้าร้าน" },
  "z-b": { n: "โซน B", d: "ชั้นวางกลางร้าน" },
  "z-c": { n: "โซน C", d: "มุมด้านใน" },
  "z-d": { n: "โซน D", d: "ใกล้แคชเชียร์" }
};

const TOPICS = ["เลือกรุ่น", "เทียบราคา", "ขนาดที่เหมาะ", "โปรโมชัน", "อื่น ๆ"];
const D = id => DEPTS.find(d => d.id === id) || {};
const S = id => STAFF.find(s => s.id === id) || {};
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const tmp = {};

function ss(k, v) {
  try {
    if (v === undefined) return sessionStorage.getItem("cs_" + k) || tmp[k] || null;
    if (v === null) {
      sessionStorage.removeItem("cs_" + k);
      delete tmp[k];
    } else {
      sessionStorage.setItem("cs_" + k, v);
      tmp[k] = v;
    }
  } catch (e) {
    if (v === undefined) return tmp[k] || null;
    if (v === null) delete tmp[k];
    else tmp[k] = v;
  }
}

let app = null,
  view = "landing",
  zone = "z-b",
  pickDept = null,
  pickStaff = "any",
  topics = [],
  note = "",
  me = ss("me"),
  myCall = ss("call"),
  mode = "local",
  dbh = null,
  primed = false,
  alerts = [];

const seen = new Set(),
  data = { calls: {}, st: {} },
  mem = {};

/* ---------- ชั้นข้อมูล: ออนไลน์ (Firebase Firestore) หรือโหมดทดลอง ---------- */
const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("callstaff") : null;

function lread(c) {
  try {
    return JSON.parse(localStorage.getItem("cs_" + c) || "{}");
  } catch (e) {
    return mem[c] || {};
  }
}

function lwrite(c, o) {
  mem[c] = o;
  try {
    localStorage.setItem("cs_" + c, JSON.stringify(o));
  } catch (e) {}
}

function sub(c) {
  if (dbh) {
    dbh.collection(c).onSnapshot(s => {
      const o = {};
      s.docs.forEach(d => o[d.id] = d.data());
      data[c] = o;
      changed(c);
    }, err => {
      console.error("Firestore error:", err);
      toast("เชื่อมต่อ Firestore ไม่ได้ กรุณาตรวจสอบว่าเปิดใช้งาน Firestore Database แล้ว");
    });
  } else {
    data[c] = lread(c);
  }
}

async function put(c, id, v) {
  const nv = { ...(data[c][id] || {}), ...v };
  data[c][id] = nv;
  if (dbh) {
    try {
      await dbh.collection(c).doc(id).set(nv, { merge: true });
    } catch (e) {
      console.error("Firestore write error:", e);
      toast("ส่งข้อมูลไม่สำเร็จ ลองอีกครั้งนะครับ");
    }
  } else {
    lwrite(c, data[c]);
    bc && bc.postMessage(c);
  }
  changed(c);
}

addEventListener("storage", e => {
  if (!dbh && e.key && e.key.startsWith("cs_")) {
    const c = e.key.slice(3);
    data[c] = lread(c);
    changed(c);
  }
});

if (bc) {
  bc.onmessage = e => {
    if (!dbh) {
      data[e.data] = lread(e.data);
      changed(e.data);
    }
  };
}

function changed(c) {
  if (c === "calls") detect();
  const a = document.activeElement;
  if (a && a.id === "note") return;
  render();
}

/* ---------- แจ้งเตือนพนักงาน ---------- */
function relevant(c) {
  return me && c.status === "waiting" && c.dept === S(me).dept && (c.target === "any" || c.target === me);
}

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, .28].forEach(t => {
      const o = a.createOscillator(),
        g = a.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(a.destination);
      g.gain.setValueAtTime(.2, a.currentTime + t);
      o.start(a.currentTime + t);
      o.stop(a.currentTime + t + .2);
    });
    navigator.vibrate && navigator.vibrate([200, 100, 200]);
  } catch (e) {}
}

function detect() {
  const list = Object.entries(data.calls);
  if (!primed) {
    list.forEach(([k]) => seen.add(k));
    primed = true;
    return;
  }
  list.forEach(([k, c]) => {
    if (!seen.has(k)) {
      seen.add(k);
      if (relevant(c) && Date.now() - c.callTs < 600000) {
        alerts.push(k);
        beep();
      }
    }
  });
  alerts = alerts.filter(k => data.calls[k] && data.calls[k].status === "waiting");
}

/* ---------- ตัวช่วย ---------- */
const busy = id => Object.values(data.calls).some(c => c.staff === id && (c.status === "coming" || c.status === "arrived"));
const avail = s => (data.st[s.id] || {}).on !== false && !busy(s.id);
const cur = () => myCall ? data.calls[myCall] : null;
const live = c => c && ["waiting", "coming", "arrived"].includes(c.status);
const mmss = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};

function toast(t) {
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = t;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

const zl = k => ZONES[k] ? ZONES[k].n + " · " + ZONES[k].d : "";

function route() {
  const h = location.hash.slice(1);
  if (h === "staff") view = me ? "staff" : "login";
  else if (ZONES[h]) {
    zone = h;
    view = live(cur()) ? "wait" : "home";
  } else {
    view = "landing";
  }
  render();
}

/* ---------- หน้าจอ ---------- */
const logo = `<span><span style="font-size:22px">🙋</span> <b>ถามพี่ได้เลย</b></span>`;

function landing() {
  return `<div class="top">${logo}</div>
<h1>เลือกของไม่ถูก ไม่ต้องเดินหาพนักงาน</h1>
<p class="mute">กดเรียกจากจุดที่ยืนอยู่ได้เลย พนักงานจะรู้ทันทีว่าคุณอยู่โซนไหน แล้วเดินมาหาถึงที่</p>
<h2>🛒 ลูกค้า · ลองสแกน QR ที่ชั้นวาง</h2>
<div class="grid">${Object.entries(ZONES).map(([k, z]) => `<a class="btn sec" href="#${k}">${z.n}<br><span class="mute">${z.d}</span></a>`).join("")}</div>
<h2>👕 พนักงาน</h2><a class="btn" style="margin-top:0" href="#staff">เข้าสู่หน้าพนักงาน</a>
<p class="mute" style="margin-top:16px">ตอนใช้งานจริง ให้ทำ QR Code จากลิงก์หน้านี้ แล้วต่อท้ายด้วย #z-a, #z-b, #z-c หรือ #z-d ตามโซนที่ติดป้าย</p>`;
}

function home() {
  return `<div class="top">${logo}<a href="#">หน้าแรก</a></div>
<h1>สวัสดีครับ อยากให้ใครช่วยดูไหม</h1>
<div class="card">📍 คุณอยู่ที่ <b>${ZONES[zone].n}</b> <span class="mute">${ZONES[zone].d}</span>
<select id="zsel" aria-label="เปลี่ยนจุดที่ยืน">${Object.entries(ZONES).map(([k, z]) => `<option value="${k}" ${k === zone ? "selected" : ""}>${z.n} · ${z.d}</option>`).join("")}</select></div>
<p class="mute">เลือกแผนกที่อยากได้คำแนะนำ</p>
<div class="grid">${DEPTS.map(d => {
    const n = STAFF.filter(s => s.dept === d.id && avail(s)).length;
    return `<button class="dept" data-act="dept" data-id="${d.id}"><span class="ico">${d.ic}</span><b>${d.n}</b><span class="mute"><i class="dot ${n ? "" : "x"}"></i>${n ? "ว่าง " + n + " คน" : "ไม่ว่างตอนนี้"}</span></button>`;
  }).join("")}</div>`;
}

function pick() {
  const d = D(pickDept);
  return `<button class="back" data-act="back">← กลับ</button>
<h1>${d.ic} แผนก${d.n}</h1>
<h2>อยากให้ใครมาช่วย</h2>
<button class="opt ${pickStaff === "any" ? "sel" : ""}" data-act="who" data-id="any"><span class="av">🤝</span><span><b>ใครก็ได้ที่ว่าง</b><br><span class="mute">มาถึงไวที่สุด</span></span></button>
${STAFF.filter(s => s.dept === d.id).map(s => {
    const a = avail(s);
    return `<button class="opt ${pickStaff === s.id ? "sel" : ""}" data-act="who" data-id="${s.id}" ${a ? "" : "disabled"}><span class="av">${s.n.slice(3, 4)}</span><span><b>${s.n}</b><br><span class="mute"><i class="dot ${a ? "" : "x"}"></i>${a ? "ว่าง" : busy(s.id) ? "กำลังช่วยลูกค้าอยู่" : "พักอยู่"}</span></span></button>`;
  }).join("")}
<h2>เรื่องที่อยากถาม <span class="mute">(ไม่บังคับ)</span></h2>
<div class="chips">${TOPICS.map(t => `<button class="chip ${topics.includes(t) ? "on" : ""}" data-act="topic" data-id="${t}">${t}</button>`).join("")}</div>
<textarea id="note" rows="2" placeholder="เช่น กำลังหาสว่านไร้สายไว้ใช้ในบ้าน">${esc(note)}</textarea>
<p class="mute" style="margin-top:8px">📍 พนักงานจะเดินไปหาที่ ${zl(zone)}</p>
<button class="btn warm" data-act="send">เรียกพนักงาน</button>`;
}

function wait() {
  const c = cur();
  if (!c) return home();
  const st = c.status,
    s = S(c.staff),
    idx = { waiting: 0, coming: 1, arrived: 2, served: 3 }[st] ?? 0;
  const steps = `<div class="steps">${[0, 1, 2].map(i => `<i class="${i <= idx ? "on" : ""}"></i>`).join("")}</div><p class="mute center">ส่งคำเรียก → พนักงานกำลังมา → ถึงตัวคุณ</p>`;
  const where = `<div class="card center">📍 ตำแหน่งของคุณ<br><b>${zl(c.zone)}</b></div>`;

  if (st === "cancelled") {
    return `<div class="pulse">🙂</div><h1 class="center">ยกเลิกคำเรียกแล้ว</h1><button class="btn" data-act="done">กลับหน้าหลัก</button>`;
  }
  if (st === "served") {
    return `<div class="pulse">💚</div><h1 class="center">ขอบคุณที่ใช้บริการครับ</h1>${c.rating ? `<p class="center mute">ให้คะแนน ${c.rating} ดาว</p>` : ""}<button class="btn" data-act="done">กลับหน้าหลัก</button>`;
  }
  if (st === "arrived") {
    return `<div class="pulse">🙌</div><h1 class="center">${s.n} มาถึงแล้ว</h1>
<p class="center mute">รอเวลา ${mmss(c.arriveTs - c.callTs)} นาที</p>
${c.rating ? `<p class="center">ขอบคุณสำหรับคะแนนครับ</p>` : `<h2 class="center">วันนี้บริการเป็นอย่างไรบ้าง</h2><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-act="rate" data-id="${n}" aria-label="${n} ดาว">⭐</button>`).join("")}</div>`}${steps}`;
  }

  return `<div class="pulse">${st === "coming" ? "🚶" : "📡"}</div>
<h1 class="center">${st === "coming" ? "รอสักครู่ พนักงานกำลังมาถึงตัวคุณ" : "ส่งคำเรียกแล้ว"}</h1>
<p class="center mute">${st === "coming" ? esc(s.n) + " กำลังเดินไปหาคุณ" : "กำลังแจ้ง" + (c.target === "any" ? "พนักงานแผนก" + D(c.dept).n : esc(S(c.target).n)) + " รอรับเรื่องสักครู่"}</p>
<div class="timer" data-since="${c.callTs}">00:00</div><p class="center mute">เวลาที่รอ</p>
${where}${steps}<button class="btn ghost" data-act="cancel">ยกเลิกการเรียก</button>`;
}

function login() {
  return `<div class="top">${logo}<a href="#">หน้าแรก</a></div><h1>พนักงานคนไหนครับ</h1><p class="mute">เลือกชื่อของคุณ ระบบจะพาไปหน้าของแผนกตัวเอง</p>
${DEPTS.map(d => `<h2>${d.ic} ${d.n}</h2>${STAFF.filter(s => s.dept === d.id).map(s => `<button class="opt" data-act="login" data-id="${s.id}"><span class="av">${s.n.slice(3, 4)}</span><b>${s.n}</b></button>`).join("")}`).join("")}`;
}

function job(c, btn) {
  return `<div class="card"><span class="tag">${D(c.dept).n}</span> <span class="mute">${c.target === "any" ? "เรียกทั้งแผนก" : c.target === me ? "เรียกคุณโดยตรง" : ""}</span>
<div class="loc" style="font-size:22px">📍 ${zl(c.zone)}</div>
${c.topic || c.note ? `<p>${esc([c.topic, c.note].filter(Boolean).join(" · "))}</p>` : ""}
<p class="mute">ลูกค้ารอมาแล้ว <b class="timer" style="font-size:inherit" data-since="${c.callTs}"></b></p>${btn}</div>`;
}

function staff() {
  const m = S(me),
    on = (data.st[me] || {}).on !== false,
    all = Object.values(data.calls);
  const mine = all.filter(c => c.staff === me && (c.status === "coming" || c.status === "arrived"));
  const waitingL = all.filter(c => relevant(c)).sort((a, b) => a.callTs - b.callTs);
  const served = all.filter(c => c.staff === me && c.status === "served"),
    avg = served.length ? served.reduce((t, c) => t + (c.arriveTs - c.callTs), 0) / served.length / 60000 : 0;

  return `<div class="top">${logo}<button class="back" data-act="logout">สลับผู้ใช้</button></div>
<div class="card sw"><div style="display:flex;gap:12px;align-items:center"><span class="av">${m.n.slice(3, 4)}</span><div><b>${m.n}</b><br><span class="mute">แผนก${D(m.dept).n}</span></div></div>
<button class="tog ${on ? "" : "off"}" data-act="toggle">${on ? "ว่างอยู่" : "พักอยู่"}</button></div>
<div class="stat"><div class="card"><b>${served.length}</b><span class="mute">ช่วยแล้ววันนี้</span></div><div class="card"><b>${avg ? avg.toFixed(1) : "–"}</b><span class="mute">นาทีที่ลูกค้ารอ</span></div></div>
${mine.length ? `<h2>งานของฉัน</h2>` + mine.map(c => job(c, c.status === "coming" ? `<button class="btn" data-act="arrive" data-id="${c.id}">ถึงตัวลูกค้าแล้ว</button>` : `<button class="btn" data-act="finish" data-id="${c.id}">ช่วยเสร็จแล้ว ปิดงาน</button>`)).join("") : ""}
<h2>ลูกค้ารอคุณอยู่</h2>
${waitingL.length ? waitingL.map(c => job(c, `<button class="btn warm" data-act="accept" data-id="${c.id}">รับเรื่อง · ไปหาลูกค้า</button>`)).join("") : `<div class="card center mute" style="padding:28px 16px">☕ ยังไม่มีลูกค้าเรียก<br>เมื่อมีคนกดเรียก จะมีแจ้งเตือนเด้งขึ้นที่หน้านี้ทันที</div>`}`;
}

function alertHtml() {
  const c = data.calls[alerts[0]];
  if (!c) return "";
  return `<div class="modal" role="alertdialog"><div class="sheet"><div style="font-size:48px">🔔</div><h1>มีลูกค้าเรียก!</h1>
<div class="loc">📍 ${ZONES[c.zone].n}</div><p class="mute">${ZONES[c.zone].d}</p>
${c.topic || c.note ? `<p>${esc([c.topic, c.note].filter(Boolean).join(" · "))}</p>` : ""}
<p class="mute">${c.target === me ? "เรียกคุณโดยตรง" : "เรียกทั้งแผนก" + D(c.dept).n}</p>
<button class="btn warm" data-act="accept" data-id="${c.id}">รับเรื่อง · ไปเลย</button><button class="btn ghost" data-act="later">ไว้ก่อน</button></div></div>`;
}

function render() {
  if (!app) app = document.getElementById("app");
  if (!app) return;
  const v = { landing, home, pick, wait, login, staff }[view] || landing;
  app.innerHTML = v() + (view === "staff" && alerts.length ? alertHtml() : "") + `<div class="foot">${mode === "live" ? "🟢 ออนไลน์ (Firebase) · ข้อมูลซิงก์ข้ามเครื่องแบบเรียลไทม์" : "🧪 โหมดทดลอง"}</div>`;
  tick();
}

function tick() {
  document.querySelectorAll("[data-since]").forEach(e => e.textContent = mmss(Date.now() - e.dataset.since));
}
setInterval(tick, 1000);

/* ---------- การกระทำ ---------- */
const acts = {
  dept: id => {
    pickDept = id;
    pickStaff = "any";
    topics = [];
    note = "";
    view = "pick";
    render();
  },
  back: () => {
    view = "home";
    render();
  },
  who: id => {
    pickStaff = id;
    render();
  },
  topic: t => {
    topics = topics.includes(t) ? topics.filter(x => x !== t) : [...topics, t];
    render();
  },
  send: () => {
    const id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    myCall = id;
    ss("call", id);
    view = "wait";
    put("calls", id, {
      id,
      zone,
      dept: pickDept,
      target: pickStaff,
      topic: topics.join(", "),
      note: note.trim(),
      status: "waiting",
      callTs: Date.now(),
      acceptTs: null,
      arriveTs: null,
      doneTs: null,
      staff: null,
      rating: null
    });
  },
  cancel: () => put("calls", myCall, { status: "cancelled" }),
  rate: n => put("calls", myCall, { rating: +n }),
  done: () => {
    myCall = null;
    ss("call", null);
    view = "home";
    render();
  },
  login: id => {
    me = id;
    ss("me", id);
    view = "staff";
    render();
  },
  logout: () => {
    me = null;
    ss("me", null);
    alerts = [];
    view = "login";
    render();
  },
  toggle: () => put("st", me, { on: (data.st[me] || {}).on === false }),
  accept: id => {
    const c = data.calls[id];
    if (!c || c.status !== "waiting") {
      toast("มีคนรับเรื่องนี้ไปแล้วครับ");
      alerts = alerts.filter(k => k !== id);
      render();
      return;
    }
    alerts = alerts.filter(k => k !== id);
    put("calls", id, { status: "coming", staff: me, acceptTs: Date.now() });
  },
  arrive: id => put("calls", id, { status: "arrived", arriveTs: Date.now() }),
  finish: id => put("calls", id, { status: "served", doneTs: Date.now() }),
  later: () => {
    alerts = [];
    render();
  }
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const f = acts[el.dataset.act];
  f && f(el.dataset.id);
});

document.addEventListener("input", e => {
  if (e.target.id === "note") note = e.target.value;
});

document.addEventListener("change", e => {
  if (e.target.id === "zsel") location.hash = e.target.value;
});

addEventListener("hashchange", route);

/* ---------- เริ่มต้นและเชื่อมต่อ Firebase ---------- */
function init() {
  app = document.getElementById("app");
  if (typeof firebase !== "undefined") {
    try {
      const fbApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      dbh = firebase.firestore();
      if (firebaseConfig.measurementId && typeof firebase.analytics === "function") {
        try { firebase.analytics(fbApp); } catch (e) {}
      }
      mode = "live";
    } catch (e) {
      console.error("Firebase init failed:", e);
      dbh = null;
      mode = "local";
    }
  }

  sub("calls");
  sub("st");
  if (!dbh) detect();
  route();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
