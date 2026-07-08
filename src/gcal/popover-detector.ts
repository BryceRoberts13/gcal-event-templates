import { isTitleInput } from "./dom-adapter";

export type TitleInputHandler = (input: HTMLInputElement) => void;

export function watchForEventTitleInputs(onTitleInput: TitleInputHandler): () => void {
  const seen = new WeakSet<HTMLInputElement>();

  const scan = (root: ParentNode) => {
    root.querySelectorAll("input").forEach((element) => {
      if (!isTitleInput(element) || seen.has(element)) {
        return;
      }
      seen.add(element);
      onTitleInput(element);
    });
  };

  scan(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node as ParentNode);
        }
      });
      if (mutation.type === "attributes" && mutation.target instanceof HTMLInputElement) {
        if (isTitleInput(mutation.target) && !seen.has(mutation.target)) {
          seen.add(mutation.target);
          onTitleInput(mutation.target);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "placeholder"],
  });

  // GCal is a SPA; re-scan periodically for late-mounted title fields.
  const intervalId = window.setInterval(() => scan(document), 1500);

  return () => {
    observer.disconnect();
    window.clearInterval(intervalId);
  };
}
