const context = SillyTavern.getContext();
const MODULE_NAME = 'screen-time-stats';

// ---- Stage 1: แค่ปุ่มในเมนู + popup เปล่า ----

// สร้างปุ่มเข้า "Extensions wand menu" (ไอคอนไม้กายสิทธิ์ ล่างซ้ายช่องพิมพ์)
function addMenuButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        console.warn(`[${MODULE_NAME}] ไม่พบ #extensionsMenu — ลองใหม่อีกที`);
        return;
    }
    if (document.getElementById('sts-menu-button')) return; // กันซ้ำ

    const btn = document.createElement('div');
    btn.id = 'sts-menu-button';
    btn.className = 'list-group-item flex-container flexGap5 interactable';
    btn.tabIndex = 0;
    btn.innerHTML = `
        <div class="fa-solid fa-chart-simple extensionsMenuExtensionButton"></div>
        <span>Screen Time Stats</span>
    `;
    btn.addEventListener('click', openDashboard);
    menu.appendChild(btn);
    console.log(`[${MODULE_NAME}] ✅ เพิ่มปุ่มในเมนูแล้ว`);
}

// เปิด popup เปล่า ๆ ไว้ก่อน
async function openDashboard() {
    const html = `
        <div class="sts-dashboard">
            <h3>📊 Screen Time Stats</h3>
            <p>✅ โครงสร้างพื้นฐานทำงานแล้ว</p>
            <p><small>ถ้าเห็นข้อความนี้ แปลว่าปุ่มกับ popup เชื่อมกับ SillyTavern ได้เรียบร้อย</small></p>
        </div>
    `;
    await context.callGenericPopup(
        html,
        context.POPUP_TYPE.TEXT,
        '',
        { wide: true, large: true, allowVerticalScrolling: true }
    );
}

// hook ตอน activate (ถูกเรียกจาก manifest)
function onActivate() {
    console.log(`[${MODULE_NAME}] activate hook`);
}

// เมนูอาจยังไม่ถูก render ตอน activate — รอ APP_READY ให้ชัวร์
context.eventSource.on(context.event_types.APP_READY, () => {
    console.log(`[${MODULE_NAME}] APP_READY — กำลังติดตั้งปุ่ม`);
    addMenuButton();
});

// เผื่อบางเวอร์ชัน APP_READY มาก่อน DOM พร้อม — ลองซ้ำอีกทีตอน jQuery ready
jQuery(() => {
    setTimeout(addMenuButton, 1500);
});

// export ให้ manifest hook มองเห็น
window.onActivate = onActivate;
