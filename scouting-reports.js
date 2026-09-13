const container = document.getElementById("trackedMatchReports");
const meta = document.getElementById("trackedReportsMeta");
const refreshButton = document.getElementById("refreshTrackedReports");
const opponentTitle = document.getElementById("opponentTitle");
const opponentSelect = document.getElementById("opponentSelect");
const reportsHeading = document.getElementById("trackedReportsHeading");
const overviewMeta = document.getElementById("scoutingOverviewMeta");
const statsContainer = document.getElementById("scoutingStats");
const opponentGrid = document.getElementById("scoutingOpponentGrid");
const refreshOverviewButton = document.getElementById("refreshScoutingOverview");

let reportData = null;

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("no")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function formatDate(date, time) {
  if (!date) return "Dato ikke satt";
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date}${time ? ` ${time}` : ""}`;
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: time ? "2-digit" : undefined,
    minute: time ? "2-digit" : undefined
  }).format(parsed);
}

function matchKickoff(match) {
  if (!match?.date) return null;
  const parsed = new Date(`${match.date}T${match.time || "00:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function effectiveStatus(match) {
  if (match?.status === "complete") return "complete";
  if (match?.status === "waiting") return "waiting";
  if (match?.status === "upcoming") {
    const kickoff = matchKickoff(match);
    if (kickoff && kickoff.getTime() + 2 * 60 * 60 * 1000 < Date.now()) return "waiting";
    return "upcoming";
  }
  return match?.status || "empty";
}

function statusText(status) {
  return ({
    upcoming: "Planlagt",
    waiting: "Mangler hentet rapport",
    complete: "Rapport klar",
    empty: "Ingen rapporter"
  })[status] || "Ukjent status";
}

function profileMatchesName(profile, name) {
  const target = normalize(name);
  if (!target) return false;
  const aliases = [profile?.opponent, ...(profile?.aliases || [])].map(normalize);
  return aliases.some(alias => alias && (target === alias || target.includes(alias) || alias.includes(target)));
}

function profileForCurrentOpponent() {
  if (!Array.isArray(reportData?.profiles)) return null;
  const selectName = opponentSelect?.selectedOptions?.[0]?.textContent || "";
  const title = opponentTitle?.textContent || "";
  return reportData.profiles.find(profile => profileMatchesName(profile, selectName))
    || reportData.profiles.find(profile => profileMatchesName(profile, title))
    || null;
}

function allMatches() {
  return (reportData?.profiles || []).flatMap(profile =>
    (profile.matches || []).map(match => ({ ...match, profileOpponent: profile.opponent }))
  );
}

function playerName(entry) {
  return typeof entry === "string" ? entry : entry?.name || "";
}

function renderSquad(match) {
  if (!Array.isArray(match.squad) || !match.squad.length) {
    return `<div class="report-empty">Startoppstilling/tropp er ikke hentet fra den direkte NFF-kamprapporten ennå.</div>`;
  }

  const starters = match.squad.filter(player => typeof player === "object" && player.role === "starter");
  const bench = match.squad.filter(player => typeof player !== "object" || player.role !== "starter");
  const block = (title, players) => players.length ? `
    <div class="report-subblock">
      <strong>${escapeHtml(title)}</strong>
      <div class="report-player-chips">${players.map(player => {
        const name = playerName(player);
        const extra = typeof player === "object" && player.note ? ` <small>${escapeHtml(player.note)}</small>` : "";
        return `<span>${escapeHtml(name)}${extra}</span>`;
      }).join("")}</div>
    </div>` : "";

  return `${block("Startere", starters)}${block(starters.length ? "Innbyttere / øvrig tropp" : "Spillere", bench)}`;
}

