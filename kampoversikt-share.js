import { db } from "./firebase-refleksjon.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("no-NO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function minuteNumber(event) {
  if (event?.minute != null && event.minute !== "") {
    const raw = String(event.minute).trim();
    const plus = raw.match(/^(\d+)\s*\+\s*(\d+)$/);
    if (plus) return Number(plus[1]) + Number(plus[2]) / 100;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const ms = Number(event?.timeMs);
  if (Number.isFinite(ms) && ms >= 0) return ms / 60000;
  return Number.MAX_SAFE_INTEGER;
}

function minuteLabel(event) {
  if (event?.minute != null && event.minute !== "") {
    return `${String(event.minute).trim()}'`;
  }
  const ms = Number(event?.timeMs);
  if (Number.isFinite(ms) && ms >= 0) {
    return `${Math.max(1, Math.ceil(ms / 60000))}'`;
  }
  return "";
}

function eventText(event) {
  return String(event?.text || event?.rawText || "")
    .replace(/^\d{1,2}:\d{2}\s*[–-]\s*/, "")
    .trim();
}

function isGoal(event) {
  return event?.type === "goal" || eventText(event).includes("⚽");
}

function isCard(event) {
  const text = eventText(event);
  return event?.type === "card" || text.includes("🟨") || text.includes("🟥");
}

function playerName(event) {
  if (event?.playerName) return String(event.playerName).trim();
  const text = eventText(event);
  const goalMatch = text.match(/⚽\s*(?:\d{1,3}(?:\s*\+\s*\d{1,2})?\s*[–-]\s*)?(.+?)(?:\s*\([^)]*\))?$/u);
  if (goalMatch?.[1]) return goalMatch[1].trim();
  const cardMatch = text.match(/[🟨🟥]\s*(?:\d{1,3}(?:\s*\+\s*\d{1,2})?\s*[–-]\s*)?(.+?)(?:\s*\([^)]*\))?$/u);
  return cardMatch?.[1]?.trim() || "Ukjent spiller";
}

function cardIcon(event) {
  if (event?.cardType === "red") return "🟥";
  if (event?.cardType === "yellow") return "🟨";
  const text = eventText(event);
  return text.includes("🟥") ? "🟥" : "🟨";
}

function teamNameForEvent(event, ourTeam, opponent) {
  if (event?.team === "away") return opponent;
  if (event?.team === "home") return ourTeam;
  return "";
}

function buildShareText(match) {
  const meta = match?.meta || {};
  const ourTeam = meta.ourTeam?.trim() || "Samnanger";
  const opponent = meta.opponent?.trim() || "Motstander";
  const ourScore = Number.isFinite(match?.score?.our) ? match.score.our : "–";
  const theirScore = Number.isFinite(match?.score?.their) ? match.score.their : "–";
  const isAway = meta.venue === "away" || meta.venueType === "away";

  const homeTeam = isAway ? opponent : ourTeam;
  const awayTeam = isAway ? ourTeam : opponent;
  const homeScore = isAway ? theirScore : ourScore;
  const awayScore = isAway ? ourScore : theirScore;

  const lines = [
    "Kampresultat",
    `${homeTeam} – ${awayTeam} ${homeScore}–${awayScore}`
  ];

  const date = formatDate(meta.date);
  if (date) lines.push(date);

  const events = Array.isArray(match?.events) ? [...match.events] : [];
  events.sort((a, b) => minuteNumber(a) - minuteNumber(b));

  const goals = events.filter(isGoal);
  const cards = events.filter(isCard);

  if (goals.length) {
    lines.push("", "Mål:");
    for (const event of goals) {
      const minute = minuteLabel(event);
      const team = teamNameForEvent(event, ourTeam, opponent);
      lines.push(`${minute ? `${minute} ` : ""}${playerName(event)}${team ? ` (${team})` : ""}`);
    }
  }

  if (cards.length) {
    lines.push("", "Kort:");
    for (const event of cards) {
      const minute = minuteLabel(event);
      const team = teamNameForEvent(event, ourTeam, opponent);
      lines.push(`${cardIcon(event)} ${minute ? `${minute} ` : ""}${playerName(event)}${team ? ` (${team})` : ""}`);
    }
  }

  if (!goals.length && !cards.length) {
    lines.push("", "Ingen mål eller kort registrert.");
  }

  return lines.join("\n");
}

async function shareFilteredResult(button) {
  const matchId = button.dataset.shareMatch;
  if (!matchId) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Henter …";

  try {
    const snap = await getDoc(doc(db, "matches", matchId));
    if (!snap.exists()) throw new Error("Kampen finnes ikke.");

    const text = buildShareText({ id: snap.id, ...snap.data() });
    if (navigator.share) {
      await navigator.share({ title: "Kampresultat", text });
      button.textContent = "✓ Delt";
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      button.textContent = "✓ Kopiert";
    } else {
      throw new Error("Deling støttes ikke i denne nettleseren.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("Kunne ikke dele kampresultatet:", error);
      button.textContent = "Kunne ikke dele";
    }
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1600);
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest?.("[data-share-match]");
  if (!button) return;

  // Kjør denne delingen før den eldre handleren i kampoversikt.js.
  event.preventDefault();
  event.stopImmediatePropagation();
  shareFilteredResult(button);
}, true);
