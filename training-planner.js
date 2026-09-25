import { auth, db } from "./firebase-refleksjon.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot,
  serverTimestamp, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const $=id=>document.getElementById(id);
let currentUser=null;
let sessions=[];
let selectedSessionId=null;
let currentFilter="upcoming";
let wishesUnsub=null;

const emptySession=()=>({
  title:"Ny treningsøkt",
  date:new Date().toISOString().slice(0,10),
  focus:"",
  intro:"",
  published:false,
  sections:[]
});

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate=value=>{
  if(!value)return{day:"—",month:"",long:"Ingen dato"};
  const d=new Date(value+"T12:00:00");
  return{
    day:String(d.getDate()).padStart(2,"0"),
    month:d.toLocaleDateString("no-NO",{month:"short"}).replace(".","").toUpperCase(),
    long:d.toLocaleDateString("no-NO",{weekday:"long",day:"numeric",month:"long"})
  };
};
const totalMinutes=plan=>(plan.sections||[]).reduce((sum,s)=>sum+(Number(s.minutes)||0),0);

function renumber(){
  [...$("sections").children].forEach((node,index)=>node.querySelector(".partNumber").textContent=String(index+1).padStart(2,"0"));
}
function addSection(section={}){
  const node=$("sectionTemplate").content.firstElementChild.cloneNode(true);
  node.querySelector(".partTitle").value=section.title||"";
  node.querySelector(".partMinutes").value=section.minutes??10;
  node.querySelector(".partDetails").value=section.details||"";
  node.querySelector(".partCoaching").value=section.coaching||"";
  node.querySelector(".partPresentation").value=section.presentationUrl||"";
  node.querySelector(".removePart").onclick=()=>{node.remove();renumber()};
  node.querySelector(".up").onclick=()=>{const prev=node.previousElementSibling;if(prev){node.parentElement.insertBefore(node,prev);renumber()}};
  node.querySelector(".down").onclick=()=>{const next=node.nextElementSibling;if(next){node.parentElement.insertBefore(next,node);renumber()}};
  $("sections").appendChild(node);renumber();
}
function collect(){
  return{
    title:$("titleInput").value.trim(),
    date:$("dateInput").value,
    focus:$("focusInput").value.trim(),
    intro:$("introInput").value.trim(),
    sections:[...$("sections").children].map(node=>({
      title:node.querySelector(".partTitle").value.trim(),
      minutes:Number(node.querySelector(".partMinutes").value)||0,
      details:node.querySelector(".partDetails").value.trim(),
      coaching:node.querySelector(".partCoaching").value.trim(),
      presentationUrl:node.querySelector(".partPresentation").value.trim()
    }))
  };
}
function renderEditor(plan){
  $("editorEmpty").hidden=true;$("sessionForm").hidden=false;
  $("titleInput").value=plan.title||"";
  $("dateInput").value=plan.date||"";
  $("focusInput").value=plan.focus||"";
  $("introInput").value=plan.intro||"";
  $("sections").innerHTML="";
  (plan.sections||[]).forEach(addSection);
  $("editorHeading").textContent=plan.title||"Ny trening";
  updatePublishUI(plan.published===true);
}
function updatePublishUI(published){
  $("publishBadge").textContent=published?"PUBLISERT":"KLADD";
  $("publishBadge").className="statusBadge "+(published?"published":"draft");
  $("publishTitle").textContent=published?"Synlig for spillerne":"Ikke publisert";
  $("publishText").textContent=published?"Spillerne kan lese denne økten på siden Trening.":"Spillerne kan ikke se denne økten før du publiserer den.";
  $("publishBtn").textContent=published?"Trekk tilbake":"Publiser til spillerne";
}
function filteredSessions(){
  const today=new Date().toISOString().slice(0,10);
  return sessions.filter(s=>{
    if(currentFilter==="draft")return !s.published;
    if(currentFilter==="upcoming")return (s.date||"9999-99-99")>=today;
    return true;
  }).sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"));
}
function renderSessions(){
  const list=filteredSessions();
  $("sessionsList").innerHTML=list.length?list.map(s=>{
    const d=fmtDate(s.date);
    return `<button class="sessionRow ${s.id===selectedSessionId?"active":""}" data-id="${s.id}" type="button">
      <span class="sessionDate"><b>${d.day}</b><small>${d.month}</small></span>
      <span class="sessionMain"><strong>${esc(s.title||"Uten navn")}</strong><span>${esc(s.focus||d.long)} · ${totalMinutes(s)} min</span></span>
      <span class="sessionState ${s.published?"published":""}">${s.published?"PUB":"KLADD"}</span>
    </button>`;
  }).join(""):'<div class="emptyState">Ingen treninger her ennå.</div>';
  document.querySelectorAll(".sessionRow").forEach(btn=>btn.onclick=()=>selectSession(btn.dataset.id));
}
async function loadSessions(){
  $("saveStatus").textContent="Henter …";
  try{
    const snap=await getDocs(collection(db,"trainingSessions"));
    sessions=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderSessions();
    if(selectedSessionId){
      const current=sessions.find(s=>s.id===selectedSessionId);
      if(current)renderEditor(current);
    }
    $("saveStatus").textContent="Oppdatert";
  }catch(e){console.error(e);$("saveStatus").textContent="Kunne ikke hente";}
}
function selectSession(id){
  selectedSessionId=id;
  const plan=sessions.find(s=>s.id===id);
  if(!plan)return;
  renderEditor(plan);renderSessions();
  window.scrollTo({top:Math.min(window.scrollY,260),behavior:"smooth"});
}
async function createSession(){
  if(!currentUser)return;
  $("saveStatus").textContent="Oppretter …";
  const plan=emptySession();
  try{
    const ref=await addDoc(collection(db,"trainingSessions"),{
      ...plan,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:currentUser.uid
    });
    selectedSessionId=ref.id;
    await loadSessions();
    selectSession(ref.id);
    $("titleInput").focus();
  }catch(e){console.error(e);alert("Kunne ikke opprette trening. Firestore-reglene må tillate trainingSessions.");}
}
async function saveSession(publishValue){
  if(!currentUser||!selectedSessionId)return;
  const existing=sessions.find(s=>s.id===selectedSessionId);
  if(!existing)return;
  const plan=collect();
  if(!plan.title||!plan.date){alert("Fyll inn navn og dato.");return}
  const published=publishValue??existing.published===true;
  $("saveStatus").textContent="Lagrer …";
  document.body.classList.add("loading");
  try{
    await setDoc(doc(db,"trainingSessions",selectedSessionId),{
      ...plan,
      published,
      updatedAt:serverTimestamp(),
      updatedBy:currentUser.uid,
      ...(published&&!existing.published?{publishedAt:serverTimestamp()}: {})
    },{merge:true});
    $("saveStatus").textContent=published?"Publisert":"Lagret";
    $("saveStatus").classList.add("saved");
    await loadSessions();
    selectSession(selectedSessionId);
  }catch(e){console.error(e);$("saveStatus").textContent="Lagring feilet";alert("Kunne ikke lagre. Kontroller Firestore-reglene.")}
  finally{document.body.classList.remove("loading")}
}
async function duplicateSession(){
  const source=collect();
  if(!currentUser)return;
  try{
    const ref=await addDoc(collection(db,"trainingSessions"),{
      ...source,title:(source.title||"Trening")+" – kopi",published:false,
      createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:currentUser.uid
    });
    selectedSessionId=ref.id;await loadSessions();selectSession(ref.id);
  }catch(e){console.error(e);alert("Kunne ikke duplisere treningen.")}
}
async function deleteSession(){
  if(!selectedSessionId||!confirm("Slette denne treningen?"))return;
  try{
    await deleteDoc(doc(db,"trainingSessions",selectedSessionId));
    selectedSessionId=null;$("sessionForm").hidden=true;$("editorEmpty").hidden=false;await loadSessions();
  }catch(e){console.error(e);alert("Kunne ikke slette treningen.")}
}

