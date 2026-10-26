'use strict';
const path=require('path'),migrate=require('./settings_migrator');
const INTERVAL=210000,REPLY=5000;
const id=value=>{try{const n=BigInt(value);return n>0n?n.toString():null;}catch(_){return null;}};
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const position=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))?{x:p.x,y:p.y,z:p.z}:null;
module.exports=function PetCompanion(mod){
 for(const name of ['C_REQUEST_SPAWN_SERVANT.1','C_REQUEST_SPAWN_SERVANT.2','C_START_SERVANT_ACTIVE_SKILL.1','C_START_SERVANT_ACTIVE_SKILL.2','S_START_COOLTIME_SERVANT_SKILL.1','S_UPDATE_SERVANT_INFO.1']){
  const [packet,v]=name.split('.');mod.dispatch.addDefinition(packet,Number(v),path.join(__dirname,'defs',name+'.def'));
 }
 const normalized=migrate(4,4,mod.settings);for(const k of Object.keys(mod.settings))delete mod.settings[k];Object.assign(mod.settings,normalized);mod.game.initialize('inventory');
 const version=mod.majorPatchVersion>=100?2:1,hooks=[],listeners=[],roster=new Set(),buffs=new Map();
 let key=null,owner=null,active=null,loc=null,w=0,ready=false,online=false,closed=false,timer=null,epoch=0;
 let want=true,attempts=0,choice=null,sending=false,pending=null,failures=0,lastFeed=-Infinity,feedWarned=false,rosterSeen=false;
 let recentUse=null,retryAfter=0,recover=true,loginCooldown=null;
 const profile=()=>key&&mod.settings.profiles[key];
 const selected=()=>{const p=profile();return p&&p.pets[p.lastPet];};
 const current=()=>{const p=profile();return active&&p&&p.pets[active.dbid];};
 const message=text=>mod.command.message('[Pet Companion] '+text);
 const hook=(...args)=>hooks.push(mod.hook(...args));
 const listen=(emitter,name,fn)=>{emitter.on(name,fn);listeners.push([emitter,name,fn]);};
 function save(){try{mod.saveSettings();}catch(e){mod.error('Pet profile could not be saved: '+e.message);}}
 function stop(){if(timer!==null)mod.clearTimeout(timer);timer=null;}
 function schedule(ms){stop();if(closed)return;const token=epoch;timer=mod.setTimeout(()=>{timer=null;if(!closed&&token===epoch)drive();},Math.max(1,ms));}
 function allowed(){return online&&ready&&!mod.game.isInLoadingScreen&&mod.game.me.alive!==false&&!mod.game.me.mounted&&!mod.game.contract?.active;}
 function send(name,packet){sending=true;try{return mod.send(name,version,packet)!==false;}catch(e){mod.error(name+': '+e.message);return false;}finally{sending=false;}}
 function reset(){epoch++;stop();active=null;loc=null;ready=false;pending=null;recentUse=null;choice=null;failures=0;retryAfter=0;recover=true;loginCooldown=null;attempts=0;lastFeed=-Infinity;feedWarned=false;}
 function presence(pet){
  if(!pet.buffIds.length)return null;
  return pet.buffIds.some(buffId=>(buffs.get(buffId)||0)>Date.now());
 }
 function useMatches(use){return use&&active&&use.key===key&&use.dbid===active.dbid&&use.skill===current()?.skill&&Date.now()-use.at<=REPLY;}
 function confirmUse(use,fromBuff){
  if(!useMatches(use))return;
  const pet=current();
  // A request is not a successful cast. Start the clock from server evidence,
  // preferring the actual buff application if it follows the cooldown reply.
  if(!use.confirmed||fromBuff&&!use.buffConfirmed){
   pet.lastUsedAt=Date.now();pet.nextBuffAt=pet.lastUsedAt+INTERVAL;
  }
  use.confirmed=true;if(fromBuff)use.buffConfirmed=true;
  if(pending===use)pending=null;
  failures=0;retryAfter=0;recover=false;save();schedule(1);
 }
 function failedUse(){
  failures++;retryAfter=Date.now()+(failures>=3?INTERVAL:15000);
  if(failures>=3){failures=0;message('Buff not confirmed; next attempt is in 3:30.');}
 }
 function watchBuff(e,ended){
  if(!online||e.target!==owner||!positive(e.id))return;
  if(ended)buffs.delete(e.id);
  else {const duration=Number(e.duration);if(!Number.isFinite(duration)||duration<0)return;buffs.set(e.id,Date.now()+duration);}
  const pet=current();if(!pet||!positive(pet.skill))return;
  const request=useMatches(recentUse)?recentUse:null;
  // Learn effects only when our own pet applies them after its active-skill
  // request. Unrelated class/party buffs must not become pet buff identities.
  if(!ended&&request&&e.source===active.gameId&&(buffs.get(e.id)||0)>Date.now()&&!pet.buffIds.includes(e.id)&&pet.buffIds.length<16){pet.buffIds.push(e.id);save();}
  if(!pet.buffIds.includes(e.id))return;
  const ownSource=e.source==null||e.source===0n||e.source===owner||e.source===active.gameId;
  if(!ended&&request&&ownSource&&(buffs.get(e.id)||0)>Date.now()){confirmUse(request,true);return;}
  if(presence(pet)===false)recover=true;
  schedule(1);
 }
 function drive(){
  const p=profile();if(closed||!online||!p||!mod.settings.enabled||!p.enabled)return;
  if(!allowed()){schedule(5000);return;}
  if(choice){const remaining=REPLY-(Date.now()-choice.at);if(remaining>0){schedule(remaining);return;}choice=null;}
  if(!active){
   const pet=selected();if(!want||!pet)return;
   if(rosterSeen&&!roster.has(pet.dbid)){want=false;message('Saved pet is unavailable on this character. Summon another pet to update the profile.');return;}
   if(attempts>=3){want=false;message('Summon not confirmed. Retries paused until the next area/login.');return;}
   const unique=BigInt(pet.dbid);if(unique>0xffffffffn){want=false;message('Pet ID exceeds the installed summon protocol; request skipped.');return;}
   attempts++;send('C_REQUEST_SPAWN_SERVANT',{counter:0,unk:0,unk1:0,servantId:pet.id,uniqueId:Number(BigInt.asIntN(32,unique))});schedule(1500);return;
  }
  const pet=current();if(!pet||!positive(pet.skill))return;
  if(pending){
   const remaining=REPLY-(Date.now()-pending.at);if(remaining>0){schedule(remaining);return;}
   pending=null;recentUse=null;failedUse();
  }
  const present=presence(pet),missing=present===false||recover&&present!==true;
  const due=Math.max(missing?0:pet.nextBuffAt||0,pet.cooldownUntil||0,retryAfter);
  if(due>Date.now()){
   const expires=present===true?Math.max(...pet.buffIds.map(buffId=>buffs.get(buffId)||0)):Infinity;
   schedule(Math.min(due-Date.now(),Math.max(1,expires-Date.now()+1)));return;
  }
  const at=Date.now(),request={key,dbid:active.dbid,skill:pet.skill,at,auto:true};pending=recentUse=request;
  const sent=send('C_START_SERVANT_ACTIVE_SKILL',{unk1:0,unk2:0,gameId:active.gameId,skill:pet.skill});
  if(!sent&&pending===request){pending=null;recentUse=null;failedUse();}
  schedule(pending?REPLY:sent?1:Math.max(1,retryAfter-Date.now()));
 }
 hook('S_LOGIN',14,e=>{
  reset();buffs.clear();online=true;owner=e.gameId;key=e.serverId+':'+e.playerId;roster.clear();rosterSeen=Array.isArray(e.servants);
  for(const pet of e.servants||[]){const db=id(pet.dbid);if(db)roster.add(db);}
  if(!mod.settings.profiles[key])mod.settings.profiles[key]={name:e.name||'',enabled:true,lastPet:null,pets:{}};
  profile().name=e.name||profile().name;want=true;
  if(profile().lastPet)loginCooldown={key,dbid:profile().lastPet,until:Date.now()+15000};save();
 });
 const realBuff={filter:{fake:false,modified:null,silenced:null}};
 hook('S_ABNORMALITY_BEGIN',mod.majorPatchVersion<=106?4:5,realBuff,e=>watchBuff(e,false));
 hook('S_ABNORMALITY_REFRESH',2,realBuff,e=>watchBuff(e,false));
 hook('S_ABNORMALITY_END',1,realBuff,e=>watchBuff(e,true));
 hook('S_REQUEST_SERVANT_INFO_LIST',mod.majorPatchVersion>=95?4:3,e=>{if(!key)return;roster.clear();rosterSeen=true;for(const pet of e.servants||[]){const db=id(pet.dbid);if(db)roster.add(db);}});
 hook('S_SPAWN_ME',3,e=>{loc=position(e.loc);if(Number.isFinite(e.w))w=e.w;ready=true;schedule(1500);});
 hook('C_PLAYER_LOCATION',5,e=>{loc=position(e.loc)||loc;if(Number.isFinite(e.w))w=e.w;});
 hook('S_LOAD_TOPO',3,()=>{reset();want=true;});
 hook('S_VISIT_NEW_SECTION',1,()=>{if(!active&&!want){want=true;attempts=0;}if(ready)schedule(1500);});
 hook('C_REQUEST_SPAWN_SERVANT',version,{filter:{fake:false}},e=>{
  if(sending||!key)return;const db=id(e.uniqueId<0?BigInt.asUintN(32,BigInt(e.uniqueId)):e.uniqueId);if(!db)return;
  choice={dbid:db,at:Date.now()};pending=null;recentUse=null;loginCooldown=null;failures=0;retryAfter=0;schedule(REPLY);
 });
 hook('S_REQUEST_SPAWN_SERVANT',4,e=>{
  if(e.ownerId!==owner||!profile()||!positive(e.id))return;const db=id(e.dbid);if(!db)return;
  epoch++;stop();pending=null;recentUse=null;failures=0;retryAfter=0;recover=true;attempts=0;want=false;feedWarned=false;
  if(loginCooldown?.dbid!==db)loginCooldown=null;
  active={dbid:db,id:Number(e.id),gameId:e.gameId,energyMax:Number(e.energyMax)};
  const p=profile();if(!p.pets[db])p.pets[db]={dbid:db,id:Number(e.id),name:e.name||'',skill:null,buffIds:[],lastUsedAt:0,nextBuffAt:0,cooldownUntil:0};
  Object.assign(p.pets[db],{id:Number(e.id),name:e.name||p.pets[db].name});
  if(!choice||choice.dbid===db){p.lastPet=db;choice=null;save();schedule(1500);}else schedule(REPLY);
 });
 hook('S_REQUEST_DESPAWN_SERVANT',1,e=>{if(!active||e.gameId!==active.gameId)return;epoch++;stop();active=null;pending=null;recentUse=null;loginCooldown=null;failures=0;want=false;});
 hook('C_START_SERVANT_ACTIVE_SKILL',version,{filter:{fake:false}},e=>{
  if(sending||!active||e.gameId!==active.gameId||!positive(e.skill)||!current())return;
  const pet=current();if(pet.skill!==Number(e.skill))pet.buffIds=[];
  pet.skill=Number(e.skill);pending=recentUse={key,dbid:active.dbid,skill:pet.skill,at:Date.now(),auto:false};failures=0;retryAfter=0;save();schedule(REPLY);
 });
 hook('S_START_COOLTIME_SERVANT_SKILL',1,e=>{
  if(!online||!Number.isFinite(e.cooltime)||e.cooltime<0)return;
  const request=useMatches(recentUse)?recentUse:null;
  if(request){
   const pet=current();pet.cooldownUntil=Date.now()+e.cooltime;
   if(e.cooltime>0)confirmUse(request,false);
   save();schedule(1);return;
  }
  // Accept a remaining-cooldown snapshot even before the pet spawn packet.
  // Scope that unlabelled snapshot to this login's saved selection only.
  if(!loginCooldown||loginCooldown.key!==key||loginCooldown.until<Date.now()||choice||active&&active.dbid!==loginCooldown.dbid)return;
  const pet=profile()?.pets[loginCooldown.dbid];if(!pet||!positive(pet.skill))return;
  pet.cooldownUntil=Date.now()+e.cooltime;save();if(ready)schedule(1);
 });
 hook('S_UPDATE_SERVANT_INFO',1,e=>{
  if(!mod.settings.autoFeed||!mod.settings.enabled||!profile()?.enabled||!active||id(e.dbid)!==active.dbid||!allowed()||mod.game.me.inCombat||!loc||Date.now()-lastFeed<30000)return;
  if(!(active.energyMax>0)||!Number.isFinite(e.energy)||e.energy/active.energyMax*100>mod.settings.feedWhenBelow)return;
  for(const food of mod.settings.petFood){const item=mod.game.inventory.findInBagOrPockets(food.id);if(!item)continue;
   lastFeed=Date.now();mod.send('C_USE_ITEM',3,{gameId:owner,id:item.id,dbid:item.dbid,target:0n,amount:1,dest:{x:0,y:0,z:0},loc:{...loc},w,unk1:0,unk2:0,unk3:0,unk4:true});feedWarned=false;return;}
  if(!feedWarned){feedWarned=true;message('No configured pet food was found.');}
 });
 listen(mod.game,'enter_game',()=>{online=true;schedule(1500);});
 listen(mod.game,'leave_game',()=>{online=false;reset();buffs.clear();key=null;owner=null;});
 listen(mod.game.me,'die',()=>{stop();pending=null;recentUse=null;recover=true;});
 listen(mod.game.me,'resurrect',()=>{want=true;attempts=0;schedule(1500);});
 mod.command.add('pet',(...args)=>{
  const command=(args[0]||'status').toLowerCase(),p=profile();
  if(command==='on'||command==='off'){
   if(p)p.enabled=command==='on';else mod.settings.enabled=command==='on';save();
   if(command==='on'){want=true;attempts=0;schedule(1);}else{stop();pending=null;recentUse=null;}
   message(command==='on'?'Automatic pet care enabled.':'Automatic pet care paused.');
  }else if(command==='toggle'){mod.settings.enabled=!mod.settings.enabled;save();if(mod.settings.enabled)schedule(1);else{stop();pending=null;recentUse=null;}message('Global automation '+(mod.settings.enabled?'ON':'OFF')+'.');}
  else if(command==='feed'){const n=Number(args[1]);if(!Number.isInteger(n)||n<1||n>99){message('pet feed 1–99');return;}mod.settings.feedWhenBelow=n;save();message('Feed below '+n+'%.');}
  else if(command==='summon'){want=true;attempts=0;schedule(1);}
  else if(command==='status'){const pet=selected();message((mod.settings.enabled&&p?.enabled?'ON':'OFF')+' | '+(pet?pet.name||pet.id:'Summon a pet once to learn it.')+' | Buff: '+(pet?.skill||'Use its buff once to learn it.')+' | Every 3:30');}
  else message('pet [status/on/off/toggle/summon/feed 1–99] — automatic learning; no save command needed.');
 });
 this.destructor=()=>{closed=true;epoch++;stop();pending=null;for(const [e,n,fn]of listeners)e.removeListener(n,fn);for(const h of hooks)mod.unhook(h);mod.command.remove('pet');save();};
};
