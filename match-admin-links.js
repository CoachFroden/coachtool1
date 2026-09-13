import { auth, db } from "./firebase-refleksjon.js";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const style = document.createElement("style");
style.textContent = `
  .matchAdminWrap{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:stretch}
  .matchAdminWrap>.next-card,.matchAdminWrap>.match-card{min-width:0}
  .matchEditBtn{display:inline-flex;align-items:center;justify-content:center;align-self:stretch;min-width:82px;padding:0 14px;border:1px solid rgba(96,165,250,.24);border-radius:16px;background:rgba(37,99,235,.10);color:#bfdbfe;text-decoration:none;font-size:.78rem;font-weight:800;white-space:nowrap}
  .matchEditBtn:hover{background:rgba(37,99,235,.16)}
  .nextMatchSlot>.matchAdminWrap{grid-template-columns:1fr auto}
  @media(max-width:560px){.matchAdminWrap{grid-template-columns:1fr}.matchEditBtn{min-height:42px}.nextMatchSlot>.matchAdminWrap{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function matchTime(meta = {}) {
  return String(meta.time || meta.startTime || "").trim();
}

async function canManage() {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() && String(snap.data()?.role || "").toLowerCase() === "coach";
}

async function loadUpcoming() {
  const q = query(
    collection(db, "matches"),
    where("meta.date", ">=", todayString()),
    orderBy("meta.date")
  );
  const snap = await getDocs(q);
  const matches = snap.docs.map(d => ({ id: d.id, meta: d.data()?.meta || {} }));
  matches.sort((a, b) => {
    const first = `${a.meta.date || ""}T${matchTime(a.meta) || "00:00"}`;
    const second = `${b.meta.date || ""}T${matchTime(b.meta) || "00:00"}`;
    return first.localeCompare(second);
  });
  return matches;
}

function editHref(id) {
  return `edit-match.html?source=official&matchId=${encodeURIComponent(id)}`;
}

function wrapWithEdit(card, matchId) {
  if (!card || card.closest(".matchAdminWrap")) return;
  const wrap = document.createElement("div");
  wrap.className = "matchAdminWrap";
  card.parentNode.insertBefore(wrap, card);
  wrap.appendChild(card);

  const edit = document.createElement("a");
  edit.className = "matchEditBtn";
  edit.href = editHref(matchId);
  edit.textContent = "Rediger";
  edit.setAttribute("aria-label", "Rediger kamp");
  wrap.appendChild(edit);
}

async function enhance() {
  if (!(await canManage())) return;
  const matches = await loadUpcoming();
  if (!matches.length) return;

  const nextCard = document.querySelector("#nextMatch .next-card");
  if (nextCard) wrapWithEdit(nextCard, matches[0].id);

  const laterCards = Array.from(document.querySelectorAll("#matchGrid .match-card"));
  laterCards.forEach((card, index) => {
    const match = matches[index + 1];
    if (match) wrapWithEdit(card, match.id);
  });
}

let tries = 0;
const timer = setInterval(async () => {
  tries += 1;
  const ready = document.querySelector("#nextMatch .next-card") || document.querySelector("#matchGrid .match-card");
  if (!ready && tries < 20) return;
  clearInterval(timer);
  try {
    await enhance();
  } catch (error) {
    console.warn("Kunne ikke legge til redigeringsknapper", error);
  }
}, 150);
