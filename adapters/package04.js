import { withRequestId } from "../js/business-request.js?v=1.3.184";
import { request } from "../js/api.js?v=1.3.184";
export const listDeliveries = () => request("package04", "delivery.list");
export const getDeliveryOptions = () => request("package04", "delivery.options");
export const createDelivery = payload => request("package04", "delivery.create", withRequestId(payload));

export const undoDelivery = id => request("package04","delivery.undo",{id});
