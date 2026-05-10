import { logError, logInfo } from "./logger.js";

export const APP_VERSION = "1.1.1";

export function checkAppVersion() {
    const savedVersion = localStorage.getItem("app_version");

    if (savedVersion !== APP_VERSION) {
        logInfo("checkAppVersion", `Nueva versión detectada ${APP_VERSION}, limpiando cache...`);

        try {
            localStorage.clear();
            sessionStorage.clear();
            localStorage.setItem("app_version", APP_VERSION);
        } catch (e) {
            logError("checkAppVersion", "Error limpiando cache para nueva versión", e);
        }

        window.location.reload();
    }
}