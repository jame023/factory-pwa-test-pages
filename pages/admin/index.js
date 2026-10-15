import { pageBusy } from '../../js/live-updates.js';
import { attendanceCalculation } from '../../js/business-rules.js';
import { render as renderWorkCalendar } from "../calendar/index.js";
import * as adminApi from "../../adapters/package11.js";
import { escapeHtml, thaiDateTime } from "../../js/utils.js";
import { RECORD_SCHEMAS, blankRecord, validateRecord } from "../../js/record-schema.js";
import { requireOnlineAction } from "../../js/offline.js";
import { confirmAction } from "../../components/modal.js";

const modules = [
  ["employees","พนักงานและสิทธิ์","ชื่อ กลุ่มงาน บทบาท และสถานะบัญชี"],
  ["attendance","เวลาเข้าออก","ข้อมูลเข้าออกและสถานะวันทำงาน"],
  ["leaveRequests","การลา","คำขอและสถานะการพิจารณา"],
  ["calendar","ปฏิทินการทำงาน","เต็มวัน ครึ่งวัน และหยุดแยกกลุ่ม"],
  ["production","งานผลิต","จำนวนผลิต ของเสีย และผู้บันทึก"],
  ["workSessions","เริ่มงาน–จบงาน","เครื่องจักร ออเดอร์ และเวลาเริ่ม–จบ"],
  ["deliveries","การขนส่ง","สินค้า ผู้ส่ง และสถานะรายการ"],
  ["screenEntries","งานสกรีน","B1–B3 • จำนวนแพ็ค เสียจากสกรีน และเสียจากผลิต"],
  ["otRequests","ข้อมูล OT","รายการ OT พร้อมรายละเอียดและรูปหลักฐาน"],
  ["audit","ประวัติการแก้ไข","ผู้แก้ไข เหตุผล และข้อมูลก่อน–หลัง"]
];
const printable = value => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value,null,2) : String(value);
const attendanceDayLabel = row => attendanceCalculation(row.checkIn || '',row.checkOut || '',{source:'admin11'}).workdayStatus === 'ครึ่งวัน' ? 'ครึ่งวัน' : 'เต็มวัน';
const fieldText = (spec, value) => spec.labels?.[spec.options.indexOf(String(value))] ?? value ?? "—";
const actionText = action => ({
  "package04.delivery.create":"บันทึกการขนส่ง", "package05.production.create":"บันทึกการผลิต",
  "package07.work.start":"เริ่มงาน", "package07.work.end":"จบงาน",
  "package08.calendar.save":"ตั้งปฏิทินงาน", "package09.leave.submit":"ส่งคำขอลา",
  "package09.leave.review":"พิจารณาคำขอลา"
}[action] || (RECORD_SCHEMAS[action.split(".")[0]]?.label || "ข้อมูล") + (action.endsWith(".edit") ? " • แก้ไข" : " • เพิ่มรายการ"));

