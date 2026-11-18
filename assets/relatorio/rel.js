/* Relatório online ETERNAL: carrega um relatório publicado pelo link secreto,
   abre com a retrospectiva animada (estilo stories) e depois mostra o painel completo. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const N=v=>(v===null||v===undefined||v===""||isNaN(Number(v)))?null:Number(v);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RM=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const int=v=>Math.round(v).toLocaleString("pt-BR");
const money=(v,dec)=>Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:dec===0?0:2,maximumFractionDigits:dec===0?0:2});
const compact=v=>v>=1e6?(v/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mi":v>=1e4?(v/1e3).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil":int(v);
const pct=v=>Math.round(v).toLocaleString("pt-BR")+"%";
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;

/* ---------- cor da marca, sempre legível no fundo escuro ---------- */
function hexRgb(h){h=String(h||"").replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h,16);return isNaN(n)||h.length!==6?[34,211,238]:[n>>16&255,n>>8&255,n&255];}
function brand(h){let [r,g,b]=hexRgb(h);const L=(0.2126*r+0.7152*g+0.0722*b)/255;if(L<0.42){const m=Math.min(.65,(0.5-L)*1.3);r=Math.round(r+(255-r)*m);g=Math.round(g+(255-g)*m);b=Math.round(b+(255-b)*m);}return {hex:"#"+[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join(""),rgb:`${r},${g},${b}`};}

/* ---------- carregar ---------- */
function tokenOf(){const m=location.pathname.match(/\/r\/([A-Za-z0-9_-]{4,80})\/?$/);if(m)return m[1];const q=new URLSearchParams(location.search).get("t");return q&&/^[A-Za-z0-9_-]{4,80}$/.test(q)?q:null;}
async function load(token){
 if(token==="demo"){const r=await fetch("/assets/relatorio/demo.json",{cache:"no-store"});if(!r.ok)throw new Error("demo");return r.json();}
 const c=window.ETERNAL_REL||{};if(!c.url||!c.key)throw new Error("config");
 const h={"apikey":c.key,"Content-Type":"application/json"};if(!/^sb_publishable_/.test(c.key))h.Authorization="Bearer "+c.key;
 const r=await fetch(c.url.replace(/\/$/,"")+"/rest/v1/rpc/get_report",{method:"POST",headers:h,body:JSON.stringify({p_token:token})});
 if(!r.ok)throw new Error("http "+r.status);return r.json();}
function fail(title,txt){$("#boot").innerHTML=`<div class="rl-msg"><img src="/assets/img/eternal-logo.svg" alt="ETERNAL" width="150"><h1>${esc(title)}</h1><p>${esc(txt)}</p></div>`;}

/* ---------- números para a retrospectiva ---------- */
function facts(P){
 const d=P.rep?.data||{},ED=window.EternalDash,T=ED?ED.derive(d.totais||{}):(d.totais||{});
 const camps=(d.campanhas||[]).filter(c=>c&&c.nome);
 const objOf=c=>(ED&&(ED.normObj(c.objetivo)||ED.inferObj(c.tipo_resultado)||ED.inferObj(c.nome)))||"outro";
 const objs=[...new Set(camps.map(objOf))];
 const mixed=objs.length>1;
 const tipo=d.tipo_resultado||(camps[0]&&camps[0].tipo_resultado)||"resultados";
 const porMil=!!d.custo_por_mil||objs[0]==="reconhecimento"&&/alcan/.test(tipo);
 const serie=(d.serie_diaria||[]).filter(p=>p&&p.data);
 const days=serie.length||null;
 return {d,T,camps,objs,mixed,tipo,porMil,serie,days,pub:d.publico||{},objOf};
}
function slidesFor(P){
 const F=facts(P),{T,camps,mixed,tipo,porMil,serie,pub}=F,S=[];
 const inv=N(T.investimento),res=N(T.resultados),alc=N(T.alcance),imp=N(T.impressoes),freq=N(T.frequencia);
 const client=P.client||{name:"Cliente"};
 S.push({k:"intro",dur:4200});
 if(inv)S.push({k:"inv",dur:5200,inv,perDay:F.days&&F.days>=3?inv/F.days:null});
 if(!mixed&&res&&!(porMil&&res===alc)){const cpr=N(T.custo_por_resultado)??(inv?inv/res*(porMil?1000:1):null);S.push({k:"res",dur:5600,res,tipo,cpr,porMil});}
 else if(mixed){const by={};camps.forEach(c=>{const r=N(c.resultados);if(!r)return;const k=c.tipo_resultado||"resultados";by[k]=(by[k]||0)+r;});const rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,3);if(rows.length)S.push({k:"mix",dur:5800,rows});}
 if(alc)S.push({k:"reach",dur:5600,alc,imp,freq,cpm:porMil&&res===alc?(N(T.custo_por_resultado)??(inv?inv/alc*1000:null)):null});
 const key=!mixed&&serie.filter(p=>N(p.resultados)!==null).length>=5?"resultados":serie.filter(p=>N(p.alcance)!==null).length>=5?"alcance":serie.filter(p=>N(p.impressoes)!==null).length>=5?"impressoes":null;
 if(key){const vals=serie.map(p=>N(p[key])??0);const mx=Math.max(...vals);if(mx>0){const bi=vals.indexOf(mx);S.push({k:"days",dur:6000,vals,bi,best:serie[bi],key,label:key==="resultados"?tipo:key==="alcance"?"pessoas alcançadas":"impressões",avg:vals.reduce((a,b)=>a+b,0)/vals.length});}}
 const ag=(pub.idade_genero||[]).map(r=>({f:r.faixa,h:N(r.homens)||0,m:N(r.mulheres)||0})).filter(r=>r.f&&!/desconhec|unknown/i.test(r.f)&&r.h+r.m>0);
 if(ag.length>=2){let best=null;ag.forEach(r=>{[["Homens",r.h],["Mulheres",r.m]].forEach(([g,v])=>{if(!best||v>best.v)best={g,f:r.f,v};});});const tot=ag.reduce((a,r)=>a+r.h+r.m,0),th=ag.reduce((a,r)=>a+r.h,0);S.push({k:"people",dur:6000,ag,best,tot,menPct:tot?th/tot*100:null,metric:pub.metrica||"Resultados"});}
 const reg=(pub.regioes||[]).filter(r=>N(r.valor)>0).sort((a,b)=>b.valor-a.valor);
 const pos=(pub.posicionamentos||[]).filter(r=>N(r.valor)>0).sort((a,b)=>b.valor-a.valor);
 if(reg.length){const tot=reg.reduce((a,r)=>a+Number(r.valor),0);S.push({k:"where",dur:5600,rows:reg.slice(0,4),tot,more:reg.length});}
 else if(pos.length>=2){const tot=pos.reduce((a,r)=>a+Number(r.valor),0);S.push({k:"place",dur:5600,rows:pos.slice(0,4),tot});}
 if(!mixed&&camps.length>=2){const cs=camps.map(c=>({c,r:N(c.resultados),i:N(c.investimento)})).filter(x=>x.r>0&&x.i>0).map(x=>({...x,cpr:x.i/x.r}));if(cs.length>=2){cs.sort((a,b)=>a.cpr-b.cpr);const avg=cs.reduce((a,x)=>a+x.i,0)/cs.reduce((a,x)=>a+x.r,0);S.push({k:"star",dur:5800,x:cs[0],avg,n:cs.length,tipo,porMil});}}
 const PT=P.prev&&P.prev.data&&P.prev.data.totais&&window.EternalDash?window.EternalDash.derive(P.prev.data.totais):null;
 if(PT){const rows=[];const ch=(a,b)=>N(a)!==null&&N(b)>0?(a-b)/b*100:null;
  const r1=!mixed?ch(res,N(PT.resultados)):null;if(r1!==null)rows.push({l:cap(tipo),v:r1,good:r1>=0});
  const cprA=N(T.custo_por_resultado),cprB=N(PT.custo_por_resultado);const r2=!mixed?ch(cprA,cprB):null;if(r2!==null)rows.push({l:porMil?"Custo por mil pessoas":"Custo por resultado",v:r2,good:r2<=0});
  const r3=ch(alc,N(PT.alcance));if(r3!==null)rows.push({l:"Pessoas alcançadas",v:r3,good:r3>=0});
  if(rows.length)S.push({k:"cmp",dur:6000,rows,per:P.prev.periodo||"período anterior"});}
 S.push({k:"end",dur:0});
 return {S,client};
}

