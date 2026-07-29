// public/scripts/extensions/third-party/screentime-stats/index.js
// Stage 3 — ปุ่มเทสโครงข้อมูลรายวัน + ระบุคีย์ตัวละคร (ยังไม่นับเวลาอัตโนมัติ)

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;
const LS_MIRROR = `${MODULE_NAME}:mirror`;
const DEMO_PREFIX = 'demo:';

window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 ไฟล์ถูกอ่านแล้ว`);

const DEFAULTS = {
    version: 3,
    idleMinutes: 5,
    daily: {},   // คีย์ตัวละคร → { 'YYYYMMDD(พ.ศ.)': [ms, ข้อความเรา, ข้อความบอท] }
    meta: {},    // คีย์ตัวละคร → { name, lastSeen }
};

/* ---------- store ---------- */

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
    try {
        SillyTavern.getContext().saveSettingsDebounced();
        serverOk = true;
    } catch (err) {
        console.warn(`${LOG} saveSettingsDebounced พลาด`, err);
    }
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(s)); }
    catch (err) { console.warn(`${LOG} เขียน localStorage พลาด`, err); }
    console.log(`${LOG} saved · server=${serverOk} · keys=${Object.keys(s.daily).length}`);
}

/* ---------- วันที่ + ตัวละคร ---------- */

function dateKey(d = new Date()) {
    const y = d.getFullYear() + 543;              // เก็บเป็น พ.ศ. อ่านง่ายเวลา debug
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

/** ใครอยู่ในหน้าแชทตอนนี้ — คีย์ = ชื่อไฟล์ avatar เพราะเปลี่ยนชื่อการ์ดแล้วสถิติไม่ขาด */
function currentTarget() {
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.groupId) {
            const g = (ctx.groups || []).find(x => String(x.id) === String(ctx.groupId));
            return { key: `group:${ctx.groupId}`, name: g?.name || 'กลุ่มไม่มีชื่อ' };
        }
        const ch = ctx.characters?.[ctx.characterId];
        if (ch?.avatar) return { key: ch.avatar, name: ch.name || ch.avatar };
    } catch (err) {
        console.warn(`${LOG} อ่านตัวละครปัจจุบันไม่ได้`, err);
    }
    return null;
}

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

function todayTotals() {
    const s = getSettings();
    const dk = dateKey();
    let ms = 0, mine = 0, theirs = 0, cast = 0;
    for (const key of Object.keys(s.daily)) {
        const row = s.daily[key]?.[dk];
        if (!row) continue;
        ms += row[0]; mine += row[1]; theirs += row[2]; cast++;
    }
    return { ms, mine, theirs, cast };
}

function fmtMinutes(ms) {
    const total = Math.round(ms / 60000);
    const h = Math.floor(total / 60), m = total % 60;
    return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

function say(msg, type = 'info') {
    if (typeof toastr !== 'undefined' && toastr[type]) toastr[type](msg, 'Screen Time Stats');
    console.log(`${LOG} ${msg}`);
}

/* ---------- ข้อมูลตัวอย่าง ---------- */

function seedDemo() {
    const s = getSettings();
    const cast = [[`${DEMO_PREFIX}mira`, 'Mira'], [`${DEMO_PREFIX}kite`, 'ไคท์'], [`${DEMO_PREFIX}noon`, 'นุ่น']];
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

/* ---------- UI ---------- */

const PANEL_HTML = `
<div class="sts-settings" id="sts_panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>⏱️ Screen Time Stats</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="sts-stage-tag">Stage 3 · เทสโครงข้อมูล</div>

      <label class="sts-field-label" for="sts_idle">
        หยุดนับเมื่อไม่มีการขยับนาน
        <span id="sts_idle_out" class="sts-value-pill">5 นาที</span>
      </label>
      <input id="sts_idle" class="sts-range" type="range" min="1" max="60" step="1" value="5">
      <p class="sts-hint">สลับไปแอปอื่นหยุดนับทันที ไม่รอครบเวลานี้</p>

      <hr class="sysHR">
      <div class="sts-btn-row">
        <input id="sts_btn_bump"  class="menu_button" type="button" value="＋1 นาที (เทส)">
        <input id="sts_btn_today" class="menu_button" type="button" value="ดูยอดวันนี้">
      </div>
      <div class="sts-btn-row">
        <input id="sts_btn_seed"  class="menu_button" type="button" value="ใส่ข้อมูลตัวอย่าง">
        <input id="sts_btn_wipe"  class="menu_button sts-danger" type="button" value="ล้างตัวอย่าง">
      </div>
      <p class="sts-hint">ปุ่ม ＋1 นาที เขียนลงตัวละครที่เปิดอยู่ตอนนี้ ใช้เทสว่าข้อมูลรอดข้ามรีเฟรช</p>

      <hr class="sysHR">
      <div class="sts-probe-title">สภาพเครื่องที่ตรวจได้</div>
      <div id="sts_probe" class="sts-probe">กำลังตรวจ...</div>
    </div>
  </div>