function editorField(spec, record) {
  let value = record[spec.key] ?? "";
  if (spec.type === "datetime-local" && value) {
    value = new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(new Date(value)).replace(" ", "T");
  }
  const id = "edit-" + spec.key;
  const attributes = ' id="' + id + '" name="' + spec.key + '"' + (spec.required ? ' required' : '') + (spec.readOnly ? ' readonly' : '');
  let input;
  if (spec.options) input = '<select' + attributes + '>' + (!spec.options.includes(String(value)) ? '<option value="" selected disabled>เลือกค่าใหม่</option>' : '') + spec.options.map((option, index) =>
    '<option value="' + escapeHtml(option) + '"' + (String(value) === option ? ' selected' : '') + '>' + escapeHtml(spec.labels?.[index] || option) + '</option>').join('') + '</select>';
  else if (spec.type === "image-data") input = '<input type="hidden"' + attributes + ' value="' + escapeHtml(value) + '">' +
    '<input id="edit-photo-file" name="photoFile" type="file" accept="image/*"><span class="help-text">เลือกภาพใหม่ได้ ไม่เกิน 512 KB • ข้อมูลจำลองในเบราว์เซอร์</span>' +
    (value ? '<a href="' + escapeHtml(value) + '" target="_blank" rel="noreferrer">ดูรูปหลักฐานปัจจุบัน</a>' : '<span class="small-muted">ยังไม่มีรูปแนบ</span>');
  else if (spec.type === "textarea") input = '<textarea' + attributes + ' maxlength="' + (spec.maxLength ?? 500) + '">' + escapeHtml(value) + '</textarea>';
  else input = '<input' + attributes + ' type="' + spec.type + '" value="' + escapeHtml(value) + '"' +
    (spec.type === "number" ? ' min="' + (spec.min ?? 0) + '" step="' + (spec.step ?? 1) + '"' : ' maxlength="500"') + '>';
  return '<div class="field' + (spec.type === 'textarea' ? ' field-full' : '') + '"><label for="' + id + '">' + escapeHtml(spec.label) + '</label>' + input + '</div>';
}

