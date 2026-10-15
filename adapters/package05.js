import { withRequestId } from "../js/business-request.js";
import { request } from "../js/api.js";
export const listProduction = () => request("package05", "production.list");
export const createProductionEntry = payload => request("package05", "production.create", withRequestId(payload));
