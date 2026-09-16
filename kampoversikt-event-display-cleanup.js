function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanEventRow(row) {
  if (!row || row.dataset.minuteDisplayCleaned === "1") return;

  const minuteEl = row.querySelector(".eventMinute");
  const textEl = row.querySelector(".eventText");
  if (!minuteEl || !textEl) return;

  const minute = String(minuteEl.textContent || "")
    .trim()
    .replace(/[’']$/, "")
    .trim();
  if (!minute) return;

  const textNode = [...textEl.childNodes].find(node =>
    node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim()
  );
  if (!textNode) return;

  const escapedMinute = escapeRegExp(minute);
  const icon = "(?:⚽|🟨|🟥|🔁|🔄|🔃|↔️?)";
  const prefix = `(^|\\d{1,2}:\\d{2}\\s*[–-]\\s*(?:${icon}\\s*)?|${icon}\\s*)`;
  const duplicateMinute = new RegExp(
    `${prefix}${escapedMinute}\\s*[’']?\\s*[–-]\\s*`,
    "u"
  );

  const original = String(textNode.nodeValue || "");
  const cleaned = original.replace(duplicateMinute, "$1");
  if (cleaned !== original) textNode.nodeValue = cleaned;

  row.dataset.minuteDisplayCleaned = "1";
}

function cleanEventRows() {
  document.querySelectorAll(".eventsPanel .eventRow").forEach(cleanEventRow);
}

const content = document.getElementById("content");
if (content) {
  const observer = new MutationObserver(cleanEventRows);
  observer.observe(content, { childList: true, subtree: true });
}

cleanEventRows();
