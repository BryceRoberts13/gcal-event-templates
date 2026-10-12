import { openTemplateManager } from "../open-options";

try {
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById("version");
  if (versionEl && manifest.version) {
    versionEl.textContent = `Version ${manifest.version}`;
  }
  const nameEl = document.getElementById("extension-name");
  if (nameEl && manifest.name) {
    nameEl.textContent = manifest.name;
  }
} catch {
  // Popup HTML already shows the name and version when this runs outside the extension.
}

document.getElementById("manage-templates")!.addEventListener("click", () => {
  void openTemplateManager().finally(() => window.close());
});
