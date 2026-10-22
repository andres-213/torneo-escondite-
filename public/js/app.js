const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function sample(){
  const gA={id:uid(),name:'Grupo A',day:1}, gB={id:uid(),name:'Grupo B',day:2};
  const mk=(n,g,a,b)=>({id:uid(),name:n,p1:a,p2:b,groupId:g.id,eliminated:false});
  const clans=[mk('Clan Fénix',gA,'Jugador 1','Jugador 2'),mk('Clan Sombra',gA,'Jugador 3','Jugador 4'),mk('Clan Corona',gA,'Jugador 5','Jugador 6'),
    mk('Clan Daga',gA,'Jugador 7','Jugador 8'),mk('Clan Eclipse',gA,'Jugador 9','Jugador 10'),
    mk('Clan Cadenas',gB,'Jugador 11','Jugador 12'),mk('Clan Rubí',gB,'Jugador 13','Jugador 14'),mk('Clan Halo',gB,'Jugador 15','Jugador 16'),mk('Clan Vórtice',gB,'Jugador 17','Jugador 18')];
  const r=(c,s,k,ka=false)=>({clanId:c.id,surv:s,kills:k,killAll:ka,played:true});
  const rounds=[
    {id:uid(),groupId:gA.id,day:1,map:'Skeld',ts:Date.now()-7200e3,results:[r(clans[0],2,1),r(clans[1],0,2),r(clans[2],1,0),r(clans[3],0,1),r(clans[4],0,0)]},
    {id:uid(),groupId:gA.id,day:1,map:'Polus',ts:Date.now()-3600e3,results:[r(clans[0],0,0),r(clans[1],1,0),r(clans[2],0,3),r(clans[3],0,0),r(clans[4],0,1)]},
  ];
  return {sample:true,groups:[gA,gB],clans,rounds,day1Closed:false};
}

/* ---------- Conexión con el servidor ---------- */
let S={groups:[],clans:[],rounds:[],day1Closed:false}, REV=0, ME=null, ADMINS=[], ADMIN_COUNT=0, MAX_ADMINS=3;
async function api(method,url,body){
  try{
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
    let d={};try{d=await r.json()}catch(e){}
    return {ok:r.ok,status:r.status,d};
  }catch(e){return {ok:false,status:0,d:{error:'Sin conexión con el servidor'}}}
}
function apply(d){S=d.state;REV=d.rev;ME=d.me;ADMINS=d.admins||[];ADMIN_COUNT=d.adminCount;MAX_ADMINS=d.maxAdmins}
let pending=0, chain=Promise.resolve();
function save(){
  if(!ME)return;
  pending++;
  chain=chain.then(async()=>{
    const r=await api('PUT','/api/state',{rev:REV,state:S});
    if(r.ok)REV=r.d.rev;
    else if(r.status===409){apply(r.d);renderAll();toast('Otro admin hizo cambios: se recargaron los datos')}
    else{toast(r.d.error||'No se pudo guardar');const g=await api('GET','/api/state');if(g.ok){apply(g.d);renderAll()}}
  }).finally(()=>pending--);
}
async function poll(){
  if(pending)return;
  const r=await api('GET','/api/state');
  if(r.ok&&!pending&&(r.d.rev!==REV||r.d.adminCount!==ADMIN_COUNT||(r.d.me&&r.d.me.id)!==(ME&&ME.id))){apply(r.d);renderAll({keepDraft:true})}
}

