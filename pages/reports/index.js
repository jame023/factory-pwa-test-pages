import * as api from '../../adapters/package06.js';
import { REPORT_KINDS } from '../../js/report-inbox.js';
import { APP_MODE } from '../../js/config.js';
import { escapeHtml as e,thaiDate,thaiDateTime } from '../../js/utils.js';
import { requireOnlineAction } from '../../js/offline.js';

export async function render(root,context){
  let selected='all',busy=false,version=0;
  const labels={present:'มาทำงาน',late:'มาสาย',leave:'ลา',absent:'ขาด',production:'การผลิต',delivery:'การขนส่ง'};
  async function draw(){
    const current=++version;
    root.innerHTML='<p class="page-loading">กำลังโหลดหมวดสรุป…</p>';
    try {
      const reports=await api.readReportInbox(selected);
      if(current!==version||context.signal?.aborted)return;
      root.innerHTML='<div class="page-heading"><div><p class="eyebrow">Reports inbox</p><h1>หมวดสรุป</h1><p>รายวัน • รายสัปดาห์ • พนักงานดีเด่น</p></div></div><p class="notice notice-warning">แหล่งรายงานทั้ง 3 หมวด: Apps Script งาน 06 • ใช้ผลสรุปและกฎพนักงานดีเด่นจากงาน 06 • ขณะนี้ยังเป็น Mock ยังไม่เชื่อมงานจริงหรือส่ง Web Push</p><div class="chip-row">'+Object.entries({all:'ทั้งหมด',...REPORT_KINDS}).map(([key,label])=>'<button class="chip" data-kind="'+key+'" aria-pressed="'+(key===selected)+'">'+e(label)+'</button>').join('')+'</div>'+
        (APP_MODE==='mock'?'<section class="card card-pad attendance-section"><h2>จำลองรายงานเข้า PWA</h2><p class="help-text">ปุ่มเหล่านี้สร้างตัวอย่างในเบราว์เซอร์นี้ ผู้บริหารทุกเซสชันในที่เก็บข้อมูลเดียวกันเห็นได้ • กดชนิดเดิมในวันเดิมจะไม่สร้างซ้ำ</p><div class="form-actions">'+Object.entries(REPORT_KINDS).map(([key,label])=>'<button class="button" data-preview="'+key+'">จำลอง'+e(label)+'</button>').join('')+'</div></section>':'')+
        '<section class="card card-pad attendance-section"><h2>ประวัติรายงาน ('+reports.length+')</h2><p class="help-text">แสดงสูงสุด 100 รายงาน • ตัวเลขและผลดีเด่นจากตัวอย่าง ไม่ใช่ข้อมูลพนักงานจริง</p>'+ (reports.map(report=>'<article class="card card-pad attendance-section"><h3>'+e(report.title)+'</h3><p>'+e(thaiDate(report.period.startDate))+' – '+e(thaiDate(report.period.endDate))+'</p><span class="badge badge-info">รับเข้า mock แล้ว • ยังไม่ได้ส่งถึงอุปกรณ์</span><details class="attendance-section"><summary>ดูรายละเอียดรายงาน</summary><dl class="work-manager-fields">'+Object.entries(report.metrics).map(([key,value])=>'<div><dt>'+e(labels[key])+'</dt><dd>'+e(value===null?'—':value.toLocaleString('th-TH'))+'</dd></div>').join('')+'</dl>'+report.sections.map(section=>'<h4>'+e(section.title)+'</h4><ul>'+section.lines.map(line=>'<li>'+e(line)+'</li>').join('')+'</ul>').join('')+(report.kind==='outstanding'?'<h4>ผลพนักงานดีเด่นที่ส่งมา</h4>'+ (report.winners.map(winner=>'<p><strong>'+e(winner.name)+'</strong><br>'+e(winner.reason)+'</p>').join('')||'<p>ไม่มีผลพนักงานดีเด่นในรายงานนี้</p>'):'')+'<p class="small-muted">สร้างเมื่อ '+e(thaiDateTime(report.generatedAt))+' • รับเมื่อ '+e(thaiDateTime(report.receivedAt))+'<br>กฎ: '+e(report.rulesVersion)+'<br>Event ID: '+e(report.eventId)+'</p></details></article>').join('')||'<p class="empty-state">ยังไม่มีรายงานเข้า • ลองปุ่มจำลองด้านบน</p>')+'</section>';
      root.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{if(busy)return;selected=button.dataset.kind;void draw();}));
      root.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',async()=>{
        if(busy||!requireOnlineAction('จำลองรายงาน'))return;
        busy=true;root.querySelectorAll('button').forEach(el=>{el.disabled=true;});button.textContent='กำลังรับรายงาน…';
        try {const result=await api.previewReport(button.dataset.preview);context.showToast(result.duplicate?'มีรายงานนี้แล้ว ไม่สร้างแจ้งเตือนซ้ำ':'รับรายงานจำลองและเพิ่มแจ้งเตือนผู้บริหารแล้ว','success');}
        catch(error){context.showToast(error.message,'error');}
        finally{busy=false;if(!context.signal?.aborted)await draw();}
      }));
    }catch(error){if(current!==version||context.signal?.aborted)return;root.innerHTML='<p role="alert">โหลดหมวดสรุปไม่สำเร็จ กรุณาเปิดหน้าใหม่</p>';context.showToast(error.message,'error');}
  }
  context.onDataChange?.(()=>busy ? false : draw());
  await draw();
}
