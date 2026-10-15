import { APP_MODE, APP_NAME, ROLE_LABELS } from "../js/config.js";
import { escapeHtml } from "../js/utils.js";

export function renderAppHeader(user) {
  return '<div class="app-header"><div class="header-inner">' +
    '<a class="brand" href="#/home" aria-label="ระบบโรงงาน SIP หน้าแรก">' +
    '<img class="brand-mark" src="./assets/icons/sip-logo.png" alt="">' +
    '<span class="brand-copy"><span class="brand-title">' + escapeHtml(APP_NAME) + '</span>' +
    '</span></a>' +
    '<div class="header-tools">' +
    '<span class="mode-pill">' + (APP_MODE === "mock" ? "DEV MOCK" : APP_MODE === "development" ? "LOCAL API" : "LINE") + '</span>' +
    '<span class="badge badge-info" aria-label="บทบาทที่ได้รับ">' + escapeHtml(ROLE_LABELS[user.role]) + '</span>' +
    (APP_MODE === "mock" && user.groups?.length ? '<span class="badge badge-info" aria-label="กลุ่มจำลอง">' + escapeHtml(user.groups.join(" / ")) + '</span>' : '') +
    (APP_MODE !== "development" ? '<button class="button button-small" type="button" data-auth-logout>ออกจากระบบ</button>' : "") +
    "</div></div></div>";
}

