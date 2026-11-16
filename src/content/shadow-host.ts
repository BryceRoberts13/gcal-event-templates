import cssText from "./styles.css?inline";

let sheet: CSSStyleSheet | null = null;

function applyStyles(root: ShadowRoot): void {
  try {
    if (typeof CSSStyleSheet === "undefined" || typeof CSSStyleSheet.prototype.replaceSync !== "function") {
      throw new Error("adoptedStyleSheets unavailable");
    }
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
    }
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement("style");
    style.textContent = cssText;
    root.append(style);
  }
}

/** Light-DOM host whose children are styled inside an open shadow root. */
export function mountShadowHost(): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement("div");
  host.dataset.gcetShadow = "";
  const root = host.attachShadow({ mode: "open" });
  applyStyles(root);
  return { host, root };
}

/**
 * Full-viewport host for menus, toasts, and the combobox. The host ignores
 * hits; the widget inside sets pointer-events and paints above Calendar.
 */
export function mountOverlay(name: string, zIndex: string): { host: HTMLElement; root: ShadowRoot } {
  const mounted = mountShadowHost();
  mounted.host.dataset.gcetOverlay = name;
  mounted.host.style.position = "fixed";
  mounted.host.style.inset = "0";
  mounted.host.style.zIndex = zIndex;
  mounted.host.style.pointerEvents = "none";
  return mounted;
}

export function removeOverlay(name: string): void {
  document.querySelector(`[data-gcet-overlay="${name}"]`)?.remove();
}

export function composedTarget(event: Event): EventTarget | null {
  const path = event.composedPath();
  return path[0] ?? event.target;
}

export function queryExtension<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T | null {
  const light = root.querySelector(selector);
  if (light) {
    return light as T;
  }
  for (const host of root.querySelectorAll("[data-gcet-shadow]")) {
    const found = host.shadowRoot?.querySelector(selector);
    if (found) {
      return found as T;
    }
  }
  return null;
}

export function queryExtensionAll(selector: string, root: ParentNode = document): Element[] {
  const found = Array.from(root.querySelectorAll(selector));
  for (const host of root.querySelectorAll("[data-gcet-shadow]")) {
    if (!host.shadowRoot) {
      continue;
    }
    found.push(...host.shadowRoot.querySelectorAll(selector));
  }
  return found;
}
