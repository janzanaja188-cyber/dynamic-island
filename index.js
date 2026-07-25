const context = SillyTavern.getContext();
const extensionName = "ios-screen-time";

// ระบุ Path แบบเต็มที่ ST ใช้ดึงไฟล์จริงๆ
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        // เปลี่ยนมาใช้ $.get() แบบมาตรฐาน และระบุนามสกุล .html ให้ชัดเจน
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // นำไปแทรกในหน้าต่างตั้งค่า Extension (ด้านขวา)
        $("#extensions_settings2").append(settingsHtml);

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
