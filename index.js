// public/scripts/extensions/third-party/screentime-stats/index.js
// Screen Time Stats · v0.8.0 (Stage 7) — ชั้นตกแต่งเต็ม ตรรกะการนับคงเดิม

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;
const LS_MIRROR = `${MODULE_NAME}:mirror`;
const DEMO_PREFIX = 'demo:';
const MENU_ITEM_ID = 'sts_menu_item';
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const TICK_MS = 5000;
const MSG_GAP_MS = 1500;

window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 อ่านไฟล์แล้ว`);

const DEFAULTS = {
    version: 8,
    idleMinutes: 5,
    hideNames: false,
    fancy: true,        // เปิด/ปิดลูกเล่นทั้งชุด
    daily: {},
    meta: {},
};

/* ══════════ ที่เก็บข้อมูล ══════════ */

function getSettings() {
    let store = null;
    try {
        const ctx = SillyTavern.getContext();
        ctx.extensionSettings[MODULE_NAME] = ctx.extensionSettings[MODULE_NAME] || {};
        store = ctx.extensionSettings[MODULE_NAME];
    } catch (err) {
        console.warn(`${LOG} อ่าน extensionSettings ไม่ได้ ใช้ localStorage แทน`, err);
    }
    if (!store) {
        try { store = JSON.parse(localStorage.getItem(LS_MIRROR)) || {}; }
        catch { store = {}; }
    }
    for (const k of Object.keys(DEFAULTS)) {
        if (store[k] === undefined) {
            const d = DEFAULTS[k];
            store[k] = (d && typeof d === 'object') ? structuredClone(d) : d;
        }
    }
    return store;
}

function saveSettings() {
    const s = getSettings();
    try { SillyTavern.getContext().saveSettingsDebounced(); }
    catch (err) { console.warn(`${LOG} saveSettingsDebounced พลาด`, err); }
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(s)); }
    catch (err) { console.warn(`${LOG} เขียน localStorage พลาด`, err); }
}

/** เครื่องผู้ใช้ขอลดการเคลื่อนไหวไหม */
function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
}

function fancyOn() {
    return getSettings().fancy && !reducedMotion();
}

/* ══════════ วันที่ + รูปแบบตัวเลข ══════════ */

function dateKey(d = new Date()) {
    const y = d.getFullYear() + 543;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

function fmtMinutes(ms) {
    const total = Math.round(ms / 60000);
    if (!total) return '0 นาที';
    const h = Math.floor(total / 60), m = total % 60;
    return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

function shortMinutes(ms) {
    const total = Math.round(ms / 60000);
    if (total < 60) return `${total}น`;
    const h = Math.floor(total / 60), m = total % 60;
    return m ? `${h}ชม${m}` : `${h}ชม`;
}

function fmtClock(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        out.push({ key: dateKey(d), dow: DOW[d.getDay()], dom: d.getDate(), isToday: i === 0 });
    }
    return out;
}

/* ══════════ รวมยอด ══════════ */

function seriesByDay(days) {
    const s = getSettings();
    return days.map(day => {
        let ms = 0, msg = 0;
        for (const key of Object.keys(s.daily)) {
            const row = s.daily[key]?.[day.key];
            if (!row) continue;
            ms += row[0]; msg += (row[1] || 0) + (row[2] || 0);
        }
        return { ...day, ms, msg };
    });
}

function rankBy(days, field) {
    const s = getSettings();
    const want = new Set(days.map(d => d.key));
    const bucket = [];
    for (const key of Object.keys(s.daily)) {
        let ms = 0, msg = 0;
        for (const dk of Object.keys(s.daily[key])) {
            if (!want.has(dk)) continue;
            const row = s.daily[key][dk];
            ms += row[0]; msg += (row[1] || 0) + (row[2] || 0);
        }
        if (!ms && !msg) continue;
        bucket.push({
            key, ms, msg,
            name: s.meta[key]?.name || key,
            avatar: s.meta[key]?.avatar || null,
        });
    }
    bucket.sort((a, b) => b[field] - a[field]);
    return bucket;
}

/* ══════════ ตัวละครที่เปิดอยู่ ══════════ */

function currentTarget() {
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.groupId) {
            const g = (ctx.groups || []).find(x => String(x.id) === String(ctx.groupId));
            return { key: `group:${ctx.groupId}`, name: g?.name || 'กลุ่มไม่มีชื่อ', avatar: null };
        }
        const ch = ctx.characters?.[ctx.characterId];
        if (ch?.avatar) return { key: ch.avatar, name: ch.name || ch.avatar, avatar: ch.avatar };
    } catch (err) { console.warn(`${LOG} อ่านตัวละครปัจจุบันไม่ได้`, err); }
    return null;
}

function avatarUrl(file) {
    if (!file) return null;
    return `characters/${encodeURIComponent(file)}`;
}

/* ══════════ เขียนยอด ══════════ */

function touchMeta(key, name, avatar) {
    const s = getSettings();
    const m = s.meta[key] || {};
    s.meta[key] = {
        name: name || m.name || key,
        avatar: avatar || m.avatar || null,
        lastSeen: dateKey(),
    };
}

function addTime(key, name, avatar, whenMs, ms) {
    if (ms <= 0) return;
    const s = getSettings();
    const dk = dateKey(new Date(whenMs));
    s.daily[key] = s.daily[key] || {};
    const row = s.daily[key][dk] || [0, 0, 0];
    row[0] += ms;
    s.daily[key][dk] = row;
    touchMeta(key, name, avatar);
}

function addBotMsg(key, name, avatar) {
    const s = getSettings();
    const dk = dateKey();
    s.daily[key] = s.daily[key] || {};
    const row = s.daily[key][dk] || [0, 0, 0];
    row[2] += 1;
    s.daily[key][dk] = row;
    touchMeta(key, name, avatar);
    saveSettings();
}

/* ══════════ ตัวนับเวลาจริง (คงเดิมทั้งก้อน) ══════════ */

let liveKey = null;
let liveName = null;
let liveAvatar = null;
let activeSince = 0;
let lastActivity = 0;
let domThrottle = 0;
let trackerReady = false;
let lastMsgStamp = 0;
let seenMsgIds = new Set();

function markActivity() {
    const now = Date.now();
    lastActivity = now;
    if (activeSince === 0 && liveKey && document.visibilityState === 'visible') {
        activeSince = now;
        console.log(`${LOG} ▶ นับต่อ ${liveName}`);
    }
}

function onDomActivity() {
    const now = Date.now();
    if (now - domThrottle < 3000) return;
    domThrottle = now;
    markActivity();
}

function commit(endTs) {
    if (!liveKey || activeSince === 0) return;
    let start = activeSince;
    if (endTs <= start) { activeSince = endTs; return; }
    let changed = false;
    while (endTs > start) {
        const d = new Date(start);
        const nextMid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const segEnd = Math.min(endTs, nextMid);
        const ms = segEnd - start;
        if (ms > 0) { addTime(liveKey, liveName, liveAvatar, start, ms); changed = true; }
        start = segEnd;
    }
    activeSince = endTs;
    if (changed) saveSettings();
}

function tick() {
    if (!liveKey || activeSince === 0) return;
    const now = Date.now();
    const idleMs = Math.max(1, getSettings().idleMinutes) * 60000;
    if (now - lastActivity > idleMs) {
        commit(lastActivity);
        activeSince = 0;
        console.log(`${LOG} ⏸ ว่างเกิน ${getSettings().idleMinutes} นาที — หยุดนับ ${liveName}`);
    } else {
        commit(now);
    }
}

function onChatChanged() {
    commit(Date.now());
    activeSince = 0;
    seenMsgIds = new Set();
    const t = currentTarget();
    liveKey = t?.key || null;
    liveName = t?.name || null;
    liveAvatar = t?.avatar || null;
    if (liveKey && document.visibilityState === 'visible') {
        activeSince = Date.now();
        lastActivity = Date.now();
    }
    console.log(`${LOG} เปลี่ยนห้อง → ${liveName || '(ไม่มี)'} · กำลังนับ=${activeSince > 0}`);
}

function onVisibility() {
    if (document.visibilityState === 'hidden') {
        commit(Date.now());
        activeSince = 0;
    } else if (liveKey) {
        activeSince = Date.now();
        lastActivity = Date.now();
    }
}

function fingerprintLastBotMsg() {
    try {
        const chat = SillyTavern.getContext()?.chat;
        if (!Array.isArray(chat) || !chat.length) return null;
        const idx = chat.length - 1;
        const m = chat[idx];
        if (!m || m.is_user) return null;
        if (m.is_system) return null;
        const text = String(m.mes || '');
        if (!text.trim()) return null;
        const swipeCount = Array.isArray(m.swipes) ? m.swipes.length : 0;
        return `${idx}|${swipeCount}|${text.length}|${text.slice(0, 24)}|${text.slice(-24)}`;
    } catch (err) {
        console.warn(`${LOG} ทำลายนิ้วมือข้อความไม่ได้`, err);
        return null;
    }
}

function onBotMessage() {
    markActivity();
    if (!liveKey) {
        const t = currentTarget();
        if (t) { liveKey = t.key; liveName = t.name; liveAvatar = t.avatar; }
    }
    if (!liveKey) return;

    const now = Date.now();
    if (now - lastMsgStamp < MSG_GAP_MS) {
        console.log(`${LOG} ✋ ข้อความถี่เกินไป ไม่นับ`);
        return;
    }

    const fp = fingerprintLastBotMsg();
    if (!fp) { console.log(`${LOG} ✋ ไม่ใช่ข้อความบอทใหม่ ไม่นับ`); return; }
    if (seenMsgIds.has(fp)) { console.log(`${LOG} ✋ ข้อความซ้ำ (ปัด/รีเจน) ไม่นับ`); return; }

    seenMsgIds.add(fp);
    if (seenMsgIds.size > 400) seenMsgIds = new Set([...seenMsgIds].slice(-200));
    lastMsgStamp = now;
    addBotMsg(liveKey, liveName, liveAvatar);
    console.log(`${LOG} 💬 นับข้อความบอท +1 (${liveName})`);
}

function flushNow() {
    commit(Date.now());
    activeSince = 0;
    saveSettings();
}

function startTracker() {
    if (trackerReady) return true;
    let ctx;
    try { ctx = SillyTavern.getContext(); } catch { return false; }
    if (!ctx?.eventSource || !ctx?.event_types) return false;

    const ev = ctx.event_types;
    if (ev.CHAT_CHANGED) ctx.eventSource.on(ev.CHAT_CHANGED, onChatChanged);
    if (ev.CHARACTER_MESSAGE_RENDERED) ctx.eventSource.on(ev.CHARACTER_MESSAGE_RENDERED, onBotMessage);
    else if (ev.MESSAGE_RECEIVED) ctx.eventSource.on(ev.MESSAGE_RECEIVED, onBotMessage);
    if (ev.MESSAGE_SENT) ctx.eventSource.on(ev.MESSAGE_SENT, markActivity);

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('touchstart', onDomActivity, { passive: true });
    document.addEventListener('keydown', onDomActivity);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);

    setInterval(tick, TICK_MS);
    onChatChanged();

    trackerReady = true;
    console.log(`${LOG} ⏱️ ตัวนับเวลาเริ่มทำงานแล้ว (เขียนทุก ${TICK_MS / 1000} วิ)`);
    return true;
}

let trackTries = 0;
const stsTrackTimer = setInterval(() => {
    trackTries++;
    if (startTracker() || trackTries >= 120) clearInterval(stsTrackTimer);
}, 500);

/* ══════════ ข้อมูลตัวอย่าง ══════════ */

function say(msg, type = 'info') {
    if (typeof toastr !== 'undefined' && toastr[type]) toastr[type](msg, 'Screen Time Stats');
    console.log(`${LOG} ${msg}`);
}

function seedDemo() {
    const s = getSettings();
    const cast = [
        [`${DEMO_PREFIX}mira`, 'Mira'],
        [`${DEMO_PREFIX}kite`, 'ไคท์'],
        [`${DEMO_PREFIX}noon`, 'นุ่น'],
        [`${DEMO_PREFIX}rin`, 'ริน'],
        [`${DEMO_PREFIX}ozzy`, 'ออซซี่'],
    ];
    for (const [key, name] of cast) {
        s.daily[key] = s.daily[key] || {};
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const mins = 8 + Math.floor(Math.random() * 95);
            s.daily[key][dateKey(d)] = [mins * 60000, 0, 2 + Math.floor(Math.random() * 40)];
        }
        s.meta[key] = { name, avatar: null, lastSeen: dateKey() };
    }
    saveSettings();
    say('ใส่ข้อมูลตัวอย่าง 7 วัน 5 ตัวละครแล้ว', 'success');
}

function clearDemo() {
    const s = getSettings();
    let n = 0;
    for (const key of Object.keys(s.daily)) {
        if (key.startsWith(DEMO_PREFIX)) { delete s.daily[key]; delete s.meta[key]; n++; }
    }
    saveSettings();
    say(`ล้างข้อมูลตัวอย่างแล้ว ${n} ตัว (ข้อมูลจริงไม่โดน)`, 'success');
}

/* ══════════ ★ ชั้นตกแต่ง: CSS keyframes ══════════ */

const FX_CSS = `
@keyframes sts-fx-rise{
  0%{opacity:0;transform:translateY(16px) scale(0.97)}
  60%{opacity:1;transform:translateY(-3px) scale(1.006)}
  100%{opacity:1;transform:none}
}
@keyframes sts-fx-grow{
  0%{transform:scaleY(0)}
  70%{transform:scaleY(1.06)}
  100%{transform:scaleY(1)}
}
@keyframes sts-fx-sweep{
  0%{background-position:-160% 0}
  100%{background-position:260% 0}
}
@keyframes sts-fx-breathe{
  0%,100%{box-shadow:0 0 0 0 rgba(127,127,127,0)}
  50%{box-shadow:0 0 16px 2px var(--sts-accent, #8ab4ff)}
}
@keyframes sts-fx-bob{
  0%,100%{transform:translateY(0) rotate(-4deg)}
  50%{transform:translateY(-5px) rotate(4deg)}
}
@keyframes sts-fx-blink{
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:0.35;transform:scale(0.78)}
}
@keyframes sts-fx-fall{
  0%{opacity:0;transform:translateY(-24px) rotate(0deg)}
  12%{opacity:1}
  100%{opacity:0;transform:translateY(150px) rotate(420deg)}
}
@keyframes sts-fx-pop{
  0%{transform:scale(1)}
  45%{transform:scale(1.16)}
  100%{transform:scale(1)}
}
.sts-fx-card{animation:sts-fx-rise 0.52s cubic-bezier(0.2,1.2,0.3,1) both}
.sts-fx-press{transition:transform 0.14s cubic-bezier(0.2,1.2,0.3,1)}
.sts-fx-press:active{transform:scale(0.96)}
.sts-fx-shine{
  background-image:linear-gradient(105deg,
    rgba(255,255,255,0) 38%,
    rgba(255,255,255,0.34) 50%,
    rgba(255,255,255,0) 62%);
  background-size:220% 100%;
  background-repeat:no-repeat;
  animation:sts-fx-sweep 3.4s linear infinite;
}
.sts-fx-crown{animation:sts-fx-bob 2.6s ease-in-out infinite}
.sts-fx-dot{animation:sts-fx-blink 1.15s ease-in-out infinite}
.sts-fx-glow{animation:sts-fx-breathe 2.8s ease-in-out infinite}
.sts-fx-confetti{position:absolute;border-radius:2px;pointer-events:none;
  animation:sts-fx-fall 1.5s cubic-bezier(0.3,0.7,0.4,1) forwards}
@media (prefers-reduced-motion: reduce){
  .sts-fx-card,.sts-fx-shine,.sts-fx-crown,.sts-fx-dot,.sts-fx-glow,.sts-fx-confetti{
    animation:none !important}
}
`;

function ensureFx() {
    if (document.getElementById('sts_fx_css')) return;
    const st = document.createElement('style');
    st.id = 'sts_fx_css';
    st.textContent = FX_CSS + '#sts_dialog::backdrop{background:rgba(0,0,0,0.62)}';
    document.head.append(st);
}

/** อ่านสีเน้นจากธีมมาใช้ซ้ำได้ทั้งไฟล์ */
function themeColor(varName, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return v || fallback;
    } catch { return fallback; }
}

/* ══════════ ตัวช่วยสร้าง DOM ══════════ */

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}

/** การ์ดพร้อมสปริงเข้าเป็นลำดับ */
function fxCard(order = 0) {
    const card = el('div', 'sts-card');
    if (fancyOn()) {
        card.classList.add('sts-fx-card');
        card.style.animationDelay = `${order * 70}ms`;
    }
    return card;
}

function countUp(node, target, suffix = '') {
    if (!fancyOn()) { node.textContent = `${target}${suffix}`; return; }
    const dur = 900;
    const t0 = performance.now();
    function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        node.textContent = `${Math.round(target * eased)}${suffix}`;
        if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function avatarNode(entry, size, ringColor, glow) {
    const box = el('div');
    box.style.cssText = [
        `width:${size}px`, `height:${size}px`, 'border-radius:50%',
        'overflow:hidden', 'flex:0 0 auto', 'position:relative',
        'display:flex', 'align-items:center', 'justify-content:center',
        `border:2px solid ${ringColor}`,
        'background:rgba(127,127,127,0.18)',
        `font-size:${Math.round(size / 2.4)}px`, 'font-weight:700',
        'box-shadow:0 5px 16px rgba(0,0,0,0.32)',
    ].join(';');
    if (glow && fancyOn()) {
        box.style.setProperty('--sts-accent', ringColor);
        box.classList.add('sts-fx-glow');
    }

    const url = avatarUrl(entry.avatar);
    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        img.addEventListener('error', () => {
            img.remove();
            box.textContent = (entry.name || '?').trim().charAt(0).toUpperCase();
        });
        box.append(img);
    } else {
        box.textContent = (entry.name || '?').trim().charAt(0).toUpperCase();
    }
    return box;
}

/** เกล็ดฉลองร่วงเหนือโพเดียม ลบตัวเองหลังเล่นจบ */
function dropConfetti(host, count = 14) {
    if (!fancyOn()) return;
    const accent = themeColor('--SmartThemeQuoteColor', '#8ab4ff');
    const second = themeColor('--SmartThemeEmColor', '#c8a2ff');
    const palette = [accent, second, '#ffd45e', '#c0c6d4'];
    for (let i = 0; i < count; i++) {
        const bit = el('div', 'sts-fx-confetti');
        const w = 4 + Math.round(Math.random() * 4);
        bit.style.cssText = [
            `width:${w}px`, `height:${w + Math.round(Math.random() * 6)}px`,
            `left:${6 + Math.random() * 88}%`, 'top:0',
            `background:${palette[i % palette.length]}`,
            `animation-delay:${Math.random() * 520}ms`,
            `opacity:0`,
        ].join(';');
        bit.addEventListener('animationend', () => bit.remove());
        host.append(bit);
    }
}

/* ══════════ การ์ด: นาฬิกาเดินสด ══════════ */

let liveTimer = null;

function buildLive() {
    const accent = themeColor('--SmartThemeQuoteColor', '#8ab4ff');
    const card = fxCard(0);
    card.append(el('div', 'sts-card-cap', 'กำลังนับอยู่'));

    const rowTop = el('div');
    rowTop.style.cssText = 'display:flex;align-items:center;gap:12px';

    const who = el('div');
    who.style.cssText = 'flex:1 1 auto;min-width:0';
    const nameLine = el('div', null, liveName || 'ยังไม่ได้เปิดห้องแชท');
    nameLine.style.cssText = 'font-size:0.95em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

    const stateWrap = el('div');
    stateWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px';
    const dot = el('div');
    dot.id = 'sts_live_dot';
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:0 0 auto';
    const stateLine = el('div', 'sts-hint');
    stateLine.id = 'sts_live_state';
    stateLine.style.cssText = 'margin:0';
    stateWrap.append(dot, stateLine);

    who.append(nameLine, stateWrap);

    const clock = el('div');
    clock.id = 'sts_live_clock';
    clock.style.cssText = [
        'flex:0 0 auto', 'font-size:1.75em', 'font-weight:700', 'line-height:1',
        'font-variant-numeric:tabular-nums', `color:${accent}`,
    ].join(';');
    clock.textContent = '0:00';

    rowTop.append(who, clock);
    card.append(rowTop);

    let lastSec = -1;
    function paint() {
        const c = document.getElementById('sts_live_clock');
        const st = document.getElementById('sts_live_state');
        const d = document.getElementById('sts_live_dot');
        if (!c || !st || !d) { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } return; }

        const saved = liveKey ? (getSettings().daily?.[liveKey]?.[dateKey()]?.[0] || 0) : 0;
        const pending = activeSince > 0 ? (Date.now() - activeSince) : 0;
        const totalSec = Math.floor((saved + pending) / 1000);
        c.textContent = fmtClock(saved + pending);

        // เต้นเบา ๆ ทุกครั้งที่วินาทีเปลี่ยน
        if (fancyOn() && totalSec !== lastSec && activeSince > 0) {
            c.style.animation = 'none';
            void c.offsetWidth;
            c.style.animation = 'sts-fx-pop 0.3s ease';
        }
        lastSec = totalSec;

        const counting = activeSince > 0;
        d.style.background = counting ? '#4ade80' : 'rgba(127,127,127,0.5)';
        d.classList.toggle('sts-fx-dot', counting && fancyOn());

        const msgs = liveKey ? (getSettings().daily?.[liveKey]?.[dateKey()]?.[2] || 0) : 0;
        st.textContent = `${counting ? 'กำลังนับ' : 'หยุดพัก'} · วันนี้ ${msgs} ข้อความจากบอท`;
    }
    paint();
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(paint, 1000);

    return card;
}

/* ══════════ การ์ด: สรุป ══════════ */

function buildSummary(rows) {
    const accent = themeColor('--SmartThemeQuoteColor', '#8ab4ff');
    const second = themeColor('--SmartThemeEmColor', '#c8a2ff');
    const totalMs = rows.reduce((a, r) => a + r.ms, 0);
    const totalMsg = rows.reduce((a, r) => a + r.msg, 0);
    const avgMin = Math.round(totalMs / 60000 / (rows.length || 1));
    const best = rows.reduce((a, r) => (r.ms > a.ms ? r : a), rows[0] || { ms: 0, dow: '-' });

    const card = fxCard(1);
    card.style.background = `linear-gradient(140deg, rgba(127,127,127,0.16), rgba(127,127,127,0.06))`;
    card.append(el('div', 'sts-hero-cap', 'รวม 7 วันที่ผ่านมา'));

    const big = el('div', 'sts-hero-big');
    const num = el('span', 'sts-hero-num', '0');
    num.style.cssText = [
        'font-size:2.6em', 'font-weight:800', 'line-height:1',
        'font-variant-numeric:tabular-nums',
        `background:linear-gradient(92deg, ${accent}, ${second})`,
        '-webkit-background-clip:text', 'background-clip:text',
        '-webkit-text-fill-color:transparent',
    ].join(';');
    big.append(num, el('span', 'sts-hero-unit', ' นาที'));
    card.append(big);
    countUp(num, Math.round(totalMs / 60000));

    const chips = el('div', 'sts-chips');
    for (const [k, v] of [
        ['เฉลี่ย/วัน', `${avgMin} นาที`],
        ['ข้อความจากบอท', `${totalMsg}`],
        ['วันที่คุยเยอะสุด', `${best.dow || '-'}`],
    ]) {
        const c = el('div', 'sts-chip');
        c.style.borderRadius = '15px';
        c.append(el('span', 'sts-chip-k', k), el('span', 'sts-chip-v', v));
        chips.append(c);
    }
    card.append(chips);
    return card;
}

/* ══════════ การ์ด: กราฟรายวัน ══════════ */

function buildChart(rows) {
    const accent = themeColor('--SmartThemeQuoteColor', '#8ab4ff');
    const card = fxCard(2);
    card.append(el('div', 'sts-card-cap', 'รายวัน'));

    const peak = Math.max(1, ...rows.map(r => r.ms));
    const chart = el('div', 'sts-chart');

    rows.forEach((r, i) => {
        const col = el('button', 'sts-col');
        col.type = 'button';
        if (fancyOn()) col.classList.add('sts-fx-press');
        if (r.isToday) col.classList.add('sts-col-today');

        const tip = el('div', 'sts-tip', `${shortMinutes(r.ms)} · ${r.msg} ข้อความ`);
        const track = el('div', 'sts-track');
        const fill = el('div', 'sts-fill');
        fill.style.height = `${Math.max(3, Math.round((r.ms / peak) * 100))}%`;
        if (fancyOn()) {
            fill.style.animation = `sts-fx-grow 0.62s cubic-bezier(0.2,1.2,0.3,1) both`;
            fill.style.animationDelay = `${180 + i * 68}ms`;
            if (r.isToday) {
                fill.classList.add('sts-fx-shine');
                fill.style.setProperty('--sts-accent', accent);
            }
        }
        track.append(fill);

        col.append(tip, track, el('div', 'sts-dow', r.dow));
        col.addEventListener('click', () => {
            const on = col.classList.contains('sts-open');
            chart.querySelectorAll('.sts-col').forEach(c => c.classList.remove('sts-open'));
            if (!on) col.classList.add('sts-open');
        });
        chart.append(col);
    });

    card.append(chart);
    return card;
}

/* ══════════ การ์ด: โพเดียมอันดับ ══════════ */

function buildPodium(days) {
    const s = getSettings();
    const accent = themeColor('--SmartThemeQuoteColor', '#8ab4ff');
    const card = fxCard(3);
    card.append(el('div', 'sts-card-cap', 'อันดับ'));

    const tabs = el('div', 'sts-tabs');
    const wrap = el('div');
    const views = {};

    const SLOTS = [
        { rank: 2, h: 54, color: '#c0c6d4', label: '2' },
        { rank: 1, h: 88, color: '#ffd45e', label: '1' },
        { rank: 3, h: 36, color: '#d99a6c', label: '3' },
    ];

    function makeView(field) {
        const view = el('div');
        const top = rankBy(days, field);
        if (!top.length) {
            view.append(el('div', 'sts-empty', 'ยังไม่มีข้อมูลในช่วงนี้ — กดใส่ข้อมูลตัวอย่างดูก่อนได้'));
            return { node: view, animated: true };
        }

        const stage = el('div');
        stage.style.cssText = [
            'position:relative', 'overflow:hidden',
            'display:flex', 'align-items:flex-end', 'justify-content:center',
            'gap:8px', 'padding:16px 0 2px',
        ].join(';');

        SLOTS.forEach((slot, order) => {
            const r = top[slot.rank - 1];
            const colWrap = el('div');
            colWrap.style.cssText = 'flex:1 1 0;display:flex;flex-direction:column;align-items:center;min-width:0';

            if (!r) {
                const ghost = el('div');
                ghost.style.cssText = [
                    'width:100%', 'border-radius:14px 14px 0 0',
                    `height:${slot.h}px`, 'background:rgba(127,127,127,0.09)',
                ].join(';');
                colWrap.append(ghost);
                stage.append(colWrap);
                return;
            }

            const nm = s.hideNames ? `ตัวละคร ${slot.rank}` : r.name;

            if (slot.rank === 1) {
                const crown = el('div', null, '👑');
                crown.style.cssText = 'font-size:1.2em;line-height:1;margin-bottom:2px';
                if (fancyOn()) crown.classList.add('sts-fx-crown');
                colWrap.append(crown);
            }

            colWrap.append(avatarNode(r, slot.rank === 1 ? 64 : 48, slot.color, slot.rank === 1));

            const name = el('div', null, nm);
            name.style.cssText = [
                'margin-top:6px', 'max-width:100%',
                `font-size:${slot.rank === 1 ? '0.9em' : '0.8em'}`, 'font-weight:700',
                'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap', 'text-align:center',
            ].join(';');
            colWrap.append(name);

            const t = el('div', null, shortMinutes(r.ms));
            t.style.cssText = [
                'font-size:0.88em', 'font-weight:700', 'font-variant-numeric:tabular-nums',
                `color:${accent}`,
            ].join(';');
            colWrap.append(t);

            const c = el('div', null, `${r.msg} ข้อความ`);
            c.style.cssText = 'font-size:0.7em;opacity:0.6;margin-bottom:7px';
            colWrap.append(c);

            const block = el('div', 'sts-podium-block');
            block.style.cssText = [
                'width:100%', 'border-radius:14px 14px 0 0',
                'height:0px', 'overflow:hidden', 'position:relative',
                'display:flex', 'align-items:center', 'justify-content:center',
                `background:linear-gradient(180deg, ${slot.color}, rgba(127,127,127,0.14))`,
                'transition:height 0.56s cubic-bezier(0.2,1.25,0.3,1)',
                `transition-delay:${order * 95}ms`,
                'box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)',
            ].join(';');
            block.dataset.h = String(slot.h);

            if (fancyOn()) {
                const shine = el('div', 'sts-fx-shine');
                shine.style.cssText = 'position:absolute;inset:0;pointer-events:none';
                shine.style.animationDelay = `${order * 420}ms`;
                block.append(shine);
            }

            const label = el('div', null, slot.label);
            label.style.cssText = 'font-size:1.1em;font-weight:800;color:rgba(0,0,0,0.55);position:relative';
            block.append(label);
            colWrap.append(block);

            stage.append(colWrap);
        });

        view.append(stage);
        view.dataset.stage = '1';

        const floor = el('div');
        floor.style.cssText = [
            'height:4px', 'border-radius:99px', 'margin-bottom:10px',
            `background:linear-gradient(90deg, transparent, ${accent}, transparent)`,
            'opacity:0.5',
        ].join(';');
        view.append(floor);

        top.slice(3, 5).forEach((r, i) => {
            const row = el('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 2px;border-radius:12px';
            if (fancyOn()) row.classList.add('sts-fx-press');
            const no = el('div', null, String(i + 4));
            no.style.cssText = 'flex:0 0 18px;text-align:center;font-size:0.8em;opacity:0.55;font-weight:700';
            row.append(no, avatarNode(r, 28, 'rgba(127,127,127,0.35)'));

            const mid = el('div');
            mid.style.cssText = 'flex:1 1 auto;min-width:0;font-size:0.82em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
            mid.textContent = s.hideNames ? `ตัวละคร ${i + 4}` : r.name;
            row.append(mid);

            const val = el('div', null, field === 'ms' ? shortMinutes(r.ms) : `${r.msg} ข้อความ`);
            val.style.cssText = 'flex:0 0 auto;font-size:0.78em;opacity:0.75;font-variant-numeric:tabular-nums';
            row.append(val);
            view.append(row);
        });

        return { node: view, animated: false };
    }

    function reveal(entry) {
        for (const k in views) views[k].node.style.display = 'none';
        entry.node.style.display = '';
        if (entry.animated) return;
        entry.animated = true;
        requestAnimationFrame(() => {
            entry.node.querySelectorAll('.sts-podium-block').forEach(b => {
                b.style.height = `${b.dataset.h || 0}px`;
            });
            const st = entry.node.querySelector('[style*="position:relative"]');
            const host = entry.node.firstElementChild;
            if (host) dropConfetti(host);
        });
    }

    for (const [label, field] of [['คุยนานสุด', 'ms'], ['ข้อความเยอะสุด', 'msg']]) {
        const entry = makeView(field);
        entry.node.style.display = 'none';
        views[field] = entry;
        wrap.append(entry.node);

        const b = el('button', 'sts-tab', label);
        b.type = 'button';
        if (fancyOn()) b.classList.add('sts-fx-press');
        b.addEventListener('click', () => {
            tabs.querySelectorAll('.sts-tab').forEach(x => x.classList.remove('sts-tab-on'));
            b.classList.add('sts-tab-on');
            reveal(entry);
        });
        tabs.append(b);
    }

    tabs.firstChild.classList.add('sts-tab-on');
    card.append(tabs, wrap);
    reveal(views['ms']);
    return card;
}

/* ══════════ การ์ด: เครื่องมือทดสอบ ══════════ */

function buildDevTools() {
    const card = fxCard(4);
    card.style.opacity = '0.78';
    card.append(el('div', 'sts-card-cap', 'เครื่องมือทดสอบ (จะซ่อนในเวอร์ชันจริง)'));
    const row = el('div', 'sts-btn-row');
    for (const [label, fn] of [
        ['วาดใหม่', () => renderSheet()],
        ['ใส่ตัวอย่าง', () => { seedDemo(); renderSheet(); }],
        ['ล้างตัวอย่าง', () => { clearDemo(); renderSheet(); }],
    ]) {
        const b = el('button', 'menu_button', label);
        b.type = 'button';
        if (fancyOn()) b.classList.add('sts-fx-press');
        b.addEventListener('click', fn);
        row.append(b);
    }
    card.append(row);
    return card;
}

function renderSheet() {
    const body = document.getElementById('sts_body');
    if (!body) return;
    ensureFx();
    const days = lastDays(7);
    const rows = seriesByDay(days);
    body.textContent = '';
    body.append(buildLive(), buildSummary(rows), buildChart(rows), buildPodium(days), buildDevTools());
}

/* ══════════ เปิด / ปิดการ์ด — <dialog> top-layer ══════════ */

function openSheet() {
    try {
        ensureFx();

        function toOpaque(raw, fallback) {
            if (!raw) return fallback;
            raw = raw.trim();
            let m = raw.match(/rgba?\(([^)]+)\)/i);
            if (m) { const p = m[1].split(',').map(x => x.trim()); if (p.length >= 3) return `rgb(${p[0]}, ${p[1]}, ${p[2]})`; }
            m = raw.match(/hsla?\(([^)]+)\)/i);
            if (m) { const p = m[1].split(',').map(x => x.trim()); if (p.length >= 3) return `hsl(${p[0]}, ${p[1]}, ${p[2]})`; }
            if (raw[0] === '#') { let h = raw.slice(1); if (h.length === 4) h = h.slice(0, 3); else if (h.length === 8) h = h.slice(0, 6); return `#${h}`; }
            return fallback;
        }
        const cardBg = toOpaque(themeColor('--SmartThemeBlurTintColor', ''), '#1e1e26');
        const accent = themeColor('--SmartThemeQuoteColor', '#8ab4ff');

        const canModal = !!window.HTMLDialogElement;
        let dlg = document.getElementById('sts_dialog');

        if (!dlg) {
            dlg = document.createElement(canModal ? 'dialog' : 'div');
            dlg.id = 'sts_dialog';
            dlg.style.cssText = [
                'position:fixed', 'inset:0', 'margin:auto',
                'width:calc(100% - 28px)', 'max-width:520px',
                'height:auto', 'max-height:calc(100% - 28px)',
                'display:flex', 'flex-direction:column', 'box-sizing:border-box',
                'padding:0', 'border:none', 'border-radius:24px', 'overflow:hidden',
                `background:${cardBg}`, 'opacity:1',
                'color:var(--SmartThemeBodyColor, #eee)',
                'box-shadow:0 22px 64px rgba(0,0,0,0.55)',
                'z-index:2147483647',
            ].join(';');

            const head = document.createElement('div');
            head.style.cssText = [
                'flex:0 0 auto', 'display:flex', 'align-items:center', 'justify-content:space-between',
                'gap:10px', 'padding:14px 16px', `background:${cardBg}`,
                'border-bottom:1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.15))',
            ].join(';');

            const title = document.createElement('div');
            title.textContent = '⏱️ เวลาบนหน้าจอ';
            title.style.cssText = 'font-size:1.12em;font-weight:700;letter-spacing:0.01em';

            const btnX = document.createElement('button');
            btnX.type = 'button';
            btnX.textContent = '✕ ปิด';
            btnX.className = fancyOn() ? 'sts-fx-press' : '';
            btnX.style.cssText = [
                'flex:0 0 auto', 'cursor:pointer', 'padding:8px 15px', 'border-radius:999px',
                'font-size:0.9em', 'font-weight:700', 'border:none',
                `background:${accent}`,
                'color:var(--SmartThemeBlurTintColor, #111)',
                'box-shadow:0 4px 14px rgba(0,0,0,0.28)',
            ].join(';');
            btnX.addEventListener('click', closeSheet);
            head.append(title, btnX);

            const body = document.createElement('div');
            body.id = 'sts_body';
            body.style.cssText = [
                'flex:1 1 auto', 'min-height:0',
                'overflow-y:auto', 'overscroll-behavior:contain', '-webkit-overflow-scrolling:touch',
                'padding:12px 16px 20px', 'box-sizing:border-box',
            ].join(';');

            dlg.append(head, body);
            document.body.append(dlg);

            dlg.addEventListener('click', ev => { if (ev.target === dlg) closeSheet(); });
            dlg.addEventListener('cancel', ev => { ev.preventDefault(); closeSheet(); });
        } else {
            dlg.style.background = cardBg;
            const head = dlg.firstElementChild;
            if (head) head.style.background = cardBg;
        }

        renderSheet();

        if (canModal && typeof dlg.showModal === 'function') {
            if (!dlg.open) dlg.showModal();
        } else {
            dlg.style.display = 'flex';
        }
        console.log(`${LOG} ✅ openSheet · fancy=${fancyOn()} · reduced=${reducedMotion()}`);
    } catch (err) {
        console.error(`${LOG} ❌ openSheet ล้ม`, err);
        if (typeof toastr !== 'undefined') toastr.error(String(err?.message || err), 'STS เปิดกราฟไม่ได้');
    }
}

