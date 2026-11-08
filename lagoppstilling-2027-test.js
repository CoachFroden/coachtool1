import {auth,db} from "./firebase-refleksjon.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {doc,getDoc,getDocs,collection} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const $=id=>document.getElementById(id);
const positions=[["Keeper",50,90],["VB",17,74],["MS",39,77],["MS",61,77],["HB",83,74],["IM",25,51],["SM",50,55],["IM",75,51],["VK",19,26],["SP",50,20],["HK",81,26]];
let players=[],chosen=null,slots=Array(11).fill(null);
function render(){
 $("count").textContent=players.length;$("players").replaceChildren();$("pitch").replaceChildren();
 const used=new Set(slots.filter(Boolean));
 for(const p of players){const b=document.createElement("button");b.className="person"+(chosen===p.id?" active":"");b.textContent=p.name+(used.has(p.id)?" · på banen":"");b.disabled=used.has(p.id);b.addEventListener("click",()=>{chosen=p.id;render()});$("players").append(b);}
 positions.forEach(([name,x,y],i)=>{const b=document.createElement("button");b.className="spot"+(slots[i]?" filled":"");b.style.left=x+"%";b.style.top=y+"%";const p=players.find(p=>p.id===slots[i]);b.textContent=p?p.name:name;b.title=p?"Fjern "+p.name:"Sett inn spiller på "+name;b.addEventListener("click",()=>{if(slots[i])slots[i]=null;else if(chosen&&!slots.includes(chosen)){slots[i]=chosen;chosen=null;}render()});$("pitch").append(b);});
 $("placed").textContent=used.size+" av 11 posisjoner fylt. "+(players.length<11?"Stallen har bare "+players.length+" spillere; dette er en test, ikke en full ellever.":"");
}
$("clear").addEventListener("click",()=>{slots.fill(null);chosen=null;render()});
onAuthStateChanged(auth,async user=>{
 if(!user){$("status").textContent="Du må logge inn først.";return;}
 try{
  const profile=await getDoc(doc(db,"users",user.uid));
  if(profile.data()?.role!=="coach")throw new Error("Bare trenerkontoen har tilgang.");
  const rosterSnap=await getDoc(doc(db,"seasonRosters","samnanger-g14-2027"));
  if(!rosterSnap.exists())throw new Error("Ingen lagret 2027-stall funnet.");
  const roster=rosterSnap.data();const ids=new Set(Array.isArray(roster.playerIds)?roster.playerIds:[]);
  const source=await getDocs(collection(db,"spillere"));
  players=source.docs.filter(d=>ids.has(d.id)).map(d=>({id:d.id,name:String(d.data().navn||d.data().name||d.id)}));
  for(const p of (Array.isArray(roster.newPlayers)?roster.newPlayers:[]))if(p&&p.id&&p.name&&!players.some(x=>x.id===p.id))players.push({id:p.id,name:p.name});
  players.sort((a,b)=>a.name.localeCompare(b.name,"no"));
  const missing=[...ids].filter(id=>!source.docs.some(d=>d.id===id)).length;
  $("status").textContent="Hentet "+players.length+" spillere fra Firebase-stallen for 2027."+(missing?" Advarsel: "+missing+" spiller-ID-er mangler i spillere.":"");
  render();
 }catch(e){$("status").textContent="Kunne ikke hente stallen: "+(e.code||e.message);}
});
render();