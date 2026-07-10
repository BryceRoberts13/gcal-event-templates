/** Opens the extension options page where templates can be added, edited, or deleted. */
export async function openTemplateManager(): Promise<void> {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) {
    return;
  }

  try {
    const response = (await runtime.sendMessage({
      type: "gcet/open-options",
    })) as { ok?: boolean; error?: string } | undefined;
    if (response?.ok) {
      return;
    }
    if (response?.error) {
      console.warn("[gcal-event-templates] open-options failed:", response.error);
    }
  } catch (error) {
    console.warn("[gcal-event-templates] open-options messaging failed:", error);
  }

  // Popup / other extension pages can open options directly if messaging fails.
  if (typeof runtime.openOptionsPage === "function") {
    try {
      await runtime.openOptionsPage();
    } catch (error) {
      console.warn("[gcal-event-templates] openOptionsPage failed:", error);
    }
  }
}
