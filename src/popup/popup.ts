import { openTemplateManager } from "../open-options";

document.getElementById("manage-templates")!.addEventListener("click", () => {
  void openTemplateManager().finally(() => window.close());
});