</div>`;

function probe() {
    let shareFiles = false;
    try {
        const f = new File([new Blob(['x'])], 'p.png', { type: 'image/png' });
        shareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
    } catch (err) { console.warn(`${LOG} canShare ไม่ผ่าน`, err); }
    let settingsWritable = false;
    try { settingsWritable = typeof SillyTavern.getContext().extensionSettings === 'object'; }
    catch { /* ยังไม่พร้อม */ }
    return [
        ['Secure context', window.isSecureContext === true, window.location.origin],
        ['IndexedDB', typeof window.indexedDB !== 'undefined', 'เก็บ session ดิบ'],
        ['แชร์ไฟล์ตรง', shareFiles, shareFiles ? 'ใช้ได้' : 'จะกดค้างเซฟรูปแทน'],
        ['extensionSettings', settingsWritable, 'เก็บยอดรายวัน'],
    ];
}

function paintProbe() {
    const box = document.getElementById('sts_probe');
    if (!box) return;
    box.textContent = '';
    for (const [label, ok, note] of probe()) {
        const row = document.createElement('div');
        row.className = 'sts-probe-row';
        for (const [cls, text] of [
            ['sts-probe-icon', ok ? '✅' : '⚠️'],
            ['sts-probe-label', label],
            ['sts-probe-note', note],
        ]) {
            const el = document.createElement('span');
            el.className = cls;
            el.textContent = text;
            row.append(el);
        }
        box.append(row);
    }
}

function bindSlider() {
    const s = getSettings();
    const input = document.getElementById('sts_idle');
    const out = document.getElementById('sts_idle_out');
    if (!input || !out) return;
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

function bindButtons() {
    document.getElementById('sts_btn_bump')?.addEventListener('click', () => {
        const t = currentTarget();
        if (!t) { say('ยังไม่ได้เปิดห้องแชทไหนเลย เปิดตัวละครก่อนแล้วกดอีกที', 'warning'); return; }
        const row = bump(t.key, t.name, 60000, 1, 1);
        say(`${t.name} → ${fmtMinutes(row[0])} · ${row[1] + row[2]} ข้อความ`, 'success');
        console.log(`${LOG} คีย์ที่ใช้เก็บ = ${t.key}`);
    });

    document.getElementById('sts_btn_today')?.addEventListener('click', () => {
        const { ms, mine, theirs, cast } = todayTotals();
        if (!cast) { say('วันนี้ยังไม่มียอดเลย', 'info'); return; }
        say(`วันนี้ ${fmtMinutes(ms)} · ${mine + theirs} ข้อความ · ${cast} ตัวละคร`, 'info');
    });

    document.getElementById('sts_btn_seed')?.addEventListener('click', seedDemo);
    document.getElementById('sts_btn_wipe')?.addEventListener('click', clearDemo);
}

function tryInject() {
    if (document.getElementById('sts_panel')) return true;
    const host = document.getElementById('extensions_settings2')
              || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', PANEL_HTML);
    paintProbe();
    bindSlider();
    bindButtons();
    return true;
}

let tries = 0;
console.log(`${LOG} 2/3 เริ่มมองหาช่องใส่ panel`);
const timer = setInterval(() => {
    tries++;
    if (tryInject()) {
        clearInterval(timer);
        window.STS_LOADED = 'ok';
        console.log(`${LOG} 3/3 ✅ panel ขึ้นแล้ว (รอบที่ ${tries})`);
        return;
    }
    if (tries >= 60) {
        clearInterval(timer);
        window.STS_LOADED = 'no-host';
        console.error(`${LOG} ❌ หา host element ไม่เจอใน 30 วินาที`);
    }
}, 500);
