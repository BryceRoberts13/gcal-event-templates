import {
  listTemplates,
  upsertTemplate,
  deleteTemplate,
  exportStoreJson,
  importStoreJson,
  resetToDefaultTemplates,
} from "../store/template-store";
import type { EventTemplate, GcalColorId } from "../types";

const listElement = document.getElementById("template-list") as HTMLUListElement;
const editorOverlay = document.getElementById("editor-overlay") as HTMLDivElement;
const templateForm = document.getElementById("template-form") as HTMLFormElement;
const addBtn = document.getElementById("add-template") as HTMLButtonElement;
const exportBtn = document.getElementById("export-json") as HTMLButtonElement;
const importBtn = document.getElementById("import-json") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-defaults") as HTMLButtonElement;
const importFileInput = document.getElementById("import-file") as HTMLInputElement;
const cancelBtn = document.getElementById("cancel-edit") as HTMLButtonElement;

// Form fields
const fieldId = document.getElementById("field-id") as HTMLInputElement;
const fieldName = document.getElementById("field-name") as HTMLInputElement;
const fieldKeywords = document.getElementById("field-keywords") as HTMLInputElement;
const fieldDescription = document.getElementById("field-description") as HTMLTextAreaElement;
const fieldLocation = document.getElementById("field-location") as HTMLInputElement;
const fieldColor = document.getElementById("field-color") as HTMLSelectElement;

async function renderList(): Promise<void> {
  const templates = await listTemplates();
  listElement.innerHTML = "";

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
    colorId: (fieldColor.value as GcalColorId) || undefined,
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
      alert("Error importing templates: " + (err instanceof Error ? err.message : "Invalid format"));
    }
    importFileInput.value = "";
  };
  reader.readAsText(file);
};

void renderList();
