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

export function setContentEditableText(element: HTMLElement, value: string): void {
  element.textContent = value;
  dispatchInput(element);
}