/* ---------- HTML de cada tela ---------- */
function rv(html,d){return `<div class="rv" style="--d:${d}ms">${html}</div>`;}
function slideHTML(s,P){
 const client=P.client||{name:"Cliente"},agency=P.agency||{},per=P.rep?.periodo||"";
 const logoC=client.logo?`<span class="st-logo"><img src="${esc(client.logo)}" alt=""></span>`:`<span class="st-logo st-ini">${esc((client.name||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase())}</span>`;
 const logoA=`<img class="st-alogo" src="${esc(agency.logo||"/assets/img/eternal-logo.svg")}" alt="${esc(agency.name||"ETERNAL")}">`;
 const big=(v,fmt,cls)=>`<div class="st-big ${cls||""}" data-count="${v}" data-fmt="${fmt}">${fmtv(v,fmt)}</div>`;
 switch(s.k){
  case "intro":return `<div class="st-ring" aria-hidden="true"></div>${rv(logoC,0)}${rv(`<p class="st-eye">Retrospectiva de resultados</p>`,250)}${rv(`<h1 class="st-h1">${esc(client.name)}</h1>`,400)}${rv(`<p class="st-per">${esc(per)}</p>`,600)}${rv(`<p class="st-by">Preparado por ${logoA}</p>`,900)}`;
  case "inv":return `${rv(`<p class="st-eye">Investimento</p>`,0)}${rv(`<p class="st-lead">Neste período, você investiu</p>`,150)}${rv(big(s.inv,"money"),300)}${rv(`<p class="st-sub">em anúncios no Facebook e no Instagram${s.perDay?`, cerca de <b>${money(s.perDay)}</b> por dia`:""}.</p>`,700)}${rv(`<p class="st-note">Agora veja o que esse investimento trouxe.</p>`,1300)}`;
  case "res":return `<div class="st-pulse" aria-hidden="true"><i></i><i></i><i></i></div>${rv(`<p class="st-eye">O resultado</p>`,0)}${rv(big(s.res,"int","st-xl"),200)}${rv(`<p class="st-unit">${esc(s.tipo)}</p>`,500)}${s.cpr?rv(`<p class="st-chip">${money(s.cpr)} ${s.porMil?"a cada mil pessoas":"por "+esc(singular(s.tipo))}</p>`,900):""}`;
  case "mix":return `${rv(`<p class="st-eye">Os resultados</p>`,0)}${rv(`<p class="st-lead">Cada objetivo trouxe o seu</p>`,150)}<div class="st-rows">${s.rows.map(([t,v],i)=>rv(`<div class="st-row"><span class="st-rv" data-count="${v}" data-fmt="int">${int(v)}</span><span class="st-rl">${esc(t)}</span></div>`,350+i*250)).join("")}</div>`;
  case "reach":{const per=Math.max(1,Math.ceil(s.alc/100));return `${rv(`<p class="st-eye">Alcance</p>`,0)}${rv(`<p class="st-lead">Sua marca chegou a</p>`,150)}${rv(big(s.alc,"int"),300)}${rv(`<p class="st-unit">pessoas diferentes</p>`,500)}${s.cpm?rv(`<p class="st-chip">${money(s.cpm)} a cada mil pessoas</p>`,700):""}<div class="st-dots" aria-hidden="true">${Array.from({length:100},(_,i)=>`<i style="--i:${i}"></i>`).join("")}</div>${rv(`<p class="st-sub">Cada ponto representa ${int(per)} ${per===1?"pessoa":"pessoas"}.${s.imp?` O anúncio apareceu <b>${int(s.imp)}</b> vezes${s.freq?`, em média ${s.freq.toLocaleString("pt-BR",{maximumFractionDigits:1})} vezes para cada pessoa`:""}.`:""}</p>`,900)}`;}
  case "days":{const mx=Math.max(...s.vals),w=100/s.vals.length;return `${rv(`<p class="st-eye">Dia a dia</p>`,0)}${rv(`<p class="st-lead">O melhor dia foi</p>`,150)}${rv(`<div class="st-big">${esc(s.best.data)}</div>`,300)}${rv(`<p class="st-unit"><span data-count="${s.vals[s.bi]}" data-fmt="int">${int(s.vals[s.bi])}</span> ${esc(s.label)}</p>`,500)}<svg class="st-bars-ch" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">${s.vals.map((v,i)=>{const h=Math.max(1.2,v/mx*56);return `<rect x="${(i*w+w*.14).toFixed(2)}" y="${(60-h).toFixed(2)}" width="${(w*.72).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6" class="${i===s.bi?"best":""}" style="--i:${i}"/>`;}).join("")}</svg>${rv(`<p class="st-sub">A média foi de ${int(s.avg)} por dia ao longo de ${s.vals.length} dias.</p>`,1100)}`;}
  case "people":{const mx=Math.max(...s.ag.map(r=>r.h+r.m));return `${rv(`<p class="st-eye">Público</p>`,0)}${rv(`<p class="st-lead">Quem mais ${/alcan/i.test(s.metric)?"viu seus anúncios":"respondeu"}</p>`,150)}${rv(`<div class="st-big st-md">${esc(s.best.g)}, ${esc(s.best.f)}</div>`,300)}<div class="st-hb">${s.ag.map((r,i)=>`<div class="st-hr" style="--i:${i}"><span>${esc(r.f)}</span><i><b style="--w:${((r.h+r.m)/mx*100).toFixed(1)}%"></b></i><em>${pct((r.h+r.m)/s.tot*100)}</em></div>`).join("")}</div>${s.menPct!==null?rv(`<p class="st-sub"><b>${pct(s.menPct)}</b> homens e <b>${pct(100-s.menPct)}</b> mulheres.</p>`,1300):""}`;}
  case "where":return `${rv(`<p class="st-eye">Onde</p>`,0)}${rv(`<p class="st-lead">Seu público está, principalmente, em</p>`,150)}${rv(`<div class="st-big st-md">${esc(s.rows[0].nome)}</div>`,300)}<div class="st-hb">${s.rows.map((r,i)=>`<div class="st-hr" style="--i:${i}"><span>${esc(r.nome)}</span><i><b style="--w:${(r.valor/s.rows[0].valor*100).toFixed(1)}%"></b></i><em>${pct(r.valor/s.tot*100)}</em></div>`).join("")}</div>${s.more>4?rv(`<p class="st-sub">E mais ${s.more-4} ${s.more-4===1?"região":"regiões"}.</p>`,1300):""}`;
  case "place":return `${rv(`<p class="st-eye">Onde apareceu</p>`,0)}${rv(`<p class="st-lead">Seu anúncio teve mais força em</p>`,150)}${rv(`<div class="st-big st-md">${esc(s.rows[0].nome)}</div>`,300)}<div class="st-hb">${s.rows.map((r,i)=>`<div class="st-hr" style="--i:${i}"><span>${esc(r.nome)}</span><i><b style="--w:${(r.valor/s.rows[0].valor*100).toFixed(1)}%"></b></i><em>${pct(r.valor/s.tot*100)}</em></div>`).join("")}</div>`;
  case "star":{const diff=s.avg?(1-s.x.cpr/s.avg)*100:null;return `${rv(`<p class="st-eye">Campanha destaque</p>`,0)}${rv(`<div class="st-big st-md">${esc(s.x.c.nome)}</div>`,200)}${rv(`<p class="st-unit"><span data-count="${s.x.r}" data-fmt="int">${int(s.x.r)}</span> ${esc(s.tipo)}</p>`,450)}${rv(`<p class="st-chip">${money(s.x.cpr*(s.porMil?1000:1))} ${s.porMil?"a cada mil pessoas":"por "+esc(singular(s.tipo))}</p>`,750)}${diff&&diff>=3?rv(`<p class="st-sub">${pct(diff)} mais barata que a média das ${s.n} campanhas.</p>`,1100):""}`;}
  case "cmp":return `${rv(`<p class="st-eye">Evolução</p>`,0)}${rv(`<p class="st-lead">Comparado a ${esc(s.per)}</p>`,150)}<div class="st-rows">${s.rows.map((r,i)=>rv(`<div class="st-row st-cmp ${r.good?"up":"down"}"><span class="st-rv">${r.v>=0?"+":"−"}${pct(Math.abs(r.v))}</span><span class="st-rl">${esc(r.l)}</span></div>`,350+i*250)).join("")}</div>`;
  case "end":return `<div class="st-ring" aria-hidden="true"></div>${rv(logoA.replace('class="st-alogo"','class="st-alogo st-alogo-lg"'),0)}${rv(`<p class="st-h2">Construindo sua presença no digital.</p>`,300)}${rv(`<button type="button" class="st-cta" data-act="full">Ver relatório completo</button>`,700)}${rv(`<button type="button" class="st-again" data-act="again">Ver de novo</button>`,900)}`;
 }
 return "";
}
function singular(t){t=String(t||"resultado").trim();const w=t.split(/\s+/)[0];const map={conversas:"conversa",pessoas:"pessoa",cadastros:"cadastro",compras:"compra",cliques:"clique",visualizações:"visualização",engajamentos:"engajamento",leads:"lead",resultados:"resultado",instalações:"instalação",reproduções:"reprodução",visitas:"visita",mensagens:"mensagem",seguidores:"seguidor"};return map[w.toLowerCase()]||"resultado";}
function fmtv(v,f){return f==="money"?money(v):f==="int"?int(v):String(v);}