function renderGoals(match) {
  if (!Array.isArray(match.goals) || !match.goals.length) {
    return `<div class="report-empty">Målhendelser er ikke hentet/verifisert fra den direkte NFF-kamprapporten ennå.</div>`;
  }

  return `<ul class="report-list">${match.goals.map(goal => {
    if (typeof goal === "string") return `<li>${escapeHtml(goal)}</li>`;
    const minute = goal.minute ? `${escapeHtml(goal.minute)}' · ` : "";
    const team = goal.team ? ` <small>(${escapeHtml(goal.team)})</small>` : "";
    return `<li>${minute}${escapeHtml(goal.player || "Ukjent målscorer")}${team}</li>`;
  }).join("")}</ul>`;
}

function renderHigherTeamPlayers(match) {
  if (!Array.isArray(match.higherTeamPlayers) || !match.higherTeamPlayers.length) {
    return `<div class="report-empty">Ingen dokumenterte krysskoblinger mot høyere lag registrert ennå.</div>`;
  }

  return `<ul class="report-list">${match.higherTeamPlayers.map(player => {
    if (typeof player === "string") return `<li>${escapeHtml(player)}</li>`;
    return `<li><strong>${escapeHtml(player.name || "")}</strong>${player.note ? ` – ${escapeHtml(player.note)}` : ""}</li>`;
  }).join("")}</ul>`;
}

function renderTakeaways(match) {
  if (!Array.isArray(match.takeaways) || !match.takeaways.length) {
    return `<div class="report-empty">Taktiske læringspunkter fylles når kampen er analysert.</div>`;
  }

  return `<ul class="report-list report-takeaways">${match.takeaways.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderSources(match) {
  const urls = (match.sourceUrls || []).map(safeUrl).filter(Boolean);
  if (!urls.length) return "";
  return `<div class="report-sources">${urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Offentlig kilde${urls.length > 1 ? ` ${index + 1}` : ""}</a>`).join(" · ")}</div>`;
}

function latestMatchForProfile(profile) {
  return [...(profile.matches || [])].sort((a, b) => `${b.date || ""}${b.time || ""}`.localeCompare(`${a.date || ""}${a.time || ""}`))[0] || null;
}

function profileStatus(profile) {
  const matches = profile.matches || [];
  if (!matches.length) return "empty";
  if (matches.some(match => effectiveStatus(match) === "waiting")) return "waiting";
  if (matches.some(match => effectiveStatus(match) === "upcoming")) return "upcoming";
  if (matches.some(match => effectiveStatus(match) === "complete")) return "complete";
  return "empty";
}

function switchOpponent(name) {
  if (!opponentSelect) return;
  const options = [...opponentSelect.options];
  const option = options.find(item => normalize(item.textContent) === normalize(name))
    || options.find(item => normalize(item.textContent).includes(normalize(name)) || normalize(name).includes(normalize(item.textContent)));
  if (!option) return;
  opponentSelect.value = option.value;
  opponentSelect.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("trackedReportsCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderOverview() {
  if (!opponentGrid || !statsContainer) return;
  const profiles = [...(reportData?.profiles || [])].sort((a, b) => String(a.opponent || "").localeCompare(String(b.opponent || ""), "nb"));
  const matches = allMatches();
  const complete = matches.filter(match => effectiveStatus(match) === "complete").length;
  const waiting = matches.filter(match => effectiveStatus(match) === "waiting").length;
  const upcoming = matches.filter(match => effectiveStatus(match) === "upcoming").length;

  statsContainer.innerHTML = [
    [profiles.length, "Motstandere med data"],
    [complete, "Rapporter klare"],
    [waiting, "Mangler innhenting"],
    [upcoming, "Planlagte kamper"]
  ].map(([value, label]) => `<div class="scouting-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("");

  const updated = reportData?.updatedAt ? new Date(reportData.updatedAt) : null;
  if (overviewMeta) {
    overviewMeta.textContent = updated && !Number.isNaN(updated.getTime())
      ? `Sist oppdatert ${new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(updated)} · offentlig NFF/Fotball.no-data`
      : "Automatisk scouting er klar, men ingen oppdateringstid er registrert ennå.";
  }

  if (!profiles.length) {
    opponentGrid.innerHTML = `<div class="empty">Ingen automatiske scoutingprofiler er registrert ennå.</div>`;
    return;
  }

  const current = profileForCurrentOpponent();
  opponentGrid.innerHTML = profiles.map(profile => {
    const matches = profile.matches || [];
    const ready = matches.filter(match => effectiveStatus(match) === "complete").length;
    const waiting = matches.filter(match => effectiveStatus(match) === "waiting").length;
    const upcoming = matches.filter(match => effectiveStatus(match) === "upcoming").length;
    const status = profileStatus(profile);
    const latest = latestMatchForProfile(profile);
    let detail = "Ingen kamprapporter hentet ennå";
    if (matches.length) {
      const bits = [];
      if (ready) bits.push(`${ready} klar${ready === 1 ? "" : "e"}`);
      if (waiting) bits.push(`${waiting} mangler innhenting`);
      if (upcoming) bits.push(`${upcoming} planlagt${upcoming === 1 ? "" : "e"}`);
      detail = bits.join(" · ") || `${matches.length} registrerte kamper`;
    }
    return `
      <button class="scouting-opponent-card ${current?.key === profile.key ? "active" : ""}" type="button" data-opponent="${escapeHtml(profile.opponent || "")}">
        <span class="scouting-opponent-main">
          <strong>${escapeHtml(profile.opponent || "Ukjent motstander")}</strong>
          <small>${escapeHtml(detail)}${latest?.score ? ` · siste resultat ${escapeHtml(latest.score)}` : ""}</small>
        </span>
        <span class="scouting-opponent-status">
          <b><span class="scouting-status-dot ${escapeHtml(status === "empty" ? "upcoming" : status)}"></span>${escapeHtml(statusText(status))}</b>
          <small>${matches.length} kamp${matches.length === 1 ? "" : "er"}</small>
        </span>
      </button>`;
  }).join("");

  opponentGrid.querySelectorAll("[data-opponent]").forEach(button => {
    button.addEventListener("click", () => switchOpponent(button.dataset.opponent || ""));
  });
}

