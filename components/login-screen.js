import { escapeHtml } from "../js/utils.js";

export function renderLoginScreen(message = "") {
  const heading = "เข้าสู่ระบบด้วย LINE";
  const description = "ยืนยันตัวตนด้วย LINE แล้วระบบจะแสดงหน้าตามบทบาทและกลุ่มงานที่ได้รับอนุญาตจากข้อมูลสิทธิที่ตรวจสอบแล้ว";  return '<section class="login-screen card card-pad" aria-labelledby="login-title">' +
    '<div class="login-brand"><img src="./assets/icons/sip-logo.png" alt="" width="64" height="64"><div><p class="eyebrow">ระบบโรงงาน SIP</p><h1 id="login-title">' + heading + '</h1></div></div>' +
    '<p class="login-description">' + description + '</p>' +
    (message ? '<p class="notice notice-warning" role="alert">' + escapeHtml(message) + '</p>' : '') +
    '<button class="button button-primary login-submit" type="button" data-auth-login>ยืนยันตัวตนด้วย LINE</button>' +
    '<p class="help-text login-privacy">ระบบจะไม่เก็บ LINE token ไว้ในเครื่อง สิทธิ์ใช้งานต้องมาจาก backend เท่านั้น</p>' +
    '</section>';
}