/* ---------- retrospectiva (stories) ---------- */
function Story(P,onDone){
 const {S,client}=slidesFor(P);const B=brand(client.color);
 const el=document.createElement("div");el.className="stx";el.setAttribute("role","dialog");el.setAttribute("aria-label","Retrospectiva de resultados");
 el.style.setProperty("--br",B.hex);el.style.setProperty("--brgb",B.rgb);
 el.innerHTML=`<div class="st-card"><div class="st-glow" aria-hidden="true"></div>
  <div class="st-top"><div class="st-prog">${S.map(()=>`<i><b></b></i>`).join("")}</div>
  <div class="st-bar"><span class="st-who">${esc(client.name)}</span><button type="button" class="st-snd" data-act="pause" aria-label="Pausar">❚❚</button><button type="button" class="st-skip" data-act="full">Pular</button></div></div>
  ${S.map((s,i)=>`<section class="st-slide st-${s.k}" data-i="${i}" aria-hidden="true">${slideHTML(s,P)}</section>`).join("")}
  <button type="button" class="st-tap st-prev" data-act="prev" aria-label="Anterior"></button><button type="button" class="st-tap st-next" data-act="next" aria-label="Próxima"></button>
  <p class="st-hint" aria-hidden="true">Toque para avançar</p></div>`;
 document.body.appendChild(el);document.body.classList.add("st-open");
 const slides=[...el.querySelectorAll(".st-slide")],bars=[...el.querySelectorAll(".st-prog b")];
 let cur=-1,t0=0,elapsed=0,paused=false,raf=0,held=false;
 function counters(sl){sl.querySelectorAll("[data-count]").forEach(n=>{const to=Number(n.dataset.count),f=n.dataset.fmt;if(RM||!isFinite(to)){n.textContent=fmtv(to,f);return;}const st=performance.now(),dl=380,du=1300;n.textContent=fmtv(0,f);
  const step=t=>{const k=Math.min(1,Math.max(0,(t-st-dl)/du));const e=1-Math.pow(1-k,4);n.textContent=fmtv(f==="money"?to*e:Math.round(to*e),f);if(k<1)requestAnimationFrame(step);};requestAnimationFrame(step);});}
 function go(i){if(i<0)i=0;if(i>=S.length)return;
  if(cur>=0){slides[cur].classList.remove("on");slides[cur].setAttribute("aria-hidden","true");}
  cur=i;slides.forEach((s,j)=>{s.classList.toggle("past",j<i);});const sl=slides[i];
  void sl.offsetWidth;sl.classList.add("on");sl.setAttribute("aria-hidden","false");
  bars.forEach((b,j)=>{b.style.width=j<i?"100%":"0%";});elapsed=0;t0=performance.now();counters(sl);
  el.classList.toggle("st-last",i===S.length-1);el.classList.toggle("st-first",i===0);}
 function tick(t){raf=requestAnimationFrame(tick);const s=S[cur];if(!s||!s.dur)return;if(paused||held){t0=t-elapsed;return;}elapsed=t-t0;const k=Math.min(1,elapsed/s.dur);bars[cur].style.width=(k*100)+"%";if(k>=1)go(cur+1);}
 function close(){cancelAnimationFrame(raf);document.removeEventListener("keydown",onKey);el.classList.add("st-out");document.body.classList.remove("st-open");setTimeout(()=>el.remove(),RM?0:420);onDone&&onDone();}
 function onKey(e){if(e.key==="ArrowRight"||e.key===" "){e.preventDefault();go(cur+1);}else if(e.key==="ArrowLeft"){go(cur-1);}else if(e.key==="Escape"){close();}}
 el.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b)return;const a=b.dataset.act;
  if(a==="next")go(cur+1);else if(a==="prev")go(cur-1);else if(a==="full")close();else if(a==="again")go(0);
  else if(a==="pause"){paused=!paused;b.textContent=paused?"▶":"❚❚";b.setAttribute("aria-label",paused?"Continuar":"Pausar");}});
 el.addEventListener("pointerdown",e=>{if(e.target.closest(".st-tap"))held=true;});
 ["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,()=>{held=false;}));
 document.addEventListener("keydown",onKey);
 go(0);raf=requestAnimationFrame(tick);
}