function closeSheet() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    const dlg = document.getElementById('sts_dialog');
    if (!dlg) return;
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.style.display = 'none';
}

/* ══════════ ทางเข้า: เมนูไม้กายสิทธิ์ ══════════ */

function findMenu() {
    const direct = document.getElementById('extensionsMenu');
    if (direct) return direct;
    const block = document.querySelector('#extensions_menu .list-group, .extensions_block .list-group');
    if (block) return block;
    const btn = document.getElementById('extensionsMenuButton');
    if (btn) {
        let hop = btn;
        for (let i = 0; i < 3 && hop; i++) {
            const found = hop.parentElement?.querySelector('.list-group');
            if (found) return found;
            hop = hop.parentElement;
        }
    }
    return null;
}

function makeMenuItem() {
    const item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    const icon = document.createElement('div');
    icon.className = 'fa-solid fa-hourglass-half extensionsMenuExtensionButton';
    const label = document.createElement('span');
    label.textContent = 'เวลาบนหน้าจอ';
    item.append(icon, label);
    item.addEventListener('click', () => {
        try { if (window.jQuery) window.jQuery('#extensionsMenu').fadeOut(120); }
        catch (e) { console.warn(`${LOG} ปิดเมนูไม่ได้ ปล่อยให้ ST จัดการเอง`, e); }
        openSheet();
    });
    return item;
}

