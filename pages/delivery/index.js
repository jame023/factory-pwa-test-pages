import { APP_MODE } from "../../js/config.js";
import * as deliveryApi from "../../adapters/package04.js";
import { escapeHtml, localDateTimeValue, thaiDateTime } from "../../js/utils.js";
import { requireOnlineAction } from "../../js/offline.js";
import { canEnterData } from "../../js/permissions.js";

const MAX_DELIVERY_PHOTOS = 10;
const MAX_DELIVERY_FILE_BYTES = 1024 * 1024;
const MAX_DELIVERY_SOURCE_BYTES = 20 * 1024 * 1024;
const DELIVERY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
async function prepareDeliveryPhoto(file) {
  if (file.size <= MAX_DELIVERY_FILE_BYTES) return { file, compressed: false };
  if (typeof createImageBitmap !== "function") throw new Error("เบราว์เซอร์นี้บีบอัดรูปไม่ได้ กรุณาใช้รูปที่เล็กลง");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("เปิดรูปเพื่อบีบอัดไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP"); }
  try {
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เตรียมพื้นที่บีบอัดรูปไม่สำเร็จ");
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)), quality = .88;
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_DELIVERY_FILE_BYTES) return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() }), compressed: true };
      if (attempt % 2 === 0) quality = Math.max(.42, quality - .12); else scale *= .82;
    }
    throw new Error("บีบอัดรูปให้ไม่เกิน 1 MB ไม่ได้ กรุณาใช้รูปที่เล็กลง");
  } finally { bitmap.close?.(); }
}

