export class ExtensionContextInvalidatedError extends Error {
  constructor() {
    super("Extension context invalidated");
    this.name = "ExtensionContextInvalidatedError";
  }
}

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(globalThis.chrome?.runtime?.id);
  } catch {
    return false;
  }
}

export function isExtensionContextInvalidated(error: unknown): boolean {
  if (error instanceof ExtensionContextInvalidatedError) {
    return true;
  }
  if (error instanceof Error) {
    return error.message.includes("Extension context invalidated");
  }
  return false;
}

export function assertExtensionContextValid(): void {
  if (!isExtensionContextValid()) {
    throw new ExtensionContextInvalidatedError();
  }
}
