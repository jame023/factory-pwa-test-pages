import { APP_MODE, MOCK_USERS, ROLE_LABELS, MOCK_SESSION_ROLE, MOCK_SESSION_GROUP, LINE_LIFF_ID, API_BASE_URL } from "./config.js";
import { requestReadOnly } from "./read-only-api.js";
import { normalizeRole, normalizeGroup } from "./permissions.js";
import { ACTIVE_DIRECTORY_NAMES, DIRECTORY_SNAPSHOT_DATE } from './directory-snapshot.js';
import { getStore } from './state.js';

const MOCK_LOGIN_KEY = "factory-pwa-demo-login-v1";
const PWA_SESSION_CACHE_KEY = "factory-pwa-test-session-v1";
const LINE_SIGNED_OUT_KEY = "factory-pwa-line-signed-out-v1";
const SESSION_ROLES = new Set(["employee", "executive", "admin"]);
const SESSION_GROUPS = new Set(["ผลิต", "สกรีน", "ขนส่ง", "ออฟฟิต"]);
let liffPromise;

function readPwaSessionCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(PWA_SESSION_CACHE_KEY) || "null");
    const user = cached?.user;
    if (!cached || cached.version !== 1 || !Number.isFinite(cached.expiresAt) || cached.expiresAt <= Date.now() ||
        !user || user.active !== true || !SESSION_ROLES.has(user.role) || typeof user.id !== "string" || typeof user.name !== "string") return null;
    const groups = Array.isArray(user.groups) ? [...new Set(user.groups.map(normalizeGroup).filter(value => SESSION_GROUPS.has(value)))] : [];
    return { ...user, groups, calendarGroups: groups, accessGroups: Array.isArray(user.accessGroups) ? [...new Set(user.accessGroups.map(normalizeGroup))] : groups,
      primaryGroup: typeof user.primaryGroup === "string" ? normalizeGroup(user.primaryGroup) : "", primaryWorkGroup: typeof user.primaryGroup === "string" ? normalizeGroup(user.primaryGroup) : "" };
  } catch (_) { return null; }
}

export class AuthProvider {
  async getSession() { throw new Error("AuthProvider.getSession must be implemented"); }
  async login() { throw new Error("AuthProvider.login must be implemented"); }
  async logout() { throw new Error("AuthProvider.logout must be implemented"); }
  async setRole() { throw new Error("Role switching is available only in mock auth"); }
}

export class MockAuthProvider extends AuthProvider {
  constructor(role = MOCK_SESSION_ROLE, group = null) {
    super();
    const user = MOCK_USERS.find(item => item.role === role);
    if (!user) throw new Error("ไม่พบบทบาทสำหรับเซสชันทดสอบ");
    const canonicalGroup = normalizeGroup(group);
    const previewGroups = role === "employee" && SESSION_GROUPS.has(canonicalGroup) ? [canonicalGroup] : (user.groups || []).map(normalizeGroup);
    Object.defineProperty(this, "user", { value:Object.freeze({ ...user,
      directorySnapshotDate:DIRECTORY_SNAPSHOT_DATE,
      workAccess:Object.freeze({orders:Object.freeze(role==='admin' || previewGroups.includes('สกรีน') ? [...ACTIVE_DIRECTORY_NAMES] : [])}),
      deliveryAccess:Object.freeze({allowed:role==='admin' || previewGroups.includes('ขนส่ง'),products:Object.freeze(role==='admin' || previewGroups.includes('ขนส่ง') ? [...ACTIVE_DIRECTORY_NAMES] : [])}),
      groups:Object.freeze([...previewGroups]), calendarGroups:Object.freeze([...new Set(previewGroups
        .filter(value => SESSION_GROUPS.has(value)))]) }), writable:false });
  }
  async getSession() {
    const remembered = readPwaSessionCache();
    if (remembered) return { user: remembered, provider: "line-session-cache", label: ROLE_LABELS[remembered.role] };
    if (localStorage.getItem(MOCK_LOGIN_KEY) !== "1") return null;
    const stored = getStore().employees.find(person=>person.id===this.user.id);
    const edited = !!stored?.updatedAt;
    const role = edited ? normalizeRole(stored.role) : this.user.role;
    const groups = edited ? [...new Set(String(stored.group || '').split(/[,，;]+/).map(value=>normalizeGroup(value.trim())).filter(Boolean))] : [...this.user.groups];
    const user = { ...this.user, role, groups, calendarGroups:groups.filter(value=>SESSION_GROUPS.has(value)),
      active:stored?.active!==false, name:edited ? stored.name : this.user.name,
      workAccess:{orders:role==='admin' || groups.includes('สกรีน') ? [...ACTIVE_DIRECTORY_NAMES] : []},
      deliveryAccess:{allowed:role==='admin' || groups.includes('ขนส่ง'),products:role==='admin' || groups.includes('ขนส่ง') ? [...ACTIVE_DIRECTORY_NAMES] : []} };
    if (user.active === false) return null;
    return { user, provider: "development-mock", label: ROLE_LABELS[role] };
  }
  async login() {
    localStorage.setItem(MOCK_LOGIN_KEY, "1");
    const session = await this.getSession();
    if (!session) throw new Error("บัญชีตัวอย่างถูกปิดใช้งาน");
    return session;
  }
  async logout() { localStorage.removeItem(MOCK_LOGIN_KEY); localStorage.removeItem(PWA_SESSION_CACHE_KEY); }
  async setRole() { throw new Error("เซสชันนี้ล็อกบทบาทไว้ ไม่สามารถเปลี่ยนสิทธิ์จากหน้าแอปได้"); }
}

