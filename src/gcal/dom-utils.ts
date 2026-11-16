function dispatchInput(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  dispatchInput(input);
}

export function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  descriptor?.set?.call(textarea, value);
  dispatchInput(textarea);
}

const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "LI",
  "TR",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "PRE",
  "SECTION",
  "ARTICLE",
]);

function contentEditableNodeToText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tag = element.tagName;
  if (tag === "BR") {
    return "\n";
  }
  if (tag === "STYLE" || tag === "SCRIPT") {
    return "";
  }

  let text = "";
  for (const child of element.childNodes) {
    text += contentEditableNodeToText(child);
  }
  if (BLOCK_TAGS.has(tag) && !text.endsWith("\n")) {
    text += "\n";
  }
  return text;
}

/** Plain text from a contenteditable, preserving paragraph and <br> breaks. */
export function readContentEditableText(element: HTMLElement): string {
  return contentEditableNodeToText(element).replace(/^\n+|\n+$/g, "");
}

export function setContentEditableText(element: HTMLElement, value: string): void {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 1) {
    element.textContent = value;
    dispatchInput(element);
    return;
  }

  element.replaceChildren(
    ...lines.map((line) => {
      const block = document.createElement("div");
      if (line === "") {
        block.appendChild(document.createElement("br"));
      } else {
        block.textContent = line;
      }
      return block;
    }),
  );
  dispatchInput(element);
}