/* ---------- recorte de período no próprio link ---------- */
const DK=["investimento","impressoes","cliques","cliques_link","resultados","conversas","leads","compras","valor_conversao","engajamentos","visualizacoes_pagina","thruplays"];
const MES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const isoD=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fromIso=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||"");return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
function diarioRows(P){const d=P.rep&&P.rep.data&&P.rep.data.diario;if(!d||!Array.isArray(d.r)||!Array.isArray(d.k))return [];return d.r.map(row=>{const o={};d.k.forEach((k,i)=>{o[k]=row[i];});return o;}).filter(o=>o._name&&o._d);}
function perLabel(a,b){const sy=a.getFullYear()===b.getFullYear(),sm=sy&&a.getMonth()===b.getMonth();
 if(sm&&a.getDate()===b.getDate())return `${a.getDate()} de ${MES[a.getMonth()]} de ${a.getFullYear()}`;
 return sm?`${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]} de ${b.getFullYear()}`:sy?`${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]} de ${b.getFullYear()}`:`${a.getDate()} de ${MES[a.getMonth()]} de ${a.getFullYear()} a ${b.getDate()} de ${MES[b.getMonth()]} de ${b.getFullYear()}`;}
function periodOptions(rows){const ds=[...new Set(rows.map(r=>r._d))].sort();if(ds.length<5)return [];const first=fromIso(ds[0]),last=fromIso(ds[ds.length-1]);
 const back=n=>{const a=new Date(last);a.setDate(a.getDate()-(n-1));return a<first?first:a;};const out=[{id:"all",l:"Tudo"}];
 if(ds.length>=10)out.push({id:"7",l:"Últimos 7 dias",a:back(7),b:last});
 if(ds.length>=21)out.push({id:"14",l:"Últimos 14 dias",a:back(14),b:last});
 const months=[...new Set(ds.map(x=>x.slice(0,7)))];
 if(months.length>=2)months.forEach(mk=>{const [y,m]=mk.split("-").map(Number);const a=new Date(Math.max(new Date(y,m-1,1),first)),b=new Date(Math.min(new Date(y,m,0),last));out.push({id:"m"+mk,l:cap(MES[m-1]),a,b});});
 return out;}