function mountMenuItem(reason) {
    if (document.getElementById(MENU_ITEM_ID)) return true;
    const menu = findMenu();
    if (!menu) return false;
    menu.append(makeMenuItem());
    console.log(`${LOG} ✅ ใส่บรรทัดในเมนูแล้ว (${reason})`);
    return true;
}

let entryTries = 0;
const stsEntryTimer = setInterval(() => {
    entryTries++;
    if (mountMenuItem(`รอบที่ ${entryTries}`) || entryTries >= 60) clearInterval(stsEntryTimer);
}, 500);

document.addEventListener('click', ev => {
    const hit = ev.target.closest?.('#extensionsMenuButton, .extensionsMenuButton, [id*="extensionsMenu"]');
    if (!hit) return;
    setTimeout(() => mountMenuItem('ดักตอนกด'), 60);
    setTimeout(() => mountMenuItem('ดักตอนกด รอบสอง'), 320);
}, true);

try {
    const obs = new MutationObserver(() => {
        if (findMenu() && !document.getElementById(MENU_ITEM_ID)) mountMenuItem('observer');
    });
    obs.observe(document.body, { childList: true, subtree: true });
} catch (err) {
    console.warn(`${LOG} MutationObserver ใช้ไม่ได้`, err);
}

/* ══════════ คำสั่งเรียกมือ ══════════ */

