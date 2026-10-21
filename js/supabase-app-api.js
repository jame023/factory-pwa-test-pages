import { validateLeaveSubmission, storedLeaveItems } from './leave-rules.js?v=1.3.184';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.3.184';

import { RECORD_SCHEMAS, validateRecord } from './record-schema.js?v=1.3.184';
import { bangkokToday } from './utils.js?v=1.3.184';
const SESSION_KEY = 'factory-pwa-line-supabase-session-v1';
function getSupabaseLineAccessToken() { try { const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null'); return saved?.accessToken && Number.isFinite(saved.expiresAt) && saved.expiresAt>Date.now() ? saved.accessToken : ''; } catch (_) { return ''; } }

const CATEGORIES = new Set(['attendance','workSessions','leaveRequests','calendar','deliveries','production','screenEntries','otRequests']);
const GROUP_BY_CATEGORY = { screenEntries:'สกรีน', production:'ผลิต', deliveries:'ขนส่ง' };
const fail = (message, code='API_ERROR') => Object.assign(new Error(message), { code });
const canonical = value => value === 'ออฟฟิต' ? 'ออฟฟิศ' : value;
const safeJson = async response => {
  const raw = await response.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!response.ok) {
    if (response.status === 401) throw fail('Session หมดอายุ กรุณาเข้าสู่ระบบ LINE อีกครั้ง','SESSION_EXPIRED');
    if (response.status === 403) throw fail('ไม่มีสิทธิ์ดำเนินการ','PERMISSION_DENIED');
    if (data?.code === '23505') throw fail('พบข้อมูลซ้ำ ไม่สามารถบันทึกซ้ำได้','DUPLICATE_RECORD');
    throw fail(data?.code === '42501' ? 'ไม่มีสิทธิ์ดำเนินการ' : 'บันทึกหรืออ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่','API_ERROR');
  }
  return data;
};

export function createSupabaseAppApi() {
  const token = getSupabaseLineAccessToken();
  if (!token) throw fail('กรุณาเข้าสู่ระบบ LINE ใหม่','SESSION_EXPIRED');
  const base = SUPABASE_URL.replace(/\/$/,'');
  async function call(path, init={}) {
    let response;
    try { response = await fetch(base + path, { ...init, cache:'no-store', redirect:'error', headers:{
      apikey:SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${token}`, Accept:'application/json',
      ...(init.body ? {'Content-Type':'application/json'} : {}), ...(init.headers || {})
    }}); } catch (error) { throw Object.assign(fail('เชื่อมต่อ Supabase ไม่ได้ กรุณาตรวจอินเทอร์เน็ต','NETWORK_ERROR'),{cause:error}); }
    return safeJson(response);
  }
    const claims = JSON.parse(decodeURIComponent(Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(token.split('.')[1].length/4)*4,'='))).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
  const userId = async () => {
    if (!claims?.app_metadata?.employee_id || !['admin','employee','executive'].includes(claims.app_metadata.role)) throw fail('สิทธิ์บัญชีไม่ถูกต้อง','PERMISSION_DENIED');
    return claims.app_metadata.employee_id;
  };const rowMap = row => ({ ...row.payload, id:row.id, employeeId:row.owner_id, group:row.group_name, createdAt:row.created_at, updatedAt:row.updated_at, employee:row.payload.employee || row.payload.operator || row.payload.sender || row.payload.operatorName });
  async function rows(category, filters={}) {
    if (!CATEGORIES.has(category)) throw fail('ไม่พบหมวดข้อมูล','VALIDATION_ERROR');
    const params = new URLSearchParams({select:'id,category,owner_id,group_name,payload,created_at,updated_at',category:`eq.${category}`,order:'created_at.desc',limit:'1000',...filters});
    return (await call('/rest/v1/factory_records?'+params)).map(rowMap);
  }
function normalizeImages(images) {
    if (!Array.isArray(images) || images.length > 10) throw fail('แนบรูปได้ไม่เกิน 10 รูป','VALIDATION_ERROR');
    let total = 0;
    return images.map(image => {
      if (!image || typeof image !== 'object' || typeof image.dataUrl !== 'string' ||
          !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl) ||
          image.dataUrl.length > 1450000) throw fail('รูปแนบไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด','VALIDATION_ERROR');
      const mimeType = image.dataUrl.slice(5,image.dataUrl.indexOf(';'));
      const bytes = Math.floor((image.dataUrl.length - image.dataUrl.indexOf(',') - 1) * 3 / 4);
      total += bytes;
      if (total > 2 * 1024 * 1024) throw fail('รูปแนบรวมต้องไม่เกิน 2 MB','VALIDATION_ERROR');
      return {name:String(image.name||'รูปแนบ').slice(0,120),mimeType,size:Number(image.size)||bytes,dataUrl:image.dataUrl};
    });
  }
  async function verifySaved(row) {
    if (!row?.id) throw fail('ยังยืนยันผลการบันทึกไม่ได้','INCOMPLETE_WRITE');
    const params = new URLSearchParams({select:'*', id:`eq.${row.id}`, category:`eq.${row.category}`});
    const [saved] = await call('/rest/v1/factory_records?'+params);
    if (!saved || saved.updated_at !== row.updated_at || JSON.stringify(saved.payload) !== JSON.stringify(row.payload))
      throw fail('บันทึกแล้วแต่ตรวจข้อมูลกลับไม่สำเร็จ กรุณาตรวจรายการก่อนบันทึกซ้ำ','INCOMPLETE_WRITE');
    // The database audit trigger commits atomically with every record mutation.
    if (claims.app_metadata.role === 'admin') {
      const audit = new URLSearchParams({select:'id',record_id:`eq.${row.id}`,table_name:`eq.factory_records:${row.category}`,limit:'1'});
      const logs = await call('/rest/v1/audit_logs?'+audit);
      if (!logs?.length) throw fail('ยังตรวจสอบประวัติการบันทึกไม่สำเร็จ','INCOMPLETE_AUDIT');
    }
    return rowMap(saved);
  }
  async function insert(category, values, groupName=null, ownerId=null) {
    const id = await userId();
const normalized = category === 'leaveRequests' && Array.isArray(values.leaveItems)
      ? {...validateRecord(category,{...values,period:'เต็มวัน'}),period:values.period,leaveItems:values.leaveItems,totalDays:values.totalDays,attachments:values.attachments,hasMedicalCertificate:values.hasMedicalCertificate}
      : validateRecord(category, category === 'otRequests' ? {...values,photo:''} : values);
    if (category === 'deliveries') {
      const bill = String(values.billNumber || '').trim().toUpperCase();
      if (!/^SD[0-9]{9}$/.test(bill)) throw fail('เลขที่บิลต้องเป็น SD ตามด้วยตัวเลข 9 หลัก','VALIDATION_ERROR');
      normalized.billNumber = bill;
    }
    if (category === 'otRequests' || category === 'leaveRequests' || category === 'deliveries') normalized.images = normalizeImages(values.images || values.photos || []);
    const row = { category, owner_id:ownerId || id, group_name:canonical(groupName || GROUP_BY_CATEGORY[category] || null), payload:normalized, created_by:id, updated_by:id };
    const data = await call('/rest/v1/factory_records?select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});
    return verifySaved(data[0]);
  }
  async function update(id, category, values, reason='') {
    const actor = await userId();
    if (!reason.trim() || reason.trim().length>500) throw fail('กรุณาระบุเหตุผลการแก้ไขไม่เกิน 500 ตัวอักษร','VALIDATION_ERROR');
    const params = new URLSearchParams({id:`eq.${id}`,category:`eq.${category}`,select:'*'});
    const data = await call('/rest/v1/factory_records?'+params,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:validateRecord(category,values),reason:reason.trim(),updated_by:actor,updated_at:new Date().toISOString()})});
    if (!data?.length) throw fail('ไม่พบรายการที่แก้ไข','NOT_FOUND');
    return verifySaved(data[0]);
  }
  async function dispatch(module, action, p={}) {
    if (module==='package01' && action==='devices.read') return call('/rest/v1/machines?select=id,machine_code,machine_name,work_group,active,display_order&order=display_order.asc');
    if (module==='package01' && action==='screenManual.read') return rows('screenEntries');
    if (module==='package01' && action==='screenManual.create') return insert('screenEntries',{...p,operatorName:await currentName()});
    if (module==='package04' && action==='delivery.list') return rows('deliveries');
    if (module==='package04' && action==='delivery.options') {
      const products=await call('/rest/v1/item_names?select=item_name&active=eq.true&order=item_name.asc');
      return {allowed:true,products:products.map(r=>r.item_name),sender:await currentName(),source:'supabase',directorySnapshotDate:null};
    }
    if (module==='package04' && action==='delivery.create') return insert('deliveries',{...p,sender:await currentName()},'ขนส่ง');
    if (module==='package04' && action==='delivery.undo') {
      const actor=await userId(); const raw=await call('/rest/v1/factory_records?select=id,owner_id,group_name,payload,created_at,updated_at&id=eq.'+encodeURIComponent(p.id)+'&category=eq.deliveries');
      const row=raw?.[0]; if(!row || row.payload?.status==='ยกเลิก') throw fail('ไม่พบรายการขนส่งที่ยังยกเลิกได้','NOT_FOUND');
      const next={...row.payload,status:'ยกเลิก',legacyStatus:'UNDONE',undoneAt:new Date().toISOString()};
      const data=await call('/rest/v1/factory_records?id=eq.'+encodeURIComponent(row.id)+'&category=eq.deliveries&select=*',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:next,reason:'ยกเลิกรายการขนส่ง',updated_by:actor,updated_at:new Date().toISOString()})}); return verifySaved(data[0]);
    }
    if (module==='package05' && action==='production.list') return rows('production');
    if (module==='package05' && action==='production.create') return insert('production',{...p,operator:await currentName()},'ผลิต');
    if (module==='package07' && action==='work.read') return rows('workSessions');
    if (module==='package07' && action==='work.options') {
      const orders=await call('/rest/v1/item_names?select=item_name&active=eq.true&order=item_name.asc'); return {orders:orders.map(r=>r.item_name),source:'supabase',directorySnapshotDate:null};
    }
    if (module==='package07' && action==='work.start') return insert('workSessions',{...p,employee:await currentName(),quantity:0,startedAt:new Date().toISOString(),endedAt:''},canonical(p.workType));
    if (module==='package07' && action==='work.end') {
      const id=await userId(); const [active]=await rows('workSessions',{id:`eq.${p.id}`}); if(!active || active.endedAt) throw fail('ไม่พบงานที่กำลังทำอยู่','NOT_FOUND');
      const payload={...active,quantity:Number(p.quantity),endedAt:new Date().toISOString()};
      return update(p.id,'workSessions',payload,'จบงาน');
    }
    if (module==='package07' && action==='ot.read') return rows('otRequests');
    if (module==='package07' && action==='ot.submit') return insert('otRequests',{...p,employee:await currentName()});
    if (module==='package09' && action==='leave.read') return rows('leaveRequests');
    if (module==='package09' && action==='leave.submit') {
      const id=await userId(), group=await currentGroup(), uiGroup=group==='ออฟฟิศ'?'ออฟฟิต':group;
      const [history,calendar]=await Promise.all([rows('leaveRequests'),rows('calendar',{group_name:`eq.${group}`})]);
      const values=validateLeaveSubmission(p,{id,primaryWorkGroup:uiGroup,calendarGroups:[uiGroup]},history,calendar.map(row=>({...row,group:uiGroup})));
      return insert('leaveRequests',{...values,employee:await currentName(),images:p.images||[]},group);
    }
    if (module==='package09' && action==='leave.review') {
      const actor=await userId(); const raw=await call('/rest/v1/factory_records?select=id,owner_id,group_name,payload,created_at,updated_at&id=eq.'+encodeURIComponent(p.id)+'&category=eq.leaveRequests');
      const row=raw?.[0] ? rowMap(raw[0]) : null; const old=raw?.[0]?.payload; if(!row || old?.status!=='pending') throw fail('ไม่พบคำขอรอพิจารณา','NOT_FOUND');
      if(!['approved','rejected'].includes(p.decision) || (p.decision==='rejected' && !String(p.rejectionReason||'').trim())) throw fail('กรุณาเลือกผลและระบุเหตุผลเมื่อปฏิเสธ','VALIDATION_ERROR');
      const next={...old,status:p.decision,reviewedAt:new Date().toISOString(),reviewedBy:await currentName(),rejectionReason:p.decision==='rejected'?String(p.rejectionReason).trim():''};
      const data=await call('/rest/v1/factory_records?id=eq.'+encodeURIComponent(row.id)+'&category=eq.leaveRequests&select=*',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:next,reason:next.rejectionReason||'พิจารณาคำขอลา',updated_by:actor,updated_at:new Date().toISOString()})}); return verifySaved(data[0]);
    }
    if (module==='package09' && action==='leave.cancel') {
      const actor=await userId(); const raw=await call('/rest/v1/factory_records?select=id,owner_id,group_name,payload,created_at,updated_at&id=eq.'+encodeURIComponent(p.id)+'&category=eq.leaveRequests');
      const row=raw?.[0] ? rowMap(raw[0]) : null; const old=raw?.[0]?.payload; if(!row) throw fail('ไม่พบคำขอลา','NOT_FOUND');
      if(!String(p.reason||'').trim()) throw fail('กรุณาระบุเหตุผลการยกเลิก','VALIDATION_ERROR');
      const next={...old,status:'cancelled',cancelledAt:new Date().toISOString(),cancellationReason:String(p.reason).trim()};
      const data=await call('/rest/v1/factory_records?id=eq.'+encodeURIComponent(row.id)+'&category=eq.leaveRequests&select=*',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({payload:next,reason:next.cancellationReason,updated_by:actor,updated_at:new Date().toISOString()})}); return verifySaved(data[0]);
    }
    if (module==='package08' && action==='calendar.read') {
      const filters={}; if(p.group) filters.group_name=`eq.${canonical(p.group)}`;
      const result=await rows('calendar',filters); const memberships=await call('/rest/v1/employee_groups?select=group_name,employee_id,active&active=eq.true'); const id=await userId(); const groups=[...new Set((claims.app_metadata.role==='admin' ? memberships : memberships.filter(r=>r.employee_id===id)).map(r=>canonical(r.group_name)))].filter(g=>['ผลิต','สกรีน','ขนส่ง','ออฟฟิศ'].includes(g)); const leaves=await rows('leaveRequests',{'payload->>status':'eq.approved'}); const approvedLeaves=leaves.flatMap(row=>storedLeaveItems(row).map(day=>({date:day.date,employee:row.employee,period:day.label,group:row.group}))).filter(day=>day.date.startsWith(p.month)); return {groups,month:p.month,entries:result.filter(r=>r.date?.startsWith(p.month)),approvedLeaves};
    }
    if (module==='package08' && action==='calendar.save') {
      const [existing]=await rows('calendar',{group_name:`eq.${canonical(p.group)}`, 'payload->>date':`eq.${p.date}`});
      return existing ? update(existing.id,'calendar',p,'แก้ไขปฏิทิน') : insert('calendar',p,canonical(p.group));
    }
    if (module==='package08' && action==='calendar.batch.save') return Promise.all((p.entries||[]).map(entry=>dispatch(module,'calendar.save',entry)));
    if (module==='package08' && action==='calendar.notifications.read') return [];
    if (module==='package09' && ['leave.notifications.read','leave.notices.read'].includes(action)) return [];
    if (module==='package10' && action==='attendance.notifications.read') return [];
    if (module==='package10' && action==='attendance.manager') return {pendingLeaves:(await rows('leaveRequests',{ 'payload->>status':'eq.pending'})).length,date:bangkokToday(),source:{kind:'real'}};
    if (module==='package10' && action==='attendance.read') {
      const [attendance,calendarRows,leaves] = await Promise.all([
        rows('attendance',{ 'payload->>date':`gte.${p.month}-01`}),
        rows('calendar',{ 'payload->>date':`gte.${p.month}-01`}),
        rows('leaveRequests')
      ]);
      const history=attendance.filter(r=>r.date?.startsWith(p.month)).map(r=>({date:r.date,checkIn:r.checkIn||null,checkOut:r.checkOut||null,status:r.status||({'present':'present-full','leave':'leave','absent':'absent','holiday':'holiday'}[r.workdayStatus]||'unrecorded'),lateMinutes:Number(r.lateMinutes)||0,earlyLeaveMinutes:Number(r.earlyLeaveMinutes)||0,overtimeMinutes:Number(r.overtimeMinutes)||0}));
      const today=history.find(r=>r.date===bangkokToday())||{date:bangkokToday(),checkIn:null,checkOut:null,status:'unrecorded',lateMinutes:0,earlyLeaveMinutes:0,overtimeMinutes:0};
      const calendarDays=calendarRows.filter(r=>r.date?.startsWith(p.month)).map(r=>({date:r.date,status:({'เต็มวัน':'scheduled','ครึ่งวัน':'present-half','หยุด':'holiday'}[r.status]||'scheduled')}));
      const id=await userId(); const myLeaves=leaves.filter(r=>r.employeeId===id && ['approved','pending'].includes(r.status) && r.startDate<=bangkokToday() && r.endDate>=bangkokToday());
      const status=today.status==='unrecorded' && myLeaves.some(r=>r.status==='approved') ? 'leave' : today.status;
      const summary={attendanceDays:history.filter(r=>['present-full','present-half','in-progress'].includes(r.status)).length,leaveDays:history.filter(r=>r.status==='leave').length,absentDays:history.filter(r=>r.status==='absent').length,lateMinutes:history.reduce((s,r)=>s+r.lateMinutes,0),earlyLeaveMinutes:history.reduce((s,r)=>s+r.earlyLeaveMinutes,0),overtimeMinutes:history.reduce((s,r)=>s+r.overtimeMinutes,0)};
      return {...today,workdayStatus:status,absent:status==='absent',leaveStatus:myLeaves.find(r=>r.status==='approved')?.type||null,month:p.month,period:p.period,history,calendarDays,summary,source:{kind:'real',asOf:new Date().toISOString()}};
    }
    if (module==='package03' && ['attendance.dashboard','attendance.read'].includes(action)) {
      const today=bangkokToday();
      const start=String(p.startDate||today).slice(0,10), end=String(p.endDate||today).slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end) throw fail('ช่วงวันที่ไม่ถูกต้อง','VALIDATION_ERROR');
      const [records,employees,memberships]=await Promise.all([
        rows('attendance',{'payload->>date':`gte.${start}`}),
        call('/rest/v1/employees?select=id,employee_name,main_group,active&active=eq.true&order=employee_name.asc'),
        call('/rest/v1/employee_groups?select=employee_id,group_name&active=eq.true')
      ]);
      const people=employees.map(person=>({id:person.id,name:person.employee_name,groups:[...new Set([person.main_group,...memberships.filter(item=>item.employee_id===person.id).map(item=>item.group_name)].filter(Boolean).map(canonical))]}));
      const inRange=records.filter(row=>row.date>=start&&row.date<=end);
      const daily=inRange.map(row=>({date:row.date,name:row.employee||rowMap(row).employee||people.find(person=>person.id===row.employeeId)?.name||'ไม่ระบุ',employeeId:row.employeeId,checkIn:row.checkIn||'',checkOut:row.checkOut||'',dayStatus:row.workdayStatus||'ไม่ระบุสถานะ',lateMinutes:Number(row.lateMinutes)||0,earlyMinutes:Number(row.earlyLeaveMinutes)||0,overtimeMinutes:Number(row.overtimeMinutes)||0,status:row.absent?'ขาด':row.workdayStatus==='leave'?'ลา':row.checkOut?'เลิกงาน':row.checkIn?'เข้างาน':'—',note:row.note||''}));
      const matched=people.filter(person=>!p.name||person.name.toLocaleLowerCase('th').includes(String(p.name).toLocaleLowerCase('th')));
      const summaries=matched.map(person=>{
        const own=inRange.filter(row=>row.employeeId===person.id);
        const present=own.filter(row=>row.checkIn), leave=own.filter(row=>row.workdayStatus==='leave'), absent=own.filter(row=>row.absent||row.workdayStatus==='absent'), late=own.filter(row=>Number(row.lateMinutes)>0), early=own.filter(row=>Number(row.earlyLeaveMinutes)>0), ot=own.filter(row=>Number(row.overtimeMinutes)>0);
        return {name:person.name,groups:person.groups,workdays:own.length,attendanceDays:present.length,leaveDays:leave.length,absenceDays:absent.length,lateDays:late.length,lateMinutes:late.reduce((sum,row)=>sum+(Number(row.lateMinutes)||0),0),earlyDays:early.length,earlyMinutes:early.reduce((sum,row)=>sum+(Number(row.earlyLeaveMinutes)||0),0),overtimeDays:ot.length,overtimeMinutes:ot.reduce((sum,row)=>sum+(Number(row.overtimeMinutes)||0),0)};
      });
      const total={workdays:inRange.length,attendanceDays:inRange.filter(row=>row.checkIn).length,leaveDays:inRange.filter(row=>row.workdayStatus==='leave').length,absenceDays:inRange.filter(row=>row.absent||row.workdayStatus==='absent').length,lateDays:inRange.filter(row=>Number(row.lateMinutes)>0).length,lateMinutes:inRange.reduce((sum,row)=>sum+(Number(row.lateMinutes)||0),0),earlyDays:inRange.filter(row=>Number(row.earlyLeaveMinutes)>0).length,earlyMinutes:inRange.reduce((sum,row)=>sum+(Number(row.earlyLeaveMinutes)||0),0),overtimeDays:inRange.filter(row=>Number(row.overtimeMinutes)>0).length,overtimeMinutes:inRange.reduce((sum,row)=>sum+(Number(row.overtimeMinutes)||0),0)};
      return {employees:people.map(({name})=>({name})),summaries,daily,startDate:start,endDate:end,currentDate:today,totals,overviewTotals:total,source:{kind:'real',asOf:new Date().toISOString()}};
    }
    if (module==='package06' && action==='reports.read') {
      if(!['today','week','month'].includes(p.period)) throw fail('เลือกรอบรายงานไม่ถูกต้อง','VALIDATION_ERROR');
      const today=bangkokToday(); let start=today;
      if(p.period==='month') start=today.slice(0,7)+'-01';
      if(p.period==='week'){const day=new Date(today+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);start=day.toISOString().slice(0,10);}
      const [attendance,production,deliveries,leaves]=await Promise.all([rows('attendance'),rows('production'),rows('deliveries'),rows('leaveRequests')]);
      const within=date=>typeof date==='string' && date.slice(0,10)>=start && date.slice(0,10)<=today;
      const a=attendance.filter(r=>within(r.date)); const prod=production.filter(r=>within(r.date||r.createdAt)); const delivery=deliveries.filter(r=>r.status!=='ยกเลิก' && within(r.dateTime||r.createdAt));
      const approvedLeaves=leaves.filter(r=>r.status==='approved' && r.startDate<=today && r.endDate>=start);
      const totals=new Map(); prod.forEach(r=>totals.set(r.operator||r.employee||'ไม่ระบุ',(totals.get(r.operator||r.employee||'ไม่ระบุ')||0)+Number(r.quantity||0)));
      return {period:p.period,present:a.filter(r=>r.checkIn).length,late:a.filter(r=>Number(r.lateMinutes)>0).length,leave:approvedLeaves.length,absent:a.filter(r=>r.absent===true||r.workdayStatus==='absent').length,production:prod.reduce((sum,r)=>sum+Number(r.quantity||0),0),delivery:delivery.length,outstanding:[...totals].sort((x,y)=>y[1]-x[1])[0]?.[0]||'—',source:{kind:'real',asOf:new Date().toISOString()}};
    }
    if (module==='package06' && action==='reports.inbox.read') return [];
    if (module==='package06' && action==='reports.notifications.read') return [];
    if (module==='package06' && action==='reports.preview.create') throw fail('การสร้างรายงานยังไม่ได้เชื่อมแหล่งข้อมูลจริง','NOT_CONFIGURED');
    if (module==='package11' && action==='admin.read') {
      const audit=await call('/rest/v1/audit_logs?select=id,table_name,record_id,action,reason,created_at&order=created_at.desc&limit=100');
      const employees=await call('/rest/v1/employees?select=id'); return {moduleCount:10,auditCount:audit.length,employeeCount:employees.length,status:'real',auditLog:audit};
    }
    if (module==='package11' && action==='records.list') {
      if (p.category==='employees') return call('/rest/v1/employees?select=id,employee_name,main_group,active,employee_code&order=employee_name.asc');
      return rows(p.category);
    }
    if (module==='package11' && action==='records.save') {
      if (p.category==='employees') throw fail('จัดการพนักงานผ่านหน้าจัดการพนักงานโดยตรง','NOT_CONFIGURED');
      return p.id ? update(p.id,p.category,p.values,p.reason) : insert(p.category,p.values,p.values?.group || GROUP_BY_CATEGORY[p.category]);
    }
    throw fail('ฟังก์ชันนี้ยังไม่ได้เชื่อมฐานข้อมูลจริง','NOT_CONFIGURED');
  }
  async function currentGroup() {
    const id=await userId(); const data=await call('/rest/v1/employees?select=main_group&id=eq.'+encodeURIComponent(id));
    if(!data?.[0]?.main_group) throw fail('ไม่พบกลุ่มงานหลักของบัญชี','PERMISSION_DENIED'); return canonical(data[0].main_group);
  }
  async function currentName() {
    const id=await userId(); const data=await call('/rest/v1/employees?select=employee_name&id=eq.'+encodeURIComponent(id));
    if(!data?.[0]?.employee_name) throw fail('ไม่พบบัญชีพนักงานที่ใช้งาน','PERMISSION_DENIED'); return data[0].employee_name;
  }
  return Object.freeze({ request:dispatch });
}













