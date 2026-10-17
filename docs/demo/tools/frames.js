const {chromium}=require('C:/Users/hp/Projects/rehletshifaa/frontend/node_modules/playwright-core');
const fs=require('fs');
const VISUAL=[6,11,13], N=19, INTRO=[16.6,24];
(async()=>{
 fs.mkdirSync('fr5',{recursive:true});
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
 await p.goto('http://localhost:8765/index.html?film=1'); const ONLY=process.env.ONLY?process.env.ONLY.split(',').map(Number):null; const meta=ONLY?JSON.parse(fs.readFileSync('fr5/meta.json')):{frames:{},video:{}};
 for(let i=0;i<N;i++){
  if(ONLY&&!ONLY.includes(i))continue;
  await p.evaluate(n=>go(n),i); await p.waitForTimeout(300);
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  const n=String(i).padStart(2,'0');
  const fxEnd=await p.evaluate(()=>window.fxEnd||0);
  meta.video[i]=await p.evaluate(()=>{const v=document.querySelector('#heroVid');if(!v)return null;const r=v.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}});
  let secs=0,fps=12;
  if(i===0){[secs,fps]=INTRO}else if(VISUAL.includes(i)){secs=5.2;fps=15}else if(fxEnd>0){secs=fxEnd+0.6;fps=12}
  if(secs>0){
   const frames=Math.round(secs*fps); meta.frames[i]={secs,fps,count:frames};
   for(let k=0;k<frames;k++){
    await p.evaluate(t=>setT(t),k/fps-0.3);
    await p.screenshot({path:`fr5/s${n}_${String(k).padStart(3,'0')}.png`});
   }
  } else {
   await p.evaluate(()=>{const v=document.querySelector('#heroVid');if(v){v.pause();v.currentTime=0}});
   await p.screenshot({path:`fr5/s${n}.png`});
  }
  console.log(i,secs,fps);
 }
 fs.writeFileSync('fr5/meta.json',JSON.stringify(meta)); await b.close();
})();