function toast(t){const el=document.getElementById('toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2200)}

/* ---------- Administradores ---------- */
const me=()=>ME;
const isAdmin=()=>!!ME;
function guard(){if(isAdmin())return true;toast('Solo un administrador puede hacer esto');return false}

/* ---------- Puntaje ---------- */
function scoreRound(round){
  const total=round.results.filter(x=>x.played).reduce((a,x)=>a+(+x.surv||0),0);
  const skeld=round.map==='Skeld';
  return round.results.map(x=>{
    const items=[];let pts=0;const add=(p,t)=>{pts+=p;items.push(`${t} +${p}`)};
    if(!x.played) return {clanId:x.clanId,pts:0,items:['No participó']};
    if(x.surv==2)add(5,'Sobrevive la pareja');
    else if(x.surv==1){ if(total===1)add(5,'Único tripulante (cuenta como pareja)'); else add(2,'Sobrevive 1 solo'); }
    if(x.kills>0)add(3*x.kills,`${x.kills} kill${x.kills>1?'s':''}`);
    if(x.killAll){add(20,'Kill a todos');add(10,'Recompensa');}
    if(skeld){ if(x.surv==2)add(10,'Bonus Skeld pareja'); else if(x.surv==1)add(5,'Bonus Skeld solo'); else add(1,'Bonus Skeld participó'); }
    return {clanId:x.clanId,pts,items};
  });
}
function totals(){
  const t={};S.clans.forEach(c=>t[c.id]={pts:0,rounds:0,kills:0,d1:0});
  S.rounds.forEach(r=>scoreRound(r).forEach((s,i)=>{const o=t[s.clanId];if(!o)return;o.pts+=s.pts;if(r.results[i].played)o.rounds++;o.kills+=+r.results[i].kills||0;if(r.day==1)o.d1+=s.pts;}));
  return t;
}
const groupName=id=>id==='__active'?'Todas las parejas':(S.groups.find(g=>g.id===id)||{}).name||'Sin grupo';

/* ---------- Tabs ---------- */
function showTab(name){
  if((name==='ronda'||name==='grupos')&&!isAdmin())name='tabla';
  document.querySelectorAll('#tabs button').forEach(x=>x.setAttribute('aria-selected',x.dataset.tab===name));
  ['tabla','ronda','grupos','reglas'].forEach(t=>document.getElementById('tab-'+t).hidden=t!==name);
  if(name==='ronda')buildRound();
}
document.getElementById('tabs').addEventListener('click',e=>{
  const b=e.target.closest('button[data-tab]');if(!b)return;
  showTab(b.dataset.tab);
});

/* ---------- Acceso de administrador ---------- */
function renderAuth(){
  const a=me(), first=!ADMIN_COUNT;
  document.body.classList.toggle('is-admin',!!a);
  document.getElementById('authBar').innerHTML=a
    ?`<span>Administrador: <b>${esc(a.name)}</b></span><button class="btn sm ghost" data-auth="logout">Cerrar sesión</button>`
    :`<span>Modo espectador</span><button class="btn sm ghost" data-auth="show">${first?'Crear administrador':'Acceso administrador'}</button>`;
  document.getElementById('authTitle').textContent=first?'Crear primer administrador':'Acceso de administrador';
  document.getElementById('authHint').textContent=first?'Aún no hay administradores. El primero que se cree podrá manejar todo el sistema.':'Solo los administradores pueden registrar rondas, editar grupos y manejar el torneo.';
  document.getElementById('authSubmit').textContent=first?'Crear y entrar':'Entrar';
  document.getElementById('aPass').autocomplete=first?'new-password':'current-password';
  if(a)document.getElementById('authPanel').hidden=true;
}
document.getElementById('authBar').addEventListener('click',async e=>{
  const b=e.target.closest('[data-auth]');if(!b)return;
  if(b.dataset.auth==='logout'){const r=await api('POST','/api/logout');if(r.ok)apply(r.d);renderAll();toast('Sesión cerrada')}
  else{const p=document.getElementById('authPanel');p.hidden=!p.hidden;if(!p.hidden)document.getElementById('aUser').focus()}
});
document.getElementById('btnAuthCancel').addEventListener('click',()=>document.getElementById('authPanel').hidden=true);
document.getElementById('formAuth').addEventListener('submit',async e=>{
  e.preventDefault();
  const user=document.getElementById('aUser').value.trim(), password=document.getElementById('aPass').value;
  if(!user||!password)return;
  const r=await api('POST','/api/login',{user,password});
  if(!r.ok){toast(r.d.error||'No se pudo entrar');return}
  apply(r.d);document.getElementById('formAuth').reset();renderAll();toast('Bienvenido, '+ME.name);
});

/* ---------- Gestión de administradores ---------- */
function renderAdmins(){
  document.getElementById('adminCount').textContent=`${ADMINS.length} de ${MAX_ADMINS} administradores`;
  document.getElementById('formAdmin').hidden=ADMINS.length>=MAX_ADMINS;
  document.getElementById('adminFull').hidden=ADMINS.length<MAX_ADMINS;
  const mine=ME&&ME.id;
  document.getElementById('adminList').innerHTML=ADMINS.map(a=>`<div class="clan-line"><span>${esc(a.name)}${a.id===mine?' <small>· tú</small>':''}</span>
    ${a.id===mine||ADMINS.length<2?'':`<button class="btn sm ghost" data-deladmin="${a.id}">Quitar</button>`}</div>`).join('');
}
document.getElementById('adminList').addEventListener('click',e=>{
  const b=e.target.closest('[data-deladmin]');if(!b||!guard())return;
  arm(b,'¿Quitar admin?',async()=>{
    const r=await api('DELETE','/api/admins/'+encodeURIComponent(b.dataset.deladmin));
    if(!r.ok){toast(r.d.error||'No se pudo quitar');return}
    apply(r.d);renderAll();toast('Administrador quitado');
  });
});
document.getElementById('formAdmin').addEventListener('submit',async e=>{
  e.preventDefault();if(!guard())return;
  const name=document.getElementById('adName').value.trim(), password=document.getElementById('adPass').value;
  if(!name||!password)return;
  const r=await api('POST','/api/admins',{name,password});
  if(!r.ok){toast(r.d.error||'No se pudo agregar');return}
  apply(r.d);e.target.reset();renderAll();toast('Administrador agregado');
});

/* ---------- Leaderboard ---------- */
function renderBoard(){
  const f=document.getElementById('lbFilter');const cur=f.value;
  f.innerHTML='<option value="all">Todos los grupos</option>'+S.groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  f.value=[...f.options].some(o=>o.value===cur)?cur:'all';
  const t=totals();
  let list=S.clans.filter(c=>f.value==='all'||c.groupId===f.value);
  list.sort((a,b)=>(a.eliminated-b.eliminated)||(t[b.id].pts-t[a.id].pts)||(t[b.id].kills-t[a.id].kills));
  const el=document.getElementById('leaderboard');
  if(!list.length){el.innerHTML='<div class="empty">Aún no hay parejas. Agrégalas en <b>Grupos y parejas</b>.</div>';return}
  const anyPts=list.some(c=>t[c.id].pts>0);
  el.innerHTML=(S.sample?'<div class="note" style="margin-bottom:4px">Estos son <strong>datos de ejemplo</strong>. Bórralos en Grupos y parejas → Borrar todo, y agrega tus grupos reales.</div>':'')+
  list.map((c,i)=>{const o=t[c.id];const top=i===0&&!c.eliminated&&anyPts;
    return `<div class="lb-row ${top?'top':''} ${c.eliminated?'out':''}">
      <div class="rk">${c.eliminated?'✕':i+1}</div>
      <div class="nm"><b>${esc(c.name)}${top?'<span class="pill win">Líder</span>':''}${c.eliminated?'<span class="pill out">Eliminada</span>':''}</b>
      <small>${esc(groupName(c.groupId))} · ${esc(c.p1||'—')} & ${esc(c.p2||'—')} · ${o.rounds} ronda${o.rounds==1?'':'s'} · ${o.kills} kills</small></div>
      <div class="tot">${o.pts}<em>puntos</em></div></div>`}).join('');
}
document.getElementById('lbFilter').addEventListener('change',renderBoard);

/* ---------- Historial ---------- */
function renderHistory(){
  const el=document.getElementById('history');
  if(!S.rounds.length){el.innerHTML='<div class="empty">Sin rondas registradas. Ve a <b>Registrar ronda</b>.</div>';return}
  const cn=id=>(S.clans.find(c=>c.id===id)||{}).name||'(pareja borrada)';
  el.innerHTML=[...S.rounds].reverse().map((r,i)=>{const sc=scoreRound(r);const n=S.rounds.length-i;
    return `<div class="hist-item"><div class="hh"><b>Ronda ${n} · ${esc(groupName(r.groupId))} · ${esc(r.map)} · Día ${r.day}</b>
      ${isAdmin()?`<span class="row-actions"><button class="btn sm ghost" data-del="${r.id}">Borrar</button></span>`:''}</div>
      <ul>${sc.filter(s=>s.pts>0).sort((a,b)=>b.pts-a.pts).map(s=>`<li><strong>${esc(cn(s.clanId))}: +${s.pts}</strong> — ${esc(s.items.join(', '))}</li>`).join('')||'<li>Nadie sumó puntos</li>'}</ul></div>`}).join('');
}
document.getElementById('history').addEventListener('click',e=>{
  const b=e.target.closest('[data-del]');if(!b||!guard())return;
  if(b.dataset.armed){S.rounds=S.rounds.filter(r=>r.id!==b.dataset.del);save();renderAll();toast('Ronda borrada')}
  else{b.dataset.armed=1;b.textContent='¿Seguro?';b.classList.add('warn');setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent='Borrar';b.classList.remove('warn')}},3000)}
});

