const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { OpenAI } = require("openai");

admin.initializeApp();
const db = admin.firestore();
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const GUARDIAN_EMAIL_FROM = "Samnanger G14 <spillerportal@vibliz.com>";

const MATCH_REMINDER_STATUSES = [
  "NOT_STARTED",
  "UPCOMING",
  "LIVE",
  "HALFTIME",
  "PAUSED"
];

function matchReminderTimestampMs(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value?._seconds)) {
    return value._seconds * 1000 + Math.floor((Number(value._nanoseconds) || 0) / 1000000);
  }
  if (Number.isFinite(value?.seconds)) {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1000000);
  }
  return null;
}

function osloDateTimeMs(dateValue, timeValue) {
  const dateMatch = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || "").match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);

  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    timeZoneName: "shortOffset"
  }).formatToParts(new Date(utcGuess)).find(part => part.type === "timeZoneName");
  const offsetMatch = String(offsetPart?.value || "GMT").match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offsetMatch) return utcGuess;

  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const offsetMinutes = sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0));
  return utcGuess - offsetMinutes * 60 * 1000;
}

function getMatchReminderElapsedMs(match, nowMs) {
  const elapsedMs = Math.max(0, Number(match.timer?.elapsedMs) || 0);
  if (match.status !== "LIVE") return elapsedMs;

  const startedAtMs = matchReminderTimestampMs(match.timer?.startTimestamp);
  if (!Number.isFinite(startedAtMs)) return elapsedMs;
  return elapsedMs + Math.max(0, nowMs - startedAtMs);
}

function buildDueMatchReminder(match, matchId, nowMs) {
  const status = String(match.status || "");
  const period = Number(match.period) === 2 ? 2 : 1;
  const halfLengthMin = Math.max(1, Number(match.meta?.halfLengthMin) || 35);
  const halfLengthMs = halfLengthMin * 60 * 1000;
  const homeTeam = match.meta?.ourTeam || "Samnanger";
  const opponent = match.meta?.opponent || "Motstander";
  const score = `${Number(match.score?.our) || 0}–${Number(match.score?.their) || 0}`;
  const relativeUrl = `./kamp.html?matchId=${encodeURIComponent(matchId)}&from=notification`;

  if (["NOT_STARTED", "UPCOMING"].includes(status)) {
    const scheduledStartMs = osloDateTimeMs(
      match.meta?.date,
      match.meta?.startTime || match.meta?.time
    );
    const overdueMs = Number.isFinite(scheduledStartMs) ? nowMs - scheduledStartMs : -1;

    // Gamle, ustartede testkamper skal ikke gi nye varsler i ettertid.
    if (overdueMs >= 0 && overdueMs <= 30 * 60 * 1000) {
      return {
        key: "matchStart",
        title: "⚽ Klar for avspark?",
        body: `${homeTeam} – ${opponent} skulle ha startet. Trykk for å åpne kampklokken.`,
        url: relativeUrl
      };
    }
  }

  if (status === "LIVE") {
    const elapsedMs = getMatchReminderElapsedMs(match, nowMs);

    if (period === 1 && elapsedMs >= halfLengthMs) {
      return {
        key: "firstHalfEnd",
        title: "⏰ 1. omgang er over",
        body: `${halfLengthMin}:00  •  ${homeTeam} ${score} ${opponent}\nTrykk for å starte pausen.`,
        url: relativeUrl
      };
    }

    if (period === 2 && elapsedMs >= halfLengthMs * 2) {
      return {
        key: "matchEnd",
        title: "🏁 Ordinær tid er ute",
        body: `${halfLengthMin * 2}:00  •  ${homeTeam} ${score} ${opponent}\nTrykk for å avslutte kampen.`,
        url: relativeUrl
      };
    }
  }

  if (["HALFTIME", "PAUSED"].includes(status)) {
    const halftimeStartedAtMs = matchReminderTimestampMs(match.halftimeStartedAt);
    if (
      Number.isFinite(halftimeStartedAtMs) &&
      nowMs - halftimeStartedAtMs >= 10 * 60 * 1000
    ) {
      return {
        key: "secondHalfStart",
        title: "▶️ Klar for 2. omgang?",
        body: `${homeTeam} ${score} ${opponent}\nPausen har vart i 10 minutter.`,
        url: relativeUrl
      };
    }
  }

  return null;
}

function getNextMatchReminderDelayMs(match, nowMs) {
  const status = String(match.status || "");
  const period = Number(match.period) === 2 ? 2 : 1;
  const halfLengthMin = Math.max(1, Number(match.meta?.halfLengthMin) || 35);
  const halfLengthMs = halfLengthMin * 60 * 1000;

  if (["NOT_STARTED", "UPCOMING"].includes(status)) {
    const scheduledStartMs = osloDateTimeMs(
      match.meta?.date,
      match.meta?.startTime || match.meta?.time
    );
    if (!Number.isFinite(scheduledStartMs)) return null;

    const differenceMs = scheduledStartMs - nowMs;
    if (differenceMs < -30 * 60 * 1000) return null;
    return Math.max(0, differenceMs);
  }

  if (status === "LIVE") {
    const elapsedMs = getMatchReminderElapsedMs(match, nowMs);
    const targetMs = period === 1 ? halfLengthMs : halfLengthMs * 2;
    return Math.max(0, targetMs - elapsedMs);
  }

  if (["HALFTIME", "PAUSED"].includes(status)) {
    const halftimeStartedAtMs = matchReminderTimestampMs(match.halftimeStartedAt);
    if (!Number.isFinite(halftimeStartedAtMs)) return null;
    return Math.max(0, halftimeStartedAtMs + 10 * 60 * 1000 - nowMs);
  }

  return null;
}

