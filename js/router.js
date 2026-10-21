import { APP_MODE, READ_ONLY_ROUTES } from "./config.js?v=1.3.186";
import { resolveWorkspaceRoute, canAccessModule } from "./permissions.js?v=1.3.186";
import { watchChanges, pageBusy, preservePageDraft, mockLiveEnabled } from './live-updates.js?v=1.3.186';
import { showActionPopup } from '../components/action-popup.js?v=1.3.186';
import { isStatusModalOpen } from '../components/status-modal.js?v=1.3.186';
const routes = {
  home: () => import("../pages/home/index.js?v=1.3.189"),
  attendance: () => import("../pages/attendance/index.js?v=1.3.186"),
  "work-session": () => import("../pages/work-session/index.js?v=1.3.187"),
  leave: () => import("../pages/leave/index.js?v=1.3.186"),
  calendar: () => import("../pages/calendar/index.js?v=1.3.186"),
  delivery: () => import("../pages/delivery/index.js?v=1.3.186"),
  production: () => import("../pages/production/index.js?v=1.3.187"),
  "production-record": () => import("../pages/production-record/index.js?v=1.3.187"),
  ot: () => import("../pages/ot/index.js?v=1.3.186"),
  reports: () => import("../pages/reports/index.js?v=1.3.186"),
  admin: () => import("../pages/admin/index.js?v=1.3.186"),
  "admin-employees": () => import("../pages/admin/employees.js?v=1.3.186"),
  "admin-groups": () => import("../pages/admin/groups.js?v=1.3.186"),
  "admin-machines": () => import("../pages/admin/machines.js?v=1.3.186"),
  "admin-item-names": () => import("../pages/admin/item-names.js?v=1.3.186")
};
routes.employee = routes.home;
routes.executive = routes.home;
const access = {
  home: ["employee", "executive", "admin"],
  employee: ["employee", "admin"],
  executive: ["executive", "admin"],
  attendance: ["employee", "executive", "admin"],
  "work-session": ["employee", "executive", "admin"],
  leave: ["employee", "executive", "admin"],
  calendar: ["employee", "executive", "admin"],
  delivery: ["employee", "executive", "admin"],
  production: ["employee", "executive", "admin"],
  "production-record": ["employee", "executive", "admin"],
  ot: ["employee", "executive", "admin"],
  reports: ["executive", "admin"],
  admin: ["admin"],
  "admin-employees": ["employee", "executive", "admin"],
  "admin-groups": ["employee", "executive", "admin"],
  "admin-machines": ["employee", "executive", "admin"],
  "admin-item-names": ["employee", "executive", "admin"]
};
let pageRoot;
let loader;
let getUser = () => ({ role: "employee" });
let onRoute = () => {};
let showToast = () => {};
let activeRoute = "home";
let routeVersion = 0;
let routeController;
export const currentRoute = () => activeRoute;
export function navigate(route) {
  if (isStatusModalOpen()) return false;
  location.hash = "#/" + route;
  return true;
}
function readRoute() {
  const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
  return raw;
}
async function renderRoute() {
  if (isStatusModalOpen()) {
    history.replaceState(null, "", "#/" + activeRoute);
    return;
  }
  showActionPopup("กำลังโหลดข้อมูล…");
  const version = ++routeVersion;
  routeController?.abort();
  routeController = new AbortController();
  const signal = routeController.signal;
  const user = getUser();
  const destination = resolveWorkspaceRoute(readRoute(), user?.role);
  const route = destination.module;
  if (user?.active===false || !destination.allowed || !routes[route] || !access[route].includes(user?.role) || !canAccessModule(user, route)) {
    showActionPopup("ไม่สามารถเปิดหน้านี้ได้: ไม่มีสิทธิ์เข้าถึง", { tone: "error", timeout: 2600 });
    activeRoute = "home"; onRoute("home");
    pageRoot.innerHTML = '<section class="card card-pad"><div class="page-heading"><div><p class="eyebrow">ไม่มีสิทธิ์เข้าถึง</p><h1>หน้านี้ไม่อยู่ในสิทธิ์ของคุณ</h1></div></div><p>กรุณากลับไปใช้งานหน้าของตนเอง</p><a class="button button-primary" href="#/home">กลับหน้าหลักของฉัน</a></section>';
    loader.hidden = true;
    return;
  }
  if (readRoute() !== destination.canonical) history.replaceState(null, "", "#/" + destination.canonical);
  activeRoute = route;
  onRoute(route);
  if ((APP_MODE === "development" && !READ_ONLY_ROUTES.includes(route)) ||
      (APP_MODE !== "mock" && APP_MODE !== "development" &&
       !(APP_MODE === "supabase-line" && ["home","attendance","work-session","leave","calendar","delivery","production","production-record","ot"].includes(route)))) {
    showActionPopup("หมวดนี้ยังไม่เปิดเชื่อมต่อข้อมูล", { tone: "info", timeout: 2600 });
    pageRoot.innerHTML = '<section class="notice notice-warning"><h1>โมดูลนี้ยังไม่เปิด API</h1><p>โหมดอ่านข้อมูลทดสอบเปิดเฉพาะเวลาของฉัน</p><a class="button" href="#/attendance">เปิดเวลาของฉัน</a></section>';
    loader.hidden = true;
    return;
  }
  loader.hidden = false;
  const view = document.createElement("div");
  pageRoot.replaceChildren(view);
  try {
    const page = await routes[route]();
    if (version !== routeVersion) return;
    let customRefresh, ready = false;
    let content = document.createElement('div');
    view.replaceChildren(content);
    let routeHadError = false;
    const context = { user, signal, navigate, workspace: destination.workspace,
      onDataChange: callback => { customRefresh = callback; },
      showToast: (...args) => { if (version === routeVersion) { if (args[1] === "error") routeHadError = true; showToast(...args); } } };
    const watcher = mockLiveEnabled ? watchChanges(async isCurrent => {
      if (signal.aborted) return;
      if (customRefresh) return customRefresh();
      const next = document.createElement('div');
      await page.render(next, context);
      if (signal.aborted) return;
      if (!isCurrent()) return false;
      if (pageBusy(content)) return false;
      if (next.querySelector('[role="alert"]')) throw new Error('อ่านข้อมูลล่าสุดไม่สำเร็จ');
      const focused = document.activeElement;
      const focusId = content.contains(focused) ? focused.id : '';
      const restoreFocus = preservePageDraft(content, next);
      content.replaceWith(next); content = next;
      restoreFocus();
      if (focusId) [...content.querySelectorAll('[id]')].find(el=>el.id===focusId)?.focus({preventScroll:true});
    }, { signal, busy: () => !ready || pageBusy(content),
      onError: () => context.showToast('อัปเดตข้อมูลไม่สำเร็จ กลับเข้าหน้าแอปเพื่อลองอีกครั้ง', 'error') }) : null;
    await page.render(content, context);
    ready = true;
    if (version === routeVersion && !signal.aborted && !routeHadError) {
      showActionPopup("โหลดหน้าเสร็จแล้ว", { tone: "success", timeout: 1300 });
    }
    // Catch a change that arrived while the initial read was still loading.
    watcher?.request();
  } catch (error) {
    if (version !== routeVersion || signal.aborted) return;
    routeController.abort();
    console.error("Route render failed", route, error);
    const safeError = String(error?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
    pageRoot.innerHTML = '<section class="notice notice-danger"><strong>เปิดหน้านี้ไม่สำเร็จ</strong><div>' + safeError + '</div><div>ลองรีเฟรช หรือกลับหน้าแรก</div><a class="button button-small" href="#/home">หน้าแรก</a></section>';
    showToast("เปิดหน้าไม่สำเร็จ", "error");
  } finally {
    if (version === routeVersion) {
      loader.hidden = true;
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }
}
export function refreshRoute() { return renderRoute(); }
export function startRouter({ root, loading, userProvider, routeChanged, toast }) {
  pageRoot = root; loader = loading; getUser = userProvider; onRoute = routeChanged; showToast = toast;
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}
