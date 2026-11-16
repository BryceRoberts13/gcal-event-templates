import {
  listTemplates,
  upsertTemplate,
  deleteTemplate,
  exportStoreJson,
  importStoreJson,
  resetToDefaultTemplates,
} from "../store/template-store";
import { STORAGE_KEY } from "../store/storage";
import { isGcalColorId } from "../store/validate-store";
import type { EventTemplate } from "../types";

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Options page is missing #${id}`);
  }
  return element as T;
}

const listElement = getRequiredElement<HTMLUListElement>("template-list");
const emptyState = getRequiredElement<HTMLParagraphElement>("empty-state");
const editorOverlay = getRequiredElement<HTMLDivElement>("editor-overlay");
const templateForm = getRequiredElement<HTMLFormElement>("template-form");
const addBtn = getRequiredElement<HTMLButtonElement>("add-template");
const exportBtn = getRequiredElement<HTMLButtonElement>("export-json");
const importBtn = getRequiredElement<HTMLButtonElement>("import-json");
const resetBtn = getRequiredElement<HTMLButtonElement>("reset-defaults");
const importFileInput = getRequiredElement<HTMLInputElement>("import-file");
const cancelBtn = getRequiredElement<HTMLButtonElement>("cancel-edit");

const fieldId = getRequiredElement<HTMLInputElement>("field-id");
const fieldName = getRequiredElement<HTMLInputElement>("field-name");
const fieldKeywords = getRequiredElement<HTMLInputElement>("field-keywords");
const fieldDescription = getRequiredElement<HTMLTextAreaElement>("field-description");
const fieldLocation = getRequiredElement<HTMLInputElement>("field-location");
const fieldColor = getRequiredElement<HTMLSelectElement>("field-color");

async function renderList(): Promise<void> {
  const templates = await listTemplates();
  listElement.innerHTML = "";
  emptyState.classList.toggle("hidden", templates.length > 0);

  templates.forEach((template) => {
    const li = document.createElement("li");
    li.className = "template-card";

    const info = document.createElement("div");
    info.className = "template-info";
    
    const h3 = document.createElement("h3");
    h3.textContent = template.name;
    info.appendChild(h3);

    const p = document.createElement("p");
    const parts = [];
    if (template.location) parts.push(`📍 ${template.location}`);
    if (template.description) parts.push(template.description.split("\n")[0]);
    p.textContent = parts.join(" | ") || "No description";
    info.appendChild(p);

    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "template-actions";

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => openEditor(template);
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "danger";
    delBtn.onclick = async () => {
      if (confirm(`Delete template "${template.name}"?`)) {
        await deleteTemplate(template.id);
        renderList();
      }
    };
    actions.appendChild(delBtn);

    li.appendChild(actions);
    listElement.appendChild(li);
  });
}

function openEditor(template?: EventTemplate): void {
  if (template) {
    fieldId.value = template.id;
    fieldName.value = template.name;
    fieldKeywords.value = (template.keywords || []).join(", ");
    fieldDescription.value = template.description || "";
    fieldLocation.value = template.location || "";
    fieldColor.value = template.colorId || "";
  } else {
    templateForm.reset();
    fieldId.value = "";
  }
  editorOverlay.classList.remove("hidden");
}

function closeEditor(): void {
  editorOverlay.classList.add("hidden");
  templateForm.reset();
}

templateForm.onsubmit = async (e) => {
  e.preventDefault();

  const id = fieldId.value || crypto.randomUUID();
  const keywords = fieldKeywords.value
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const template: EventTemplate = {
    id,
    name: fieldName.value,
    keywords: keywords.length > 0 ? keywords : undefined,
    description: fieldDescription.value || undefined,
    location: fieldLocation.value || undefined,
    colorId: isGcalColorId(fieldColor.value) ? fieldColor.value : undefined,
    updatedAt: Date.now(),
  };

  await upsertTemplate(template);
  closeEditor();
  renderList();
};

addBtn.onclick = () => openEditor();
cancelBtn.onclick = () => closeEditor();

exportBtn.onclick = async () => {
  const json = await exportStoreJson();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "templates.json";
  a.click();
  URL.revokeObjectURL(url);
};

importBtn.onclick = () => importFileInput.click();

resetBtn.onclick = async () => {
  if (
    !confirm(
      "Replace all templates with the built-in defaults (Focus block, Gym, 1:1, See family)?",
    )
  ) {
    return;
  }
  await resetToDefaultTemplates();
  await renderList();
};

importFileInput.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const raw = event.target?.result as string;
    try {
      await importStoreJson(raw);
      renderList();
      alert("Templates imported successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid format";
      alert(`Error importing templates: ${message}`);
    }
    importFileInput.value = "";
  };
  reader.readAsText(file);
};

try {
  chrome.storage?.onChanged.addListener((changes, area) => {
    if ((area !== "sync" && area !== "local") || !changes[STORAGE_KEY]) {
      return;
    }
    void renderList();
  });
} catch {
  // Options opened outside the extension has no storage events.
}

void renderList();
