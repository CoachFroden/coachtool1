import {auth,db} from "./firebase-refleksjon.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {collection,doc,getDoc,getDocs,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const $=id=>document.getElementById(id);
const KEY="coachtool:preview:roster:samnanger-g14:2027:v1";
let source=[],selected=new Set(),added=[],loaded=false,year="2027",coachUid=null;
function save(){localStorage.setItem(KEY,JSON.stringify({ids:[...selected],added}));}
function restore(){try{const d=JSON.parse(localStorage.getItem(KEY)||"null");if(d){selected=new Set(Array.isArray(d.ids)?d.ids:[]);added=Array.isArray(d.added)?d.added.filter(p=>p&&typeof p.name==="string"):[];}}catch{}}
function element(tag,content,cls){const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(cls)el.className=cls;return el;}
function render(){
 const readOnly=year==="2026";$("newSection").hidden=readOnly;$("all").disabled=readOnly||!loaded;$("none").disabled=readOnly||!loaded;
 $("yearInfo").textContent=readOnly?"Viser eksisterende spillere som kilde for historikken. Ingen endringer kan gjøres i 2026.":"Velg hvilke eksisterende spillere som fortsetter, og legg til nye. Endringer lagres kun lokalt i testversjonen.";
 $("players").replaceChildren();const q=$("search").value.trim().toLocaleLowerCase("no");
 const visible=source.filter(p=>p.name.toLocaleLowerCase("no").includes(q));
 for(const p of visible){
  const row=element("div",undefined,"player");const label=element("label");const cb=document.createElement("input");cb.type="checkbox";cb.checked=readOnly||selected.has(p.id);cb.disabled=readOnly;cb.addEventListener("change",()=>{if(cb.checked)selected.add(p.id);else selected.delete(p.id);save();render();});
  const info=element("span");info.append(element("strong",p.name),element("small",readOnly?"Eksisterende spiller · 2026":selected.has(p.id)?"Med i 2027":"Ikke valgt for 2027"));label.append(cb,info);row.append(label);$("players").append(row);
 }
 $("newPlayers").replaceChildren();
 for(const p of added){const row=element("div",undefined,"player");row.append(element("span",p.name));const btn=element("button","Fjern");btn.type="button";btn.addEventListener("click",()=>{added=added.filter(x=>x.id!==p.id);save();render();});row.append(btn);$("newPlayers").append(row);}
 const total=readOnly?source.length:selected.size+added.length;
 $("count").textContent=total+" spillere";
 $("summary").textContent=readOnly?"2026: "+source.length+" eksisterende spilleroppføringer (ikke bekreftet full sesongstall).":"2027: "+selected.size+" videreførte + "+added.length+" nye = "+total+" spillere. Alle starter med 0 kamper, 0 mål og 0 minutter i 2027.";
 $("reset").hidden=readOnly;
}
$("year").addEventListener("change",e=>{year=e.target.value;render()});
$("search").addEventListener("input",render);
$("all").addEventListener("click",()=>{source.forEach(p=>selected.add(p.id));save();render()});
$("none").addEventListener("click",()=>{selected.clear();save();render()});
$("addForm").addEventListener("submit",e=>{e.preventDefault();const name=$("newName").value.trim();if(!name)return;if([...source.filter(p=>selected.has(p.id)),...added].some(p=>p.name.toLocaleLowerCase("no")===name.toLocaleLowerCase("no"))){$("status").textContent="Denne spilleren finnes allerede i teststallen.";return;}added.push({id:"preview-"+Date.now()+"-"+Math.random().toString(36).slice(2),name});$("newName").value="";save();render()});
$("reset").addEventListener("click",()=>{if(!confirm("Nullstille alle lokale valg for 2027?"))return;selected.clear();added=[];save();render()});
restore();
onAuthStateChanged(auth,async user=>{
 if(!user){$("status").textContent="Logg inn i Coachtool1 for å hente spillerlisten.";return;}
 try{
  const profile=await getDoc(doc(db,"users",user.uid));
  if(!profile.exists()||profile.data().role!=="coach"){$("status").textContent="Kun trenere har tilgang til denne forhåndsvisningen.";return;}
  const snap=await getDocs(collection(db,"spillere"));
  source=snap.docs.map(d=>({id:d.id,name:String(d.data().navn||d.data().name||d.id)})).sort((a,b)=>a.name.localeCompare(b.name,"no"));
  coachUid=user.uid;loaded=true;$("status").textContent="Spillere hentet. Ingen data er endret i Firebase.";render();
 }catch(err){$("status").textContent="Kunne ikke hente spillerlisten: "+(err.code||err.message);}
});
render();

$("saveFirebase").addEventListener("click",async()=>{
 const status=$("saveStatus");status.textContent="";
 if(!coachUid||!loaded){status.textContent="Spillerlisten er ikke ferdig lastet.";return;}
 if(year!=="2027"){status.textContent="Bare 2027-stallen kan lagres her.";return;}
 if(!confirm("Lagre valgt spillerstall for G14 2027 i Firebase? Dette endrer ikke 2026."))return;
 const btn=$("saveFirebase");btn.disabled=true;status.textContent="Lagrer …";
 try{
  const playerIds=[...selected].filter(id=>source.some(p=>p.id===id));
  const newPlayers=added.map(p=>({id:p.id,name:p.name}));
  await setDoc(doc(db,"seasonRosters","samnanger-g14-2027"),{
   teamId:"samnanger-g14",seasonId:"samnanger-g14-2027",year:2027,
   playerIds,newPlayers,updatedBy:coachUid,updatedAt:serverTimestamp()
  });
  status.textContent="Lagret i Firebase: "+(playerIds.length+newPlayers.length)+" spillere.";
 }catch(err){
  status.textContent="Ikke lagret i Firebase: "+(err.code||err.message)+". Valgene er fortsatt lagret lokalt.";
 }finally{btn.disabled=false;}
});
