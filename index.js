// public/scripts/extensions/third-party/screentime-stats/index.js
// Screen Time Stats · v0.6.0 (Stage 5) — ตัวนับเวลาจริง (ไฟล์เต็ม วางทับได้เลย)

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;
const LS_MIRROR = `${MODULE_NAME}:mirror`;
const DEMO_PREFIX = 'demo:';
const MENU_ITEM_ID = 'sts_menu_item';
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const TICK_MS = 15000;   // จังหวะบวกเวลาเข้ายอด ทุก 15 วินาที

window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 อ่านไฟล์แล้ว`);

const DEFAULTS = {
    version: 6,
    idleMinutes: 5,
    hideNames: false,
    daily: {},   // คีย์ตัวละคร → { 'YYYYMMDD(พ.ศ.)': [ms, ข้อความเรา, ข้อความบอท] }
    meta: {},    // คีย์ตัวละคร → { name, lastSeen }
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
    let serverOk = false;
    try { SillyTavern.getContext().saveSettingsDebounced(); serverOk = true; }
    catch (err) { console.warn(`${LOG} saveSettingsDebounced พลาด`, err); }
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(s)); }
    catch (err) { console.warn(`${LOG} เขียน localStorage พลาด`, err); }
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
            ms += row[0]; msg += row[1] + row[2];
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
            ms += row[0]; msg += row[1] + row[2];
        }
        if (!ms && !msg) continue;
        bucket.push({ key, name: s.meta[key]?.name || key, ms, msg });
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
            return { key: `group:${ctx.groupId}`, name: g?.name || 'กลุ่มไม่มีชื่อ' };
        }
        const ch = ctx.characters?.[ctx.characterId];
        if (ch?.avatar) return { key: ch.avatar, name: ch.name || ch.avatar };
    } catch (err) { console.warn(`${LOG} อ่านตัวละครปัจจุบันไม่ได้`, err); }
    return null;
}

/* ══════════ เขียนยอด (เวลา + ข้อความ) ══════════ */

function addTime(key, name, whenMs, ms) {
    if (ms <= 0) return;
    const s = getSettings();
    const dk = dateKey(new Date(whenMs));
    s.daily[key] = s.daily[key] || {};
    const row = s.daily[key][dk] || [0, 0, 0];
    row[0] += ms;
    s.daily[key][dk] = row;
    s.meta[key] = { name: name || s.meta[key]?.name || key, lastSeen: dk };
}

function addMsg(key, name, kind) {
    const s = getSettings();
    const dk = dateKey();
    s.daily[key] = s.daily[key] || {};
    const row = s.daily[key][dk] || [0, 0, 0];
    if (kind === 'user') row[1] += 1; else row[2] += 1;
    s.daily[key][dk] = row;
    s.meta[key] = { name: name || s.meta[key]?.name || key, lastSeen: dk };
    saveSettings();
}

/* ══════════ ★ ตัวนับเวลาจริง ══════════ */

let liveKey = null;        // ตัวละครที่กำลังนับ
let liveName = null;
let activeSince = 0;       // เวลาที่เริ่มนับช่วงนี้ (0 = ไม่ได้นับ)
let lastActivity = 0;      // เวลาที่ขยับล่าสุด
let domThrottle = 0;
let trackerReady = false;

function markActivity() {
    const now = Date.now();
    lastActivity = now;
    // ถ้าหยุดพักอยู่แล้วมีการขยับ + เปิดห้องอยู่ + จอไม่ได้ถูกซ่อน → เริ่มนับใหม่
    if (activeSince === 0 && liveKey && document.visibilityState === 'visible') {
        activeSince = now;
    }
}

function onDomActivity() {
    const now = Date.now();
    if (now - domThrottle < 3000) return;   // ลดการยิงถี่เกินไป
    domThrottle = now;
    markActivity();
}

/** บวกเวลาที่ผ่านไปเข้ายอด ตัดเที่ยงคืนให้ลงถูกวัน */
function commit(endTs) {
    if (!liveKey || activeSince === 0) return;
    let start = activeSince;
    if (endTs <= start) { activeSince = endTs; return; }
    let changed = false;
    while (endTs > start) {
        const d = new Date(start);
        const nextMid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); // เที่ยงคืนถัดไป
        const segEnd = Math.min(endTs, nextMid);
        const ms = segEnd - start;
        if (ms > 0) { addTime(liveKey, liveName, start, ms); changed = true; }
        start = segEnd;
    }
    activeSince = endTs;
    if (changed) saveSettings();
}

/** เต้นทุก 15 วิ: ถ้าว่างเกิน idle → ปิดยอดแค่ถึงตอนขยับล่าสุด ; ถ้ายัง active → บวกต่อ */
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
    commit(Date.now());     // ปิดยอดตัวเก่าก่อน
    activeSince = 0;
    const t = currentTarget();
    liveKey = t?.key || null;
    liveName = t?.name || null;
    if (liveKey && document.visibilityState === 'visible') {
        activeSince = Date.now();
        lastActivity = Date.now();
    }
    console.log(`${LOG} เปลี่ยนห้อง → ${liveName || '(ไม่มี)'} · กำลังนับ=${activeSince > 0}`);
}

function onVisibility() {
    if (document.visibilityState === 'hidden') {
        commit(Date.now());
        activeSince = 0;     // สลับแอป/ปิดจอ = หยุดทันที
    } else if (liveKey) {
        activeSince = Date.now();
        lastActivity = Date.now();
    }
}

function onMessage(kind) {
    markActivity();
    if (!liveKey) {
        const t = currentTarget();
        if (t) { liveKey = t.key; liveName = t.name; }
    }
    if (liveKey) addMsg(liveKey, liveName, kind);
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
    if (ev.MESSAGE_SENT) ctx.eventSource.on(ev.MESSAGE_SENT, () => onMessage('user'));
    if (ev.MESSAGE_RECEIVED) ctx.eventSource.on(ev.MESSAGE_RECEIVED, () => onMessage('bot'));

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('touchstart', onDomActivity, { passive: true });
    document.addEventListener('keydown', onDomActivity);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);

    setInterval(tick, TICK_MS);
    onChatChanged();   // จับตัวละครที่เปิดค้างอยู่ตอนนี้

    trackerReady = true;
    console.log(`${LOG} ⏱️ ตัวนับเวลาเริ่มทำงานแล้ว`);
    return true;
}

let trackTries = 0;
const stsTrackTimer = setInterval(() => {
    trackTries++;
    if (startTracker() || trackTries >= 120) clearInterval(stsTrackTimer);
}, 500);

/* ══════════ ข้อมูลตัวอย่าง + ปุ่มเทส ══════════ */

function bump(key, name, ms, mine, theirs) {
    const s = getSettings();
    const dk = dateKey();
    s.daily[key] = s.daily[key] || {};
    const row = s.daily[key][dk] || [0, 0, 0];
    row[0] += ms; row[1] += mine; row[2] += theirs;
    s.daily[key][dk] = row;
    s.meta[key] = { name, lastSeen: dk };
    saveSettings();
    return row;
}

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
    ];
    for (const [key, name] of cast) {
        s.daily[key] = s.daily[key] || {};
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const mins = 8 + Math.floor(Math.random() * 95);
            const mine = 3 + Math.floor(Math.random() * 45);
            s.daily[key][dateKey(d)] = [mins * 60000, mine, Math.max(1, mine - 1)];
        }
        s.meta[key] = { name, lastSeen: dateKey() };
    }
    saveSettings();
    say('ใส่ข้อมูลตัวอย่าง 7 วัน 3 ตัวละครแล้ว', 'success');
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

/* ══════════ ตัวช่วยสร้าง DOM ══════════ */

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}

function countUp(node, target, suffix = '') {
    const dur = 700;
    const t0 = performance.now();
    function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = `${Math.round(target * eased)}${suffix}`;
        if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

/* ══════════ การ์ดแต่ละใบ ══════════ */

function buildSummary(rows) {
    const totalMs = rows.reduce((a, r) => a + r.ms, 0);
    const totalMsg = rows.reduce((a, r) => a + r.msg, 0);
    const avgMin = Math.round(totalMs / 60000 / (rows.length || 1));

    const card = el('div', 'sts-card sts-hero');
    card.append(el('div', 'sts-hero-cap', 'รวม 7 วันที่ผ่านมา'));

    const big = el('div', 'sts-hero-big');
    const num = el('span', 'sts-hero-num', '0');
    big.append(num, el('span', 'sts-hero-unit', ' นาที'));
    card.append(big);
    countUp(num, Math.round(totalMs / 60000));

    const chips = el('div', 'sts-chips');
    for (const [k, v] of [['เฉลี่ย/วัน', `${avgMin} นาที`], ['ข้อความ', `${totalMsg}`]]) {
        const c = el('div', 'sts-chip');
        c.append(el('span', 'sts-chip-k', k), el('span', 'sts-chip-v', v));
        chips.append(c);
    }
    card.append(chips);
    return card;
}

function buildChart(rows) {
    const card = el('div', 'sts-card');
    card.append(el('div', 'sts-card-cap', 'รายวัน'));

    const peak = Math.max(1, ...rows.map(r => r.ms));
    const chart = el('div', 'sts-chart');

    rows.forEach((r, i) => {
        const col = el('button', 'sts-col');
        col.type = 'button';
        if (r.isToday) col.classList.add('sts-col-today');

        const tip = el('div', 'sts-tip', `${shortMinutes(r.ms)} · ${r.msg} ข้อความ`);
        const track = el('div', 'sts-track');
        const fill = el('div', 'sts-fill');
        fill.style.height = `${Math.max(3, Math.round((r.ms / peak) * 100))}%`;
        fill.style.animationDelay = `${i * 70}ms`;
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

function buildRanks(days) {
    const s = getSettings();
    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    const card = el('div', 'sts-card');
    card.append(el('div', 'sts-card-cap', 'อันดับ'));

    const tabs = el('div', 'sts-tabs');
    const wrap = el('div');
    const lists = {};

    function makeList(field) {
        const list = el('div', 'sts-ranks');
        const top = rankBy(days, field).slice(0, 5);
        if (!top.length) {
            list.append(el('div', 'sts-empty', 'ยังไม่มีข้อมูลในช่วงนี้ — กดใส่ข้อมูลตัวอย่างดูก่อนได้'));
            return { node: list, animated: true };
        }
        const peak = top[0][field] || 1;
        top.forEach((r, i) => {
            const row = el('div', 'sts-rank');
            row.append(el('div', 'sts-medal', medals[i]));

            const mid = el('div', 'sts-rank-mid');
            mid.append(el('div', 'sts-rank-name', s.hideNames ? `ตัวละคร ${i + 1}` : r.name));

            const bar = el('div', 'sts-rank-track');
            const f = el('div', 'sts-rank-fill');
            f.style.animation = 'none';
            f.style.transition = 'width 0.55s cubic-bezier(0.2, 1, 0.3, 1)';
            f.style.width = '0%';
            f.dataset.w = String(Math.max(4, Math.round((r[field] / peak) * 100)));
            bar.append(f);
            mid.append(bar);

            row.append(mid);
            row.append(el('div', 'sts-rank-val',
                field === 'ms' ? shortMinutes(r.ms) : `${r.msg} ข้อความ`));
            list.append(row);
        });
        return { node: list, animated: false };
    }

    function reveal(entry) {
        for (const k in lists) lists[k].node.style.display = 'none';
        entry.node.style.display = '';
        if (entry.animated) return;
        entry.animated = true;
        requestAnimationFrame(() => {
            entry.node.querySelectorAll('.sts-rank-fill').forEach(f => {
                f.style.width = `${f.dataset.w || 0}%`;
            });
        });
    }

    for (const [label, field] of [['คุยนานสุด', 'ms'], ['ข้อความเยอะสุด', 'msg']]) {
        const entry = makeList(field);
        entry.node.style.display = 'none';
        lists[field] = entry;
        wrap.append(entry.node);

        const b = el('button', 'sts-tab', label);
        b.type = 'button';
        b.addEventListener('click', () => {
            tabs.querySelectorAll('.sts-tab').forEach(x => x.classList.remove('sts-tab-on'));
            b.classList.add('sts-tab-on');
            reveal(entry);
        });
        tabs.append(b);
    }

    tabs.firstChild.classList.add('sts-tab-on');
    card.append(tabs, wrap);
    reveal(lists['ms']);
    return card;
}

function buildDevTools() {
    const card = el('div', 'sts-card sts-dev');
    card.append(el('div', 'sts-card-cap', 'เครื่องมือทดสอบ (จะซ่อนในเวอร์ชันจริง)'));

    // แถบสถานะการนับสด
    const counting = activeSince > 0;
    const todayMs = liveKey ? (getSettings().daily?.[liveKey]?.[dateKey()]?.[0] || 0) : 0;
    const status = el('div', 'sts-hint');
    status.textContent =
        `นับอยู่: ${liveName || '(ยังไม่ได้เปิดห้อง)'} · ${counting ? '🟢 กำลังนับ' : '⚪ หยุดพัก'} · วันนี้ ${fmtMinutes(todayMs)}`;
    card.append(status);

    const row = el('div', 'sts-btn-row');
    for (const [label, fn] of [
        ['รีเฟรชสถานะ', () => renderSheet()],
        ['＋1 นาที', () => {
            const t = currentTarget();
            if (!t) { say('เปิดห้องแชทก่อนนะครับ', 'warning'); return; }
            bump(t.key, t.name, 60000, 1, 1);
            renderSheet();
        }],
        ['ใส่ตัวอย่าง', () => { seedDemo(); renderSheet(); }],
        ['ล้างตัวอย่าง', () => { clearDemo(); renderSheet(); }],
    ]) {
        const b = el('button', 'menu_button', label);
        b.type = 'button';
        b.addEventListener('click', fn);
        row.append(b);
    }
    card.append(row);
    return card;
}

function renderSheet() {
    const body = document.getElementById('sts_body');
    if (!body) return;
    const days = lastDays(7);
    const rows = seriesByDay(days);
    body.textContent = '';
    body.append(buildSummary(rows), buildChart(rows), buildRanks(days), buildDevTools());
}

/* ══════════ เปิด / ปิดแผ่น — ใช้ <dialog> top-layer ══════════ */

function openSheet() {
    try {
        function toOpaque(raw, fallback) {
            if (!raw) return fallback;
            raw = raw.trim();
            let m = raw.match(/rgba?\(([^)]+)\)/i);
            if (m) { const p = m[1].split(',').map(s => s.trim()); if (p.length >= 3) return `rgb(${p[0]}, ${p[1]}, ${p[2]})`; }
            m = raw.match(/hsla?\(([^)]+)\)/i);
            if (m) { const p = m[1].split(',').map(s => s.trim()); if (p.length >= 3) return `hsl(${p[0]}, ${p[1]}, ${p[2]})`; }
            if (raw[0] === '#') { let h = raw.slice(1); if (h.length === 4) h = h.slice(0, 3); else if (h.length === 8) h = h.slice(0, 6); return `#${h}`; }
            return fallback;
        }
        let tint = '';
        try { tint = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor'); }
        catch (e) { console.warn(`${LOG} อ่านสีธีมไม่ได้`, e); }
        const cardBg = toOpaque(tint, '#1e1e26');

        if (!document.getElementById('sts_dialog_css')) {
            const st = document.createElement('style');
            st.id = 'sts_dialog_css';
            st.textContent = '#sts_dialog::backdrop{background:rgba(0,0,0,0.6)}';
            document.head.append(st);
        }

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
                'padding:0', 'border:none', 'border-radius:22px', 'overflow:hidden',
                `background:${cardBg}`, 'opacity:1',
                'color:var(--SmartThemeBodyColor, #eee)',
                'box-shadow:0 20px 60px rgba(0,0,0,0.55)',
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
            title.style.cssText = 'font-size:1.1em;font-weight:600';
            const btnX = document.createElement('button');
            btnX.type = 'button';
            btnX.textContent = '✕ ปิด';
            btnX.style.cssText = [
                'flex:0 0 auto', 'cursor:pointer', 'padding:8px 14px', 'border-radius:999px',
                'font-size:0.9em', 'font-weight:600', 'border:none',
                'background:var(--SmartThemeQuoteColor, #8ab4ff)',
                'color:var(--SmartThemeBlurTintColor, #111)',
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

        console.log(`${LOG} ✅ openSheet · dialog(top-layer) · bg=${cardBg}`);
    } catch (err) {
        console.error(`${LOG} ❌ openSheet ล้ม`, err);
        if (typeof toastr !== 'undefined') toastr.error(String(err?.message || err), 'STS เปิดกราฟไม่ได้');
    }
}

