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
        if (node instanceof HTMLElement) {
          scan(node);
        }
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}
