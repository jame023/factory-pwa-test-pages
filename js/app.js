import { startCalendarNotifications } from "./notifications.js";
import { authProvider } from "./auth.js?v=2.1.1";
import { renderAppHeader } from "../components/app-header.js";
import { renderLoginScreen } from "../components/login-screen.js?v=2.1.1";
import { renderBottomNav } from "../components/bottom-nav.js";
import { currentRoute, startRouter, refreshRoute } from "./router.js";
import { subscribeStore } from './state.js';
import { showToast } from "../components/toast.js";
import { registerServiceWorker, setOfflineNotice, watchConnection } from "./offline.js";
import { APP_MODE } from "./config.js?v=2.1.1";
import { installActionFeedback, showActionPopup } from "../components/action-popup.js";

let session;
let appMounted = false;
let stopNotifications;
let sessionRevision = 0;
const headerRoot = document.getElementById("header-root");
const navRoot = document.getElementById("nav-root");
const pageRoot = document.getElementById("page-root");
const loadingRoot = document.getElementById("page-loading");
const LINE_LOGIN_URL = "https://jame023.github.io/factory-pwa-test-pages/login-test.html";

function renderChrome(route = currentRoute()) {
  headerRoot.innerHTML = renderAppHeader(session.user);
  navRoot.innerHTML = renderBottomNav(route);
  headerRoot.querySelector("[data-auth-logout]")?.addEventListener("click", signOut);
}

function renderLogin(message = "") {
  headerRoot.replaceChildren();
  navRoot.replaceChildren();
  loadingRoot.hidden = true;
  pageRoot.innerHTML = renderLoginScreen(message);
  pageRoot.querySelector("[data-auth-login]")?.addEventListener("click", login);
  pageRoot.querySelector("[data-auth-register]")?.addEventListener("click", register);
}

function register() {
  showActionPopup("หน้าสมัครสมาชิกจะเปิดใน Pass ถัดไป", { tone:"info", timeout:3200 });
}

async function login(event) {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "กำลังยืนยันตัวตนกับ LINE…";
  showActionPopup("กำลังยืนยันตัวตนกับ LINE…");
  if (APP_MODE === "mock") {
    location.href = LINE_LOGIN_URL;
    return;
  }
  try {
    session = await authProvider.login();
    if (!session) return; // LIFF may redirect the browser to LINE Login.
    await mountApp();
    showActionPopup("ยืนยันตัวตนแล้ว กำลังเปิดหน้าของคุณ…", { tone:"success", timeout:1300 });
  } catch (error) {
    renderLogin(error?.message || "ยืนยันตัวตนไม่สำเร็จ ลองใหม่อีกครั้ง");
    showActionPopup("ยืนยันตัวตนไม่สำเร็จ", { tone:"error", timeout:2600 });
  }
}

async function signOut() {
  showActionPopup("กำลังออกจากระบบ…");
  try {
    await authProvider.logout();
    location.reload();
  } catch (error) {
    showActionPopup(error?.message || "ออกจากระบบไม่สำเร็จ", { tone:"error", timeout:3000 });
  }
}

function watchMockAccount() {
  if (APP_MODE !== "mock") return;
  subscribeStore(()=>{
    const revision=++sessionRevision;
    void authProvider.getSession().then(async latest=>{
      if(revision!==sessionRevision)return;
      if(!latest) { session=null; showActionPopup("บัญชีตัวอย่างถูกปิดใช้งาน", { tone:"error", timeout:1800 }); location.reload(); return; }
      if(JSON.stringify(latest.user)===JSON.stringify(session.user))return;
      session=latest;
      stopNotifications?.();
      stopNotifications=session.user.active===false ? undefined : startCalendarNotifications(session.user,showToast);
      renderChrome();
      await refreshRoute();
      showToast("อัปเดตสิทธิ์บัญชีแล้ว");
    }).catch(()=>showToast("อ่านสิทธิ์ล่าสุดไม่สำเร็จ","error"));
  });
}

async function mountApp() {
  if (appMounted) return;
  appMounted = true;
  renderChrome();
  stopNotifications = session.user.active===false ? undefined : startCalendarNotifications(session.user,showToast);
  watchMockAccount();
  startRouter({
    root: pageRoot,
    loading: loadingRoot,
    userProvider: () => session.user,
    routeChanged: route => { navRoot.innerHTML = renderBottomNav(route); },
    toast: showToast
  });
}

async function start() {
  installActionFeedback();
  await registerServiceWorker();
  setOfflineNotice(message => showToast(message, "error"));
  watchConnection();
  showActionPopup("กำลังตรวจสอบสถานะบัญชี…");
  try {
    session = await authProvider.getSession();
    if (!session) {
      renderLogin();
      return;
    }
    await mountApp();
    showActionPopup("ยืนยันตัวตนแล้ว", { tone:"success", timeout:1000 });
  } catch (error) {
    renderLogin(error?.message || "ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่");
    showActionPopup("ตรวจสอบบัญชีไม่สำเร็จ", { tone:"error", timeout:2800 });
  }
}
start();




