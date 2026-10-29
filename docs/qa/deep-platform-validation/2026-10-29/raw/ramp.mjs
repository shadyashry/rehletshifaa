// Bounded closed-loop ramp on one cached public read, backend-direct (no gateway budget), shared dev stack.
// Stops a step early if p95 > 2000 ms or errors > 1%.
const URL_ = "http://localhost:8080/api/v1/public/consultants?locale=en";
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)]);};
for (const c of [1,4,8,16]) {
  const ms=[]; let err=0; const end=Date.now()+20000;
  await Promise.all(Array.from({length:c},async()=>{while(Date.now()<end){const t=performance.now();try{const r=await fetch(URL_);await r.arrayBuffer();if(r.status!==200)err++;}catch{err++;}ms.push(performance.now()-t);}}));
  const out={concurrency:c,requests:ms.length,rps:Math.round(ms.length/20),errors:err,p50:q(ms,50),p95:q(ms,95),p99:q(ms,99)};
  console.log(JSON.stringify(out)); if(out.p95>2000||err/ms.length>0.01)break;
}
