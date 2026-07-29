// public/scripts/extensions/third-party/screentime-stats/index.js
// Stage 1-B — โหมดกันพัง: ไม่รออีเวนต์ ไม่โหลดไฟล์นอก ไม่แตะ getContext ตอนบูต

const MODULE_NAME = 'screentime-stats';
const LOG = `[${MODULE_NAME}]`;

// ธงตรวจชีวิต — พิมพ์ window.STS_LOADED ใน console แล้วรู้ผลทันที
window.STS_LOADED = 'parsed';
console.log(`${LOG} 1/3 ไฟล์ถูกอ่านแล้ว`);

const PANEL_HTML = `
<div class="sts-settings" id="sts_panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>⏱️ Screen Time Stats</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="sts-stage-tag">Stage 1-B · โครงเปล่า</div>
      <p class="sts-hint">โหลดสำเร็จ ยังไม่มีการนับเวลาใด ๆ</p>
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
    } catch (err) {
        console.warn(`${LOG} ยังอ่าน context ไม่ได้`, err);
    }
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
        const i = document.createElement('span');
        i.className = 'sts-probe-icon';
        i.textContent = ok ? '✅' : '⚠️';
        const l = document.createElement('span');
        l.className = 'sts-probe-label';
        l.textContent = label;
        const n = document.createElement('span');
        n.className = 'sts-probe-note';
        n.textContent = note;
        row.append(i, l, n);
        box.append(row);
    }
    console.table(probe());
}

function tryInject() {
    if (document.getElementById('sts_panel')) return true;
    const host = document.getElementById('extensions_settings2')
              || document.getElementById('extensions_settings');
    if (!host) return false;
    host.insertAdjacentHTML('beforeend', PANEL_HTML);
    paintProbe();
    return true;
}

// ไม่รออีเวนต์ — ลองเองทุกครึ่งวินาที สูงสุด 30 วินาทีแล้วเลิก
let tries = 0;
console.log(`${LOG} 2/3 เริ่มมองหาช่องใส่ panel`);
const timer = setInterval(() => {
    tries++;
    if (tryInject()) {
        clearInterval(timer);
        window.STS_LOADED = 'ok';
        console.log(`${LOG} 3/3 ✅ panel ขึ้นแล้ว (รอบที่ ${tries})`);
        if (typeof toastr !== 'undefined') toastr.success('Stage 1-B โหลดสำเร็จ', 'Screen Time Stats');
        return;
    }
    if (tries >= 60) {
        clearInterval(timer);
        window.STS_LOADED = 'no-host';
        console.error(`${LOG} ❌ หา #extensions_settings2 ไม่เจอใน 30 วินาที`);
    }
}, 500);
