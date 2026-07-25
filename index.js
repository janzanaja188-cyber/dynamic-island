const context = SillyTavern.getContext();
const extensionName = "ios-screen-time";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// ฟังก์ชันสำหรับโหลดและแทรก UI
async function setupUI() {
    try {
        console.log(`[${extensionName}] Attempting to load HTML...`);
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // แทรกในหน้าต่างตั้งค่า Extension (ด้านขวา)
        $("#extensions_settings2").append(settingsHtml);

        console.log(`[${extensionName}] ✅ UI appended successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load HTML:`, error);
    }
}

// รอจนกว่า SillyTavern จะโหลด UI พื้นฐานเสร็จสมบูรณ์
context.eventSource.on(context.event_types.APP_READY, () => {
    console.log(`[${extensionName}] App ready, initializing...`);
    setupUI();
});
