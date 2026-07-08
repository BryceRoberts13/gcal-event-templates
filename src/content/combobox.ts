import { searchTemplates } from "../search/template-search";
import type { EventTemplate } from "../types";

const COMBOBOX_CLASS = "gcet-combobox";
const DROPDOWN_CLASS = "gcet-dropdown";
const ITEM_CLASS = "gcet-dropdown-item";

export function mountTemplateCombobox(
  titleInput: HTMLInputElement,
  templates: EventTemplate[],
  onSelect: (template: EventTemplate) => void,
): () => void {
  if (titleInput.dataset.gcetMounted === "true") {
    return () => undefined;
  }
  titleInput.dataset.gcetMounted = "true";

  const wrapper = document.createElement("div");
  wrapper.className = COMBOBOX_CLASS;
  titleInput.parentNode?.insertBefore(wrapper, titleInput);
  wrapper.appendChild(titleInput);

  const dropdown = document.createElement("ul");
  dropdown.className = DROPDOWN_CLASS;
  dropdown.hidden = true;
  dropdown.setAttribute("role", "listbox");
  wrapper.appendChild(dropdown);

  let activeIndex = -1;

  const render = () => {
    const matches = searchTemplates(templates, titleInput.value);
    dropdown.replaceChildren();
    activeIndex = -1;

    for (const [index, template] of matches.entries()) {
      const item = document.createElement("li");
      item.className = ITEM_CLASS;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");

      const name = document.createElement("div");
      name.className = "gcet-dropdown-item-name";
      name.textContent = template.name;
      item.appendChild(name);

      if (template.location || template.description) {
        const hint = document.createElement("div");
        hint.className = "gcet-dropdown-item-hint";
        hint.textContent = template.location ?? template.description ?? "";
        item.appendChild(hint);
      }

      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        onSelect(template);
        close();
      });

      dropdown.appendChild(item);
    }

    dropdown.hidden = matches.length === 0;
  };

  const open = () => {
    render();
    if (!dropdown.hidden) {
      dropdown.hidden = false;
    }
  };

  const close = () => {
    dropdown.hidden = true;
    activeIndex = -1;
  };

  const moveActive = (delta: number) => {
    const items = dropdown.querySelectorAll(`.${ITEM_CLASS}`);
    if (items.length === 0) {
      return;
    }
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items.forEach((item, index) => {
      item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
    });
  };

  const selectActive = () => {
    const matches = searchTemplates(templates, titleInput.value);
    const template = matches[activeIndex];
    if (template) {
      onSelect(template);
      close();
    }
  };

  const onFocus = () => open();
  const onInput = () => open();
  const onKeyDown = (event: KeyboardEvent) => {
    if (dropdown.hidden) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      event.stopPropagation();
      selectActive();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  const onBlur = () => {
    window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) {
        close();
      }
    }, 120);
  };

  titleInput.addEventListener("focus", onFocus);
  titleInput.addEventListener("input", onInput);
  titleInput.addEventListener("keydown", onKeyDown);
  titleInput.addEventListener("blur", onBlur);

  return () => {
    titleInput.removeEventListener("focus", onFocus);
    titleInput.removeEventListener("input", onInput);
    titleInput.removeEventListener("keydown", onKeyDown);
    titleInput.removeEventListener("blur", onBlur);
    delete titleInput.dataset.gcetMounted;
    wrapper.parentNode?.insertBefore(titleInput, wrapper);
    wrapper.remove();
  };
}
