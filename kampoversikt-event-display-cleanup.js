import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMatchMinute(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

function eventSortValue(event) {
  const rawTime = event?.timeMs;
  if (rawTime !== null && rawTime !== undefined && rawTime !== "") {
    const ms = Number(rawTime);
    if (Number.isFinite(ms)) return ms;
  }
  const minute = parseMatchMinute(event?.minute);
  return minute == null ? Number.MAX_SAFE_INTEGER : minute * 60000;
}

function sortedEvents(events) {
  return (Array.isArray(events) ? [...events] : [])
    .sort((a, b) => eventSortValue(a) - eventSortValue(b));
}

function eventClock(event) {
  const stored = String(event?.createdClock || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(stored)) return stored;

  const source = String(event?.text || event?.rawText || "");
  return source.match(/^\s*(\d{1,2}:\d{2})\s*[–-]\s*/u)?.[1] || "";
}

function cleanDuplicateMinute(text, minute) {
  if (!minute) return text;
  const escapedMinute = escapeRegExp(minute);
  const icon = "(?:⚽|🟨|🟥|🔁|🔄|🔃|↔️?)";
  const prefix = `(^|\\d{1,2}:\\d{2}\\s*[–-]\\s*(?:${icon}\\s*)?|${icon}\\s*)`;
  const duplicateMinute = new RegExp(
    `${prefix}${escapedMinute}\\s*[’']?\\s*[–-]\\s*`,
    "u"
  );
  return text.replace(duplicateMinute, "$1");
}

function enhanceEventRow(row, event) {
  if (!row || !event) return;

  const minuteEl = row.querySelector(".eventMinute");
  const textEl = row.querySelector(".eventText");
  if (!minuteEl || !textEl) return;

  const textNode = [...textEl.childNodes].find(node =>
    node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim()
  );
  if (!textNode) return;

  const minute = String(minuteEl.textContent || "")
    .trim()
    .replace(/[’']$/, "")
    .trim();

  let text = String(textNode.nodeValue || "");
  text = cleanDuplicateMinute(text, minute);

  const clock = eventClock(event);
  const visibleClock = text.match(/^\s*(\d{1,2}:\d{2})\s*[–-]\s*/u)?.[1] || "";
  if (clock && !visibleClock) {
    text = `${clock} – ${text.trimStart()}`;
  }

  textNode.nodeValue = text;
  row.dataset.eventDisplayEnhanced = "1";
}

const matchCache = new Map();

async function loadMatch(matchId) {
  if (!matchCache.has(matchId)) {
    matchCache.set(matchId, getDoc(doc(db, "matches", matchId)).then(snapshot =>
      snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
    ).catch(error => {
      matchCache.delete(matchId);
      console.warn("Kunne ikke hente hendelser for visningsopprydding:", error);
      return null;
    }));
  }
  return matchCache.get(matchId);
}

async function enhancePanel(panel) {
  if (!panel?.id?.startsWith("events-")) return;
  const rows = [...panel.querySelectorAll(".eventRow")];
  if (!rows.length || rows.every(row => row.dataset.eventDisplayEnhanced === "1")) return;

  const matchId = panel.id.slice("events-".length);
  const match = await loadMatch(matchId);
  if (!match) return;

  const events = sortedEvents(match.events);
  rows.forEach((row, index) => enhanceEventRow(row, events[index]));
}

function enhanceEventRows() {
  document.querySelectorAll(".eventsPanel").forEach(panel => {
    enhancePanel(panel);
  });
}

const content = document.getElementById("content");
if (content) {
  const observer = new MutationObserver(enhanceEventRows);
  observer.observe(content, { childList: true, subtree: true });
}

enhanceEventRows();