export async function render(root, context) {
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลด Admin…</span></div>';
  let summary = await adminApi.readAdminSummary();
  let category = "employees";
  let rows = await adminApi.listRecords(category);
  let employeeDirectory = [...rows];
  let selectedId = null;
  let creatingRecord = false;
  let editingScreen = false;
  let generation = 0;
  let query = "";
  let calendarController;
  context.signal?.addEventListener("abort",()=>calendarController?.abort(),{once:true});
  const draw = () => {
    if(context.signal?.aborted)return;
    calendarController?.abort();
    const isAudit = category === "audit";
    const editOnly = category === "screenEntries";
    const schema = isAudit ? {label:"ประวัติการแก้ไข",fields:[]} : RECORD_SCHEMAS[category];
    const canCreate = !isAudit && !schema.singleton && category !== 'calendar';
    const creationId = category === 'attendance' ? 'manual-attendance-details' : 'admin-create-details';
    const filteredRows = rows.filter(row => Object.entries(row).filter(([key])=>key!=='photo').map(([,value])=>printable(value)).join(" ").toLocaleLowerCase("th").includes(query.toLocaleLowerCase("th")));
    const selected = rows.find(row => row.id === selectedId);
    const record = selected || (isAudit ? {} : blankRecord(category));
    root.innerHTML =
      '<div class="page-heading"><div><p class="eyebrow">Admin</p><h1>ศูนย์ควบคุม Admin</h1><p>ยึดหมวดงานและแนวทางจาก 11_admin_control_center</p></div></div>' +
      '<div class="form-actions"><a class="button" href="#/employee">หน้าพนักงาน</a><a class="button" href="#/executive">หน้าผู้บริหาร</a></div>' +
      '<p class="notice notice-warning">DEV MOCK • ยังไม่เชื่อมชีตจริง • การแก้ไขมีผลเฉพาะข้อมูลจำลองในเบราว์เซอร์นี้</p><nav class="admin-module-grid" aria-label="หมวดงานตามงาน 11">' + modules.map(([key,title,hint])=>'<button class="card admin-module-button" data-admin-module="'+key+'" aria-pressed="'+(category===key)+'"><strong>'+escapeHtml(title)+'</strong><span>'+escapeHtml(hint)+'</span></button>').join('')+'</nav>' +
      (category === 'leaveRequests' ? '<section class="card card-pad attendance-section"><h2>คำขอลาและปฏิทินกลาง</h2><p class="help-text">ดูผู้ได้รับอนุมัติลาทุกกลุ่มในหน้าคำขอลาร่วมกับผู้บริหาร</p><a class="button" href="#/executive/leave">เปิดหน้าคำขอลา</a></section>' : '') +
      '<section data-record-browser class="card card-pad" style="margin-top:.8rem"><div class="field"><label for="admin-category">หมวดข้อมูล</label><select id="admin-category">' +
      modules.map(([key, label]) => '<option value="' + key + '"' + (category === key ? ' selected' : '') + '>' + escapeHtml(label) + '</option>').join('') +
      '</select></div><form data-admin-search class="toolbar attendance-section"><div class="field"><label for="admin-search">ค้นหาชื่อ รหัส วันที่ หรือข้อมูลในหมวดนี้</label><input id="admin-search" value="'+escapeHtml(query)+'" maxlength="100"></div><button class="button" type="submit">ค้นหา</button></form><div class="section-title"><h2>รายการที่พบ (' + filteredRows.length + ')</h2></div><div class="admin-record-list">' +
      (filteredRows.length ? filteredRows.map(row => '<button type="button" class="admin-link" data-record="' + rows.indexOf(row) + '" aria-pressed="' + (row.id === selectedId) + '"><span>' +
        escapeHtml(isAudit ? [row.actor,row.action,thaiDateTime(row.createdAt)].join(' · ') : schema.fields.slice(0, 3).map(spec => fieldText(spec, row[spec.key])).join(' · ')) + '</span><span>ดูรายละเอียด ›</span></button>').join('') : '<p class="empty-state">ยังไม่มีรายการ</p>') +
      '</div></section>' +
      (canCreate ? '<section class="card card-pad attendance-section" data-create-record'+(category === 'attendance' ? ' data-manual-attendance' : '')+'><h2>เพิ่มรายการ • '+escapeHtml(schema.label)+'</h2><button class="button button-primary" type="button" data-new-record aria-expanded="'+creatingRecord+'" aria-controls="'+creationId+'">'+(category === 'attendance' ? '＋ ลงเวลาแทนเครื่องสแกน' : '＋ เพิ่มรายการ')+'</button><div id="'+creationId+'" data-create-details'+(!creatingRecord ? ' hidden' : '')+'></div></section>' : '') +
      (editOnly && selected ? '<section class="card card-pad attendance-section"><h2>แก้ไขรายการ • งานสกรีน</h2><button class="button button-primary" type="button" data-toggle-screen aria-expanded="'+editingScreen+'" aria-controls="screen-edit-details">แก้ไขรายการ</button><p class="help-text">เลือกรายการแล้ว • กดเพื่อเปิดหรือปิดรายละเอียด</p><div id="screen-edit-details"'+(!editingScreen ? ' hidden' : '')+'></div></section>' : '') +
      (selected && category !== "calendar" ? '<section class="card card-pad attendance-section"><h2>รายละเอียดข้อมูล</h2><dl class="work-manager-fields">'+Object.entries(selected).map(([key,value])=>'<div><dt>'+escapeHtml(schema.fields.find(spec=>spec.key===key)?.label || key)+'</dt><dd>'+(key==='photo' && value ? '<a href="'+escapeHtml(value)+'" target="_blank" rel="noreferrer">เปิดรูปหลักฐาน</a>' : '<pre class="admin-data-value">'+escapeHtml(printable(value))+'</pre>')+'</dd></div>').join('')+'</dl></section>' : '') +
      (!isAudit && category !== "calendar" && (!editOnly || editingScreen || creatingRecord) && (selected || (canCreate && creatingRecord)) ? '<section data-admin-editor class="card form-card" style="margin-top:.8rem"><h2>' + (selected ? 'แก้ไขรายการ' : 'เพิ่มรายการ') + ' • ' + escapeHtml(schema.label) + '</h2>' +
      (category === 'attendance' ? '<p class="help-text">ลงเวลาแทนเมื่อเครื่องสแกนใช้งานไม่ได้ หรือแก้ไขเวลาเดิม • เลือกพนักงาน วันที่ และเวลาเข้า–ออก พร้อมระบุเหตุผล • เวลาออกใส่ภายหลังได้ • มาสาย ออกก่อน และ OT คำนวณใหม่ • บันทึกสำเร็จแจ้งทุกบัญชี หากมีรายการของวันที่เลือกแล้ว ให้แก้ไขรายการเดิม</p>' : '') +
      (category === 'leaveRequests' ? '<p class="help-text">เพิ่มรายการคือการลาแทนพนักงาน • ส่งคำขอรออนุมัติและแจ้งผู้บริหารตามปกติ • ผลอนุมัติ/ปฏิเสธแจ้งผู้ขอ ออฟฟิต และผู้บริหาร • หากปฏิเสธ ใช้เหตุผลการแก้ไขเป็นเหตุผลที่แจ้งผู้ขอ</p>' : '') +
      (category === 'screenEntries' ? '<p class="help-text">ข้อมูลชุดเดียวกับหน้างานสกรีน • เว้นว่างเมื่อไม่บันทึกช่องนั้น และใส่ 0 เมื่อยืนยันว่าไม่มี • เพิ่มหรือแก้ไขต้องระบุเหตุผลและเก็บประวัติ</p>' : '') +
      (category === 'otRequests' ? '<p class="help-text">Admin เพิ่มรายการ OT แทนพนักงานหรือแก้ไขรายการเดิมได้ • เลือกชื่อพนักงานจากรายชื่อจำลอง และระบบเก็บผู้แก้ไขไว้ในประวัติ</p>' : '') +
      '<form id="admin-edit-form"><div class="form-grid" style="margin-top:.8rem">' + schema.fields.map(spec => {
        if(category==='screenEntries' && !selected && spec.key==='operatorName')return editorField({...spec,readOnly:true},{operatorName:context.user.name});
        if (category === 'attendance' && ['leaveStatus','absent'].includes(spec.key)) return '';
        if (category === 'attendance' && spec.key === 'workdayStatus') {
          const label = attendanceDayLabel(record);
          return editorField({key:'workdayStatusDisplay',label:'สถานะวันทำงาน',type:'text',readOnly:true},{workdayStatusDisplay:label});
        }
        if (category === 'attendance' && spec.key === 'employee') {
          const names = [...new Set([...employeeDirectory.filter(person=>person.active!==false && person.role==='employee').map(person=>person.name), ...rows.map(row=>row.employee)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
          return editorField({...spec,options:['',...names],labels:['เลือกพนักงาน',...names]},record);
        }
        if (category === 'otRequests' && spec.key === 'employee') {
          const names = [...new Set([...employeeDirectory.filter(person=>person.active!==false && person.role==='employee').map(person=>person.name), ...rows.map(row=>row.employee)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
          return editorField({...spec,options:['',...names],labels:['เลือกพนักงาน',...names]},record);
        }
        return editorField(spec, record);
      }).join('') +
      '</div><div class="field"><label for="admin-reason">เหตุผลการแก้ไข</label><textarea id="admin-reason" name="changeReason" required minlength="3" maxlength="300"></textarea></div><div class="form-actions"><button class="button button-primary" type="submit">ตรวจสอบและบันทึก</button></div></form></section>' : '') +
      '<section class="card card-pad" style="margin-top:.8rem"><h2>ประวัติการบันทึก (' + summary.auditCount + ')</h2><div class="list">' +
      (summary.auditLog.slice(0, 8).map(row => '<div class="list-row"><div><strong>' + escapeHtml(row.actor) + '</strong><div class="list-meta">' +
        escapeHtml(actionText(row.action)) + ' · ' + escapeHtml(thaiDateTime(row.createdAt)) + '</div></div></div>').join('') || '<p class="empty-state">ยังไม่มีประวัติ</p>') +
      '</div></section><p class="notice notice-warning" style="margin-top:.8rem">ข้อมูลจำลองในอุปกรณ์นี้เท่านั้น รายงานจริงจะใช้ผลจากงาน 06 • แบบฟอร์มนี้ยังไม่เทียบเท่ากฎ Preview/Apply ของงาน 11 ครบทุกหมวด การตั้งค่า LINE / LIFF / Trigger / อุปกรณ์จริงยังไม่เปิดแก้ไข</p>';
    if(canCreate && creatingRecord && !selected) {
      const editor=root.querySelector('[data-admin-editor]');
      editor.className='attendance-section';
      editor.style.marginTop='';
      editor.querySelector('h2')?.remove();
      root.querySelector('[data-create-details]').append(editor);
    }
    if(editOnly && selected) {
      const details=root.querySelector('.work-manager-fields')?.closest('section');
      if(editingScreen) {
        const host=root.querySelector('#screen-edit-details');
        if(details) { details.className='attendance-section'; host.append(details); }
        const editor=root.querySelector('[data-admin-editor]');
        editor.className='attendance-section';
        editor.style.marginTop='';
        editor.querySelector('h2')?.remove();
        host.append(editor);
      } else details?.remove();
    }
    if (category === "calendar") {
      const host = document.createElement("section");
      host.className = "attendance-section";
      host.setAttribute("aria-label","จัดการปฏิทินงานแบบผู้บริหาร");
      root.querySelector("[data-record-browser]").replaceWith(host);
      calendarController = new AbortController();
      const signal = calendarController.signal;
      if (context.signal?.aborted) calendarController.abort();
      void renderWorkCalendar(host,{...context,signal,onDataChange:undefined}).catch(error=>{
        if(!signal.aborted){host.textContent="โหลดปฏิทินไม่สำเร็จ กรุณาเลือกหมวดใหม่";context.showToast(error.message,"error");}
      });
    }
    async function selectCategory(nextCategory) {
      calendarController?.abort();
      const version = ++generation;
      root.querySelectorAll('button, input, select, textarea').forEach(control=>{control.disabled=true;});
      try {
        const data = nextCategory === 'audit' ? (await adminApi.readAdminSummary()).auditLog : await adminApi.listRecords(nextCategory);
        const directory = nextCategory === 'attendance' ? await adminApi.listRecords('employees') : employeeDirectory;
        if(version!==generation || context.signal?.aborted)return;
        employeeDirectory=directory;
        category=nextCategory;rows=data;query='';creatingRecord=false;editingScreen=false;selectedId=RECORD_SCHEMAS[category]?.singleton ? rows[0]?.id : null;draw();
      }catch(error){if(!context.signal?.aborted){context.showToast(error.message,'error');draw();}}
    }
    root.querySelector('#admin-category')?.addEventListener('change',event=>{void selectCategory(event.target.value);});
    root.querySelectorAll('[data-admin-module]').forEach(button=>button.addEventListener('click',()=>{void selectCategory(button.dataset.adminModule);}));
    root.querySelector('[data-admin-search]')?.addEventListener('submit',event=>{event.preventDefault();query=root.querySelector('#admin-search').value.trim();draw();context.showToast('ค้นหาเสร็จแล้ว','success');});
    root.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => {
      selectedId = rows[Number(button.dataset.record)]?.id; creatingRecord=false; editingScreen=false; draw();
    }));
    root.querySelector('[data-new-record]')?.addEventListener('click', () => { selectedId = null; editingScreen=false; creatingRecord=!creatingRecord; draw(); });
    root.querySelector('[data-toggle-screen]')?.addEventListener('click', () => { if(!selected)return; editingScreen=!editingScreen; draw(); });
    if(category==='attendance') {
      const form=root.querySelector('#admin-edit-form');
      const syncStatus=()=>{form.elements.workdayStatusDisplay.value=attendanceDayLabel({...record,checkIn:form.elements.checkIn.value,checkOut:form.elements.checkOut.value});};
      form?.elements.checkIn.addEventListener('change',syncStatus);
      form?.elements.checkOut.addEventListener('change',syncStatus);
    }
    root.querySelector('#admin-edit-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      if (!requireOnlineAction('แก้ไขข้อมูล')) return;
      const form = event.currentTarget;
      const button = form.querySelector('button[type=submit]');
      if (button.disabled) return;
      let values;
      try {
        const input=Object.fromEntries(new FormData(form));
        const photoFile=form.elements.photoFile?.files?.[0];
        if(photoFile) {
          if(!['image/png','image/jpeg','image/gif','image/webp'].includes(photoFile.type) || photoFile.size>512*1024)throw new Error('รูปต้องเป็น PNG, JPG, GIF หรือ WebP และไม่เกิน 512 KB');
          input.photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('อ่านรูปไม่สำเร็จ'));reader.readAsDataURL(photoFile);});
        }
        // Removed leave/absence controls retain the stored values on edits.
        // Workday status is calculated from the times rather than overridden by UI.
        values = validateRecord(category, category==='attendance' ? {...blankRecord(category),...selected,...input} : input);
      }
      catch (error) { context.showToast(error.message, 'error'); return; }
      const targetCategory = category, targetId = selectedId;
      button.disabled = true;
      const changes = schema.fields.filter(spec=>JSON.stringify(selected?.[spec.key] ?? null)!==JSON.stringify(values[spec.key] ?? null)).map(spec=>spec.label+': '+printable(selected?.[spec.key])+' → '+printable(values[spec.key]));
      const confirmed = await confirmAction({ title:'ตรวจสอบก่อนบันทึก • '+schema.label, message:changes.join('\n')+'\nเหตุผล: '+form.elements.changeReason.value, confirmLabel:'ยืนยันบันทึก Mock' });
      if (!confirmed || context.signal?.aborted) { button.disabled = false; return; }
      button.textContent = 'กำลังบันทึก…';
      root.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = true; });
      try {
        const result = await adminApi.saveRecord(targetCategory, targetId, values, selected || null, form.elements.changeReason.value);
        const [nextRows, nextSummary] = await Promise.all([adminApi.listRecords(targetCategory), adminApi.readAdminSummary()]);
        if (context.signal?.aborted) return;
        rows = nextRows; summary = nextSummary; category = targetCategory; selectedId = result.id; creatingRecord=false; editingScreen=false; draw();
        context.showToast('บันทึกข้อมูลแล้ว (mock)', 'success');
      } catch (error) { if (!context.signal?.aborted) { context.showToast(error.message || 'บันทึกไม่สำเร็จ', 'error'); draw(); } }
    });
  };
  context.onDataChange?.(async()=>{
    const version=generation, target=category;
    const [latestRows,latestSummary,latestDirectory]=await Promise.all([
      target==='audit' ? adminApi.readAdminSummary().then(value=>value.auditLog) : adminApi.listRecords(target),
      adminApi.readAdminSummary(), adminApi.listRecords('employees')
    ]);
    if(context.signal?.aborted || version!==generation || target!==category)return;
    if(pageBusy(root))return false;
    rows=latestRows;summary=latestSummary;employeeDirectory=latestDirectory;
    // The embedded calendar owns its refresh and retains all staged days.
    if(category==='calendar')return;
    const editor=root.querySelector('#admin-edit-form');
    const dirty=editor && [...editor.querySelectorAll('input,select,textarea')].some(el=>el.tagName==='SELECT'
      ? el.value!==([...el.options].find(option=>option.defaultSelected)?.value || el.options[0]?.value)
      : el.value!==undefined && el.value!==el.defaultValue);
    const active=document.activeElement, focusId=root.contains(active)?active.id:'';
    const search=root.querySelector('#admin-search')?.value;
    draw();
    // Retain the old handler with its original expectedBefore snapshot. A concurrent
    // change therefore rejects a stale save rather than overwriting another edit.
    if(dirty)root.querySelector('#admin-edit-form')?.replaceWith(editor);
    if(search!==undefined)root.querySelector('#admin-search').value=search;
    if(focusId)root.querySelector('#'+focusId)?.focus({preventScroll:true});
  });
  draw();
}