function renderWishes(items){
  const statusLabel={new:"Ny",considering:"Vurderes",planned:"Planlagt",used:"Brukt"};
  const fresh=items.filter(w=>w.status==="new").length;
  $("wishCount").textContent=`${fresh} nye`;
  $("wishesList").innerHTML=items.length?items.map(w=>`<article class="wishCard">
    <div class="wishMeta"><strong>${esc(w.playerName||"Spiller")}</strong><span>${w.createdAt?.toDate?w.createdAt.toDate().toLocaleDateString("no-NO"):""}</span></div>
    <span class="wishCategory">${esc(w.category||"Ønske")}</span>
    <p>${esc(w.text||"")}</p>
    <div class="wishActions">${["new","considering","planned","used"].map(status=>`<button data-id="${w.id}" data-status="${status}" class="${w.status===status?"active":""}" type="button">${statusLabel[status]}</button>`).join("")}</div>
  </article>`).join(""):'<div class="emptyState">Ingen treningsønsker ennå.</div>';
  document.querySelectorAll(".wishActions button").forEach(btn=>btn.onclick=async()=>{
    try{await updateDoc(doc(db,"trainingWishes",btn.dataset.id),{status:btn.dataset.status,updatedAt:serverTimestamp(),updatedBy:currentUser.uid})}
    catch(e){console.error(e);alert("Kunne ikke oppdatere ønsket.")}
  });
}
function startWishes(){
  wishesUnsub?.();
  wishesUnsub=onSnapshot(collection(db,"trainingWishes"),snap=>{
    const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    renderWishes(items);
  },e=>{console.error(e);$("wishesList").innerHTML='<div class="emptyState">Kunne ikke hente ønsker. Firestore-reglene må oppdateres.</div>'});
}

$("newSessionBtn").onclick=createSession;
$("refreshSessionsBtn").onclick=loadSessions;
$("addSectionBtn").onclick=()=>addSection();
$("sessionForm").onsubmit=e=>{e.preventDefault();saveSession()};
$("publishBtn").onclick=()=>{
  const existing=sessions.find(s=>s.id===selectedSessionId);
  saveSession(!(existing?.published===true));
};
$("duplicateBtn").onclick=duplicateSession;
$("deleteBtn").onclick=deleteSession;
document.querySelectorAll(".filterChip").forEach(btn=>btn.onclick=()=>{
  currentFilter=btn.dataset.filter;
  document.querySelectorAll(".filterChip").forEach(x=>x.classList.toggle("active",x===btn));
  renderSessions();
});

onAuthStateChanged(auth,async user=>{
  wishesUnsub?.();wishesUnsub=null;
  if(!user){location.href="./index.html";return}
  const profile=await getDoc(doc(db,"users",user.uid));
  if(!profile.exists()||profile.data().role!=="coach"){alert("Kun trener har tilgang.");location.href="./fremside.html";return}
  currentUser=user;
  await loadSessions();
  startWishes();
});