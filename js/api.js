import { APP_MODE } from "./config.js";
import { mockRequest } from "./mock-api.js";
import { normalizeAttendanceQuery, validateAttendanceResponse, validateManagerResponse } from "./attendance-contract.js";
import { requestReadOnly } from "./read-only-api.js";
import { createSupabaseAppApi } from "./supabase-app-api.js";

export async function request(module, action, payload = {}, options = {}) {
  let data;
  if (APP_MODE === "mock") data = await mockRequest(module, action, payload);
  else if (APP_MODE === "development") data = await requestReadOnly(module, action, payload, options);
  else if (APP_MODE === "supabase-line" || APP_MODE === "production") data = await createSupabaseAppApi().request(module, action, payload, options);
  else {
    // Production continues to fail closed, regardless of endpoint configuration.
    throw new Error("ยังไม่ได้เชื่อม API สำหรับโหมด " + APP_MODE);
  }
  if (module === "package10" && action === "attendance.read") {
    return validateAttendanceResponse(data, normalizeAttendanceQuery(payload));
  }
  if (module === "package10" && action === "attendance.manager") return validateManagerResponse(data);
  return data;
}


