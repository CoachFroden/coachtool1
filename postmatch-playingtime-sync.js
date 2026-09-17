import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  PLAYING_TIME_SCHEMA_VERSION,
  MANUAL_OVERRIDE_VERSION,
  calculatePlayingTime,
  applyManualOverrides,
  samePlayingTime
} from "./postmatch-playingtime-core.js?v=20260918-1";

export async function recalculateMatchPlayingTime(matchId, options = {}) {
  if (!matchId) return null;

  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const match = { id: snap.id, ...snap.data() };
  if (String(match.status || "").toUpperCase() !== "ENDED") return match;

  const hasPostMatchCorrection = Boolean(match?.postMatchPlayerCorrection?.correctedAt);
  const hasLegacyOverrideData =
    Array.isArray(match?.playingTimeManualOverrides) ||
    Number(match?.playingTimeManualOverrideVersion) > 0 ||
    match?.playingTimeCalculation?.mode === "manual" ||
    match?.playingTimeCalculation?.mode === "mixed";

  // Ikke skriv om historiske kamper bare fordi vinduet åpnes.
  // Hendelsesredigering kan eksplisitt tvinge beregning med { force: true }.
  if (!options.force && !hasPostMatchCorrection && !hasLegacyOverrideData) {
    return match;
  }

  // Gamle forsøk på globale/manuelle overstyringer var ikke entydige.
  // Migrer dem bort én gang. Nye overstyringer opprettes eksplisitt per spiller.
  const needsOverrideMigration =
    Number(match?.playingTimeManualOverrideVersion) !== MANUAL_OVERRIDE_VERSION;

  const workingMatch = needsOverrideMigration
    ? {
        ...match,
        playingTimeManualOverrides: [],
        playingTimeManualOverrideVersion: MANUAL_OVERRIDE_VERSION
      }
    : match;

  const calculated = calculatePlayingTime(workingMatch);
  const finalPlayingTime = applyManualOverrides(workingMatch, calculated.playingTime);

  const needsWrite =
    needsOverrideMigration ||
    Number(match?.playingTimeCalculation?.version) !== PLAYING_TIME_SCHEMA_VERSION ||
    !samePlayingTime(match.playingTime, finalPlayingTime);

  if (!needsWrite) {
    return {
      ...workingMatch,
      playingTime: finalPlayingTime
    };
  }

  const calculation = {
    source: (workingMatch.playingTimeManualOverrides || []).length
      ? "auto-with-player-manual-overrides"
      : "starters-substitutions-match-end",
    mode: (workingMatch.playingTimeManualOverrides || []).length ? "mixed" : "auto",
    version: PLAYING_TIME_SCHEMA_VERSION,
    matchEndMs: calculated.matchEndMs,
    starterCount: calculated.starterCount
  };

  await updateDoc(ref, {
    playingTime: finalPlayingTime,
    playingTimeManualOverrides: workingMatch.playingTimeManualOverrides || [],
    playingTimeManualOverrideVersion: MANUAL_OVERRIDE_VERSION,
    playingTimeCalculation: calculation,
    playingTimeAutoCalculated: true,
    playingTimeAutoCalculatedAt: new Date().toISOString(),
    playingTimeRecalcRequestedAt: null,
    updatedAt: serverTimestamp()
  });

  return {
    ...workingMatch,
    playingTime: finalPlayingTime,
    playingTimeCalculation: calculation
  };
}
