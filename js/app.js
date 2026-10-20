import { startCalendarNotifications } from "./notifications.js";
import { authProvider } from "./auth.js?v=2.1.2";
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

function renderAuthenticatedLanding() {
  renderChrome();
  navRoot.replaceChildren();
  loadingRoot.hidden = true;

  const card = document.createElement("section");
  card.className = "card card-pad";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "ยืนยันตัวตนสำเร็จ • Test Preview";
  const title = document.createElement("h1");
  title.textContent = "เข้าสู่ระบบสำเร็จ";
  const description = document.createElement("p");
  description.textContent = "ข้อมูลด้านล่างอ่านจากบัญชีและสิทธิ์ที่ตรวจสอบผ่าน Supabase แล้ว";
  card.append(eyebrow, title, description);

  const addRow = (label, value) => {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    row.append(strong, document.createTextNode(value || "—"));
    card.append(row);
  };
  addRow("ชื่อพนักงาน", session.user.name);
  addRow("LINE Display Name", session.user.lineDisplayName);
  addRow("บทบาท", session.user.role);
  addRow("กลุ่มงานหลัก", session.user.main_group);
  addRow("กลุ่มงานที่ได้รับสิทธิ์", session.user.groups?.join(", "));
  addRow("สถานะบัญชี", session.user.active === true ? "ใช้งานได้" : "ระงับ");

  const note = document.createElement("p");
  note.className = "small-muted";
  note.textContent = "โมดูลข้อมูลการทำงานยังไม่เปิดใน Test Preview";
  card.append(note);
  pageRoot.replaceChildren(card);
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
  if (APP_MODE === "supabase-line") {
    renderAuthenticatedLanding();
    return;
  }
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