function cutPayload(P,rows,a,b){const A=isoD(a),B=isoD(b),d=P.rep.data,rs=rows.filter(r=>r._d>=A&&r._d<=B),byC=new Map();
 rs.forEach(r=>{const c=byC.get(r._name)||{};DK.forEach(k=>{const v=N(r[k]);if(v!==null)c[k]=(c[k]||0)+v;});byC.set(r._name,c);});
 const reachT=t=>/alcan/i.test(t||"");
 const camps=(d.campanhas||[]).filter(c=>c&&byC.has(c.nome)&&(byC.get(c.nome).investimento||0)>0).map(c=>{const sm=byC.get(c.nome);const o={...c};DK.forEach(k=>{o[k]=sm[k]??null;});o.alcance=null;o.frequencia=null;o.ctr=null;o.cpc=null;o.cpm=null;
  if(reachT(c.tipo_resultado)){o.resultados=null;o.custo_por_resultado=null;}else o.custo_por_resultado=N(o.resultados)?o.investimento/o.resultados:null;return o;});
 const T={};DK.forEach(k=>{const v=camps.map(c=>N(c[k])).filter(x=>x!==null);T[k]=v.length?v.reduce((x,y)=>x+y,0):null;});
 const tipos=[...new Set(camps.map(c=>c.tipo_resultado||""))],single=tipos.length===1&&!reachT(tipos[0]);
 if(!single){T.resultados=null;T.custo_por_resultado=null;}else T.custo_por_resultado=N(T.resultados)?T.investimento/T.resultados:null;
 T.alcance=null;T.frequencia=null;
 const data={...d,campanhas:camps,totais:T,serie_diaria:(d.serie_diaria||[]).filter(p=>p&&p.iso&&p.iso>=A&&p.iso<=B),publico:{},video:null,metas:undefined,anterior:undefined,diario:undefined,custo_por_mil:false,alcance_somado:false,observacoes:"",tipo_resultado:single?tipos[0]:d.tipo_resultado,objetivo_principal:single?d.objetivo_principal:null};
 return {...P,prev:null,rep:{...P.rep,periodo:perLabel(a,b),data,analise:{}}};}

