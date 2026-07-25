const context = SillyTavern.getContext();
const extensionName = "ios-screen-time";
const extensionFolderPath = `third-party/${extensionName}`;

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        // โหลด HTML จากไฟล์
        const settingsHtml = await context.renderExtensionTemplateAsync(extensionFolderPath, 'settings');

        // นำไปแทรกในหน้าต่างตั้งค่า Extension (ด้านขวา)
        $("#extensions_settings2").append(settingsHtml);

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
