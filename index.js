// public/scripts/extensions/third-party/screentime-stats/index.js
// Stage 2 — slider ตั้งเวลาหยุดนับ + เซฟค่าให้รอดข้ามรีเฟรช

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;
const LS_MIRROR = `${MODULE_NAME}:mirror`;

window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 ไฟล์ถูกอ่านแล้ว`);

const DEFAULTS = {
    version: 2,
    idleMinutes: 5,
};

/** อ่าน settings แบบไม่พังถ้า context ยังไม่มา */
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
        try {
            store = JSON.parse(localStorage.getItem(LS_MIRROR)) || {};
        } catch {
            store = {};
        }
    }

    // เติมคีย์ที่เพิ่มมาใหม่ทุกครั้ง — ผู้ใช้เก่าจะไม่เจอ undefined
    for (const k of Object.keys(DEFAULTS)) {
        if (store[k] === undefined) store[k] = DEFAULTS[k];
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
    try {
        localStorage.setItem(LS_MIRROR, JSON.stringify(s));
    } catch (err) {
        console.warn(`${LOG} เขียน localStorage พลาด`, err);
    }
    console.log(`${LOG} saved · idleMinutes=${s.idleMinutes} · server=${serverOk}`);
}

const PANEL_HTML = `
<div class="sts-settings" id="sts_panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>⏱️ Screen Time Stats</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="sts-stage-tag">Stage 2 · ตั้งเวลาหยุดนับ</div>

      <label class="sts-field-label" for="sts_idle">
        หยุดนับเมื่อไม่มีการขยับนาน
        <span id="sts_idle_out" class="sts-value-pill">5 นาที</span>
      </label>
      <input id="sts_idle" class="sts-range" type="range" min="1" max="60" step="1" value="5">
      <p class="sts-hint">ทิ้งหน้าแชทไว้เกินเวลานี้แล้วเวลาจะหยุดเดิน สลับไปแอปอื่นหยุดทันทีไม่รอครบ</p>

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
    } catch (err) {
        console.warn(`${LOG} canShare ไม่ผ่าน`, err);
    }
    let settingsWritable = false;
    try {
        settingsWritable = typeof SillyTavern.getContext().extensionSettings === 'object';
    } catch { /* ยังไม่พร้อม */ }

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
        void out.offsetWidth;          // บังคับ reflow ให้ animation เล่นซ้ำได้
        out.classList.add('sts-pulse');
        getSettings().idleMinutes = v;
        saveSettings();
    });
}

function tryInject() {
    if (document.getElementById('sts_panel')) return true;
    const host = document.getElementById('extensions_settings2')
              || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', PANEL_HTML);
    paintProbe();
    bindSlider();
    return true;
}

let tries = 0;
console.log(`${LOG} 2/3 เริ่มมองหาช่องใส่ panel`);
const timer = setInterval(() => {
    tries++;
    if (tryInject()) {
        clearInterval(timer);
        window.STS_LOADED = 'ok';
        console.log(`${LOG} 3/3 ✅ panel ขึ้นแล้ว (รอบที่ ${tries}) · idleMinutes=${getSettings().idleMinutes}`);
        return;
    }
    if (tries >= 60) {
        clearInterval(timer);
        window.STS_LOADED = 'no-host';
        console.error(`${LOG} ❌ หา host element ไม่เจอใน 30 วินาที`);
    }
}, 500);
