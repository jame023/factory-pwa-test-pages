import { getMachineAdminSession } from './machine-admin-auth.js';
import { createSupabaseItemNameRepository } from './item-name-admin-repository.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

async function repository() {
  const session = await getMachineAdminSession();
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ LINE เพื่อโหลดชื่อรายการ');
  return createSupabaseItemNameRepository({ supabaseUrl:SUPABASE_URL, publishableKey:SUPABASE_PUBLISHABLE_KEY, accessToken:session.accessToken, user:session.user });
}
export async function listActiveItemNames() {
  const rows = await (await repository()).listItems({ active:true });
  return rows.filter(row => row.active === true).sort((a,b) => a.item_name.localeCompare(b.item_name,'th'));
}
export async function requireActiveItemName(id, expectedName) {
  if (!id) throw new Error('กรุณาเลือกชื่อรายการจากรายการที่เปิดใช้งาน');
  const item = await (await repository()).getItemById(id);
  if (!item || item.active !== true) throw new Error('ชื่อรายการนี้ปิดใช้งานแล้ว กรุณาโหลดรายการใหม่');
  if (item.item_name !== expectedName) throw new Error('ชื่อรายการมีการเปลี่ยนแปลง กรุณาโหลดรายการใหม่');
  return item;
}

