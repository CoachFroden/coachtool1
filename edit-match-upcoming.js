const params = new URLSearchParams(window.location.search);
const source = params.get("source");

function simplifyUpcomingEditor() {
  if (source !== "official") return;

  const statusEl = document.getElementById("status");
  if (!statusEl || String(statusEl.value || "").toUpperCase() !== "UPCOMING") return;

  const ourEl = document.getElementById("our");
  const theirEl = document.getElementById("their");
  const toggleEventsBtn = document.getElementById("toggleEventsBtn");
  const eventsSection = document.getElementById("eventsSection");
  const backBtn = document.getElementById("backBtn");
  const hint = document.getElementById("hint");
  const title = document.querySelector(".title h1");

  ourEl?.closest("label")?.remove();
  theirEl?.closest("label")?.remove();
  statusEl.closest("label")?.remove();
  toggleEventsBtn?.remove();
  eventsSection?.remove();

  if (title) title.textContent = "Rediger kommende kamp";
  if (hint) hint.textContent = "Endre dato, klokkeslett, motstander og kampdetaljer.";

  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = "kamper.html";
    };
  }
}

window.addEventListener("load", () => {
  // edit-match.js fyller kampdata asynkront etter innlogging. Vent kort til status er satt.
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const statusEl = document.getElementById("status");
    const hasLoadedStatus = statusEl && statusEl.value;

    if (hasLoadedStatus || attempts >= 40) {
      window.clearInterval(timer);
      simplifyUpcomingEditor();
    }
  }, 100);
});