window.STS_OPEN = openSheet;
window.STS_CLOSE = closeSheet;
window.STS_TRACK = () => {
    const now = Date.now();
    const saved = liveKey ? (getSettings().daily?.[liveKey]?.[dateKey()]?.[0] || 0) : 0;
    const out = {
        ตัวละครที่นับอยู่: liveName || '(ไม่มี)',
        กำลังนับ: activeSince > 0,
        ค้างอยู่วินาที: activeSince > 0 ? Math.round((now - activeSince) / 1000) : 0,
        เขียนแล้ววันนี้: fmtClock(saved),
        ว่างมาแล้ววินาที: lastActivity ? Math.round((now - lastActivity) / 1000) : '-',
        หน้าจอ: document.visibilityState,
        idleนาที: getSettings().idleMinutes,
        ลูกเล่น: fancyOn(),
    };
    console.table(out);
    return out;
};

/* ══════════ drawer ในหน้า Extensions ══════════ */

const PANEL_HTML = `
<div class="sts-settings" id="sts_panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>⏱️ Screen Time Stats</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="sts-stage-tag">Stage 7 · v0.8.0</div>

      <label class="sts-field-label" for="sts_idle">
        หยุดนับเมื่อไม่มีการขยับนาน
        <span id="sts_idle_out" class="sts-value-pill">5 นาที</span>
      </label>
      <input id="sts_idle" class="sts-range" type="range" min="1" max="60" step="1" value="5">

      <label class="sts-check">
        <input id="sts_hide" type="checkbox">
        <span>ซ่อนชื่อตัวละครในอันดับ (สำหรับตอนแคปแชร์)</span>
      </label>

      <label class="sts-check">
        <input id="sts_fancy" type="checkbox">
        <span>เปิดลูกเล่นและอนิเมชัน</span>
      </label>

      <hr class="sysHR">
      <input id="sts_btn_open" class="menu_button" type="button" value="เปิดหน้ากราฟ">
      <p class="sts-hint">สีทุกชิ้นดึงจากธีมปัจจุบัน · เครื่องที่ตั้งลดการเคลื่อนไหวไว้จะปิดอนิเมชันเอง</p>
    </div>
  </div>
</div>`;

