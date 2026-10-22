import { saveSession, loadSession, deleteSession, withSessionLock } from './session-vault.js?v=1.3.191';
import { APP_MODE, MOCK_USERS, ROLE_LABELS, MOCK_SESSION_ROLE, MOCK_SESSION_GROUP, LINE_LIFF_ID, API_BASE_URL,
  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_LINE_PROVIDER } from "./config.js?v=1.3.186";
import { startPkceOAuth, completePkceOAuth } from "./pkce-oauth.js?v=1.3.186";

import { requestReadOnly } from "./read-only-api.js?v=1.3.186";
import { normalizeRole, normalizeGroup } from "./permissions.js?v=1.3.186";
import { ACTIVE_DIRECTORY_NAMES, DIRECTORY_SNAPSHOT_DATE } from './directory-snapshot.js?v=1.3.186';
import { getStore } from './state.js?v=1.3.186';

const MOCK_LOGIN_KEY = "factory-pwa-demo-login-v1";
const LINE_SIGNED_OUT_KEY = "factory-pwa-line-signed-out-v1";
const SESSION_ROLES = new Set(["employee", "executive", "admin"]);
const SESSION_GROUPS = new Set(["ผลิต", "สกรีน", "ขนส่ง", "ออฟฟิต"]);
const SUPABASE_SESSION_KEY = "factory-pwa-line-supabase-session-v1";
let liffPromise;

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
  async logout() { localStorage.removeItem(MOCK_LOGIN_KEY); }
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
  const allowedProducts = values => Array.isArray(values) ? values.filter(value=>typeof value==="string" && value.length<=120) : [];
  return { user:{ id:user.id, name:user.name.trim(), role, groups,
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



function decodeClaims(token) {
  const segment = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!segment) throw new Error("ไม่สามารถยืนยันตัวตนได้");
  try {
    return JSON.parse(decodeURIComponent(Array.from(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, "=")))
      .map(char => "%" + char.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
  } catch (_) { throw new Error("ไม่สามารถยืนยันตัวตนได้"); }
}

async function supabaseRequest(path, { method = "GET", token, body } = {}) {
  const headers = { apikey:SUPABASE_PUBLISHABLE_KEY, Accept:"application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(new URL(path, SUPABASE_URL), { method, headers,
    body:body === undefined ? undefined : JSON.stringify(body), cache:"no-store", redirect:"error" });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("เชื่อมต่อระบบยืนยันตัวตนไม่ได้");
    error.status = response.status;
    error.authMessage = String(value?.msg || value?.message || value?.error_description || "");
    throw error;
  }
  return value;
}

async function clearStoredSession() {
  sessionStorage.removeItem(SUPABASE_SESSION_KEY);
  sessionStorage.removeItem('factory-pwa-machine-supabase-session-v1');
  localStorage.setItem('factory-pwa-session-signed-out','1');
  await deleteSession();
}
export function clearSupabaseSession() { return withSessionLock(clearStoredSession); }

function authFailure(value) {
  const text = String(value || '');
  if (text.includes('FACTORY_ACCOUNT_INACTIVE') || text === 'inactive') return new Error('บัญชีถูกระงับการใช้งาน');
  if (text.includes('FACTORY_ACCOUNT_NOT_FOUND') || text === 'not_found') return new Error('ยังไม่มีบัญชีในระบบ');
  if (text.includes('FACTORY_NO_GROUP')) return new Error('ยังไม่มีกลุ่มงาน กรุณาติดต่อ Admin');
  if (text === 'session_expired') return new Error('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE ใหม่');
  if (text === 'permissions_changed') return new Error('สิทธิ์บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบ LINE ใหม่');
  return new Error('ไม่สามารถยืนยันตัวตนได้ กรุณาเริ่ม LINE Login ใหม่');
}

export async function checkSupabaseSession() {
  const token = getSupabaseLineAccessToken();
  if (!token) throw authFailure('session_expired');
  const result = await supabaseRequest('/rest/v1/rpc/factory_session_status', {method:'POST', token, body:{}});
  if (result?.authorized !== true) throw authFailure(result?.reason);
  return result;
}

export function getSupabaseLineAccessToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY) || 'null');
    if (!saved?.accessToken || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) return '';
    return saved.accessToken;
  } catch (_) { return ''; }
}

function roleForGroups(groups) {
  if (groups.includes("Admin")) return "admin";
  if (groups.includes("ผู้บริหาร")) return "executive";
  return groups.length ? "employee" : "none";
}

