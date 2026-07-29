// public/scripts/extensions/third-party/screentime-stats/index.js
// Stage 1 — โครงเปล่า: ทำให้ drawer โผล่ + รายงานสภาพเครื่อง

const MODULE_NAME = 'screentime-stats';
const TEMPLATE_DIR = `third-party/${MODULE_NAME}`;
const LOG = `[${MODULE_NAME}]`;

// ห้าม import จาก script.js — ทุกอย่างมาจาก getContext()
const context = SillyTavern.getContext();

/** hook: activate — ยิงตอน loader ยังบังจออยู่ ใช้แค่ log ใน Stage นี้ */
export function onActivate() {
    console.log(`${LOG} activate hook fired`);
}

/** ตรวจว่าเบราว์เซอร์เครื่องนี้รองรับอะไรบ้าง — ตัวชี้ขาดของ Stage 4 / Stage 8 */
function probeEnvironment() {
    const canShareFiles =
        typeof navigator.canShare === 'function' &&
        (() => {
            try {
                const probe = new File([new Blob(['x'])], 'p.png', { type: 'image/png' });
                return navigator.canShare({ files: [probe] });
            } catch (err) {
                console.warn(`${LOG} canShare probe failed`, err);
                return false;
            }
        })();

    return {
        secureContext: window.isSecureContext === true,
        origin: window.location.origin,
        indexedDB: typeof window.indexedDB !== 'undefined',
        localforage: typeof SillyTavern?.libs?.localforage !== 'undefined',
        shareFiles: canShareFiles,
        settingsWritable: typeof context.extensionSettings === 'object',
    };
}

function paintProbe(env) {
    const $root = $('#sts_probe');
    if (!$root.length) {
        console.error(`${LOG} #sts_probe not found — template ไม่ตรงกับ js`);
        return;
    }

    const mark = ok => (ok ? '✅' : '⚠️');
    const rows = [
        ['Secure context (จำเป็นกับการแชร์รูป)', mark(env.secureContext), env.origin],
        ['IndexedDB', mark(env.indexedDB), env.localforage ? 'localforage พร้อม' : 'ไม่พบ localforage'],
        ['Share ไฟล์ตรงจากเบราว์เซอร์', mark(env.shareFiles), env.shareFiles ? 'ใช้ได้' : 'จะใช้วิธีกดค้างเซฟรูปแทน'],
        ['เขียน extensionSettings', mark(env.settingsWritable), 'สำหรับเก็บยอดรายวัน'],
    ];

    const html = rows
        .map(([label, icon, note]) => `
            <div class="sts-probe-row">
                <span class="sts-probe-icon">${icon}</span>
                <span class="sts-probe-label">${label}</span>
                <span class="sts-probe-note">${note}</span>
            </div>`)
        .join('');

    // note มาจากค่าที่เราสร้างเองทั้งหมด แต่ล้างผ่าน DOMPurify ไว้เป็นนิสัย
    const purify = SillyTavern?.libs?.DOMPurify;
    $root.html(purify ? purify.sanitize(html) : html);

    console.table(env);
}

async function injectPanel() {
    let html;
    try {
        html = await context.renderExtensionTemplateAsync(TEMPLATE_DIR, 'settings');
    } catch (err) {
        console.warn(`${LOG} renderExtensionTemplateAsync พลาด, ถอยไปใช้ $.get`, err);
        html = await $.get(`scripts/extensions/${TEMPLATE_DIR}/settings.html`);
    }

    $('#extensions_settings2').append(html);
    paintProbe(probeEnvironment());
}

(async function boot() {
    console.log(`${LOG} booting...`);
    try {
        context.eventSource.once(context.event_types.APP_READY, async () => {
            await injectPanel();
            console.log(`${LOG} ✅ panel injected`);
        });
    } catch (err) {
        console.error(`${LOG} ❌ boot failed`, err);
    }
})();
