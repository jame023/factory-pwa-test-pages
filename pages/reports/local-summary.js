import * as reportApi from "../../adapters/package06.js";
import { statCard } from "../../components/app-card.js";
import { escapeHtml } from "../../js/utils.js";

const periods = [
  { key: "today", label: "วันนี้" },
  { key: "week", label: "สัปดาห์" },
  { key: "month", label: "เดือน" }
];
export async function render(root, context) {
  let period = "today";
  const draw = async () => {
    root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดรายงาน…</span></div>';
    const data = await reportApi.readReport(period);
    const current = periods.find(item => item.key === period);
    root.innerHTML =
      '<div class="page-heading"><div><p class="eyebrow">Reports</p><h1>รายงาน</h1><p>สรุปจากข้อมูลจำลองที่บันทึกในอุปกรณ์นี้</p></div></div>' +
      '<div class="chip-row">' + periods.map(item =>
        '<button class="chip" type="button" data-period="' + item.key + '" aria-pressed="' + (period === item.key) + '">' +
        item.label + "</button>").join("") + "</div>" +
      '<section class="card card-pad" style="margin-top:.8rem"><p class="eyebrow">ช่วงรายงาน</p><h2>' +
      escapeHtml(current.label) + '</h2></section>' +
      '<div class="grid grid-3" style="margin-top:.8rem">' +
        statCard("มาทำงาน", data.present, "ครั้ง") +
        statCard("มาสาย", data.late, "ครั้ง") +
        statCard("ลา", data.leave, "รายการ") +
        statCard("ขาด", data.absent, "ครั้ง") +
        statCard("Production", Number(data.production).toLocaleString("th-TH"), "ชิ้น (mock)") +
        statCard("การขนส่ง", data.delivery, "รายการ (mock)") +
      '</div><section class="card card-pad" style="margin-top:.8rem"><p class="eyebrow">ผู้บันทึกยอดผลิตสูงสุดในช่วงนี้</p><h2>' +
      escapeHtml(data.outstanding || "—") + '</h2><p class="small-muted">นับจากรายการจำลอง ไม่ใช่เกณฑ์พนักงานดีเด่นของระบบจริง</p></section>';
    root.querySelectorAll("[data-period]").forEach(button => button.addEventListener("click", async () => {
      period = button.dataset.period;
      await draw();
    }));
  };
  try { await draw(); }
  catch (error) {
    root.innerHTML = '<div class="notice notice-danger">โหลดรายงานไม่สำเร็จ</div>';
    context.showToast(error.message || "เกิดข้อผิดพลาด", "error");
  }
}