export class SupabaseLineAuthProvider extends AuthProvider {
  async login() {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_LINE_PROVIDER) {
      throw new Error("การตั้งค่า LINE Login ยังไม่ครบ");
    }
    await startPkceOAuth({ supabaseUrl:SUPABASE_URL, provider:SUPABASE_LINE_PROVIDER,
      redirectTo:globalThis.location.origin + globalThis.location.pathname + globalThis.location.hash });
    return null;
  }

  async getSession() { return withSessionLock(() => this.restoreSession()); }

  async restoreSession() {
    // The Admin data module owns this separate PKCE callback; keep it for machine-admin-auth.js.
    const isAdminModuleCallback = new URLSearchParams(location.search).has('code') && /^#\/admin\/(employees|groups|machines|item-names)(?:$|\?)/.test(location.hash);
    const callback = isAdminModuleCallback ? null : await completePkceOAuth({ supabaseUrl:SUPABASE_URL, publishableKey:SUPABASE_PUBLISHABLE_KEY });
    if (callback?.error) {
      await clearStoredSession();
      throw authFailure(callback.error);
    }

    let saved = callback?.accessToken ? callback : null;
    if (!saved) {
      if (localStorage.getItem('factory-pwa-session-signed-out') === '1') return null;
      saved = await loadSession();
      if (!saved) {
        try { saved = JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY) || "null"); } catch (_) { saved = null; }
      }
    }
    if (!saved?.accessToken || !saved?.refreshToken) return null;
    if (!Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
      await clearStoredSession();
      throw authFailure('session_expired');
    }

    // Reissue the Supabase session on app start so the Auth Hook recalculates access.
    try {
      const refreshed = await supabaseRequest("/auth/v1/token?grant_type=refresh_token", {
        method:"POST", body:{ refresh_token:saved.refreshToken }
      });
      saved = { accessToken:refreshed.access_token, refreshToken:refreshed.refresh_token,
        expiresAt:Date.now() + Number(refreshed.expires_in || 3600) * 1000 };
      // Rotation has already happened. Preserve the new pair if a later read has a network error.
      await saveSession(saved);
    } catch (error) {
      await clearStoredSession();
      throw authFailure(error.authMessage);
    }

    const claims = decodeClaims(saved.accessToken);
    const metadata = claims.app_metadata || {};
    if (metadata.employee_status === "inactive") {
      await clearStoredSession();
      throw new Error("บัญชีถูกระงับการใช้งาน");
    }
    if (metadata.employee_status === "not_found") {
      await clearStoredSession();
      throw new Error("ยังไม่มีบัญชีในระบบ");
    }
    const role = metadata.role;
    const employeeId = metadata.employee_id;
    if (!claims.exp || Number(claims.exp) * 1000 <= Date.now() ||
        !["admin", "employee", "executive"].includes(role) || typeof employeeId !== "string") {
      await clearStoredSession();
      throw new Error("บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อ Admin");
    }

    // Supabase verifies the signed token; RLS limits both reads to this employee.
    const authUser = await supabaseRequest("/auth/v1/user", { token:saved.accessToken });
    if (!(authUser?.identities || []).some(identity => identity.provider === SUPABASE_LINE_PROVIDER)) {
      await clearStoredSession();
      throw new Error("ไม่สามารถยืนยันตัวตนได้");
    }
    const employeeUrl = new URL("/rest/v1/employees", SUPABASE_URL);
    employeeUrl.search = new URLSearchParams({ select:"id,employee_name,line_display_name,main_group,active", id:`eq.${employeeId}` });
    const employees = await supabaseRequest(employeeUrl.pathname + employeeUrl.search, { token:saved.accessToken });
    const employee = Array.isArray(employees) && employees.length === 1 ? employees[0] : null;
    if (!employee || employee.active !== true) {
      await clearStoredSession();
      throw new Error(employee?.active === false ? "บัญชีถูกระงับการใช้งาน" : "ยังไม่มีบัญชีในระบบ");
    }
    const groupsUrl = new URL("/rest/v1/employee_groups", SUPABASE_URL);
    groupsUrl.search = new URLSearchParams({ select:"group_name", employee_id:`eq.${employeeId}`, active:"eq.true" });
    const memberships = await supabaseRequest(groupsUrl.pathname + groupsUrl.search, { token:saved.accessToken });
    const groups = [...new Set((Array.isArray(memberships) ? memberships : []).map(row => row.group_name)
      .filter(value => typeof value === "string" && value.length <= 80))];
    if (roleForGroups(groups) !== role) {
      await clearStoredSession();
      throw new Error("สิทธิ์บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบ LINE ใหม่");
    }

    await saveSession(saved);
    localStorage.removeItem('factory-pwa-session-signed-out');
    sessionStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(saved));
    const sessionExpiry = new Date(Number(claims.exp) * 1000).toISOString();
    const redirectTarget = role === "admin" ? "admin" : role === "executive" ? "executive" : "home";
    return { authenticated:true, provider:"supabase-line", label:ROLE_LABELS[role],
      employee_id:employee.id, employee_name:employee.employee_name,
      line_display_name:employee.line_display_name || "", main_group:employee.main_group || "",
      groups, active:true, session_expiry:sessionExpiry, redirect_target:redirectTarget,
      user:{ id:employee.id, employee_id:employee.id, authUserId:authUser.id,
        name:employee.employee_name, lineDisplayName:employee.line_display_name || "",
        main_group:employee.main_group || "", role, groups, calendarGroups:groups.filter(value=>SESSION_GROUPS.has(value)),
        active:true, redirectTarget } };
  }

  async logout() {
    return withSessionLock(async () => {
      let saved = await loadSession();
      if (!saved) { try { saved = JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY) || "null"); } catch (_) {} }
      await clearStoredSession();
      if (saved?.accessToken) {
        try { await supabaseRequest('/auth/v1/logout', {method:'POST',token:saved.accessToken,body:{}}); }
        catch (error) { if (![401,403].includes(error.status)) throw error; }
      }
    });
  }
}

export function createAuthProvider(mode) {
  return mode === "mock" ? new MockAuthProvider(MOCK_SESSION_ROLE, MOCK_SESSION_GROUP) : mode === "supabase-line"
    ? new SupabaseLineAuthProvider() : mode === "development"
    ? new DevelopmentAuthProvider() : new PwaAuthProvider();
}
export const authProvider = createAuthProvider(APP_MODE);



