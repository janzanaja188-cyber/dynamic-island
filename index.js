// ดึง Context ของ SillyTavern มาใช้งาน (ห้าม Import โดยตรง)
const context = SillyTavern.getContext();
const extensionName = "session-time-tracker"; // ต้องตรงกับชื่อโฟลเดอร์เป๊ะๆ
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ฟังก์ชันเริ่มต้น (Hook)
window.onActivate = function() {
    console.log(`[${extensionName}] Activating hook...`);
};

// รอให้แอปโหลด UI เสร็จก่อนค่อยแทรก HTML
context.eventSource.on(context.event_types.APP_READY, async () => {
    console.log(`[${extensionName}] Loading extension UI...`);

    try {
        // ใช้ Context เพื่อโหลด HTML แทนการใช้ $.get ตรงๆ เพื่อความปลอดภัยและรองรับการแปล
        const settingsHtml = await context.renderExtensionTemplateAsync(`third-party/${extensionName}`, 'settings');

        // แทรกเข้าไปในเมนู Extensions (ด้านขวา)
        $("#extensions_settings2").append(settingsHtml);

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load UI:`, error);
    }
});
