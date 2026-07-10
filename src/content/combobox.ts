import { searchTemplates } from "../search/template-search";
import { openTemplateManager } from "../open-options";
import type { EventTemplate } from "../types";

const DROPDOWN_CLASS = "gcet-dropdown";
const ITEM_CLASS = "gcet-dropdown-item";
const MANAGE_CLASS = "gcet-dropdown-manage";

function matchesForQuery(
  templates: EventTemplate[],
  query: string,
): EventTemplate[] {
  const filtered = searchTemplates(templates, query);
  // If the field already has a one-off title (no template match), still show
  // the full list so the user can pick a template to overwrite.
  if (filtered.length === 0 && query.trim().length > 0) {
    return searchTemplates(templates, "");
  }
  return filtered;
}

export function mountTemplateCombobox(
  titleInput: HTMLInputElement,
  templates: EventTemplate[],
  onSelect: (template: EventTemplate) => void,
): () => void {
  if (titleInput.dataset.gcetMounted === "true") {
    return () => undefined;
  }
  titleInput.dataset.gcetMounted = "true";

  // Do NOT wrap GCal's input — React owns that tree. Overlay the dropdown on body.
  const dropdown = document.createElement("ul");
  dropdown.className = DROPDOWN_CLASS;
  dropdown.hidden = true;
  dropdown.setAttribute("role", "listbox");
  document.body.appendChild(dropdown);

  let activeIndex = -1;

  const positionDropdown = () => {
    const rect = titleInput.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.width = `${Math.max(rect.width, 280)}px`;
    dropdown.style.zIndex = "2147483646";
  };

  const render = () => {
    const matches = matchesForQuery(templates, titleInput.value);
    dropdown.replaceChildren();
    activeIndex = -1;

    for (const [index, template] of matches.entries()) {
      const item = document.createElement("li");
      item.className = ITEM_CLASS;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      item.dataset.gcetIndex = String(index);

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

      dropdown.appendChild(item);
    }

    const footer = document.createElement("li");
    footer.className = "gcet-dropdown-footer";
    footer.setAttribute("role", "presentation");
    const manageBtn = document.createElement("button");
    manageBtn.type = "button";
    manageBtn.className = MANAGE_CLASS;
    manageBtn.textContent = "Manage templates…";
    footer.appendChild(manageBtn);
    dropdown.appendChild(footer);

    dropdown.hidden = false;
    positionDropdown();
  };

  const open = () => {
    render();
  };

  const close = () => {
    dropdown.hidden = true;
    activeIndex = -1;
  };

  const selectAt = (index: number) => {
    const matches = matchesForQuery(templates, titleInput.value);
    const template = matches[index];
    if (!template) {
      return;
    }
    onSelect(template);
    close();
  };

  /**
   * GCal registers document capture outside-click listeners. Our overlay is
   * appended to body (outside the dialog), so without intercepting at window
   * capture the dialog closes before a template can be applied.
   */
  const shieldPage = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Node) || !dropdown.contains(target)) {
      return;
    }

    // Only apply on the first press of a gesture; close() hides the list so a
    // follow-up pointerdown/mousedown of the same click does not re-apply.
    if (
      !dropdown.hidden &&
      (event.type === "mousedown" || event.type === "pointerdown")
    ) {
      const manage =
        target instanceof Element ? target.closest(`.${MANAGE_CLASS}`) : null;
      if (manage) {
        event.preventDefault();
        close();
        void openTemplateManager();
        event.stopImmediatePropagation();
        return;
      }

      const item =
        target instanceof Element ? target.closest(`.${ITEM_CLASS}`) : null;
      if (item instanceof HTMLElement) {
        const index = Number(item.dataset.gcetIndex);
        if (Number.isFinite(index)) {
          event.preventDefault();
          selectAt(index);
        }
      }
    }

    event.stopImmediatePropagation();
  };

  const moveActive = (delta: number) => {
    const items = dropdown.querySelectorAll(`.${ITEM_CLASS}`);
    if (items.length === 0) {
      return;
    }
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items.forEach((item, index) => {
      item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      if (index === activeIndex) {
        (item as HTMLElement).scrollIntoView({ block: "nearest" });
      }
    });
  };

  const selectActive = () => {
    if (activeIndex >= 0) {
      selectAt(activeIndex);
    }
  };

  const onFocus = () => open();
  const onClick = () => open();
  const onInput = () => open();
  const onKeyDown = (event: KeyboardEvent) => {
    if (dropdown.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      open();
    }
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
      if (!dropdown.contains(document.activeElement) && document.activeElement !== titleInput) {
        close();
      }
    }, 150);
  };
  const onScrollOrResize = () => {
    if (!dropdown.hidden) {
      positionDropdown();
    }
  };

  titleInput.addEventListener("focus", onFocus);
  titleInput.addEventListener("click", onClick);
  titleInput.addEventListener("input", onInput);
  titleInput.addEventListener("keydown", onKeyDown);
  titleInput.addEventListener("blur", onBlur);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
  window.addEventListener("mousedown", shieldPage, true);
  window.addEventListener("mouseup", shieldPage, true);
  window.addEventListener("click", shieldPage, true);
  window.addEventListener("pointerdown", shieldPage, true);
  window.addEventListener("pointerup", shieldPage, true);

  return () => {
    titleInput.removeEventListener("focus", onFocus);
    titleInput.removeEventListener("click", onClick);
    titleInput.removeEventListener("input", onInput);
    titleInput.removeEventListener("keydown", onKeyDown);
    titleInput.removeEventListener("blur", onBlur);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
    window.removeEventListener("mousedown", shieldPage, true);
    window.removeEventListener("mouseup", shieldPage, true);
    window.removeEventListener("click", shieldPage, true);
    window.removeEventListener("pointerdown", shieldPage, true);
    window.removeEventListener("pointerup", shieldPage, true);
    delete titleInput.dataset.gcetMounted;
    dropdown.remove();
  };
}
