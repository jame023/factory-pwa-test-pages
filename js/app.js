import { startCalendarNotifications } from "./notifications.js?v=1.3.184";
import { authProvider } from "./auth.js?v=1.3.184";
import { renderAppHeader } from "../components/app-header.js?v=1.3.184";
import { renderLoginScreen } from "../components/login-screen.js?v=1.3.184";
import { renderBottomNav } from "../components/bottom-nav.js?v=1.3.184";
import { currentRoute, startRouter, refreshRoute } from "./router.js?v=1.3.185";
import { subscribeStore } from './state.js?v=1.3.184';
import { showToast } from "../components/toast.js?v=1.3.184";
import { registerServiceWorker, setOfflineNotice, watchConnection } from "./offline.js?v=1.3.184";
import { APP_MODE } from "./config.js?v=1.3.184";
import { installActionFeedback, showActionPopup } from "../components/action-popup.js?v=1.3.184";
// Preserve the machine-only OAuth code before the mock app/router can replace the URL.
const machineOAuthCode = new URLSearchParams(location.search).get('code');
if (machineOAuthCode && /^#\/admin\/(machines|item-names)(?:$|\?)/.test(location.hash)) {
  sessionStorage.setItem('factory-pwa-machine-oauth-code-v1', machineOAuthCode);
}

let session;
let appMounted = false;
let stopNotifications;
let sessionRevision = 0;
const headerRoot = document.getElementById("header-root");
const navRoot = document.getElementById("nav-root");
const pageRoot = document.getElementById("page-root");
const loadingRoot = document.getElementById("page-loading");

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
}

async function login(event) {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = APP_MODE === "mock" ? "กำลังเปิดบัญชีตัวอย่าง…" : "กำลังยืนยันตัวตน…";
  showActionPopup(APP_MODE === "mock" ? "กำลังเปิดบัญชีตัวอย่าง…" : "กำลังยืนยันตัวตนกับ LINE…");
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
  if (APP_MODE === "mock" || APP_MODE === "supabase-line") await registerServiceWorker();
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




