import { logError } from "./logger.js";

const APP_VERSION = "1.1.0";

export function checkAppVersion() {
    const savedVersion = localStorage.getItem("app_version");

    if (savedVersion !== APP_VERSION) {
        console.log("Nueva versión detectada, limpiando cache...");

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