/* ---------- Cerrar día ---------- */
function renderControl(){
  document.getElementById('dayTag').textContent=S.day1Closed?'Día 2 en curso · Día 1 cerrado':'Día 1 en curso';
  const b=document.getElementById('btnCloseDay');
  b.textContent=S.day1Closed?'Reabrir día 1':'Cerrar día 1';
  b.className=S.day1Closed?'btn ghost':'btn';
  document.getElementById('elimCount').disabled=S.day1Closed;
  const d1=S.groups.filter(g=>g.day==1).map(g=>g.name), d2=S.groups.filter(g=>g.day==2).map(g=>g.name);
  const cnt=id=>S.clans.filter(c=>c.groupId===id).length;
  document.getElementById('fmtA').textContent=S.groups.filter(g=>g.day==1).map(g=>`${g.name} · ${cnt(g.id)} clanes`).join(' / ')||'Sin grupo';
  document.getElementById('fmtB').textContent=S.groups.filter(g=>g.day==2).map(g=>`${g.name} · ${cnt(g.id)} clanes`).join(' / ')||'Sin grupo';
  document.getElementById('subline').textContent=`Jueves 22: ${d1.join(', ')||'—'} · Viernes 23: ${d2.join(', ')||'—'} · puntos acumulados`;
}
function day1Candidates(){
  const t=totals();
  const d1g=new Set(S.groups.filter(g=>g.day==1).map(g=>g.id));
  const played=new Set(S.rounds.filter(r=>r.day==1).flatMap(r=>r.results.filter(x=>x.played).map(x=>x.clanId)));
  return S.clans.filter(c=>!c.eliminated&&(d1g.has(c.groupId)||played.has(c.id))).sort((a,b)=>(t[a.id].pts-t[b.id].pts)||(t[a.id].kills-t[b.id].kills));
}
document.getElementById('btnCloseDay').addEventListener('click',()=>{
  if(!guard())return;
  if(S.day1Closed){S.clans.forEach(c=>{if(c.elimDay1)c.eliminated=false,delete c.elimDay1});S.day1Closed=false;save();renderAll();toast('Día 1 reabierto');return}
  const n=Math.max(0,+document.getElementById('elimCount').value||0);
  const out=day1Candidates().slice(0,n);
  document.getElementById('closeMsg').textContent=out.length?`Se eliminarán: ${out.map(c=>c.name).join(', ')}.`:'No hay parejas para eliminar. ¿Cerrar igual?';
  document.getElementById('closeConfirm').hidden=false;
});
document.getElementById('btnCloseNo').addEventListener('click',()=>document.getElementById('closeConfirm').hidden=true);
document.getElementById('btnCloseYes').addEventListener('click',()=>{
  if(!guard())return;
  const n=Math.max(0,+document.getElementById('elimCount').value||0);
  day1Candidates().slice(0,n).forEach(c=>{c.eliminated=true;c.elimDay1=true});
  S.day1Closed=true;save();document.getElementById('closeConfirm').hidden=true;
  document.getElementById('rDay').value='2';renderAll();toast('Día 1 cerrado');
});