async function getMatchReminderTokens(ownerUid) {
  const tokenValues = [];
  const addTokens = data => {
    if (!data || data.matchRemindersEnabled === false) return;
    if (typeof data.token === "string") tokenValues.push(data.token);
    if (Array.isArray(data.tokens)) tokenValues.push(...data.tokens);
  };

  if (ownerUid) {
    const tokenDoc = await db.collection("adminTokens").doc(ownerUid).get();
    if (tokenDoc.exists) addTokens(tokenDoc.data());
  } else {
    const tokensSnapshot = await db.collection("adminTokens").get();
    tokensSnapshot.forEach(docSnapshot => addTokens(docSnapshot.data()));
  }

  return [...new Set(tokenValues.filter(token => typeof token === "string" && token.length > 20))]
    .slice(0, 500);
}

function buildMatchPushMessage(tokens, reminder) {
  return {
    tokens,
    data: {
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
      matchId: reminder.matchId || "match",
      reminderKey: reminder.key
    },
    // Et eksplisitt Web Push-varsel gjør leveringen mer robust på iPhone når
    // hjemskjermappen er lukket og skjermen er låst. Service workeren bruker
    // de samme datafeltene for ikon, klikk og riktig kamplenke.
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "300"
      },
      notification: {
        title: reminder.title,
        body: reminder.body,
        tag: `samnanger-${reminder.matchId || "match"}-${reminder.key}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [280, 120, 280, 120, 520]
      }
    }
  };
}

exports.testMatchPushNotification = onCall({
  region: "europe-west1",
  timeoutSeconds: 30
}, async request => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Du må være logget inn.");
  }

  const token = String(request.data?.token || "");
  const delaySeconds = Math.min(15, Math.max(3, Number(request.data?.delaySeconds) || 8));
  if (token.length < 20) {
    throw new HttpsError("invalid-argument", "Varslingstoken mangler.");
  }

  const tokenSnapshot = await db.collection("adminTokens").doc(request.auth.uid).get();
  const tokenData = tokenSnapshot.data() || {};
  const registeredTokens = new Set([
    tokenData.token,
    ...(Array.isArray(tokenData.tokens) ? tokenData.tokens : [])
  ].filter(Boolean));

  if (!tokenSnapshot.exists || !registeredTokens.has(token)) {
    throw new HttpsError("permission-denied", "Denne enheten er ikke registrert for kampvarsler.");
  }

  await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

  const response = await admin.messaging().sendEachForMulticast(
    buildMatchPushMessage([token], {
      key: "deviceTest",
      title: "🔔 Kampvarsler virker",
      body: "iPhone er koblet til. Du får beskjed ved pause og kampslutt.",
      url: "./dagens-kamp.html?from=notification-test",
      matchId: "device-test"
    })
  );

  if (response.successCount === 0) {
    const message = response.responses[0]?.error?.message || "Firebase avviste testvarslet.";
    throw new HttpsError("failed-precondition", message);
  }

  console.log(`Testvarsel sendt til enheten for ${request.auth.uid}.`);
  return {
    successCount: response.successCount,
    failureCount: response.failureCount
  };
});

async function claimMatchReminder(matchRef, reminderKey, nowMs) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(matchRef);
    if (!snapshot.exists) return false;

    const freshMatch = snapshot.data();
    const stillDue = buildDueMatchReminder(freshMatch, snapshot.id, nowMs);
    if (!stillDue || stillDue.key !== reminderKey) return false;

    const existing = freshMatch.pushReminders?.[reminderKey] || {};
    if (existing.sentAt) return false;

    const claimedAtMs = matchReminderTimestampMs(existing.claimedAt);
    if (Number.isFinite(claimedAtMs) && nowMs - claimedAtMs < 2 * 60 * 1000) {
      return false;
    }

    transaction.update(matchRef, {
      [`pushReminders.${reminderKey}.claimedAt`]: admin.firestore.Timestamp.fromMillis(nowMs)
    });
    return true;
  });
}

async function processMatchClockReminder(matchSnapshot, schedulerStartedAtMs) {
  const initialDelayMs = getNextMatchReminderDelayMs(
    matchSnapshot.data(),
    schedulerStartedAtMs
  );

  // Cloud Scheduler starter hvert minutt. Når grensen er mindre enn ett
  // minutt unna, holder funksjonen seg våken de siste sekundene for et mer
  // presist varsel.
  if (!Number.isFinite(initialDelayMs) || initialDelayMs > 65 * 1000) return;
  if (initialDelayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, initialDelayMs + 500));
  }

  const nowMs = Date.now();
  const freshSnapshot = await matchSnapshot.ref.get();
  if (!freshSnapshot.exists) return;

  const match = freshSnapshot.data();
  const reminder = buildDueMatchReminder(match, freshSnapshot.id, nowMs);
  if (!reminder) return;

  const tokens = await getMatchReminderTokens(match.ownerUid);
  if (tokens.length === 0) return;

  const claimed = await claimMatchReminder(freshSnapshot.ref, reminder.key, nowMs);
  if (!claimed) return;

  try {
    const response = await admin.messaging().sendEachForMulticast(
      buildMatchPushMessage(tokens, {
        ...reminder,
        matchId: freshSnapshot.id
      })
    );

    if (response.successCount === 0) {
      throw new Error("Ingen registrerte enheter tok imot kampvarslet.");
    }

    await freshSnapshot.ref.update({
      [`pushReminders.${reminder.key}.sentAt`]: admin.firestore.FieldValue.serverTimestamp(),
      [`pushReminders.${reminder.key}.successCount`]: response.successCount,
      [`pushReminders.${reminder.key}.failureCount`]: response.failureCount
    });

    console.log(
      `Kampvarsel ${reminder.key} sendt for ${freshSnapshot.id} til ${response.successCount} enhet(er).`
    );
  } catch (error) {
    await freshSnapshot.ref.update({
      [`pushReminders.${reminder.key}.claimedAt`]: admin.firestore.FieldValue.delete()
    }).catch(() => {});
    console.error(`Kunne ikke sende kampvarsel for ${freshSnapshot.id}:`, error);
  }
}

/* =====================================================
   KAMPVARSLER TIL LÅSESKJERM
===================================================== */

exports.sendMatchClockReminders = onSchedule({
  schedule: "* * * * *",
  timeZone: "Europe/Oslo",
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 1,
  timeoutSeconds: 120
}, async () => {
  const nowMs = Date.now();
  const matchesSnapshot = await db.collection("matches")
    .where("status", "in", MATCH_REMINDER_STATUSES)
    .get();

  await Promise.all(
    matchesSnapshot.docs.map(matchSnapshot =>
      processMatchClockReminder(matchSnapshot, nowMs)
    )
  );
});

function parseEnergy(value) {

  if (typeof value === "number") return value;

  if (value === "Lav") return 1;
  if (value === "Middels") return 3;
  if (value === "Høy") return 5;

  return Number(value) || 0;

}

setGlobalOptions({
  secrets: ["OPENAI_API_KEY"],
});

/* =====================================================
   AI ANALYSE (TIL TRENER)
===================================================== */

exports.resetPlayerPassword = onCall(async (request) => {
  try {
    const context = request.auth;
    const { uid } = request.data;

    if (!context) throw new Error("Må være innlogget.");
    if (!uid) throw new Error("UID mangler.");

    // 🔐 Sjekk at det er trener
 //   const userDoc = await db.collection("users").doc(context.uid).get();

 //   if (!userDoc.exists || userDoc.data().role !== "coach") {
  //    throw new Error("Kun trener kan resette passord.");
  //  }

    // 🔑 Generer midlertidig passord
    const tempPassword = Math.random().toString(36).slice(-8);

    // 🔐 Oppdater i Firebase Auth
    await admin.auth().updateUser(uid, {
      password: tempPassword
    });

    // 🧠 Flagg at spiller må endre passord
    await db.collection("users").doc(uid).update({
      mustChangePassword: true,
      passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordResetBy: context.uid
    });

    return {
      tempPassword
    };

  } catch (error) {
    console.error(error);
    throw new Error(error.message || "Kunne ikke resette passord.");
  }
});

exports.onPasswordRequest = onDocumentWritten(
  "passwordRequests/{docId}",
  async (event) => {

    // 🔥 Kun kjør hvis dokument finnes (ikke delete)
    if (!event.data.after.exists) return;

    const data = event.data.after.data();
    const username = data.username;

    // 🔹 Finn navn fra users
    let name = username;

    const usersSnap = await db.collection("users").get();

    usersSnap.forEach(doc => {
      const u = doc.data();
      if (u.username === username) {
        name = u.name;
      }
    });

    // 🔹 Hent admin tokens
    const tokensSnap = await db.collection("adminTokens").get();
    const tokens = tokensSnap.docs.map(doc => doc.data().token);

    if (tokens.length === 0) {
      console.log("Ingen admin tokens.");
      return;
    }

    // 🔔 Send push
    await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        title: "Glemt passord",
        body: `${name} ber om nytt passord`
      }
    });

    console.log("Push sendt: password request");
  }
);

exports.generatePlayerAnalysis = onCall(async (request) => {
  try {
    const context = request.auth;
    if (!context) throw new Error("Må være innlogget.");

    const { playerId, week } = request.data;
    if (!playerId) throw new Error("playerId mangler.");

    const snap = await db
      .collection("refleksjoner")
      .doc(playerId)
      .collection("entries")
      .get();

    if (snap.empty) {
      throw new Error("Ingen refleksjoner funnet.");
    }

    let entries = snap.docs.map(d => d.data());

    // sorter
    entries.sort((a, b) => (a.year - b.year) || (a.week - b.week));

    // filtrer uke hvis valgt
    if (week && week !== "all") {
      entries = entries.filter(e => String(e.week) === String(week));
    }

    if (entries.length === 0) {
      throw new Error("Ingen refleksjoner for valgt periode.");
    }

    // ========= BEREGNING =========

    const avgEffort =
      entries.reduce((sum, e) => sum + (Number(e.effort) || 0), 0) /
      entries.length;

    const avgEnergy =
      entries.reduce((sum, e) => sum + parseEnergy(e.energy), 0) /
      entries.length;

    const last = entries[entries.length - 1];

    const lastEffort = Number(last.effort) || 0;
    const lastEnergy = parseEnergy(last.energy);

    const first = entries[0];

    // trend
    let trend = "stabil";

    if (lastEffort > first.effort || lastEnergy > parseEnergy(first.energy)) {
      trend = "økende";
    } else if (lastEffort < first.effort || lastEnergy < parseEnergy(first.energy)) {
      trend = "fallende";
    }

    // ========= RISIKO =========

    let riskFlags = [];

    const lowEnergy = lastEnergy <= 2;
    const lowEffort = lastEffort <= 2;

    if (entries.length >= 2) {
      const lastTwo = entries.slice(-2);

      const bothLowEnergy =
        parseEnergy(lastTwo[0].energy) <= 2 &&
        parseEnergy(lastTwo[1].energy) <= 2;

      if (bothLowEnergy) {
        riskFlags.push("Vedvarende lav energi");
      }
    }

    if (lowEnergy) riskFlags.push("Lav energi i siste refleksjon");
    if (lowEffort) riskFlags.push("Lav innsats i siste refleksjon");

    // ========= KALIBRERING =========

    const entriesWithCoach = entries.filter(
      e => e.coachEffort !== undefined && e.coachEnergy !== undefined
    );

    let calibrationAnalysis = "Ingen trener-score registrert.";

    if (entriesWithCoach.length > 0) {
      const avgEffortDelta =
        entriesWithCoach.reduce(
          (sum, e) => sum + (Number(e.coachEffort) - Number(e.effort)),
          0
        ) / entriesWithCoach.length;

      const avgEnergyDelta =
        entriesWithCoach.reduce(
          (sum, e) => sum + (Number(e.coachEnergy) - parseEnergy(e.energy)),
          0
        ) / entriesWithCoach.length;

      if (avgEffortDelta > 0.5 || avgEnergyDelta > 0.5) {
        calibrationAnalysis = "Spilleren undervurderer seg selv.";
      } else if (avgEffortDelta < -0.5 || avgEnergyDelta < -0.5) {
        calibrationAnalysis = "Spilleren overvurderer seg selv.";
      } else {
        calibrationAnalysis = "God kalibrering mellom spiller og trener.";
      }
    }

    // ========= AI =========

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
Du analyserer utviklingen til en ungdomsspiller.

Data:
- Snitt innsats: ${avgEffort.toFixed(2)}
- Snitt energi: ${avgEnergy.toFixed(2)}
- Trend: ${trend}
- Siste innsats: ${lastEffort}
- Siste energi: ${lastEnergy}

Skriv:
1. Kort oppsummering
2. Utviklingstrend
3. Mental profil
4. Coaching-fokus

Kort og konkret.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du er en fotballtrener." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5
    });

    const text = response.choices?.[0]?.message?.content || "";

    // enkel parsing (du brukte samme før)
    const summary = text;
    
    // ========= LAGRE =========

    const analysisKey = week && week !== "all" ? week : "all";

    await db
      .collection("aiAnalysis")
      .doc(playerId)
      .collection("weeks")
      .doc(String(analysisKey))
      .set({
        summary,
        keyPatterns: {
          performanceTrend: trend,
          mentalProfile: "-"
        },
        calibrationAnalysis,
        riskFlags,
        coachingFocus: "-",
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    return { success: true };

  } catch (error) {
    console.error(error);
    throw new Error("Kunne ikke generere analyse.");
  }
});

/* =====================================================
   AI TILBAKEMELDING (TIL SPILLER)
===================================================== */
exports.generatePlayerFeedback = onCall(async (request) => {
  try {
    const context = request.auth;
    if (!context) throw new Error("Må være innlogget.");

    const { playerId, entryId, type } = request.data;

    if (!playerId) throw new Error("playerId mangler.");

const entryDoc = await db
  .collection("refleksjoner")
  .doc(playerId)
  .collection("entries")
  .doc(entryId)
  .get();

if (!entryDoc.exists) {
  throw new Error("Refleksjon ikke funnet.");
}

const r = entryDoc.data();

const week = r.week ?? null;
const year = r.year ?? null;

console.log("REFLECTION USED WEEK:", r.week);
console.log("GOOD:", r.goodThing, "IMPROVE:", r.improveThing);

const more = r.more || r.moreMatch || [];

const reflectionHistory = `
Type: ${r.type === "match" ? "Kamp" : "Trening"}

Innsats: ${r.effort}/5
Energi: ${parseEnergy(r.energy)}/5
Opplevelse: ${r.fun || "-"}/5

Fokus: ${more.length ? more.join(", ") : "Ingen valgt"}
`;

const playerDoc = await db.collection("users").doc(playerId).get();
const player = playerDoc.data() || {};

const playerInfo = `
Spiller: ${player.name || ""}
Posisjon: ${player.position || ""}
`;

const prompt = `
Du er ein fotballtrenar som gir ei kort og ekte tilbakemelding til ein 14-åring.

Du veit berre dette:
- Gøy: ${r.fun}/5
- Innsats: ${r.effort}/5
- Energi: ${parseEnergy(r.energy)}/5
- Fokus: ${more.length ? more.join(", ") : "ingen"}

Start med:
"Hei, ${player.name || "!"}"

Språk:
- Nynorsk
- Munnleg og naturleg

Lengde:
- 2–4 korte setningar

Viktig:
- Du har ikkje sett økta
- Du svarer berre på det spelaren har valt
- Ikkje kommenter alt slavisk – vel det viktigaste
- Varier språket og setningsstartar
- Ikkje bruk same formuleringar kvar gong
- Unngå faste mønster

Stil:
- Som ein ekte trenar
- Kan vere litt direkte, oppmuntrande eller utfordrande

Gi:
- Éin kort kommentar
- Éitt konkret tips

Unngå:
- Rapportstil
- Overforklaring
- Gjentakingar

Refleksjon:
${reflectionHistory}
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: "Du skriv alltid på nynorsk og gir korte, konkrete og motiverande tilbakemeldingar til ein 14 år gammal fotballspelar."
    },
    { role: "user", content: prompt }
  ],
  temperature: 0.7,
  presence_penalty: 0.2
});

    const feedbackText = response?.choices?.[0]?.message?.content || 