function bindPanel() {
    const s = getSettings();

    const input = document.getElementById('sts_idle');
    const out = document.getElementById('sts_idle_out');
    if (input && out) {
        input.value = String(s.idleMinutes);
        out.textContent = `${s.idleMinutes} นาที`;
        input.addEventListener('input', () => {
            const v = Math.min(60, Math.max(1, Number(input.value) || 5));
            out.textContent = `${v} นาที`;
            out.classList.remove('sts-pulse');
            void out.offsetWidth;
            out.classList.add('sts-pulse');
            getSettings().idleMinutes = v;
            saveSettings();
        });
    }

    const hide = document.getElementById('sts_hide');
    if (hide) {
        hide.checked = !!s.hideNames;
        hide.addEventListener('change', () => {
            getSettings().hideNames = hide.checked;
            saveSettings();
            if (document.getElementById('sts_dialog')?.open) renderSheet();
        });
    }

    const fancy = document.getElementById('sts_fancy');
    if (fancy) {
        fancy.checked = !!s.fancy;
        fancy.addEventListener('change', () => {
            getSettings().fancy = fancy.checked;
            saveSettings();
            if (document.getElementById('sts_dialog')?.open) renderSheet();
        });
    }

    document.getElementById('sts_btn_open')?.addEventListener('click', openSheet);
}

let panelTries = 0;
console.log(`${LOG} 2/3 เริ่มมองหาช่องใส่ panel`);
const stsPanelTimer = setInterval(() => {
    panelTries++;
    if (document.getElementById('sts_panel')) { clearInterval(stsPanelTimer); return; }
    const host = document.getElementById('extensions_settings2')
              || document.getElementById('extensions_settings');
    if (host) {
        host.insertAdjacentHTML('beforeend', PANEL_HTML);
        bindPanel();
        clearInterval(stsPanelTimer);
        window.STS_LOADED = 'ok';
        console.log(`${LOG} 3/3 ✅ panel ขึ้นแล้ว (รอบที่ ${panelTries})`);
        return;
    }
    if (panelTries >= 60) {
        clearInterval(stsPanelTimer);
        window.STS_LOADED = 'no-host';
        console.error(`${LOG} ❌ หา host element ไม่เจอใน 30 วินาที`);
    }
}, 500);