/* ---------- Ronda ---------- */
let draft=null;
function buildRound(){
  const gs=document.getElementById('rGroup');const cur=gs.value;
  gs.innerHTML=S.groups.map(g=>`<option value="${g.id}">${esc(g.name)} (Día ${g.day})</option>`).join('')+'<option value="__active">Todas las parejas activas</option>';
  if([...gs.options].some(o=>o.value===cur))gs.value=cur;
  else{const g=S.groups.find(g=>g.day==(S.day1Closed?2:1));if(g)gs.value=g.id}
  document.getElementById('rDay').value=S.day1Closed?'2':'1';
  resetDraft();
}
function resetDraft(){
  const gid=document.getElementById('rGroup').value;
  const cl=S.clans.filter(c=>!c.eliminated&&(gid==='__active'||c.groupId===gid));
  draft=cl.map(c=>({clanId:c.id,surv:0,kills:0,killAll:false,played:true}));
  renderRound();
}
function renderRound(){
  const el=document.getElementById('roundRows');
  if(!draft.length){el.innerHTML='<div class="empty">Este grupo no tiene parejas activas. Agrégalas en <b>Grupos y parejas</b>.</div>';document.getElementById('soloNote').hidden=true;return}
  const map=document.getElementById('rMap').value;
  const sc=scoreRound({map,results:draft});
  el.innerHTML=draft.map((x,i)=>{const c=S.clans.find(c=>c.id===x.clanId);
    return `<div class="rr" data-i="${i}">
      <div class="nm"><b>${esc(c.name)}</b><small>${esc(c.p1||'—')} & ${esc(c.p2||'—')}</small></div>
      <div class="f">Sobreviven<div class="seg">${[0,1,2].map(v=>`<button type="button" data-surv="${v}" class="${x.surv==v?'on':''}" aria-pressed="${x.surv==v}">${v}</button>`).join('')}</div></div>
      <div class="f"><label for="k${i}" style="all:unset">Kills</label><input id="k${i}" type="number" min="0" value="${x.kills}" data-kills></div>
      <div class="f"><label for="ka${i}" style="all:unset">Kill a todos</label><input id="ka${i}" type="checkbox" ${x.killAll?'checked':''} data-ka></div>
      <div class="f"><label for="pl${i}" style="all:unset">Participó</label><input id="pl${i}" type="checkbox" ${x.played?'checked':''} data-pl></div>
      <div class="live">+${sc[i].pts}</div></div>`}).join('');
  const tot=draft.filter(x=>x.played).reduce((a,x)=>a+x.surv,0);
  const n=document.getElementById('soloNote');
  n.hidden=tot!==1;
  n.innerHTML='★ Solo sobrevivió <strong>un único tripulante</strong> en la ronda: se le cuenta como pareja (<strong>+5</strong> en vez de +2).';
}
document.getElementById('roundRows').addEventListener('click',e=>{
  const b=e.target.closest('[data-surv]');if(!b)return;
  const i=+b.closest('.rr').dataset.i;draft[i].surv=+b.dataset.surv;renderRound();
});
document.getElementById('roundRows').addEventListener('change',e=>{
  const row=e.target.closest('.rr');if(!row)return;const x=draft[+row.dataset.i];
  if(e.target.matches('[data-kills]'))x.kills=Math.max(0,parseInt(e.target.value)||0);
  if(e.target.matches('[data-ka]'))x.killAll=e.target.checked;
  if(e.target.matches('[data-pl]')){x.played=e.target.checked;if(!x.played){x.surv=0;x.kills=0;x.killAll=false}}
  renderRound();
});
document.getElementById('rGroup').addEventListener('change',resetDraft);
document.getElementById('rMap').addEventListener('change',renderRound);
document.getElementById('btnResetRound').addEventListener('click',resetDraft);
document.getElementById('btnSaveRound').addEventListener('click',()=>{
  if(!guard())return;
  if(!draft.length){toast('No hay parejas en este grupo');return}
  S.rounds.push({id:uid(),groupId:document.getElementById('rGroup').value,day:+document.getElementById('rDay').value,map:document.getElementById('rMap').value,ts:Date.now(),results:draft.map(x=>({...x}))});
  save();renderAll();resetDraft();toast('Ronda guardada');
});

