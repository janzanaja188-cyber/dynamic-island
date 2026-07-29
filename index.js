// public/scripts/extensions/third-party/screentime-stats/index.js
// Screen Time Stats · v0.4.5 (Stage 4-E) — บังคับ fullscreen ไม่มี transition

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;
const LS_MIRROR = `${MODULE_NAME}:mirror`;
const DEMO_PREFIX = 'demo:';
const MENU_ITEM_ID = 'sts_menu_item';
const DOW = ['อา', 'จ', 'อ', 'พฤ', 'ศ', 'ส'];

window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 อ่านไฟล์แล้ว`);

const DEFAULTS = {
    version: 4,
    idleMinutes: 5,
    hideNames: false,
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
    let serverOk = false;
    try { SillyTavern.getContext().saveSettingsDebounced(); serverOk = true; }
    catch (err) { console.warn(`${LOG} saveSettingsDebounced พลาด`, err); }
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(s)); }
    catch (err) { console.warn(`${LOG} เขียน localStorage พลาด`, err); }
    console.log(`${LOG} saved · server=${serverOk} · keys=${Object.keys(s.daily).length}`);
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
    return h ? `${h}ชม. ${m} นาที` : `${m} นาที`;
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

/* ══════════ ตัวละครที่เปิดอยู่ + ปุ่มเทส ══════════ */

function currentTarget() {
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.groupId) {
            const g = (ctx.groups || []).find(x => String(x.id) === String(ctx.groupId));
            return { key: `group:${ctx.groupId}`, name: g?.name || 'กลุ่มไม่มีชื่อ' };
        }
        const ch = ctx.characters?.[ctx.characterId];
        if (ch?.avatar) return { key: ch.avatar, name: ch.name || ch.avatar };
    } catch (err) { console.warn(`${LOG} อ่านตัวละครปจจุบันไม่ได้`, err); }
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

        const tip = el('div', 'sts-tip', `${shortMinutes(r.ms)} · ${r.msg}ข้อความ`);
        const track = el('div', 'sts-track');
        const fill = el('div', 'sts-fill');
        fill.style.height = `${Math.max(3, Math.round((r.ms / peak) * 100))}%`;
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
    const list = el('div', 'sts-ranks');

    function paint(field) {
        list.textContent = '';
        const top = rankBy(days, field).slice(0, 5);
        if (!top.length) {
            list.append(el('div', 'sts-empty', 'ยังไม่มีข้อมูลในช่วงนี้ — กดใส่ข้อมูลตัวอย่างดูก่อนได้'));
            return;
        }
        const peak = top[0][field] || 1;
        top.forEach((r, i) => {
            const row = el('div', 'sts-rank');
            row.append(el('div', 'sts-medal', medals[i]));

            const mid = el('div', 'sts-rank-mid');
            mid.append(el('div', 'sts-rank-name', s.hideNames ? `ตัวละคร ${i + 1}` : r.name));

            const bar = el('div', 'sts-rank-track');
            const f = el('div', 'sts-rank-fill');
            f.style.width = `${Math.max(4, Math.round((r[field] / peak) * 100))}%`;
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

/* ══════════ เปิด / ปิดแผ่น — inline styles ล้วน ๆ ══════════ */

function openSheet() {
    try {
        let scrim = document.getElementById('sts_scrim');
        if (!scrim) {
            scrim = document.createElement('div');
            scrim.id = 'sts_scrim';
            // ★ ปักหมุดสี่ด้าน = 0 → สูงเท่าจอจริงเสมอ ไม่พึ่ง vh/dvh อีก
            Object.assign(scrim.style, {
                position: 'fixed',
                top: '0', right: '0', bottom: '0', left: '0',
                display: 'flex', flexDirection: 'column',
                boxSizing: 'border-box',
                background: 'var(--SmartThemeBlurTintColor, #1b1b1f)',
                color: 'var(--SmartThemeBodyColor, #eee)',
                zIndex: '2147483647',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            });

            // หัว — ตรึงบนสุด ไม่เลื่อน
            const head = document.createElement('div');
            Object.assign(head.style, {
                flex: '0 0 auto',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px 10px',
                borderBottom: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.15))',
            });

            const title = document.createElement('div');
            title.textContent = '⏱️ เวลาบนหน้าจอ';
            Object.assign(title.style, { fontSize: '1.1em', fontWeight: '600' });

            const btnX = document.createElement('button');
            btnX.textContent = '✕';
            btnX.type = 'button';
            Object.assign(btnX.style, {
                width: '34px', height: '34px', borderRadius: '50%', flex: '0 0 auto',
                background: 'transparent', color: 'inherit',
                border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.15))',
                cursor: 'pointer', opacity: '0.7', fontSize: '1em',
            });
            btnX.addEventListener('click', closeSheet);
            head.append(title, btnX);

            // เนื้อหา — เลื่อนได้ข้างใน (min-height:0 คือหัวใจ)
            const body = document.createElement('div');
            body.id = 'sts_body';
            Object.assign(body.style, {
                flex: '1 1 auto',
                minHeight: '0',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                width: '100%', maxWidth: '560px', margin: '0 auto',
                padding: '12px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
                boxSizing: 'border-box',
            });

            scrim.append(head, body);
            document.body.append(scrim);
        }

        renderSheet();
        scrim.style.display = 'flex';
        console.log(`${LOG} ✅ openSheet · fullscreen(pinned) · การ์ด=${scrim.querySelectorAll('.sts-card').length}`);
    } catch (err) {
        console.error(`${LOG} ❌ openSheet ล้ม`, err);
        if (typeof toastr !== 'undefined') toastr.error(String(err?.message || err), 'STS เปิดกราฟไม่ได้');
    }
}

function closeSheet() {
    const scrim = document.getElementById('sts_scrim');
    if (scrim) scrim.style.display = 'none';
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
        for (let i = 0; i < 3&& hop; i++) {
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
    item.addEventListener('click', ev => {
        ev.stopPropagation();
        document.getElementById('extensionsMenu')?.classList.add('displayNone');
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
    setTimeout(() => mountMenuItem('ดักตอนกด รอบสง'), 320);
}, true);

try {
    const obs = new MutationObserver(() => {
        if (findMenu() && !document.getElementById(MENU_ITEM_ID)) mountMenuItem('observer');
    });
    obs.observe(document.body, { childList: true, subtree: true });
} catch (err) {
    console.warn(`${LOG} MutationObserver ใช้ไม่ได้`, err);
}

window.STS_OPEN = openSheet;
window.STS_CLOSE = closeSheet;
window.STS_FINDMENU = () => {
    const m = findMenu();
    console.log(`${LOG} findMenu →`, m);
    return m ? (m.id || m.className) : 'ไม่เจอ';
};
window.STS_DIAG = () => {
    const scrim = document.getElementById('sts_scrim');
    const out = {
        บรรทัดในเมนู: !!document.getElementById(MENU_ITEM_ID),
        แผ่นมีอยู่: !!scrim,
        แสดงผลอยู่: scrim ? (scrim.style.display !== 'none') : false,
        zIndex: scrim?.style.zIndex || '-',
        opacity: scrim?.style.opacity || '-',
        การ์ด: scrim?.querySelectorAll('.sts-card').length ?? 0,
        ตัวละครในฐานข้อมูล: Object.keys(getSettings().daily).length,
    };
    console.table(out);
    return out;
};

/* ══════ drawer ในหน้า Extensions ══════════ */

const PANEL_HTML = `
<div class="sts-settings" id="sts_panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>⏱️ Screen Time Stats</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="sts-stage-tag">Stage 4-E · v0.45</div>

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
      <p class="sts-hint">ปกติเรียกจากไอคอนไม้กายสิทธิ์ → "เวลาบนหน้าจอ"</p>
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
            if (document.getElementById('sts_scrim')?.style.display !== 'none') renderSheet();
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
