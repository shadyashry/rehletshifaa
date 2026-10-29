const API="https://api-dev.rehletshifaa.com",O={"content-type":"application/json",origin:"https://dev.rehletshifaa.com"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function once(label,email){
  const body={givenName:"Nour",familyName:"Dpvtiming",country:"Kenya",whatsappNumber:"+2547"+String(Date.now()).slice(-8),preferredLanguage:"en",consent:true,careArea:"cardiology",ageBand:"AGE_18_64"};
  if(email)body.email=email;
  const c=await (await fetch(API+"/api/v1/cases",{method:"POST",headers:O,body:JSON.stringify(body)})).json(); await sleep(1500);
  const t0=performance.now(); const r=await fetch(API+`/api/v1/cases/${c.caseId}/submit`,{method:"POST",headers:{...O,"x-case-grant":c.intakeGrant},body:"{}"});
  console.log(label,r.status,Math.round(performance.now()-t0),"ms",r.headers.get("x-request-id")); await sleep(1500);
}
await once("no-email",null); await once("email",`dpv.timing.${Date.now()}@local.test`); await once("no-email",null); await once("email",`dpv.timing2.${Date.now()}@local.test`);