/* ---------- Grupos ---------- */
function renderGroups(){
  const cs=document.getElementById('cGroup');const cur=cs.value;
  cs.innerHTML=S.groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  if([...cs.options].some(o=>o.value===cur))cs.value=cur;
  const el=document.getElementById('groupsList');
  if(!S.groups.length){el.innerHTML='<div class="empty">No hay grupos. Crea el primero con el formulario.</div>';return}
  const t=totals();
  el.innerHTML=S.groups.map(g=>{const cl=S.clans.filter(c=>c.groupId===g.id);
    return `<div class="group-card"><header><span class="gname">${esc(g.name)}</span>
      <span class="row-actions"><span class="chip">Día ${g.day} · ${g.day==1?'Jueves 22':'Viernes 23'}</span><span class="chip dim">${cl.length} clanes</span>
      <button class="btn sm ghost" data-delg="${g.id}">Borrar grupo</button></span></header>
      ${cl.map(c=>`<div class="clan-line"><span>${esc(c.name)} <small>· ${esc(c.p1||'—')} & ${esc(c.p2||'—')} · ${t[c.id].pts} pts${c.eliminated?' · eliminada':''}</small></span>
        <button class="btn sm ghost" data-delc="${c.id}">Quitar</button></div>`).join('')||'<div class="clan-line"><small>Sin parejas todavía.</small></div>'}
    </div>`}).join('');
}
function arm(b,label,fn){if(b.dataset.armed){fn()}else{b.dataset.armed=1;const o=b.textContent;b.textContent=label;b.classList.add('warn');setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent=o;b.classList.remove('warn')}},3000)}}
document.getElementById('groupsList').addEventListener('click',e=>{
  const g=e.target.closest('[data-delg]'),c=e.target.closest('[data-delc]');
  if(!guard())return;
  if(g)arm(g,'¿Borrar con sus parejas?',()=>{const ids=new Set(S.clans.filter(c=>c.groupId===g.dataset.delg).map(c=>c.id));S.groups=S.groups.filter(x=>x.id!==g.dataset.delg);S.clans=S.clans.filter(c=>!ids.has(c.id));S.sample=false;save();renderAll();toast('Grupo borrado')});
  if(c)arm(c,'¿Quitar?',()=>{S.clans=S.clans.filter(x=>x.id!==c.dataset.delc);S.sample=false;save();renderAll();toast('Pareja quitada')});
});
document.getElementById('formGroup').addEventListener('submit',e=>{
  e.preventDefault();if(!guard())return;const n=document.getElementById('gName').value.trim();if(!n)return;
  S.groups.push({id:uid(),name:n,day:+document.getElementById('gDay').value});S.sample=false;
  document.getElementById('gName').value='';save();renderAll();document.getElementById('cGroup').value=S.groups.at(-1).id;toast('Grupo agregado');
});
document.getElementById('formClan').addEventListener('submit',e=>{
  e.preventDefault();if(!guard())return;const n=document.getElementById('cName').value.trim();const g=document.getElementById('cGroup').value;
  if(!g){toast('Primero crea un grupo');return}if(!n)return;
  S.clans.push({id:uid(),name:n,p1:document.getElementById('cP1').value.trim(),p2:document.getElementById('cP2').value.trim(),groupId:g,eliminated:false});S.sample=false;
  ['cName','cP1','cP2'].forEach(i=>document.getElementById(i).value='');save();renderAll();toast('Pareja agregada');document.getElementById('cName').focus();
});
document.getElementById('btnSample').addEventListener('click',()=>{if(!guard())return;S=sample();save();renderAll();toast('Ejemplo cargado')});
document.getElementById('btnWipe').addEventListener('click',()=>{if(guard())document.getElementById('wipeConfirm').hidden=false});
document.getElementById('btnWipeNo').addEventListener('click',()=>document.getElementById('wipeConfirm').hidden=true);
document.getElementById('btnWipeYes').addEventListener('click',()=>{if(!guard())return;S={groups:[],clans:[],rounds:[],day1Closed:false};save();document.getElementById('wipeConfirm').hidden=true;renderAll();toast('Todo borrado')});

function renderAll(opts={}){
  renderAuth();
  if(!isAdmin()&&(!document.getElementById('tab-ronda').hidden||!document.getElementById('tab-grupos').hidden))showTab('tabla');
  renderBoard();renderHistory();renderControl();renderGroups();renderAdmins();
  if(!document.getElementById('tab-ronda').hidden&&!opts.keepDraft)buildRound();
}
(async()=>{
  const r=await api('GET','/api/state');
  if(r.ok)apply(r.d);else toast(r.d.error||'No se pudo cargar el torneo');
  renderAll();
  setInterval(poll,5000);
})();