"Trener har foreløpig ikke generert tilbakemelding.";

const data = {
  playerId,
  type: type || "weekly",
  year
};

if (type === "weekly") {
  data.week = week;
}

const feedbackDoc = await db.collection("feedback").add({
  ...data,
  generatedText: feedbackText,
  editedText: feedbackText,
  status: "draft",
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

    return {
      feedbackId: feedbackDoc.id,
      feedback: feedbackText
    };

  } catch (error) {
    console.error(error);
    throw new Error("Kunne ikke generere tilbakemelding.");
  }
});



/* =====================================================
   PUSH VARSEL – NY REFLEKSJON
===================================================== */
exports.onNewReflection = onDocumentCreated(
  "refleksjoner/{playerId}/entries/{entryId}",
  async (event) => {

    const snap = event.data;
    if (!snap) return;

    const { playerId } = event.params;

    // 🔹 Hent spillernavn fra users
    const userDoc = await db.collection("users").doc(playerId).get();

    let name = "En spiller";
    if (userDoc.exists) {
      const userData = userDoc.data();
      name =
        userData.displayName ||
        userData.name ||
        userData.navn ||
        userData.email ||
        "En spiller";
    }

    // 🔹 Hent admin tokens
    const tokensSnap = await db.collection("adminTokens").get();
    const tokens = tokensSnap.docs.map(doc => doc.data().token);

    if (tokens.length === 0) {
      console.log("Ingen admin tokens funnet.");
      return;
    }

    await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        title: "Ny refleksjon",
        body: `${name} har sendt inn ukerefleksjon.`
      }
    });

    console.log("Push sendt: Ny refleksjon");
  }
);

