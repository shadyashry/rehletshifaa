const {chromium}=require('C:/Users/hp/Projects/rehletshifaa/frontend/node_modules/playwright-core');
const fs=require('fs');
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
 await p.goto('http://localhost:8765/index.html?film=1'); const rects={};
 for(let i=0;i<=15;i++){
  await p.evaluate(n=>go(n),i); await p.waitForTimeout(300);
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  rects[i]=await p.evaluate(()=>[...document.querySelectorAll('.hs')].map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}));
  await p.screenshot({path:`fr2/s${String(i).padStart(2,'0')}.png`});
 }
 fs.writeFileSync('fr2/rects.json',JSON.stringify(rects)); await b.close();
})();
