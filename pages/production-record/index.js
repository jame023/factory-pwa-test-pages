import * as api from '../../adapters/package05.js?v=1.3.186';
import {isProductionEmployee, PRODUCTION_WORK_MACHINES} from '../../js/permissions.js?v=1.3.186';
import {bangkokToday, escapeHtml as e, thaiDate} from '../../js/utils.js?v=1.3.186';
import {requireOnlineAction} from '../../js/offline.js?v=1.3.186';
import {statCard} from '../../components/app-card.js?v=1.3.186';

export async function render(root, context, {embedded=false} = {}) {
  if(!embedded && context.workspace==='employee' && ['employee','admin'].includes(context.user.role)){
    const work=await import('../work-session/index.js?v=1.3.187');
    return work.render(root,{...context,workType:'ผลิต'});
  }
  root.innerHTML='<p class="page-loading">กำลังโหลดข้อมูลผลิต…</p>';
  const rows=await api.listProduction();
  if(context.signal?.aborted)return;
  const create=isProductionEmployee(context.user) || (context.user.role === "admin" && context.workspace === "employee");
  const total=rows.reduce((sum,row)=>sum+Number(row.quantity||0),0);
  const defective=rows.reduce((sum,row)=>sum+Number(row.defective||0),0);
  root.innerHTML=(embedded?'<div class="section-title"><div><h2>บันทึกข้อมูลผลิต</h2><p>ใส่ยอดรายวันแยกจากจำนวนตอนจบงาน</p></div></div>':'<div class="page-heading"><h1>'+ (create?'บันทึกข้อมูลผลิต':'ข้อมูลผลิต') +'</h1></div>')+
    '<p class="notice notice-info">บันทึกและอ่านรายการจาก Supabase</p>'+
    '<div class="grid grid-3 attendance-section">'+statCard('จำนวนผลิต',total,'ใบ')+statCard('ของเสีย',defective,'ใบ')+statCard('จำนวนดี',total-defective,'ใบ')+'</div>'+
    (create?'<section class="card form-card attendance-section"><h2>บันทึกยอดผลิต</h2><form id="production-record-form"><div class="form-grid">'+
      '<label class="field">วันที่<input id="production-date" name="date" type="date" required value="'+bangkokToday()+'"></label>'+
      '<label class="field">เครื่องจักร<select id="production-machine" name="machine" required><option value="">เลือกเครื่องจักร</option>'+PRODUCTION_WORK_MACHINES.map(machine=>'<option>'+machine+'</option>').join('')+'</select></label>'+
      '<label class="field">จำนวนผลิต (ใบ)<input id="production-quantity" name="quantity" type="number" min="1" step="1" inputmode="numeric" required></label>'+
      '<label class="field">ของเสีย (ใบ)<input id="production-defective" name="defective" type="number" min="0" step="1" inputmode="numeric" value="0" required></label>'+
      '<label class="field field-full">ผู้บันทึก<input name="operator" value="'+e(context.user.name)+'" readonly></label>'+
      '<label class="field field-full">หมายเหตุ<textarea id="production-note" name="note" maxlength="500"></textarea></label></div>'+
      '<div class="form-actions"><button class="button button-primary" type="submit">บันทึกข้อมูลผลิต</button></div></form></section>':'')+
    '<section class="card card-pad attendance-section"><h2>รายการผลิตล่าสุด</h2><div class="list">'+(rows.slice(0,20).map(row=>'<article class="list-row"><div><strong>'+e(row.machine)+' • '+e(thaiDate(row.date))+'</strong><p>ผลิต '+e(row.quantity)+' ใบ • เสีย '+e(row.defective)+' ใบ • ดี '+e(Number(row.quantity)-Number(row.defective))+' ใบ</p><p class="list-meta">ผู้บันทึก: '+e(row.operator || row.employee)+'<br>'+e(row.note||'')+'</p></div></article>').join('')||'<p class="empty-state">ยังไม่มีรายการผลิต</p>')+'</div></section>';
  const form=root.querySelector('#production-record-form');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('[type=submit]');
    if(button.disabled || !requireOnlineAction('บันทึกข้อมูลผลิต'))return;
    const values=Object.fromEntries(new FormData(form));
    if(Number(values.defective)>Number(values.quantity)){context.showToast('ของเสียต้องไม่เกินจำนวนผลิต','error');return;}
    button.disabled=true;button.textContent='กำลังบันทึกข้อมูลผลิต…';
    try {
      await api.createProductionEntry(values);
      context.showToast('บันทึกข้อมูลผลิตแล้ว','success');
      await render(root,context,{embedded});
    } catch(error){context.showToast(error.message||'บันทึกไม่สำเร็จ','error');}
    finally{button.disabled=false;button.textContent='บันทึกข้อมูลผลิต';}
  });
}

