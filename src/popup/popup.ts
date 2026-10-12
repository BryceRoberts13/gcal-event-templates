import { openTemplateManager } from "../open-options";

try {
  const version = chrome.runtime.getManifest().version;
  const versionEl = document.getElementById("version");
  if (versionEl && version) {
    versionEl.textContent = `Version ${version}`;
  }
} catch {
  // Popup HTML already shows the version when this runs outside the extension.
}

document.getElementById("manage-templates")!.addEventListener("click", () => {
  void openTemplateManager().finally(() => window.close());
});
