import { escapeHtml } from "../js/utils.js";

export function confirmAction({ title, message, confirmLabel = "ยืนยัน", danger = false }) {
  return new Promise(resolve => {
    const root = document.createElement("div");
    root.className = "modal-backdrop";
    root.innerHTML = '<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
      '<h2 id="confirm-title">' + escapeHtml(title) + "</h2>" +
      "<p>" + escapeHtml(message) + '</p><div class="modal-actions">' +
      '<button type="button" class="button" data-choice="cancel">ยกเลิก</button>' +
      '<button type="button" class="button ' + (danger ? "button-danger" : "button-primary") +
      '" data-choice="confirm">' + escapeHtml(confirmLabel) + "</button></div></section>";
    const finish = value => { root.remove(); resolve(value); };
    root.addEventListener("click", event => {
      const choice = event.target.closest("[data-choice]")?.dataset.choice;
      if (choice) finish(choice === "confirm");
      else if (event.target === root) finish(false);
    });
    document.body.append(root);
    root.querySelector("[data-choice=confirm]").focus();
  });
}