const drawRows = rows => [...rows].sort((a,b) => String(b.dateTime || b.createdAt || "").localeCompare(String(a.dateTime || a.createdAt || ""))).slice(0, 8).map(item => {
  const fields = [
    ["เลขที่บิล",item.billNumber || "—"], ["จำนวนรูปหลักฐาน",item.images?.length || 0], ["สินค้า",item.product], ["จำนวน",item.quantity], ["ผู้ส่ง",item.sender],
    ["วันที่และเวลาส่ง",thaiDateTime(item.dateTime || item.createdAt)], ["สถานะ",item.status],
    ["หมายเหตุ",item.note || "—"], ["รหัสรายการ",item.id || "—"],
    ["บันทึกเมื่อ",item.createdAt ? thaiDateTime(item.createdAt) : "—"]
  ];
  return '<article class="delivery-record"><div class="list-row"><div class="list-main"><div class="list-title">' + escapeHtml(item.product) + '</div><div class="list-meta">จำนวน ' + escapeHtml(item.quantity) + ' · ' + escapeHtml(item.sender) + ' · ' + escapeHtml(thaiDateTime(item.dateTime || item.createdAt)) + '</div></div><span class="badge ' + (item.status === "ส่งสำเร็จ" ? "badge-success" : "badge-danger") + '">' + escapeHtml(item.status) + '</span></div><details class="delivery-record-details" data-live-key="' + escapeHtml(item.id) + '"><summary>ดูรายละเอียดการขนส่ง</summary><dl class="work-manager-fields">' + fields.map(([label,value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(String(value ?? "—")) + '</dd></div>').join("") + '</dl></details></article>';
}).join("");

export async function render(root, context) {
  root.innerHTML = '<div class="page-loading"><span class="loading-spinner"></span><span>กำลังโหลดรายการขนส่ง…</span></div>';
  const rows = await deliveryApi.listDeliveries();
  const canCreate = canEnterData(context.user.role);
  const options = canCreate ? await deliveryApi.getDeliveryOptions() : null;
  const ready = options?.allowed && options.products.length > 0;
  let selectedPhotos = [], previewUrls = [], processingPhotos = false;
  const clearPreviewUrls = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; };
  context.signal?.addEventListener("abort", clearPreviewUrls, { once: true });
  root.innerHTML =
    '<div class="page-heading"><div><p class="eyebrow">การขนส่ง</p><h1>' + (canCreate ? 'บันทึกการขนส่ง' : 'ข้อมูลการขนส่ง') + '</h1><p>' + (canCreate ? 'กรอกข้อมูลการขนส่ง' : 'รายการที่พนักงานบันทึก แสดงแบบอ่านอย่างเดียว') + '</p></div></div>' +
    (APP_MODE === "mock" ? '<p class="notice notice-warning">DEV MOCK • รายการเลือกอ่านจากชีต ณ 09/10/2569 • ผู้ส่งและรายการบันทึกเป็นข้อมูลจำลอง • ยังไม่เขียนชีตจริง</p>' : '') +
    (canCreate ? '<section class="card form-card"><h2>บันทึกการขนส่ง</h2><form id="delivery-form" style="margin-top:.8rem"><div class="form-grid">' +
      '<div class="field"><label for="product">สินค้า</label><select id="product" name="product" required' + (ready ? '' : ' disabled') + '><option value="">' + (ready ? 'เลือกสินค้า' : 'ยังไม่มีรายการสินค้าตามสิทธิ์') + '</option>' + (options.products || []).map(product => '<option value="' + escapeHtml(product) + '">' + escapeHtml(product) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="billNumber">เลขที่บิล</label><input id="billNumber" name="billNumber" pattern="[Ss][Dd][0-9]{9}" maxlength="11" placeholder="SD123456789" required></div>' +
      '<div class="field field-full"><span class="field-label">รูปหลักฐาน <span class="ot-optional">จำเป็น</span></span><div class="ot-upload-box" data-delivery-dropzone><div class="ot-upload-mark" aria-hidden="true">＋</div><div class="ot-upload-copy"><strong>เพิ่มรูปหลักฐานการขนส่ง</strong><span>เลือกหลายรูปหรือเพิ่มภายหลังได้</span><small>JPG, PNG หรือ WebP • บีบอัดรูปใหญ่ให้อัตโนมัติ • สูงสุด 10 รูป รูปละไม่เกิน 1 MB</small></div><label class="button button-small ot-upload-button" for="deliveryImages">เลือกรูป<input id="deliveryImages" class="ot-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label></div><div class="ot-photo-status" data-delivery-photo-status role="status" aria-live="polite">ยังไม่ได้เลือกรูป</div><div class="ot-photo-grid" data-delivery-photo-grid></div></div>' +
      '<div class="field"><label for="quantity">จำนวน</label><input id="quantity" name="quantity" type="number" inputmode="decimal" min="0.01" step="any" required></div>' +
      '<div class="field"><label for="sender">ผู้ส่ง</label><input id="sender" name="sender" readonly required value="' + escapeHtml(options.sender || '') + '" placeholder="รอยืนยันสิทธิ์จาก Supabase"><p class="small-muted">กำหนดจากบัญชีที่เข้าสู่ระบบ ไม่สามารถเปลี่ยนชื่อได้</p></div>' +
      '<div class="field"><label for="dateTime">วันที่และเวลา</label><input id="dateTime" name="dateTime" type="datetime-local" required value="' + escapeHtml(localDateTimeValue()) + '"></div>' +
      '<div class="field"><label for="deliveryStatus">สถานะ</label><input id="deliveryStatus" name="status" value="ส่งสำเร็จ" readonly></div>' +
    '</div>' + (!ready ? '<p class="small-muted" role="status">ยังไม่มีสินค้า หรือบัญชีนี้ไม่มีสิทธิ์บันทึกการขนส่ง</p>' : '') + '<div class="form-actions"><button class="button button-primary" type="submit"' + (ready ? '' : ' disabled data-live-disabled') + '>ตรวจสอบและบันทึก</button></div></form></section>' : '') +
    '<div class="section-title"><div><h2>รายการล่าสุด</h2><p>แสดงสูงสุด 8 รายการ</p></div></div>' +
    '<section class="card card-pad"><div class="list">' + (rows.length ? drawRows(rows) : '<div class="empty-state">ยังไม่มีรายการขนส่ง</div>') +
    "</div></section><p class=\"small-muted\" style=\"margin-top:.8rem\">ข้อมูลและรายการขนส่งเชื่อมกับ Supabase</p>";
  const form = root.querySelector("#delivery-form");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!ready) return;
    if (!requireOnlineAction("บันทึกการขนส่ง")) return;
    const button = form.querySelector("button[type=submit]");
    if (button.disabled) return;
    const values = Object.fromEntries(new FormData(form));
    if (Number(values.quantity) <= 0) { context.showToast("จำนวนต้องมากกว่า 0", "error"); return; }
    button.disabled = true; button.textContent = "กำลังบันทึก…";
    try {
      const images=await Promise.all(selectedPhotos.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,mimeType:file.type,size:file.size,dataUrl:reader.result});reader.onerror=()=>reject(new Error("อ่านรูปแนบไม่สำเร็จ"));reader.readAsDataURL(file);})));
      await deliveryApi.createDelivery({...values,images});
      clearPreviewUrls();
      context.showToast("บันทึกรายการแล้ว", "success");
      await render(root, context);
    } catch (error) {
      context.showToast(error.message || "บันทึกไม่สำเร็จ", "error");
      button.disabled = false; button.textContent = "ตรวจสอบและบันทึก";
    }
  });
  const fileInput = form?.querySelector("#deliveryImages"), dropzone = form?.querySelector("[data-delivery-dropzone]");
  const photoGrid = form?.querySelector("[data-delivery-photo-grid]"), photoStatus = form?.querySelector("[data-delivery-photo-status]");
  const submitButton = form?.querySelector("[type=submit]");
  function drawPhotos() {
    clearPreviewUrls();
    photoGrid.innerHTML = selectedPhotos.map((file,index) => {
      const url = URL.createObjectURL(file); previewUrls.push(url);
      return '<article class="ot-photo-card"><img src="'+escapeHtml(url)+'" alt="ตัวอย่างรูปหลักฐาน '+(index+1)+'"><div class="ot-photo-info"><strong>'+escapeHtml(file.name)+'</strong><span>'+(file.size/1024).toFixed(0)+' KB</span></div><button class="ot-photo-remove" type="button" data-remove-delivery-photo="'+index+'" aria-label="ลบรูป '+escapeHtml(file.name)+'">ลบ</button></article>';
    }).join("");
    photoStatus.textContent = selectedPhotos.length ? 'เลือกแล้ว '+selectedPhotos.length+' จาก '+MAX_DELIVERY_PHOTOS+' รูป' : 'ยังไม่ได้เลือกรูป';
    fileInput.required = selectedPhotos.length === 0;
  }
  async function addPhotos(files) {
    const incoming = Array.from(files || []);
    if (!incoming.length || processingPhotos) return;
    if (selectedPhotos.length + incoming.length > MAX_DELIVERY_PHOTOS) { context.showToast('แนบได้สูงสุด '+MAX_DELIVERY_PHOTOS+' รูป','error'); return; }
    if (incoming.some(file => !DELIVERY_IMAGE_TYPES.includes(file.type) || file.size <= 0 || file.size > MAX_DELIVERY_SOURCE_BYTES)) { context.showToast('เลือกรูป JPG, PNG หรือ WebP ขนาดต้นฉบับไม่เกิน 20 MB ต่อรูป','error'); return; }
    processingPhotos = true; fileInput.disabled = true; submitButton.disabled = true; photoStatus.textContent = 'กำลังตรวจและปรับขนาดรูป…'; dropzone.classList.add('is-processing');
    try {
      let compressed = 0;
      for (const file of incoming) { const result = await prepareDeliveryPhoto(file); selectedPhotos.push(result.file); if (result.compressed) compressed++; }
      if (context.signal?.aborted) return;
      drawPhotos(); if (compressed) context.showToast('บีบอัดรูปใหญ่ให้อัตโนมัติแล้ว '+compressed+' รูป','success');
    } catch (error) { photoStatus.textContent = selectedPhotos.length ? 'เพิ่มรูปไม่สำเร็จ • รูปเดิมยังอยู่' : 'เพิ่มรูปไม่สำเร็จ'; context.showToast(error.message||'เพิ่มรูปไม่สำเร็จ','error'); }
    finally { processingPhotos=false; fileInput.disabled=false; submitButton.disabled=false; dropzone.classList.remove('is-processing'); }
  }
  fileInput?.addEventListener('change',()=>{void addPhotos(fileInput.files);fileInput.value='';});
  photoGrid?.addEventListener('click',event=>{const button=event.target.closest('[data-remove-delivery-photo]');if(!button||processingPhotos)return;selectedPhotos.splice(Number(button.dataset.removeDeliveryPhoto),1);drawPhotos();});
  dropzone?.addEventListener('dragover',event=>{event.preventDefault();dropzone.classList.add('is-dragging');});
  dropzone?.addEventListener('dragleave',event=>{if(!dropzone.contains(event.relatedTarget))dropzone.classList.remove('is-dragging');});
  dropzone?.addEventListener('drop',event=>{event.preventDefault();dropzone.classList.remove('is-dragging');void addPhotos(event.dataTransfer?.files);});
}