/* =====================================================
   PUSH VARSEL – NY BRUKER
===================================================== */
exports.onNewUser = onDocumentCreated(
  "users/{userId}",
  async (event) => {

    const snap = event.data;
    if (!snap) return;

    const userData = snap.data();

    // Hent navn (tilpass felt etter hva du faktisk lagrer)
    const name =
      userData.displayName ||
      userData.name ||
      userData.navn ||
      userData.email ||
      "Ny spiller";

    // Hent alle admin tokens
    const tokensSnap = await db.collection("adminTokens").get();
    const tokens = tokensSnap.docs.map(doc => doc.data().token);

    if (tokens.length === 0) {
      console.log("Ingen admin tokens funnet.");
      return;
    }

    await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
  title: "Ny bruker registrert",
  body: `${name} har opprettet bruker.`
}
    });

    console.log("Push sendt: Ny bruker");
  }
);

exports.generateMonthlyFeedback = onCall(async (request) => {

  try {

    const context = request.auth;
    const { playerId, year, month } = request.data;

    if (!context) throw new Error("Må være innlogget.");
    if (!playerId) throw new Error("playerId mangler.");

    const userDoc = await db.collection("users").doc(context.uid).get();

    if (!userDoc.exists || userDoc.data().role !== "coach") {
      throw new Error("Kun trener kan generere tilbakemelding.");
    }

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const snapshot = await db
      .collection("refleksjoner")
      .doc(playerId)
      .collection("entries")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .orderBy("createdAt")
      .get();

    if (snapshot.empty) {
      throw new Error("Ingen refleksjoner denne måneden.");
    }

    const filteredReflections = snapshot.docs
  .map((doc) => doc.data())
  .sort((a, b) => (a.year - b.year) || (a.week - b.week));

    const reflectionHistory = filteredReflections.map((r, i) => `
Refleksjon ${i + 1}
Uke: ${r.week}
Type: ${r.type}
God ting: ${r.goodThing}
Forbedre: ${r.improveThing}
Innsats: ${r.effort}
Energi (1-5): ${parseEnergy(r.energy)}
`).join("\n");

    const prompt = `
Du er en ungdomstrener (G14).

Basert på refleksjonene under skal du skrive en
kort månedsoppsummering til spilleren.

Inkluder:
- Hva spilleren gjør bra
- Hva spilleren utvikler
- 2 konkrete fokusområder neste måned

Maks 150 ord.

Refleksjoner:
${reflectionHistory}
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du skriver konkrete trener-tilbakemeldinger." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5
    });

    const feedbackText = response.choices?.[0]?.message?.content || "";

    const feedbackDoc = await db.collection("feedback").add({

      playerId,
      type: "monthly",

      year,
      month,

      generatedText: feedbackText,
      editedText: feedbackText,

      status: "draft",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()

    });

    return {
      feedbackId: feedbackDoc.id,
      feedback: feedbackText
    };

  } catch (error) {

    console.error(error);
    throw new Error("Kunne ikke generere månedsfeedback.");

  }

});

exports.generateSeasonFeedback = onCall(async (request) => {

  try {

    const context = request.auth;
    const { playerId, year, season } = request.data;

    if (!context) throw new Error("Må være innlogget.");
    if (!playerId) throw new Error("playerId mangler.");

    const userDoc = await db.collection("users").doc(context.uid).get();

    if (!userDoc.exists || userDoc.data().role !== "coach") {
      throw new Error("Kun trener kan generere tilbakemelding.");
    }

    let start;
    let end;

    if (season === "spring") {

      start = new Date(year, 0, 1);
      end = new Date(year, 6, 1);

    } else {

      start = new Date(year, 6, 1);
      end = new Date(year + 1, 0, 1);

    }

    const snapshot = await db
      .collection("refleksjoner")
      .doc(playerId)
      .collection("entries")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .orderBy("createdAt")
      .get();

    if (snapshot.empty) {
      throw new Error("Ingen refleksjoner i denne sesongen.");
    }

    const filteredReflections = snapshot.docs.map(doc => doc.data());

    const reflectionHistory = filteredReflections.map((r, i) => `
Refleksjon ${i + 1}
Uke: ${r.week}
Type: ${r.type}
God ting: ${r.goodThing}
Forbedre: ${r.improveThing}
Innsats: ${r.effort}
Energi: ${r.energy}
`).join("\n");

    const prompt = `
Du er en fotballtrener som skriver en halvårsvurdering til en 14 år gammel spiller.

Basert på refleksjonene under:

- Oppsummer utviklingen
- Hva spilleren gjør bra
- Hva spilleren bør fokusere på neste halvår

Skriv maks 200 ord.

Refleksjoner:
${reflectionHistory}
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du skriver konkrete trener-tilbakemeldinger." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5
    });

    const feedbackText = response.choices?.[0]?.message?.content || "";

    const feedbackDoc = await db.collection("feedback").add({

      playerId,

      type: "season",

      season,
      year,

      generatedText: feedbackText,
      editedText: feedbackText,

      status: "draft",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()

    });

    return {
      feedbackId: feedbackDoc.id,
      feedback: feedbackText
    };

  } catch (error) {

    console.error(error);
    throw new Error("Kunne ikke generere sesongfeedback.");

  }

});


