import { hideActionPopup, showActionPopup } from "./action-popup.js";

export function showToast(message, tone = "info") {
  hideActionPopup();
  showActionPopup(message, {
    tone: tone === "success" || tone === "error" ? tone : "info",
    timeout: 3200
  });
}
