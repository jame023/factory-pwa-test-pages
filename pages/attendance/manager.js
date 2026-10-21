import { subscribeStore } from "../../js/state.js?v=1.3.186";
import { APP_MODE } from "../../js/config.js?v=1.3.186";
import { readAttendanceDashboard } from "../../adapters/package03.js?v=1.3.186";
import { statCard, attendanceToneClass } from "../../components/app-card.js?v=1.3.186";
import { bangkokToday, escapeHtml, thaiDate } from "../../js/utils.js?v=1.3.186";

const duration = value => String(Math.floor(value / 60)).padStart(2,"0") + ":" + String(value % 60).padStart(2,"0");
const display = value => escapeHtml(value === "" || value == null ? "—" : String(value));
const columnTone = label => ({"วันลา":"leave","ขาดงาน":"absent","มาสาย":"late","มาสาย (วัน)":"late","มาสายรวม (ชม:นาที)":"late-total","ออกก่อนเวลา":"early","ออกก่อนเวลา (วัน)":"early","ออกก่อนรวม (ชม:นาที)":"early-total"})[label] || "";
const toneClass = attendanceToneClass;
const table = (title, columns, rows, subtitle, groups = [], mobileMarkup = "") => {
  const accessibleTitle = title || "รายละเอียดรายวัน";
  const isSummary = title === "ตารางสรุปแต่ละคน";
  const tableClass = isSummary ? "attendance-table--summary" : "attendance-table--daily";
  const sectionClass = isSummary ? "attendance-summary-section" : "attendance-daily-section";
  const groupHeader = groups.length
    ? '<tr class="attendance-table-groups">' + groups.map(group => '<th scope="colgroup" colspan="' + group.span + '">' + escapeHtml(group.label) + '</th>').join("") + '</tr>'
    : "";
  const heading = title ? '<div class="section-title"><h2>' + title + '</h2><span class="small-muted">' + escapeHtml(subtitle) + '</span></div>' : "";
  return '<section class="attendance-section ' + sectionClass + '" aria-label="' + escapeHtml(accessibleTitle) + '">' + heading + mobileMarkup + '<div class="table-wrap attendance-table-wrap" tabindex="0" role="region" aria-label="' + escapeHtml(accessibleTitle) + ' เลื่อนแนวนอนเพื่อดูทุกคอลัมน์"><table aria-label="' + escapeHtml(accessibleTitle) + '" class="' + tableClass + '"><thead>' + groupHeader + '<tr>' + columns.map(label => '<th scope="col">' + label + '</th>').join("") + '</tr></thead><tbody>' + (rows.length ? rows.map(row => '<tr>' + row.map((cell, index) => '<td class="' + toneClass(columnTone(columns[index]), cell) + '">' + display(cell) + '</td>').join("") + '</tr>').join("") : '<tr><td colspan="' + columns.length + '">ไม่พบข้อมูลในช่วงวันที่และชื่อที่เลือก</td></tr>') + '</tbody></table></div></section>';
};
function showData(data) {
  const cards = [["จำนวนวันทำงาน",data.overviewTotals.workdays,"วันรวมทุกคน"],["จำนวนวันมาทำงาน",data.overviewTotals.attendanceDays,"วันเต็ม / ครึ่งวัน"],
    ["วันลา",data.overviewTotals.leaveDays,"วัน","leave"],["ขาดงาน",data.overviewTotals.absenceDays,"วัน","absent"],["มาสาย",data.overviewTotals.lateDays,"ครั้ง","late"],
    ["มาสายรวม",duration(data.overviewTotals.lateMinutes),"ชั่วโมง:นาที","late-total"],["ออกก่อนเวลา",data.overviewTotals.earlyDays,"ครั้ง","early"],
    ["ออกก่อนรวม",duration(data.overviewTotals.earlyMinutes),"ชั่วโมง:นาที","early-total"],["OT",data.overviewTotals.overtimeDays,"วัน"],["OT รวมเวลา",duration(data.overviewTotals.overtimeMinutes),"ชั่วโมง:นาที"]];
  const summaryGroups = [{label:"พนักงาน",span:2},{label:"สรุปวันทำงาน",span:4},{label:"มาสาย / ออกก่อนเวลา",span:4},{label:"OT",span:2}];
  const dailyGroups = [{label:"พนักงานและเวลาเข้าออก",span:4},{label:"มาสาย / ออกก่อน / OT",span:3},{label:"ผลการลงเวลา",span:2}];
  const dailyRows = [...data.daily].filter(row => String(row.date) === data.currentDate).sort((a,b) => String(a.name).localeCompare(String(b.name),"th"));
  const dailyCards = '<div class="attendance-mobile-list attendance-mobile-list--daily">' + (dailyRows.map(row => {
    const statusClass = row.status === "ขาด" ? "attendance-pill--absent" : row.status === "ลา" ? "attendance-pill--leave" : row.status === "เข้างาน" || row.status === "เลิกงาน" ? "attendance-pill--ok" : "attendance-pill--neutral";
    const signals = [
      row.lateMinutes ? '<span class="attendance-signal attendance-signal--late">มาสาย <strong>' + escapeHtml(row.lateMinutes) + ' นาที</strong></span>' : "",
      row.earlyMinutes ? '<span class="attendance-signal attendance-signal--early">ออกก่อน <strong>' + escapeHtml(row.earlyMinutes) + ' นาที</strong></span>' : "",
      row.overtimeMinutes ? '<span class="attendance-signal attendance-signal--ot">OT <strong>' + escapeHtml(duration(row.overtimeMinutes)) + '</strong></span>' : ""
    ].filter(Boolean).join("");
    return '<article class="attendance-person-card"><div class="attendance-person-card__head"><h3>' + escapeHtml(row.name) + '</h3><span class="attendance-pill ' + statusClass + '">' + escapeHtml(row.status || "—") + '</span></div><div class="attendance-person-card__times"><div><span>เวลาเข้า</span><strong>' + display(row.checkIn) + '</strong></div><div><span>เวลาออก</span><strong>' + display(row.checkOut) + '</strong></div></div><div class="attendance-person-card__details"><span class="attendance-pill attendance-pill--neutral">' + escapeHtml(row.dayStatus || "ไม่ระบุสถานะวัน") + '</span>' + (signals || '<span class="attendance-person-card__quiet">ไม่มีมาสาย ออกก่อน หรือ OT</span>') + '</div>' + (row.note ? '<p class="attendance-person-card__note">หมายเหตุ: ' + escapeHtml(row.note) + '</p>' : '') + '</article>';
  }).join("") || '<p class="empty-state">วันนี้ยังไม่มีรายการลงเวลา</p>') + '</div>';
  const daily = '<section class="attendance-latest"><div class="section-title"><div><h2>รายละเอียดรายวัน</h2><p class="small-muted">วันที่ ' + escapeHtml(thaiDate(data.currentDate)) + ' • ข้อมูลของวันนี้ทุกคน</p></div></div>' +
    table("",["ชื่อ","เข้างาน","เลิกงาน","สถานะวัน","มาสาย","ออกก่อนเวลา","OT","สถานะ","หมายเหตุ"],
      dailyRows.map(row => [row.name,row.checkIn,row.checkOut,row.dayStatus,row.lateMinutes ? row.lateMinutes + " นาที" : "",row.earlyMinutes ? row.earlyMinutes + " นาที" : "",row.overtimeMinutes ? duration(row.overtimeMinutes) : "",row.status,row.note]),dailyRows.length + " รายการ • เลื่อนซ้าย-ขวาเพื่อดูครบ",dailyGroups,dailyCards) + '</section>';
  const overview = '<section class="card card-pad attendance-overview"><div class="section-title"><div><h2>ภาพรวมเดือนนี้</h2><p class="small-muted">รวมทุกคน • ไม่เปลี่ยนตามตัวกรองตาราง</p></div></div><div class="grid grid-3">' + cards.map(card => statCard(...card)).join("") + '</div></section>';
  const summaryMobile = '<div class="attendance-mobile-list attendance-mobile-list--summary">' + (data.summaries.map(row =>
    '<article class="attendance-person-card"><div class="attendance-person-card__head"><div><h3>' + escapeHtml(row.name) + '</h3><span class="attendance-person-card__group">' + escapeHtml(row.groups.join(", ") || "ไม่ระบุกลุ่ม") + '</span></div></div><div class="attendance-summary-metrics">' +
    '<div><span>วันทำงาน</span><strong>' + escapeHtml(row.workdays) + ' วัน</strong></div><div><span>มาทำงาน</span><strong>' + escapeHtml(row.attendanceDays) + ' วัน</strong></div>' +
    '<div class="attendance-summary-metric--leave"><span>ลา</span><strong>' + escapeHtml(row.leaveDays) + ' วัน</strong></div><div class="attendance-summary-metric--absent"><span>ขาด</span><strong>' + escapeHtml(row.absenceDays) + ' วัน</strong></div>' +
    '<div class="attendance-summary-metric--late"><span>สาย</span><strong>' + escapeHtml(row.lateDays) + ' วัน</strong><small>รวม ' + escapeHtml(duration(row.lateMinutes)) + '</small></div>' +
    '<div class="attendance-summary-metric--early"><span>ออกก่อน</span><strong>' + escapeHtml(row.earlyDays) + ' วัน</strong><small>รวม ' + escapeHtml(duration(row.earlyMinutes)) + '</small></div>' +
    '<div class="attendance-summary-metric--ot"><span>OT</span><strong>' + escapeHtml(row.overtimeDays) + ' วัน</strong><small>รวม ' + escapeHtml(duration(row.overtimeMinutes)) + '</small></div></div></article>'
  ).join("") || '<p class="empty-state">ไม่พบพนักงานตามตัวกรองนี้</p>') + '</div>';
  const summary = '<p class="small-muted">ช่วง ' + escapeHtml(thaiDate(data.startDate)) + ' – ' + escapeHtml(thaiDate(data.endDate)) + ' • ตารางสรุปที่ตรงกับตัวกรอง</p>' +
    table("ตารางสรุปแต่ละคน",["ชื่อ","กลุ่มงาน","จำนวนวันทำงาน","จำนวนวันมาทำงาน","วันลา","ขาดงาน","มาสาย (วัน)","มาสายรวม (ชม:นาที)","ออกก่อนเวลา (วัน)","ออกก่อนรวม (ชม:นาที)","OT (วัน)","OT รวม (ชม:นาที)"],
      data.summaries.map(row => [row.name,row.groups.join(", "),row.workdays,row.attendanceDays,row.leaveDays,row.absenceDays,row.lateDays,duration(row.lateMinutes),row.earlyDays,duration(row.earlyMinutes),row.overtimeDays,duration(row.overtimeMinutes)]),data.summaries.length + " คน • เลื่อนซ้าย-ขวาเพื่อดูครบ",summaryGroups,summaryMobile) +

    '<p class="help-text">— หมายถึงไม่มีข้อมูล • รายการยังไม่ลงเวลาออกไม่ถูกนับเป็นขาดงาน • สรุปจากรายการเวลาที่บันทึกใน Supabase</p>';
  return {daily, overview, summary};
}
export async function renderManagerAttendance(root,{ signal,showToast,onDataChange }) {
  const currentDate = bangkokToday();
  const month = currentDate.slice(0,7);
  const monthStart = month + "-01";
  root.innerHTML = '<div class="page-heading"><div><p class="eyebrow">Attendance</p><h1>เวลาเข้าออก</h1><p>ดูรายละเอียดของวันนี้ และค้นหาข้อมูลในตารางสรุปแยกตามช่วงวันที่</p></div></div><div data-latest></div><div data-overview></div><section class="manager-summary-search"><div class="section-title"><div><h2>ค้นหาตารางสรุปแต่ละคน</h2><p class="small-muted">ตัวกรองนี้มีผลเฉพาะตารางด้านล่าง • รายละเอียดวันนี้และภาพรวมเดือนนี้ไม่เปลี่ยน</p></div></div><form class="card card-pad manager-filters" data-filters><div class="manager-filter-grid"><div class="field"><label for="manager-name">ชื่อพนักงาน</label><input id="manager-name" name="name" list="manager-employees" placeholder="ทุกคน หรือค้นหาชื่อ" maxlength="100" autocomplete="off"><datalist id="manager-employees"></datalist></div><div class="field"><label for="manager-month">เดือน</label><input id="manager-month" type="month" value="' + month + '"></div><div class="field"><label for="manager-start">วันที่เริ่ม</label><input id="manager-start" name="startDate" type="date" required value="' + month + '-01"></div><div class="field"><label for="manager-end">วันที่สิ้นสุด</label><input id="manager-end" name="endDate" type="date" required value="' + currentDate + '"></div><div class="manager-filter-action"><button class="button button-primary" type="submit">ค้นหา</button></div></div><p class="help-text">เลือกเดือนได้ทั้งเดือน หรือกำหนดช่วงวันที่เองไม่เกิน 367 วัน • รายชื่อและสรุปอ่านจาก Supabase ตามสิทธิ์บัญชี</p></form></section><div data-status role="status" aria-live="polite"></div><div data-results></div>';
  const form = root.querySelector("form");
  const status = root.querySelector("[data-status]");
  const latest = root.querySelector("[data-latest]");
  const overview = root.querySelector("[data-overview]");
  const content = root.querySelector("[data-results]");
  const button = form.querySelector("button");
  let version = 0;
  let controller;
  let latestData;
  let monthData;
  signal?.addEventListener("abort",() => { version++; controller?.abort(); },{once:true});
  root.querySelector("#manager-month").addEventListener("change",event => {
    if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
    const value = event.target.value;
    const last = new Date(value + "-01T00:00:00Z");
    last.setUTCMonth(last.getUTCMonth() + 1,0);
    form.elements.startDate.value = value + "-01";
    form.elements.endDate.value = last.toISOString().slice(0,10);
  });
  async function load(refreshSnapshots=false,notify=false) {
    if (signal?.aborted || !form.reportValidity()) return;
    const formValues = Object.fromEntries(new FormData(form));
    const query = {name:String(formValues.name || ""),startDate:String(formValues.startDate || ""),endDate:String(formValues.endDate || "")};
    if (query.startDate > query.endDate || (Date.parse(query.endDate) - Date.parse(query.startDate)) / 86400000 > 366) {
      status.textContent = "เลือกวันที่เริ่มไม่เกินวันที่สิ้นสุด และช่วงไม่เกิน 367 วัน";
      return;
    }
    const current = ++version;
    controller?.abort(); controller = new AbortController();
    const requestSignal = controller.signal;
    button.disabled = true; button.textContent = "กำลังค้นหา…";
    content.replaceChildren(); status.textContent = "กำลังค้นหาตารางสรุป…";
    try {
      const refresh = refreshSnapshots || !latestData || !monthData;
      const [summaryData,todayData,currentMonthData] = await Promise.all([
        readAttendanceDashboard(query,{signal:requestSignal}),
        refresh ? readAttendanceDashboard({startDate:currentDate,endDate:currentDate},{signal:requestSignal}) : Promise.resolve(latestData),
        refresh ? readAttendanceDashboard({startDate:monthStart,endDate:currentDate},{signal:requestSignal}) : Promise.resolve(monthData)
      ]);
      if (current !== version || signal?.aborted) return;
      latestData = todayData;
      monthData = currentMonthData;
      root.querySelector("datalist").innerHTML = summaryData.employees.map(row => '<option value="' + escapeHtml(row.name) + '"></option>').join("");
      const rendered = showData({currentDate,daily:latestData.daily,overviewTotals:monthData.totals,startDate:query.startDate,endDate:query.endDate,summaries:summaryData.summaries});
      latest.innerHTML = rendered.daily;
      overview.innerHTML = rendered.overview;
      content.innerHTML = rendered.summary;
      status.textContent = "ตารางสรุป: พบ " + summaryData.summaries.length + " คน • " + summaryData.startDate + " – " + summaryData.endDate;
      if (notify) showToast("ค้นหาเสร็จแล้ว พบ " + summaryData.summaries.length + " คน", "success");
    } catch (error) {
      if (current !== version || signal?.aborted || error.name === "AbortError") return;
      status.textContent = "ค้นหาตารางสรุปไม่สำเร็จ กดค้นหาเพื่อลองใหม่";
      showToast(error.message || "อ่านข้อมูลไม่สำเร็จ","error");
    } finally {
      if (current === version) { button.disabled = false; button.textContent = "ค้นหา"; }
    }
  }
  form.addEventListener("submit",event => { event.preventDefault(); void load(false,true); });
  if(APP_MODE === "mock" && !onDataChange) {
    const unsubscribe=subscribeStore(()=>{ if(!signal?.aborted)void load(true); });
    signal?.addEventListener("abort",unsubscribe,{once:true});
  }
  onDataChange?.(()=>load(true));
  await load(true);
}

