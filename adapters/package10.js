import { request } from "../js/api.js?v=1.3.181";
import { normalizeAttendanceQuery } from "../js/attendance-contract.js";
export const readMyAttendance = (query = {}, options = {}) =>
  request("package10", "attendance.read", normalizeAttendanceQuery(query), options);
export const readManagerAttendanceOverview = (options = {}) =>
  request("package10", "attendance.manager", {}, options);

export const readAttendanceNotifications = () => request("package10", "attendance.notifications.read");
