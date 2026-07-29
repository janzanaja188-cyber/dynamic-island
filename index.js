// public/scripts/extensions/third-party/screentime-stats/index.js
// Stage 4 — กราฟแท่ง 7 วัน ใน popup ที่เรียกจากเมนูไม้กายสิทธิ์ (ยังไม่นับเวลาอัตโนมัติ)

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;
const LS_MIRROR = `${MODULE_NAME}:mirror`;
const DEMO_PREFIX = 'demo:';
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 ไฟล์ถูกอ่านแล้ว`);

const DEFAULTS = {
    version: 4,
    idleMinutes: 5,
    hideNames: false,
    daily: {},
    meta: {},
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
    try { SillyTavern.getContext().saveSettingsDebounced(); serverOk = true; }
    catch (err) { console.warn(`${LOG} saveSettingsDebounced พลาด`, err); }
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(s)); }
    catch (err) { console.warn(`${LOG} เขียน localStorage พลาด`, err); }
    console.log(`${LOG} saved · server=${serverOk} · keys=${Object.keys(s.daily).length}`);
}

/* ---------- วันที่ ---------- */

function dateKey(d = new Date()) {
    const y = d.getFullYear() + 543;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

function fmtMinutes(ms) {
    const total = Math.round(ms / 60000);
    const h = Math.floor(total / 60), m = total % 60;
    if (!total) return '0 นาที';
    return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

function shortMinutes(ms) {
    const total = Math.round(ms / 60000);
    if (total < 60) return `${total}น`;
    const h = Math.floor(total / 60), m = total % 60;
    return m ? `${h}ชม${m}` : `${h}ชม`;
}

/** ย้อนหลัง n วัน นับวันนี้เป็นวันสุดท้าย */
function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        out.push({ key: dateKey(d), dow: DOW[d.getDay()], dom: d.getDate(), isToday: i === 0 });
    }
    return out;
}

/* ---------- รวมยอด ---------- */

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

/* ---------- ตัวละครปัจจุบัน + ปุ่มเทส ---------- */

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

/* ---------- กราฟ ---------- */

const SHEET_HTML = `
<div class="sts-scrim" id="sts_scrim">
  <div class="sts-sheet" id="sts_sheet" role="dialog" aria-label="Screen Time Stats">
    <div class="sts-grip"></div>
    <div class="sts-sheet-head">
      <div class="sts-sheet-title">⏱️ เวลาบนหน้าจอ</div>
      <button class="sts-x" id="sts_close" aria-label="ปิด">✕</button>
    </div>
    <div class="sts-sheet-body" id="sts_body"></div>
  </div>
