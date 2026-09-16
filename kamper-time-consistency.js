import { db } from "./firebase-refleksjon.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

function canonicalTime(meta = {}) {
  return String(meta.startTime || meta.time || "").trim();
}

function setDisplayedTime(element, time) {
  if (!element || !time) return;
  const text = String(element.textContent || "").trim();
  if (/\bkl\s+\d{1,2}:\d{2}\b/i.test(text)) {
    element.textContent = text.replace(/\bkl\s+\d{1,2}:\d{2}\b/i, `kl ${time}`);
  } else if (text) {
    element.textContent = `${text} kl ${time}`;
  }
}

async function fetchMatchById(matchId) {
  if (!matchId) return null;
  const snap = await getDoc(doc(db, "matches", matchId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function findMatchForModal(title, venueName) {
  const opponent = String(title || "").trim();
  if (!opponent) return null;

  const snap = await getDocs(query(
    collection(db, "matches"),
    where("meta.opponent", "==", opponent)
  ));

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!rows.length) return null;

  const venue = String(venueName || "").trim().toLocaleLowerCase("no");
  const venueMatches = venue
    ? rows.filter(row => String(row?.meta?.venueName || "").trim().toLocaleLowerCase("no") === venue)
    : rows;

  const candidates = venueMatches.length ? venueMatches : rows;
  candidates.sort((a, b) => String(b?.meta?.date || "").localeCompare(String(a?.meta?.date || "")));
  return candidates[0] || null;
}

async function correctModal(prefix) {
  const overlay = document.getElementById(`${prefix}ModalOverlay`);
  if (!overlay?.classList.contains("show")) return;

  const titleEl = document.getElementById(`${prefix}ModalTitle`);
  const dateEl = document.getElementById(`${prefix}ModalDate`);
  const venueEl = document.getElementById(`${prefix}ModalVenue`);
  if (!titleEl || !dateEl) return;

  const params = new URLSearchParams(window.location.search);
  const urlMatchId = prefix === "pitch" && params.get("openLineup") === "true"
    ? params.get("matchId")
    : null;

  let match = await fetchMatchById(urlMatchId);
  if (!match) {
    match = await findMatchForModal(titleEl.textContent, venueEl?.textContent);
  }
  if (!match) return;

  const time = canonicalTime(match.meta || {});
  if (time) setDisplayedTime(dateEl, time);
}

for (const prefix of ["pitch", "info"]) {
  const overlay = document.getElementById(`${prefix}ModalOverlay`);
  if (!overlay) continue;

  const observer = new MutationObserver(() => {
    if (overlay.classList.contains("show")) {
      correctModal(prefix).catch(error => console.error("Kunne ikke korrigere kampstarttid:", error));
    }
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });
}

correctModal("pitch").catch(() => {});
correctModal("info").catch(() => {});
