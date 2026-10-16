const {chromium}=require('C:/Users/hp/Projects/rehletshifaa/frontend/node_modules/playwright-core');
const fs=require('fs');
const ANIM=[0,6,11,13], N=19, SPEC={0:[16.6,24]};
(async()=>{
 fs.mkdirSync('fr4',{recursive:true});
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
 await p.goto('http://localhost:8765/index.html?film=1'); const meta={};
 for(let i=0;i<N;i++){
  await p.evaluate(n=>go(n),i); await p.waitForTimeout(300);
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  const n=String(i).padStart(2,'0');
  meta[i]={hs:await p.evaluate(()=>[...document.querySelectorAll('.hs')].map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})),
    video:await p.evaluate(()=>{const v=document.querySelector('#heroVid');if(!v)return null;const r=v.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})};
  if(ANIM.includes(i)){
   const [secs,fps]=SPEC[i]||[5.2,15]; const frames=Math.round(secs*fps);
   for(let k=0;k<frames;k++){
    await p.evaluate(t=>setT(t),k/fps-0.3);
    await p.screenshot({path:`fr4/s${n}_${String(k).padStart(3,'0')}.png`});
   }
  } else {
   await p.evaluate(()=>{const v=document.querySelector('#heroVid');if(v){v.pause();v.currentTime=0}});
   await p.screenshot({path:`fr4/s${n}.png`});
  }
 }
 fs.writeFileSync('fr4/meta.json',JSON.stringify(meta)); await b.close();
})();