</div>`;

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

function buildSummary(rows) {
    const totalMs = rows.reduce((a, r) => a + r.ms, 0);
    const totalMsg = rows.reduce((a, r) => a + r.msg, 0);
    const avgMin = Math.round(totalMs / 60000 / rows.length);

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
            chart.querySelectorAll('.sts-col').forEach(c => c.classList.remove('sts-open'));
            col.classList.add('sts-open');
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
    const list = el('div', 'sts-ranks');

    function paint(field) {
        list.textContent = '';
        const top = rankBy(days, field).slice(0, 5);
        if (!top.length) { list.append(el('div', 'sts-empty', 'ยังไม่มีข้อมูลในช่วงนี้')); return; }
        const peak = top[0][field] || 1;
        top.forEach((r, i) => {
            const row = el('div', 'sts-rank');
            row.append(el('div', 'sts-medal', medals[i]));

            const mid = el('div', 'sts-rank-mid');
            const nm = s.hideNames ? `ตัวละคร ${i + 1}` : r.name;
            mid.append(el('div', 'sts-rank-name', nm));
            const bar = el('div', 'sts-rank-track');
            const f = el('div', 'sts-rank-fill');
            f.style.width = `${Math.max(4, Math.round((r[field] / peak) * 100))}%`;
            f.style.animationDelay = `${i * 60}ms`;
            bar.append(f);
            mid.append(bar);

            row.append(mid);
            row.append(el('div', 'sts-rank-val',
                field === 'ms' ? shortMinutes(r.ms) : `${r.msg} ข้อความ`));
            list.append(row);
        });
    }

    for (const [label, field] of [['คุยนานสุด', 'ms'], ['ข้อความเยอะสุด', 'msg']]) {
        const b = el('button', 'sts-tab', label);
        b.type = 'button';
        b.addEventListener('click', () => {
            tabs.querySelectorAll('.sts-tab').forEach(x => x.classList.remove('sts-tab-on'));
            b.classList.add('sts-tab-on');
            paint(field);
        });
        tabs.append(b);
    }
    tabs.firstChild.classList.add('sts-tab-on');

    card.append(tabs, list);
    paint('ms');
    return card;
}

function buildDevTools() {
    const card = el('div', 'sts-card sts-dev');
    card.append(el('div', 'sts-card-cap', 'เครื่องมือทดสอบ (จะซ่อนในเวอร์ชันจริง)'));
    const row = el('div', 'sts-btn-row');
    for (const [label, fn] of [
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

function openSheet() {
    if (!document.getElementById('sts_scrim')) {
        document.body.insertAdjacentHTML('beforeend', SHEET_HTML);
        document.getElementById('sts_close').addEventListener('click', closeSheet);
        document.getElementById('sts_scrim').addEventListener('click', ev => {
            if (ev.target.id === 'sts_scrim') closeSheet();
        });
    }
    renderSheet();
    const scrim = document.getElementById('sts_scrim');
    scrim.classList.add('sts-on');
}

function closeSheet() {
    document.getElementById('sts_scrim')?.classList.remove('sts-on');
}

/* ---------- ทางเข้า: เมนูไม้กายสิทธิ์ + ปุ่มลอยสำรอง ---------- */

function makeMenuItem() {
    const item = document.createElement('div');
    item.id = 'sts_menu_item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    const icon = document.createElement('div');
    icon.className = 'fa-solid fa-hourglass-half extensionsMenuExtensionButton';
    const label = document.createElement('span');
    label.textContent = 'เวลาบนหน้าจอ';
    item.append(icon, label);
    item.addEventListener('click', () => {
        document.getElementById('extensionsMenu')?.classList.add('displayNone');
        openSheet();
    });
    return item;
}

function makeFloatButton() {
    const b = document.createElement('button');
    b.id = 'sts_fab';
    b.type = 'button';
    b.title = 'เวลาบนหน้าจอ';
    b.textContent = '⏱️';
    b.addEventListener('click', openSheet);
    document.body.append(b);
    return b;
}

let entryTries = 0;
const entryTimer = setInterval(() => {
    entryTries++;
    if (document.getElementById('sts_menu_item') || document.getElementById('sts_fab')) {
        clearInterval(entryTimer);
        return;
    }
    const menu = document.getElementById('extensionsMenu');
    if (menu) {
        menu.append(makeMenuItem());
        clearInterval(entryTimer);
        console.log(`${LOG} ✅ ใส่ปุ่มในเมนูไม้กายสิทธิ์แล้ว (รอบที่ ${entryTries})`);
        return;
    }
    if (entryTries >= 60) {
        clearInterval(entryTimer);
        makeFloatButton();
        console.warn(`${LOG} ⚠️ ไม่เจอ #extensionsMenu — ถอยไปใช้ปุ่มลอยมุมขวาล่าง`);
    }
}, 500);

/* ---------- drawer ในหน้า Extensions ---------- */

const PANEL_HTML = `
<div class="sts-settings" id="sts_panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>⏱️ Screen Time Stats</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="sts-stage-tag">Stage 4 · กราฟ 7 วัน</div>

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
      <p class="sts-hint">ปกติเรียกจากไอคอนไม้กายสิทธิ์ → “เวลาบนหน้าจอ”</p>
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
            if (document.getElementById('sts_scrim')?.classList.contains('sts-on')) renderSheet();
        });
    }

    document.getElementById('sts_btn_open')?.addEventListener('click', openSheet);
}

let tries = 0;
console.log(`${LOG} 2/3 เริ่มมองหาช่องใส่ panel`);
const timer = setInterval(() => {
    tries++;
    if (document.getElementById('sts_panel')) { clearInterval(timer); return; }
    const host = document.getElementById('extensions_settings2')
              || document.getElementById('extensions_settings');
    if (host) {
        host.insertAdjacentHTML('beforeend', PANEL_HTML);
        bindPanel();
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
