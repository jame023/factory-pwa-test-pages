import { authProvider, getSupabaseLineAccessToken, checkSupabaseSession } from './auth.js?v=1.3.238';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.186';

const fail = (message, code, status) => Object.assign(new Error(message), { code, status });

// Compatibility adapter for Admin repositories. The app owns login, renewal and logout.
export async function getMachineAdminSession() {
  const accessToken = getSupabaseLineAccessToken();
  if (!accessToken) return null;
  const state = await checkSupabaseSession();
  if (state?.authorized !== true || state.role !== 'admin' ||
      typeof state.employee_id !== 'string' || !state.employee_id) {
    throw fail('ไม่มีสิทธิ์ดำเนินการ', 'PERMISSION_DENIED', 403);
  }
  const assertCurrent = () => {
    if (getSupabaseLineAccessToken() !== accessToken) {
      throw fail('Session เปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง', 'SESSION_CHANGED', 401);
    }
  };
  assertCurrent();
  const url = new URL('/rest/v1/employees', SUPABASE_URL);
  url.search = new URLSearchParams({
    select: 'id,employee_name,line_display_name,main_group,active',
    id: 'eq.' + state.employee_id,
  });
  let response;
  try {
    response = await fetch(url, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error',
    });
  } catch (cause) {
    throw Object.assign(fail('ติดต่อ Supabase ไม่สำเร็จ กรุณาลองใหม่', 'NETWORK_ERROR', 0), { cause });
  }
  assertCurrent();
  if (!response.ok) {
    throw fail(
      response.status === 401 ? 'Session หมดอายุ' : response.status === 403 ? 'ไม่มีสิทธิ์ดำเนินการ' : 'อ่านบัญชีผู้ใช้ไม่สำเร็จ',
      response.status === 401 ? 'SESSION_EXPIRED' : response.status === 403 ? 'PERMISSION_DENIED' : 'API_ERROR',
      response.status,
    );
  }
  const rows = await response.json();
  assertCurrent();
  const employee = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!employee || employee.id !== state.employee_id || employee.active !== true ||
      employee.main_group !== state.main_group) {
    throw fail('บัญชีหรือสิทธิ์เปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง', 'PERMISSION_DENIED', 403);
  }
  return {
    accessToken,
    user: {
      id: employee.id, employee_id: employee.id,
      name: employee.employee_name, lineDisplayName: employee.line_display_name || '',
      role: state.role, main_group: state.main_group,
      groups: [...state.groups], calendarGroups: [], active: true,
    },
  };
}

// Older callers use the same whole-app actions; there is no module-specific session.
export function loginToMachineAdmin() { return authProvider.login(); }
export function logoutFromMachineAdmin() { return authProvider.logout(); }