/* ---------- página ---------- */
async function main(){
 const token=tokenOf();
 if(!token){fail("Link incompleto","Confira se o link do relatório foi copiado inteiro.");return;}
 let P=null;
 try{P=await load(token);}catch(e){fail("Não foi possível abrir o relatório","Verifique sua conexão e tente de novo em instantes.");return;}
 if(!P||!P.rep){fail("Relatório indisponível","Este link não está mais ativo. Fale com a ETERNAL para receber o link atualizado.");return;}
 const c=P.client||{};document.title=`${c.name||"Relatório"} · ${P.rep.periodo||"Resultados"} | ETERNAL`;
 const B=brand(c.color);document.documentElement.style.setProperty("--br",B.hex);
 $("#boot").remove();
 const root=$("#root");root.hidden=false;
 const rows=diarioRows(P),opts=periodOptions(rows);let cur="all",dash=null;
 const bar=document.createElement("div");bar.className="rl-bar";
 bar.innerHTML=`${opts.length?`<div class="rl-per" role="group" aria-label="Período do relatório"><span class="rl-pl">Período</span>${opts.map(o=>`<button type="button" class="rl-chip" data-per="${o.id}" aria-pressed="${o.id==="all"}">${esc(o.l)}</button>`).join("")}</div>`:""}<button type="button" class="rl-replay">▶ Ver a retrospectiva</button>`;root.before(bar);
 const note=document.createElement("p");note.className="rl-note";note.hidden=true;bar.after(note);
 const mountWith=pl=>{try{if(dash&&dash.dispose)dash.dispose();root.innerHTML="";dash=window.EternalDash.mount(root,{...pl,version:"cliente"});}
  catch(e){root.innerHTML=`<p class="rl-err">Não foi possível montar o painel neste navegador. Tente abrir no Chrome, Safari ou Edge.</p>`;}};
 mountWith(P);
 bar.addEventListener("click",e=>{const b=e.target.closest("[data-per]");if(!b||b.dataset.per===cur)return;cur=b.dataset.per;const o=opts.find(x=>x.id===cur);
  bar.querySelectorAll("[data-per]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.per===cur)));
  const y=window.scrollY;if(!o||o.id==="all"){mountWith(P);note.hidden=true;}
  else{mountWith(cutPayload(P,rows,o.a,o.b));note.hidden=false;note.textContent=`Mostrando ${perLabel(o.a,o.b)}. Público, regiões, horários e alcance aparecem só em "Tudo", porque não dá para somar pessoas dia a dia sem contar a mesma pessoa duas vezes.`;}
  requestAnimationFrame(()=>window.scrollTo(0,y));});
 const skip=new URLSearchParams(location.search).has("painel");
 const open=()=>Story(P,()=>{window.scrollTo(0,0);});
 bar.querySelector(".rl-replay").addEventListener("click",open);
 if(!skip)open();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",main);else main();
})();