/* =====================================================
   FORESATTINVITASJONER
   Sikker flyt: godkjent spiller -> trener -> e-post -> låst e-post
===================================================== */

function normalizeInviteEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function requireCoach(uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Du må være logget inn.");
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists || snap.data().role !== "coach") {
    throw new HttpsError("permission-denied", "Kun trener kan godkjenne foresatte.");
  }
}

exports.approveGuardianInvite = onCall({
  region: "europe-west1",
  timeoutSeconds: 30,
  secrets: [RESEND_API_KEY]
}, async request => {
  await requireCoach(request.auth?.uid);
  const requestId = String(request.data?.requestId || "");
  if (!requestId) throw new HttpsError("invalid-argument", "Forespørsel mangler.");

  const ref = db.collection("guardianRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Forespørselen finnes ikke.");
  const data = snap.data();
  if (data.status !== "pending") {
    throw new HttpsError("failed-precondition", "Forespørselen er allerede behandlet.");
  }

  const token = require("crypto").randomBytes(32).toString("hex");
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await ref.update({
    status: "approved",
    inviteToken: token,
    inviteExpiresAt: expiresAt,
    inviteUsed: false,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: request.auth.uid
  });

  const inviteUrl = `https://coachfroden.github.io/spillerportal/?guardianInvite=${encodeURIComponent(token)}`;
  const email = normalizeInviteEmail(data.guardianEmail);
  const guardianName = data.guardianName || "Foresatt";
  const playerName = data.playerName || "spilleren";
  const apiKey = RESEND_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "E-posttjenesten er ikke konfigurert.");

  const safe = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `guardian-invite-${requestId}-${token.slice(0,12)}` },
    body: JSON.stringify({
      from: GUARDIAN_EMAIL_FROM,
      to: [email],
      subject: `Invitasjon som foresatt til ${playerName} – Samnanger G14`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><h2>Hei ${safe(guardianName)}</h2><p>${safe(playerName)} har lagt deg til som foresatt i Samnanger G14 sin spillerportal, og trener har godkjent koblingen.</p><p>Bruk knappen under for å opprette foresattkontoen. E-postadressen er låst til denne invitasjonen.</p><p style="margin:28px 0"><a href="${safe(inviteUrl)}" style="background:#0b5cff;color:white;text-decoration:none;padding:13px 20px;border-radius:8px;display:inline-block">Opprett foresattkonto</a></p><p>Lenken kan brukes én gang og utløper om 7 dager.</p><p style="font-size:13px;color:#667085">Hvis du ikke kjenner til dette, kan du ignorere e-posten.</p></div>`
    })
  });
  const emailResult = await emailResponse.json().catch(() => ({}));
  if (!emailResponse.ok) {
    console.error("Resend guardian invite failed", emailResponse.status, emailResult);
    await ref.update({ status:"pending", inviteToken:admin.firestore.FieldValue.delete(), inviteExpiresAt:admin.firestore.FieldValue.delete(), inviteUsed:admin.firestore.FieldValue.delete(), approvedAt:admin.firestore.FieldValue.delete(), approvedBy:admin.firestore.FieldValue.delete() });
    throw new HttpsError("internal", emailResult?.message || "Kunne ikke sende invitasjonen på e-post.");
  }
  await ref.update({ inviteEmailId:emailResult.id || null, inviteEmailSentAt:admin.firestore.FieldValue.serverTimestamp() });
  return { inviteUrl, email, guardianName, emailSent:true };
});




exports.sendPortalPasswordReset = onCall({
  region: "europe-west1",
  timeoutSeconds: 30,
  secrets: [RESEND_API_KEY]
}, async request => {
  const email = normalizeInviteEmail(request.data?.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Skriv inn en gyldig e-postadresse.");
  }

  // Keep the public response generic so this endpoint does not reveal
  // whether an e-mail address has an account.
  let resetUrl;
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    resetUrl = await admin.auth().generatePasswordResetLink(email, {
      url: "https://coachfroden.github.io/spillerportal/"
    });
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return { success: true };
    }
    console.error("Could not generate portal password reset link", error);
    throw new HttpsError("internal", "Kunne ikke lage lenke for nytt passord.");
  }

  const apiKey = RESEND_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "E-posttjenesten er ikke konfigurert.");

  const safe = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const displayName = user.displayName || "der";
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: GUARDIAN_EMAIL_FROM,
      to: [email],
      subject: "Lag nytt passord – Samnanger G14 Spillerportal",
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033">
        <h2>Hei ${safe(displayName)}</h2>
        <p>Vi har fått en forespørsel om å lage nytt passord til kontoen din i Samnanger G14 sin spillerportal.</p>
        <p style="margin:28px 0"><a href="${safe(resetUrl)}" style="background:#0b5cff;color:white;text-decoration:none;padding:13px 20px;border-radius:8px;display:inline-block">Lag nytt passord</a></p>
        <p>Hvis du ikke ba om nytt passord, kan du ignorere denne e-posten. Det gamle passordet virker fortsatt.</p>
        <p style="font-size:13px;color:#667085">Lenken er laget av Firebase Authentication og kan bare brukes til denne kontoen.</p>
      </div>`
    })
  });

  const emailResult = await emailResponse.json().catch(() => ({}));
  if (!emailResponse.ok) {
    console.error("Resend password reset failed", emailResponse.status, emailResult);
    throw new HttpsError("internal", "Kunne ikke sende e-post med nytt passord.");
  }

  return { success: true };
});