function render() {
  renderOverview();
  if (!container) return;
  const profile = profileForCurrentOpponent();

  if (reportsHeading) {
    reportsHeading.textContent = profile?.opponent ? `Kamper for ${profile.opponent}` : "Kamper for valgt motstander";
  }

  if (!profile) {
    container.innerHTML = `<div class="empty">Det finnes ingen automatisk kamprapport for denne motstanderen ennå. Scoutingvakten skal hente inn kampene fra avdelingen.</div>`;
    if (meta) meta.textContent = reportData?.updatedAt ? "Ingen rapporter for valgt lag ennå." : "";
    return;
  }

  const matches = [...(profile.matches || [])].sort((a, b) => `${b.date || ""}${b.time || ""}`.localeCompare(`${a.date || ""}${a.time || ""}`));
  if (meta) {
    const ready = matches.filter(match => effectiveStatus(match) === "complete").length;
    const waiting = matches.filter(match => effectiveStatus(match) === "waiting").length;
    const upcoming = matches.filter(match => effectiveStatus(match) === "upcoming").length;
    meta.textContent = `${ready} klare · ${waiting} mangler innhenting · ${upcoming} planlagte`;
  }

  if (!matches.length) {
    container.innerHTML = `<div class="empty">Ingen kamper er hentet for dette laget ennå. Dette betyr ikke at laget ikke har spilt; automatisk innhenting skal fylle historikken.</div>`;
    return;
  }

  container.innerHTML = matches.map(match => {
    const status = effectiveStatus(match);
    return `
    <article class="tracked-report ${escapeHtml(status === "empty" ? "upcoming" : status)}">
      <div class="report-head">
        <div>
          <div class="report-date">${escapeHtml(formatDate(match.date, match.time))} · ${escapeHtml(match.teamScope || "")}</div>
          <h3>${escapeHtml(match.home || "")} – ${escapeHtml(match.away || "")}</h3>
          <div class="report-competition">${escapeHtml(match.competition || "")}${match.venue ? ` · ${escapeHtml(match.venue)}` : ""}</div>
        </div>
        <div class="report-status-wrap">
          ${match.score ? `<strong class="report-score">${escapeHtml(match.score)}</strong>` : ""}
          <span class="report-status">${escapeHtml(statusText(status))}</span>
        </div>
      </div>

      <p class="report-purpose">${escapeHtml(match.purpose || "")}</p>
      ${match.summary ? `<div class="report-summary">${escapeHtml(match.summary)}</div>` : ""}

      <details ${status === "complete" ? "open" : ""}>
        <summary>Spillere og kampdetaljer</summary>
        <div class="report-grid">
          <section><h4>Tropp / oppstilling</h4>${renderSquad(match)}</section>
          <section><h4>Mål</h4>${renderGoals(match)}</section>
          <section><h4>Spillere brukt høyere</h4>${renderHigherTeamPlayers(match)}</section>
          <section><h4>Hva betyr det for oss?</h4>${renderTakeaways(match)}</section>
        </div>
      </details>
      ${renderSources(match)}
    </article>`;
  }).join("");
}

async function loadReports() {
  if (!container) return;
  if (refreshButton) refreshButton.disabled = true;
  if (refreshOverviewButton) refreshOverviewButton.disabled = true;
  container.innerHTML = `<div class="empty">Henter kamprapporter …</div>`;

  try {
    const response = await fetch(`./scouting-reports.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    reportData = await response.json();
    render();
  } catch (error) {
    console.warn("Kunne ikke hente scouting-rapporter", error);
    container.innerHTML = `<div class="roster-alert"><strong>Kunne ikke hente rapportene.</strong><br>Prøv Oppdater på nytt.</div>`;
    if (opponentGrid) opponentGrid.innerHTML = `<div class="roster-alert"><strong>Kunne ikke hente scoutingstatus.</strong></div>`;
  } finally {
    if (refreshButton) refreshButton.disabled = false;
    if (refreshOverviewButton) refreshOverviewButton.disabled = false;
  }
}

refreshButton?.addEventListener("click", loadReports);
refreshOverviewButton?.addEventListener("click", loadReports);
opponentSelect?.addEventListener("change", () => setTimeout(render, 0));

if (opponentTitle) {
  new MutationObserver(render).observe(opponentTitle, { childList: true, subtree: true, characterData: true });
}

loadReports();