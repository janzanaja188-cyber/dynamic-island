// public/scripts/extensions/third-party/dynamic-island/index.js

const context = SillyTavern.getContext();
const MODULE_NAME = "dynamic-island";
const extensionFolderPath = `scripts/extensions/third-party/${MODULE_NAME}`;

jQuery(async () => {
    console.log(`[${MODULE_NAME}] Loading...`);

    try {
        // โหลด HTML ของ settings drawer จากไฟล์
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // ต่อเข้า panel ฝั่งขวาของ Extensions settings
        $("#extensions_settings2").append(settingsHtml);

        console.log(`[${MODULE_NAME}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] ❌ Failed to load:`, error);
    }
});
