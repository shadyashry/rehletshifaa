import { expect, type Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";

// Synthetic fixtures only: browser checks exercise the real UI without touching patient records.
const stamp="2026-09-05T12:00:00Z";
const subject="qa-coordinator";
const baseCase={country:"Kenya",careCategory:"cardiology",preferredLanguage:"en",createdAt:stamp,updatedAt:stamp,version:1,travelPackageRequested:false};
// The backend's action contract, as the real resolver would answer for each fixture case.
const actionsFor=(c:{status:string;coordinatorSubject?:string},viewer:string)=>({journeyStage:c.status,waitingOn:c.coordinatorSubject?"STAFF":"NONE",blockers:[],
  currentAction:!c.coordinatorSubject?{code:"CLAIM_CASE",kind:"CLAIM"}:c.coordinatorSubject!==viewer?{code:"VIEW_ONLY",kind:"NONE"}:{code:"ASSIGN_CONSULTANT",kind:"FOCUS"},
  availableActions:c.coordinatorSubject===viewer?["REQUEST_INFORMATION","ASSIGN_CONSULTANT","SET_TRAVEL_PACKAGE","CANCEL_CASE"]:[]});
export const portalAlerts=(page:Page)=>page.locator('[role="alert"]:not(#__next-route-announcer__)');
export async function setupPortal(page:Page, role="COORDINATOR", options:{documentsFail?:boolean;claimConflict?:boolean;reviews?:boolean;saveFail?:boolean;empty?:boolean}={}){
  const roles=role==="COORDINATOR_LEAD"?["COORDINATOR",role]:[role];
  await page.addInitScript(({roles,subject,authority})=>{
    const value=JSON.stringify({access_token:"synthetic-test-token",token_type:"Bearer",scope:"openid profile email",profile:{sub:subject,name:"Layla Hassan",email:"layla@example.test",roles},expires_at:Math.floor(Date.now()/1000)+3600});
    sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`,value);
  },{roles,subject,authority:OIDC_AUTHORITY});
  const coordinator=roles.includes("COORDINATOR");
  const status=role==="DOCTOR"?"CONSULTANT_REVIEW":role==="OPERATIONS"?"ACCEPTED":"INTAKE_REVIEW";
  let cases=options.empty?[]:coordinator?[
    {...baseCase,id:"unowned",caseNumber:"RS-2026-000001",patientName:null,status:"RECEIVED",coordinatorSubject:undefined},
    {...baseCase,id:"owned",caseNumber:"RS-2026-000002",patientName:"Maya Example",status:"INTAKE_REVIEW",coordinatorSubject:subject},
    ...(role==="COORDINATOR_LEAD"?[{...baseCase,id:"team",caseNumber:"RS-2026-000003",patientName:"Omar Example",status:"INTAKE_REVIEW",coordinatorSubject:"report",coordinatorName:"Team Coordinator"}]:[])
  ]:[{...baseCase,id:"owned",caseNumber:"RS-2026-000002",patientName:"Maya Example",status,coordinatorSubject:"owner"}];
  let preferences={displayName:null as string|null,locale:"en"};
  const writes:{path:string;body:Record<string,unknown>}[]=[];
  await page.route("**/api/v1/**",async route=>{
    const request=route.request(),url=new URL(request.url()),api=url.pathname.replace("/api/v1","");
    const body=request.postDataJSON() as Record<string,unknown>|null;
    const reply=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    if(request.method()==="OPTIONS")return route.fulfill({status:204});
    if(request.method()!=="GET")writes.push({path:api,body:body??{}});
    if(api==="/account/preferences"){
      if(request.method()==="PUT"){if(options.saveFail)return reply({message:"Unable to save changes"},500);preferences=body as typeof preferences;}
      return reply(preferences);
    }
    if(api.endsWith("/intake-preview")){const c=cases.find(c=>c.id==="unowned")!;return reply({caseSummary:c,intakeSummary:"Cardiac reports submitted for review. Please assess the requested care pathway.",actions:actionsFor(c,subject)});}
    if(api.endsWith("/claim")){
      if(options.claimConflict){cases=cases.filter(c=>c.id!=="unowned");return reply({message:"Another coordinator has taken ownership. The queue has been refreshed."},409);}
      cases=cases.map(c=>c.id==="unowned"?{...c,coordinatorSubject:subject,patientName:"New Patient",status:"INTAKE_REVIEW"}:c);
      return reply({id:"assignment",status:"ACTIVE"});
    }
    if(api==="/tasks/mine")return reply([]);
    if(api.endsWith("/cases"))return reply(cases);
    if(api.endsWith("/documents"))return options.documentsFail?reply({message:"Documents temporarily unavailable"},503):reply(options.reviews?[{documentId:"doc",fileName:"Clinical report.pdf",contentType:"application/pdf",sizeBytes:1024,status:"CLEAN",createdAt:stamp}]:[]);
    if(/\/cases\/(owned|unowned|team)$/.test(api)){const c=cases.find(c=>api.endsWith(c.id))!;return reply({caseSummary:c,actions:actionsFor(c,subject),intakeSummary:"Cardiac reports submitted for review.",timeline:[{type:"STATUS",label:"Received",status:"RECEIVED",occurredAt:stamp}],tasks:[],messages:[],assignments:[],clinicalReviews:options.reviews?[{id:"review",versionNumber:1,status:"APPROVED",recommendedTreatment:"Review finding visible to the care team",createdAt:stamp}]:[]});}
    if(api.endsWith("/messages"))return options.saveFail?reply({message:"Unable to save changes"},500):reply({id:"message",status:"SENT"});
    if(api.endsWith("/me"))return reply({displayName:"Layla Hassan",specialty:"Cardiology"});
    if(api.endsWith("/readiness"))return reply({readyForCoordination:false,depositStatus:"REQUESTED",blockingItems:[{code:"DEPOSIT",labelEn:"Deposit outstanding",labelAr:"الوديعة مستحقة"}],updatedAt:stamp});
    if(api==="/admin/staff-teams")return reply([
      // accountStatus mirrors the real payload: the lead picker only offers ACTIVE leads.
      {subject:"lead",name:"Coordination Lead",role:"COORDINATOR_LEAD",staffFunction:"COORDINATOR",accountStatus:"ACTIVE"},{subject:"report",name:"Team Coordinator",role:"COORDINATOR",staffFunction:"COORDINATOR",leadSubject:"lead",accountStatus:"ACTIVE"},
      {subject:"ops-lead",name:"Operations Lead",role:"OPERATIONS_LEAD",staffFunction:"OPERATIONS",accountStatus:"ACTIVE"},{subject:"ops-staff",name:"Operations Staff",role:"OPERATIONS",staffFunction:"OPERATIONS",accountStatus:"ACTIVE"},
      {subject:"finance-lead",name:"Finance Lead",role:"FINANCE_LEAD",staffFunction:"FINANCE",accountStatus:"ACTIVE"},{subject:"finance-staff",name:"Finance Staff",role:"FINANCE",staffFunction:"FINANCE",accountStatus:"ACTIVE"}
    ]);
    if(api==="/identity-review/queue")return reply([{id:"identity",subjectType:"PATIENT",status:"MANUAL_REVIEW",documentType:"PASSPORT",issuingCountry:"Kenya",documentReferenceMasked:"***1234",requestedAt:stamp}]);
    return reply([]);
  });
  return {writes};
}

