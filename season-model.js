// Felles datamodell for flere lag og sesonger.
// Denne modulen er bevisst ikke koblet til eksisterende produksjonssider ennå.
export const SEASON_STATUS = Object.freeze({ ACTIVE: "active", ARCHIVED: "archived" });

export function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Ugyldig sesongår");
  }
  return year;
}

export function createTeam({ name, club = "Samnanger IL", ageGroup = "" }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Lagnavn mangler");
  return { name: trimmed, club: String(club).trim(), ageGroup: String(ageGroup).trim(), createdAt: null };
}

export function createSeason({ teamId, year, name = "" }) {
  if (!teamId || typeof teamId !== "string") throw new Error("teamId mangler");
  const normalizedYear = normalizeYear(year);
  return {
    teamId, year: normalizedYear,
    name: String(name).trim() || String(normalizedYear),
    status: SEASON_STATUS.ACTIVE,
    createdAt: null
  };
}

export function createMembership({ teamId, seasonId, playerId, jerseyNumber = null }) {
  if (![teamId, seasonId, playerId].every(v => typeof v === "string" && v.trim())) {
    throw new Error("Lag, sesong og spiller må være valgt");
  }
  return { teamId, seasonId, playerId, jerseyNumber, active: true };
}

export function belongsToSeason(record, { teamId, seasonId }) {
  return Boolean(record && teamId && seasonId &&
    record.teamId === teamId && record.seasonId === seasonId);
}

export function filterSeasonRecords(records, context) {
  return records.filter(record => belongsToSeason(record, context));
}

// Foreslått Firestore-struktur:
// teams/{teamId}
// seasons/{seasonId}                 (teamId, year, status)
// seasonMemberships/{membershipId}   (teamId, seasonId, playerId)
// matches/{matchId}                  (+ teamId, seasonId)
// spillere/{playerId}                (stabil identitet på tvers av år)
//
// Viktig: eksisterende matches uten teamId/seasonId må migreres kontrollert.
// Ikke fall tilbake til å vise dem i alle sesonger.

// Statistikken beregnes per sesong, aldri som et løpende tall på spilleren.
// En spiller som er med i flere sesonger, starter dermed på null hvert år.
export function playerSeasonStats(matches, playerId, context) {
  const seasonMatches = filterSeasonRecords(matches, context);
  const result = { matches: 0, goals: 0, minutes: 0 };
  for (const match of seasonMatches) {
    const stats = match?.playerStats?.[playerId];
    if (!stats) continue;
    if (stats.played === true || Number(stats.minutes) > 0) result.matches += 1;
    result.goals += Number(stats.goals) || 0;
    result.minutes += Number(stats.minutes) || 0;
  }
  return result;
}
