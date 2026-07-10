const BANNER_ID = "gcet-refresh-banner";

export function showExtensionRefreshBanner(): void {
  if (document.getElementById(BANNER_ID)) {
    return;
  }

  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.className = "gcet-refresh-banner";
  banner.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent =
    "Event Templates was updated — refresh this Calendar tab to reconnect.";
  banner.appendChild(text);

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "gcet-refresh-banner-btn";
  refresh.textContent = "Refresh";
  refresh.addEventListener("click", () => {
    location.reload();
  });
  banner.appendChild(refresh);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "gcet-refresh-banner-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => {
    banner.remove();
  });
  banner.appendChild(dismiss);

  document.body.appendChild(banner);
}
