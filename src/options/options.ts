import { listTemplates } from "../store/template-store";

async function render(): Promise<void> {
  const list = document.getElementById("template-list");
  if (!list) {
    return;
  }

  const templates = await listTemplates();
  list.replaceChildren(
    ...templates.map((template) => {
      const item = document.createElement("li");
      item.textContent = template.name;
      return item;
    }),
  );
}

void render();
