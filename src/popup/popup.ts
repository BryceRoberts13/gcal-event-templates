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
  // The popup HTML still explains the feature when this runs outside the extension.
}

const manageButton = document.getElementById("manage-templates");
if (!manageButton) {
  throw new Error("Popup is missing #manage-templates");
}
manageButton.addEventListener("click", () => {
  void openTemplateManager().finally(() => window.close());
});