export class DevelopmentAuthProvider extends AuthProvider {
  async getSession() {
    const session = await requestReadOnly("session", "read");
    if (session.provider !== "development-fixture" || !["employee","manager"].includes(session.user?.role) ||
        typeof session.user.id !== "string" || typeof session.user.name !== "string" ||
        !session.user.id.startsWith("fixture-") || session.user.name.length > 100) {
      throw new Error("เซสชัน API ทดสอบไม่ถูกต้อง");
    }
    const role = normalizeRole(session.user.role);
    return { user: { id:session.user.id, name:session.user.name, role },
      provider:session.provider, label:ROLE_LABELS[role] };
  }
  async login() { return this.getSession(); }
  async logout() { throw new Error("ออกจากระบบบัญชีทดสอบโดยปิดเซิร์ฟเวอร์ทดสอบ"); }
}

function authApiUrl(path) {
  const base = new URL(API_BASE_URL || "./api/v1/", globalThis.location.href);
  if (base.origin !== globalThis.location.origin || base.search || base.hash || base.username || base.password) {
    throw new Error("ที่อยู่บริการยืนยันตัวตนไม่ถูกต้อง");
  }
  return new URL(path, base);
}

function validateServerSession(envelope) {
  const user = envelope?.ok === true ? envelope.data?.user : null;
  if (!user || typeof user.id !== "string" || !user.id || user.id.length > 160 ||
      typeof user.name !== "string" || !user.name.trim() || user.name.length > 100) {
    throw new Error("ข้อมูลบัญชีที่ยืนยันแล้วไม่ถูกต้อง");
  }
  const role = normalizeRole(user.role);
  if (!SESSION_ROLES.has(role) || user.active === false) throw new Error("บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งาน");
  const groups = Array.isArray(user.groups) ? [...new Set(user.groups.filter(value => typeof value === "string")
    .map(normalizeGroup).filter(value => SESSION_GROUPS.has(value)))] : [];
  const accessGroups = Array.isArray(user.accessGroups) ? [...new Set(user.accessGroups
    .filter(value => typeof value === "string").map(normalizeGroup).filter(Boolean))] : groups;
  const primaryGroup = typeof user.primaryGroup === "string" ? normalizeGroup(user.primaryGroup) : "";
  const allowedProducts = values => Array.isArray(values) ? values.filter(value=>typeof value==="string" && value.length<=120) : [];
  return { user:{ id:user.id, name:user.name.trim(), role, primaryGroup, primaryWorkGroup:primaryGroup,
    accessGroups, groups,
    calendarGroups:Array.isArray(user.calendarGroups) ? user.calendarGroups.map(normalizeGroup).filter(value=>SESSION_GROUPS.has(value)) : groups,
    workAccess:{orders:allowedProducts(user.workAccess?.orders)},
    deliveryAccess:{allowed:user.deliveryAccess?.allowed===true, products:allowedProducts(user.deliveryAccess?.products)},
    active:true }, provider:"line-session", label:ROLE_LABELS[role] };
}

