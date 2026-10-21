import { withRequestId } from "../js/business-request.js?v=1.3.184";
import { request } from "../js/api.js?v=1.3.184";
export const listProduction = () => request("package05", "production.list");
export const createProductionEntry = payload => request("package05", "production.create", withRequestId(payload));