function closeSheet() {
    const dlg = document.getElementById('sts_dialog');
    if (!dlg) return;
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.style.display = 'none';
}

/* ══════════ ทางเข้า: เมนูไม้กายสิทธิ์ (ไล่หา 4 ชั้น) ══════════ */

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
    console.log(`${LOG} ✅ ใส่บรรทัดในเมนูแล้ว (${reason}) · host=${menu.id || menu.className}`);
    return true;
}

let entryTries = 0;
const stsEntryTimer = setInterval(() => {
    entryTries++;
    if (mountMenuItem(`รอบที่ ${entryTries}`) || entryTries >= 60) {
        clearInterval(stsEntryTimer);
        if (!document.getElementById(MENU_ITEM_ID)) {
            console.warn(`${LOG} ⚠️ ยังหาเมนูไม่เจอ — รอดักตอนกดปุ่มไม้กายสิทธิ์แทน`);
        }
    }
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

/* ══════════ คำสั่งเรียกมือ + ตรวจอาการ ══════════ */

window.STS_OPEN = openSheet;
window.STS_CLOSE = closeSheet;
window.STS_FINDMENU = () => {
    const m = findMenu();
    console.log(`${LOG} findMenu →`, m);
    return m ? (m.id || m.className) : 'ไม่เจอ';
};
window.STS_TRACK = () => {
    const now = Date.now();
    const out = {
        ตัวละครที่นับอยู่: liveName || '(ไม่มี)',
        กำลังนับ: activeSince > 0,
        นับมาแล้ววินาที: activeSince > 0 ? Math.round((now - activeSince) / 1000) : 0,
        ว่างมาแล้ววินาที: lastActivity ? Math.round((now - lastActivity) / 1000) : '-',
        หน้าจอ: document.visibilityState,
        idleนาที: getSettings().idleMinutes,
        ตัวละครในฐานข้อมูล: Object.keys(getSettings().daily).length,
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
      <div class="sts-stage-tag">Stage 5 · v0.6.0</div>

      <label class="sts-field-label" for="sts_idle">
        หยุดนับเมื่อไม่มีการขยับนาน
        <span id="sts_idle_out" class="sts-value-pill">5 นาที</span>
      </label>
      <input id="sts_idle" class="sts-range" type="range" min="1" max="60" step="1" value="5">

      <label class="sts-check">
        <input id="sts_hide" type="checkbox">
        <span>ซ่อนชื่อตัวละครในอันดับ (สำหรับตอนแคปแชร์)</span>
      </label>

      <hr class="sysHR">
      <input id="sts_btn_open" class="menu_button" type="button" value="เปิดหน้ากราฟ">
      <p class="sts-hint">ปกติเรียกจากไอคอนไม้กายสิทธิ์ → "เวลาบนหน้าจอ" · ตัวนับเวลาเดินเองแล้ว</p>
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
