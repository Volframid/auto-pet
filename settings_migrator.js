'use strict';
const defaults=()=>({enabled:true,autoFeed:true,feedWhenBelow:90,petFood:[{id:206049},{id:206050},{id:206051}],profiles:{}});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
module.exports=function migrate(from,to,data){
 const out=Object.assign(defaults(),object(data)?data:{});if(!object(out.profiles))out.profiles={};
 if(out.feedWhenBelow===0)out.autoFeed=false;
 if(!Number.isInteger(out.feedWhenBelow)||out.feedWhenBelow<1||out.feedWhenBelow>99)out.feedWhenBelow=90;
 if(!Array.isArray(out.petFood))out.petFood=defaults().petFood;
 out.petFood=out.petFood.filter(p=>p&&Number.isSafeInteger(p.id)&&p.id>0);
 for(const [oldKey,character]of Object.entries(out.characters||{})){
  if(!/^\d+_\d+$/.test(oldKey)||!object(character))continue;const [player,server]=oldKey.split('_'),key=server+':'+player;
  if(!out.profiles[key])out.profiles[key]={name:character.name||'',enabled:character.enabled!==false,lastPet:null,pets:{}};
 }
 for(const [oldKey,pet]of Object.entries(out.servantsList||{})){
  if(!pet||!/^\d+_\d+$/.test(oldKey)||!/^\d+$/.test(String(pet.dbid))||!positive(pet.id))continue;
  const [server,player]=oldKey.split('_'),key=server+':'+player,legacy=out.characters?.[player+'_'+server]||{};
  if(!out.profiles[key])out.profiles[key]={name:legacy.name||'',enabled:legacy.enabled!==false,lastPet:String(pet.dbid),pets:{}};
  const p=out.profiles[key];if(!object(p.pets))p.pets={};
  if(!p.pets[String(pet.dbid)])p.pets[String(pet.dbid)]={id:Number(pet.id),dbid:String(pet.dbid),name:pet.name||'',skill:positive(legacy.bondSkill)?Number(legacy.bondSkill):null,nextBuffAt:0,cooldownUntil:0};
  if(!p.lastPet)p.lastPet=String(pet.dbid);
 }
 for(const [key,p]of Object.entries(out.profiles)){
  if(!object(p)||!object(p.pets)){delete out.profiles[key];continue;}p.enabled=p.enabled!==false;
  for(const [id,pet]of Object.entries(p.pets)){
   if(!object(pet)||!/^\d+$/.test(id)||!positive(pet.id)){delete p.pets[id];continue;}
   pet.id=Number(pet.id);pet.dbid=id;pet.skill=positive(pet.skill)?Number(pet.skill):null;
   pet.buffIds=Array.isArray(pet.buffIds)?[...new Set(pet.buffIds.filter(positive).map(Number))].slice(0,16):[];
   for(const t of ['lastUsedAt','nextBuffAt','cooldownUntil'])if(!Number.isFinite(pet[t])||pet[t]<0)pet[t]=0;
  }if(p.lastPet&&!p.pets[p.lastPet])p.lastPet=null;
 }
 delete out.servantsList;delete out.characters;return out;
};
function positive(n){return Number.isSafeInteger(Number(n))&&Number(n)>0;}
