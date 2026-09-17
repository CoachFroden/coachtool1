import { db } from "./firebase-refleksjon.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const RECALC_KEY = "coachtool1:postmatch-playingtime-recalc";
const REPAIR_PREFIX = "coachtool1:postmatch-playingtime-repair:";

function timestamp(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function repairIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const matchId = params.get("matchId");
  if (!matchId || params.get("view") !== "played") return;

  // Gi den vanlige omberegningen tid til å fullføre først dersom den allerede
  // ble trigget av en hendelses- eller spillerkorrigering.
  await delay(1400);

  const snap = await getDoc(doc(db, "matches", matchId));
  if (!snap.exists()) return;

  const match = snap.data();
  if (String(match?.status || "").toUpperCase() !== "ENDED") return;

  const correctedAt = timestamp(match?.postMatchPlayerCorrection?.correctedAt);
  const calculatedAt = timestamp(match?.playingTimeAutoCalculatedAt);
  const repairKey = `${REPAIR_PREFIX}${matchId}`;

  // Ingen spillerkorrigering, eller beregningen er allerede nyere enn
  // korrigeringen: ingenting å reparere.
  if (!correctedAt || calculatedAt >= correctedAt) {
    sessionStorage.removeItem(repairKey);
    return;
  }

  const attempts = Number(sessionStorage.getItem(repairKey) || 0);
  if (attempts >= 2) {
    console.warn("Automatisk reparasjon av spilletid ble forsøkt to ganger uten å bli ferdig.");
    return;
  }

  sessionStorage.setItem(repairKey, String(attempts + 1));
  sessionStorage.setItem(RECALC_KEY, JSON.stringify({
    matchId,
    at: Date.now(),
    reason: "post-match-player-correction"
  }));

  window.location.reload();
}

repairIfNeeded().catch(error => {
  console.error("Kunne ikke kontrollere spilletid etter spillerkorrigering:", error);
});