async function loadLiff() {
  if (!LINE_LIFF_ID) throw new Error("ยังไม่ได้ตั้งค่า LIFF สำหรับ PWA");
  if (globalThis.liff) return globalThis.liff;
  liffPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/versions/2.31.1/sdk.js";
    script.async = true;
    script.onload = () => globalThis.liff ? resolve(globalThis.liff) : reject(new Error("โหลดบริการ LINE ไม่สำเร็จ"));
    script.onerror = () => reject(new Error("เชื่อมต่อบริการ LINE ไม่สำเร็จ"));
    document.head.append(script);
  });
  return liffPromise;
}

export class LineLiffAuthProvider extends AuthProvider {
  async backendSession() {
    const response = await fetch(authApiUrl("session"), { method:"GET", credentials:"same-origin", cache:"no-store",
      redirect:"error", headers:{ Accept:"application/json" } });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(response.status === 404 ? "backend ยืนยันตัวตนยังไม่พร้อมใช้งาน" : "ตรวจสอบเซสชันไม่สำเร็จ");
    const envelope = await response.json().catch(() => null);
    return validateServerSession(envelope);
  }
  async exchangeLineToken(liff) {
    const idToken = liff.getIDToken();
    if (typeof idToken !== "string" || !idToken || idToken.length > 10000) throw new Error("ไม่พบ LINE ID token กรุณาเข้าสู่ระบบ LINE ใหม่");
    const response = await fetch(authApiUrl("auth/line/session"), { method:"POST", credentials:"same-origin", cache:"no-store",
      redirect:"error", headers:{ Accept:"application/json", "Content-Type":"application/json" }, body:JSON.stringify({idToken}) });
    if (!response.ok) throw new Error(response.status === 403 ? "บัญชี LINE นี้ยังไม่มีสิทธิ์ในระบบ" : "ยืนยันบัญชีกับระบบไม่สำเร็จ");
    const envelope = await response.json().catch(() => null);
    return validateServerSession(envelope);
  }
  async resumeLineSession() {
    if (!LINE_LIFF_ID || localStorage.getItem(LINE_SIGNED_OUT_KEY) === "1") return null;
    const liff = await loadLiff();
    await liff.init({ liffId:LINE_LIFF_ID });
    return liff.isLoggedIn() ? this.exchangeLineToken(liff) : null;
  }
  async getSession() {
    if (localStorage.getItem(LINE_SIGNED_OUT_KEY) === "1") return null;
    const session = await this.backendSession();
    if (session) return session;
    try { return await this.resumeLineSession(); }
    catch (error) {
      if (error.message === "ยังไม่ได้ตั้งค่า LIFF สำหรับ PWA") return null;
      throw error;
    }
  }
  async login() {
    localStorage.removeItem(LINE_SIGNED_OUT_KEY);
    const liff = await loadLiff();
    await liff.init({ liffId:LINE_LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri:globalThis.location.href });
      return null;
    }
    await this.exchangeLineToken(liff);
    const session = await this.backendSession();
    if (!session) throw new Error("ระบบยังไม่สร้าง session ที่ยืนยันแล้ว");
    return session;
  }
  async logout() {
    localStorage.setItem(LINE_SIGNED_OUT_KEY, "1");
    const response = await fetch(authApiUrl("auth/logout"), { method:"POST", credentials:"same-origin", cache:"no-store",
      redirect:"error", headers:{ Accept:"application/json", "Content-Type":"application/json" }, body:"{}" });
    if (!response.ok) throw new Error("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
  }
}

export class PwaAuthProvider extends LineLiffAuthProvider {}

export function createAuthProvider(mode) {
  return mode === "mock" ? new MockAuthProvider(MOCK_SESSION_ROLE, MOCK_SESSION_GROUP) : mode === "development"
    ? new DevelopmentAuthProvider() : new PwaAuthProvider();
}
export const authProvider = createAuthProvider(APP_MODE);



