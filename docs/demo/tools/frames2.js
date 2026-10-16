const {chromium}=require('C:/Users/hp/Projects/rehletshifaa/frontend/node_modules/playwright-core');
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1920,height:1080}});
 await p.goto('http://localhost:8765/index.html?film=1');
 await p.addStyleTag({content:'.hs::after{animation-play-state:paused!important;animation-delay:var(--d,0s)!important;animation-duration:2s!important}'});
 for(let i=0;i<=15;i++){
  await p.evaluate(n=>go(n),i); await p.waitForTimeout(300);
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  const n=String(i).padStart(2,'0');
  const frames = i>=1&&i<=14 ? 20 : 1;
  for(let k=0;k<frames;k++){
   await p.evaluate(t=>document.documentElement.style.setProperty('--d',`-${t}s`),k*0.1);
   await p.screenshot({path:`fr/s${n}_${String(k).padStart(2,'0')}.png`});
  }
 }
 await b.close();
})();