exports.createGuardianInvite = onCall({
  region: "europe-west1",
  timeoutSeconds: 30,
  secrets: [RESEND_API_KEY]
}, async request => {
  await requireCoach(request.auth?.uid);

  const playerId = String(request.data?.playerId || "").trim();
  const guardianName = String(request.data?.guardianName || "").trim();
  const email = normalizeInviteEmail(request.data?.guardianEmail);

  if (!playerId) throw new HttpsError("invalid-argument", "Spiller mangler.");
  if (guardianName.length < 2) throw new HttpsError("invalid-argument", "Skriv inn navn på foresatt.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Skriv inn en gyldig e-postadresse.");
  }

  const playerSnap = await db.collection("spillere").doc(playerId).get();
  if (!playerSnap.exists) throw new HttpsError("not-found", "Spilleren finnes ikke.");
  const playerData = playerSnap.data() || {};
  const playerName = playerData.navn || playerData.name || "spilleren";

  const playerAccountsSnap = await db.collection("playerAccounts").where("playerId", "==", playerId).get();
  const approvedPlayerAccount = playerAccountsSnap.docs.find(docSnap => docSnap.data()?.approved === true);
  if (!approvedPlayerAccount) {
    throw new HttpsError("failed-precondition", "Spilleren må ha en godkjent spillerkonto først.");
  }

  const guardianAccountsSnap = await db.collection("guardianAccounts").where("email", "==", email).get();
  const alreadyLinked = guardianAccountsSnap.docs.some(docSnap => {
    const ids = docSnap.data()?.playerIds;
    return Array.isArray(ids) && ids.includes(playerId);
  });
  if (alreadyLinked) {
    throw new HttpsError("already-exists", "Denne foresatte er allerede koblet til spilleren.");
  }

  const existingRequestsSnap = await db.collection("guardianRequests").where("guardianEmail", "==", email).get();
  const existingRequest = existingRequestsSnap.docs.find(docSnap => {
    const data = docSnap.data() || {};
    return data.playerId === playerId && ["pending", "approved"].includes(String(data.status || ""));
  });
  if (existingRequest) {
    throw new HttpsError("already-exists", "Det finnes allerede en aktiv invitasjon til denne e-postadressen.");
  }

  const token = require("crypto").randomBytes(32).toString("hex");
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const requestRef = db.collection("guardianRequests").doc();

  await requestRef.set({
    playerUid: approvedPlayerAccount.id,
    playerId,
    playerName,
    guardianName,
    guardianEmail: email,
    status: "approved",
    source: "coach",
    inviteToken: token,
    inviteExpiresAt: expiresAt,
    inviteUsed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: request.auth.uid
  });

  const inviteUrl = `https://coachfroden.github.io/spillerportal/?guardianInvite=${encodeURIComponent(token)}`;
  const apiKey = RESEND_API_KEY.value();
  if (!apiKey) {
    await requestRef.delete().catch(() => {});
    throw new HttpsError("failed-precondition", "E-posttjenesten er ikke konfigurert.");
  }

  const safe = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `coach-guardian-invite-${requestRef.id}-${token.slice(0,12)}`
    },
    body: JSON.stringify({
      from: GUARDIAN_EMAIL_FROM,
      to: [email],
      subject: `Invitasjon som foresatt til ${playerName} – Samnanger G14`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><h2>Hei ${safe(guardianName)}</h2><p>Treneren i Samnanger G14 har invitert deg som foresatt til ${safe(playerName)} i spillerportalen.</p><p>Bruk knappen under for å opprette foresattkontoen eller koble en eksisterende konto. E-postadressen er låst til denne invitasjonen.</p><p style="margin:28px 0"><a href="${safe(inviteUrl)}" style="background:#0b5cff;color:white;text-decoration:none;padding:13px 20px;border-radius:8px;display:inline-block">Åpne foresattinvitasjon</a></p><p>Lenken kan brukes én gang og utløper om 7 dager.</p><p style="font-size:13px;color:#667085">Hvis du ikke har bedt om eller forventet denne invitasjonen, kan du kontakte treneren eller ignorere e-posten.</p></div>`
    })
  });

  const emailResult = await emailResponse.json().catch(() => ({}));
  if (!emailResponse.ok) {
    console.error("Resend coach guardian invite failed", emailResponse.status, emailResult);
    await requestRef.delete().catch(() => {});
    throw new HttpsError("internal", emailResult?.message || "Kunne ikke sende invitasjonen på e-post.");
  }

  await requestRef.update({
    inviteEmailId: emailResult.id || null,
    inviteEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    requestId: requestRef.id,
    email,
    guardianName,
    playerId,
    playerName,
    emailSent: true
  };
});


exports.deleteGuardianAccount = onCall({
  region: "europe-west1",
  timeoutSeconds: 30
}, async request => {
  await requireCoach(request.auth?.uid);
  const guardianUid = String(request.data?.guardianUid || "");
  if (!guardianUid) throw new HttpsError("invalid-argument", "Foresatt mangler.");

  const guardianRef = db.collection("guardianAccounts").doc(guardianUid);
  const guardianSnap = await guardianRef.get();
  if (!guardianSnap.exists) throw new HttpsError("not-found", "Foresattkontoen finnes ikke.");
  const guardian = guardianSnap.data() || {};
  const email = normalizeInviteEmail(guardian.email);

  // Fjern invitasjons-/koblingsdata for denne foresatte. Spillernes samtaler beholdes.
  const requestDocs = new Map();
  const byUid = await db.collection("guardianRequests").where("guardianUid", "==", guardianUid).get();
  byUid.docs.forEach(d => requestDocs.set(d.ref.path, d.ref));
  if (email) {
    const byEmail = await db.collection("guardianRequests").where("guardianEmail", "==", email).get();
    byEmail.docs.forEach(d => requestDocs.set(d.ref.path, d.ref));
  }

  const refs = [guardianRef, ...requestDocs.values()];
  while (refs.length) {
    const batch = db.batch();
    refs.splice(0, 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  try {
    await admin.auth().deleteUser(guardianUid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  return { success: true };
});

exports.getGuardianInvite = onCall({
  region: "europe-west1",
  timeoutSeconds: 30
}, async request => {
  const token = String(request.data?.token || "");
  if (!token) throw new HttpsError("invalid-argument", "Invitasjon mangler.");
  const qs = await db.collection("guardianRequests").where("inviteToken", "==", token).limit(1).get();
  if (qs.empty) throw new HttpsError("not-found", "Invitasjonen finnes ikke.");
  const snap = qs.docs[0], data = snap.data();
  if (data.status !== "approved" || data.inviteUsed) throw new HttpsError("failed-precondition", "Invitasjonen er ikke lenger gyldig.");
  if (!data.inviteExpiresAt || data.inviteExpiresAt.toMillis() < Date.now()) throw new HttpsError("deadline-exceeded", "Invitasjonen har utløpt.");
  return {
    requestId: snap.id,
    email: normalizeInviteEmail(data.guardianEmail),
    guardianName: data.guardianName || "",
    playerName: data.playerName || ""
  };
});

exports.claimGuardianInvite = onCall({
  region: "europe-west1",
  timeoutSeconds: 30
}, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Du må være logget inn.");
  const token = String(request.data?.token || "");
  if (!token) throw new HttpsError("invalid-argument", "Invitasjon mangler.");

  const authUser = await admin.auth().getUser(uid);
  const signedInEmail = normalizeInviteEmail(authUser.email);
  if (!signedInEmail) throw new HttpsError("failed-precondition", "Kontoen mangler e-postadresse.");

  const qs = await db.collection("guardianRequests").where("inviteToken", "==", token).limit(1).get();
  if (qs.empty) throw new HttpsError("not-found", "Invitasjonen finnes ikke.");
  const reqRef = qs.docs[0].ref;

  await db.runTransaction(async tx => {
    const fresh = await tx.get(reqRef);
    const data = fresh.data();
    if (!data || data.status !== "approved" || data.inviteUsed) throw new HttpsError("failed-precondition", "Invitasjonen er allerede brukt eller ugyldig.");
    if (!data.inviteExpiresAt || data.inviteExpiresAt.toMillis() < Date.now()) throw new HttpsError("deadline-exceeded", "Invitasjonen har utløpt.");
    const invitedEmail = normalizeInviteEmail(data.guardianEmail);
    if (signedInEmail !== invitedEmail) throw new HttpsError("permission-denied", "Denne invitasjonen tilhører en annen e-postadresse.");

    const guardianRef = db.collection("guardianAccounts").doc(uid);
    const guardianSnap = await tx.get(guardianRef);
    const existing = guardianSnap.exists ? guardianSnap.data() : {};
    const ids = Array.from(new Set([...(Array.isArray(existing.playerIds) ? existing.playerIds : []), data.playerId]));

    tx.set(guardianRef, {
      name: data.guardianName || existing.name || authUser.displayName || "",
      email: invitedEmail,
      approved: true,
      playerIds: ids,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: data.approvedBy || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(guardianSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });

    tx.update(reqRef, {
      inviteUsed: true,
      inviteUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      guardianUid: uid,
      status: "claimed"
    });
  });

  return { success: true };
});
