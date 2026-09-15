import fs from "node:fs";
for (const l of fs.readFileSync("./.env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2];}
import pkg from "pg"; const {Client}=pkg;
const norm=(r)=>{let d=String(r||"").replace(/\D/g,"");if(!d)return null;if(!d.startsWith("55")&&(d.length===10||d.length===11))d="55"+d;if(d.startsWith("55")&&(d.length===12||d.length===13))return d;return null;};
const TIT=new Set(["pastor","pastora","pr","pra","dr","dra","prof","profa","sr","sra","srta","dona","seu","irmao","irmã","irma","the","de","da","do"]);
const cap=(s)=>s?s.charAt(0).toUpperCase()+s.slice(1).toLowerCase():s;
const primeiro=(n)=>{let x=String(n||"").normalize("NFKC").trim();if(!x)return null;x=x.replace(/[^\p{L}\s]/gu," ").replace(/\s+/g," ").trim();for(const t of x.split(" ")){if(t.length<2)continue;if(TIT.has(t.toLowerCase()))continue;return cap(t);}return null;};
const c=new Client({host:process.env.PGHOST,port:+process.env.PGPORT,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,ssl:false,connectionTimeoutMillis:12000});
await c.connect();
const url=((await c.query("SELECT valor FROM config WHERE chave='EVOLUTION_URL'")).rows[0].valor||"").replace(/\/$/,"");
const key=(await c.query("SELECT valor FROM config WHERE chave='EVOLUTION_APIKEY'")).rows[0].valor;
const map=new Map(); const put=(nu,nm)=>{const x=norm(nu);if(!x)return;if(!map.has(x))map.set(x,nm||"");else if(!map.get(x)&&nm)map.set(x,nm);};
for(const inst of ["EXTRACAO - ELIANE","eliane-pacheco"]){try{const r=await fetch(`${url}/chat/findContacts/${encodeURIComponent(inst)}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:key},body:JSON.stringify({where:{}})});if(r.ok){const d=await r.json().catch(()=>[]);for(const ct of (Array.isArray(d)?d:[])){const jid=ct.remoteJid||ct.id||"";if(String(jid).includes("@s.whatsapp.net"))put(jid.split("@")[0],ct.pushName||ct.name||"");}}}catch{}}
for(const row of (await c.query("SELECT contato n, max(contato_nome) nm FROM mensagens WHERE agente_id=6 AND contato IS NOT NULL GROUP BY contato")).rows) put(row.n,row.nm);
for(const row of (await c.query("SELECT whatsapp n, nome nm FROM pessoas WHERE agente_id=6 AND whatsapp<>'' AND COALESCE(criado_por,'')<>'demo-oseias'")).rows) put(row.n,row.nm);
await c.end();
let seq=0; const linhas=[["Name","Phone 1 - Value","Labels"]];
for(const [num,nome] of map){const pn=primeiro(nome)||`Contato ${String(++seq).padStart(4,"0")}`;linhas.push([`${pn} | Eliane`,"+"+num,"Eliane | Contato"]);}
fs.writeFileSync("Contatos_Eliane_MAX.csv","﻿"+linhas.map(l=>l.map(x=>/[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x).join(",")).join("\n"),"utf8");
console.log("Eliane:",map.size,"contatos -> Contatos_Eliane_MAX.csv");
