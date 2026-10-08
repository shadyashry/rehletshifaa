import { expect, type Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";
import { leadsCoordinationTeam, meFor, routeMe } from "./me-fixture";

// Synthetic fixtures only: browser checks exercise the real UI without touching patient records.
const stamp="2026-09-05T12:00:00Z";
const subject="qa-coordinator";
const baseCase={country:"Kenya",careCategory:"cardiology",preferredLanguage:"en",createdAt:stamp,updatedAt:stamp,version:1,travelPackageRequested:false};
// The backend's action contract, as the real resolver would answer for each fixture case.
const actionsFor=(c:{status:string;coordinatorSubject?:string},viewer:string)=>({journeyStage:c.status,waitingOn:c.coordinatorSubject?"STAFF":"NONE",blockers:[],
  ...(c.coordinatorSubject?{waitingReason:"Waiting for our team",waitingReasonCode:"DEFAULT_STAFF"}:{}),
  currentAction:!c.coordinatorSubject?{code:"CLAIM_CASE",kind:"CLAIM"}:c.coordinatorSubject!==viewer?{code:"VIEW_ONLY",kind:"NONE"}:{code:"ASSIGN_CONSULTANT",kind:"FOCUS"},
  availableActions:c.coordinatorSubject===viewer?["REQUEST_INFORMATION","ASSIGN_CONSULTANT","SET_TRAVEL_PACKAGE","CANCEL_CASE"]:[]});
/** The platform roles behind each fixture persona (the portal reads them from `/me`, never from the token). */
const PLATFORM_ROLES:Record<string,string[]>={COORDINATOR_LEAD:["COORDINATOR"],DOCTOR:["CONSULTANT"],CREDENTIALING_ADMIN:["CONSULTANT_OPERATIONS_MANAGER"],
  AUDITOR:["COMPLIANCE_AUDITOR"],SYSTEM_ADMIN:["SYSTEM_ADMINISTRATOR"]};
/** The staff views (My work, My cases, Team queue) are navigation — in the header from md, inline below — not tabs. */
export const staffView=(page:Page,name:RegExp)=>page.getByRole("navigation",{name:/^(Your work|أقسام العمل)$/}).getByRole("link",{name});
export const portalAlerts=(page:Page)=>page.locator('[role="alert"]:not(#__next-route-announcer__)');
export async function setupPortal(page:Page, role="COORDINATOR", options:{documentsFail?:boolean;claimConflict?:boolean;reviews?:boolean;saveFail?:boolean;empty?:boolean;pendingWork?:boolean;assistedDecision?:boolean;notifications?:boolean;representatives?:boolean}={}){
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
  // The Arabic assisted path: the patient asked for a call, so recording their decision is the owned case's current action.
  let recorded=false;
  const assisted=(c:{id:string;coordinatorSubject?:string})=>!!options.assistedDecision&&c.id==="owned"&&c.coordinatorSubject===subject;
  const releasedProposal={proposalId:"p1",versionId:"v1",versionNumber:1,status:"RELEASED",language:"ar",currency:"USD",validUntil:"2026-12-31T00:00:00Z",documentType:"PRELIMINARY_ESTIMATE",
    items:[{id:"i1",category:"MEDICAL",description:"Dual chamber pacemaker implant",quantity:1,unitPrice:4850,optional:false}],assistance:{requestedAt:stamp}};
  const assistedActions=()=>recorded?{journeyStage:"ACCEPTED",waitingOn:"STAFF",blockers:[],currentAction:{code:"WAIT_DEPOSIT_ARRANGEMENT",kind:"WAIT"},availableActions:["REQUEST_INFORMATION"]}
    :{journeyStage:"PATIENT_DECISION",waitingOn:"STAFF",blockers:[],currentAction:{code:"WORK_ITEM",kind:"FOCUS",title:"Go through the proposal terms with the patient in Arabic",context:"The patient asked you to go through the deposit, refund and cancellation terms with them in Arabic and record their decision.",workItemId:"w-terms",workItemVersion:0,workType:"PROPOSAL_TERMS_CALL",overdue:false,copy:{code:"PROPOSAL_TERMS_CALL",params:{}}},
      availableActions:["REQUEST_INFORMATION","RESEND_PROPOSAL_LINK","RECORD_PROPOSAL_DECISION"]};
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
    if(api==="/patient/account/session")return reply({linked:true,currentCaseId:"owned",accountStatus:"ACTIVE",pendingLinkRequests:0});
    if(api==="/patient/account/profile")return reply({givenName:"Maya",familyName:"Example",displayName:"Maya Example",country:"Kenya",preferredLanguage:"en",email:"maya@example.test",emailVerified:true,whatsappNumber:"+254700000000",phoneVerified:true,accountStatus:"ACTIVE"});
    if(api==="/tasks/mine")return reply([]);
    // A pending consultant assignment is work, not yet one of "my cases": it is reachable only from My Work.
    // A coded notification (pass 3 wording): the bell words it from its code; the English is the fallback.
    if(api==="/notifications"&&options.notifications)return reply({unread:1,items:[{id:"n1",caseId:"owned",caseNumber:"RS-2026-000001",taskId:null,eventType:"CASE_OWNERSHIP_TRANSFERRED",
      title:"A case has been transferred to you",context:"You are now the owner of case RS-2026-000001, transferred by Sara Ahmed.",createdAt:stamp,read:false,
      copy:{code:"CASE_OWNERSHIP_TRANSFERRED",params:{caseNumber:"RS-2026-000001",by:"Sara Ahmed"}}}]});
    if(api==="/work/mine")return reply(options.pendingWork?[{id:"w-pending",caseId:"pending",caseNumber:"RS-2026-000009",patientName:"Nour Example",caseStatus:"CONSULTANT_ASSIGNMENT_PENDING",waitingOn:"CONSULTANT",careCategory:"cardiology",coordinatorName:"Layla Hassan",documentCount:1,type:"CONSULTANT_ASSIGNMENT",title:"New clinical assignment",context:"You have been assigned case RS-2026-000009 for clinical review.",priority:"NORMAL",status:"OPEN",blocking:false,dueAt:null,overdue:false,createdAt:stamp,version:0,copy:{code:"NEW_ASSIGNMENT_CLINICAL",params:{caseNumber:"RS-2026-000009"}}}]:[]);
    if(api.endsWith("/cases/pending"))return reply({caseSummary:{...baseCase,id:"pending",caseNumber:"RS-2026-000009",patientName:"Nour Example",status:"CONSULTANT_ASSIGNMENT_PENDING",coordinatorSubject:"owner",coordinatorName:"Layla Hassan",waitingOn:"CONSULTANT"},actions:{journeyStage:"CONSULTANT_ASSIGNMENT_PENDING",waitingOn:"CONSULTANT",blockers:[],currentAction:{code:"ACCEPT_ASSIGNMENT",kind:"ACCEPT"},availableActions:[]},intakeSummary:"Cardiac reports submitted for review.",timeline:[{type:"STATUS",label:"Received",status:"RECEIVED",occurredAt:stamp}],tasks:[],messages:[],assignments:[{id:"a-pending",assigneeSubject:subject,assigneeName:"Dr Layla Hassan",assigneeRole:"DOCTOR",assignmentType:"PRIMARY",status:"PENDING",assignedAt:stamp,version:0}],clinicalReviews:[]});
    if(api.endsWith("/cases"))return reply(cases);
    if(api.endsWith("/documents"))return options.documentsFail?reply({message:"Documents temporarily unavailable"},503):reply(options.reviews||options.pendingWork?[{documentId:"doc",fileName:"Clinical report.pdf",contentType:"application/pdf",sizeBytes:1024,status:"CLEAN",createdAt:stamp}]:[]);
    if(api.endsWith("/proposals/v1/decision/on-behalf")){recorded=true;return reply({...releasedProposal,status:"ACCEPTED"});}
    if(/\/cases\/(owned|unowned|team)$/.test(api)){const c=cases.find(c=>api.endsWith(c.id))!;return reply({caseSummary:assisted(c)?{...c,status:recorded?"ACCEPTED":"PATIENT_DECISION"}:c,actions:assisted(c)?assistedActions():actionsFor(c,subject),...(assisted(c)?{proposal:{...releasedProposal,...(recorded?{status:"ACCEPTED"}:{})}}:{}),
      ...(assisted(c)&&options.representatives?{representatives:[{id:"rep-1",name:"Omar Example",relationship:"PARENT",since:"2026-09-01T09:00:00Z"},{id:"rep-2",name:null,relationship:"SIBLING",since:"2026-09-05T09:00:00Z"}]}:{}),intakeSummary:"Cardiac reports submitted for review.",timeline:[{type:"STATUS",label:"Received",status:"RECEIVED",occurredAt:stamp}],tasks:[],messages:[],assignments:[],clinicalReviews:options.reviews?[{id:"review",versionNumber:1,status:"APPROVED",recommendedTreatment:"Review finding visible to the care team",createdAt:stamp}]:[]});}
    if(api.endsWith("/messages"))return options.saveFail?reply({message:"Unable to save changes"},500):reply({id:"message",status:"SENT"});
    if(api.endsWith("/me"))return reply({displayName:"Layla Hassan",specialty:"Cardiology"});
    if(api.endsWith("/readiness"))return reply({readyForCoordination:false,depositStatus:"REQUESTED",blockingItems:[{code:"DEPOSIT",labelEn:"Deposit outstanding",labelAr:"الوديعة مستحقة"}],updatedAt:stamp});
    if(api==="/admin/staff-teams")return reply([
      // accountStatus mirrors the real payload: the lead picker only offers ACTIVE leads.
      {subject:"lead",name:"Coordination Lead",role:"COORDINATOR_LEAD",staffFunction:"COORDINATOR",accountStatus:"ACTIVE"},{subject:"report",name:"Team Coordinator",role:"COORDINATOR",staffFunction:"COORDINATOR",leadSubject:"lead",accountStatus:"ACTIVE"},
      {subject:"ops-lead",name:"Operations Lead",role:"OPERATIONS_LEAD",staffFunction:"OPERATIONS",accountStatus:"ACTIVE"},{subject:"ops-staff",name:"Operations Staff",role:"OPERATIONS",staffFunction:"OPERATIONS",accountStatus:"ACTIVE"},
      {subject:"finance-lead",name:"Finance Lead",role:"FINANCE_LEAD",staffFunction:"FINANCE",accountStatus:"ACTIVE"},{subject:"finance-staff",name:"Finance Staff",role:"FINANCE",staffFunction:"FINANCE",accountStatus:"ACTIVE"}
    ]);
    if(api==="/admin/platform-access/staff")return reply({people:[],invitations:[]});
    if(api==="/identity-review/queue")return reply([{id:"identity",subjectType:"PATIENT",status:"MANUAL_REVIEW",documentType:"PASSPORT",issuingCountry:"Kenya",documentReferenceMasked:"***1234",requestedAt:stamp}]);
    return reply([]);
  });
  await routeMe(page,meFor(subject,PLATFORM_ROLES[role]??[role],{displayName:"Layla Hassan",teams:role==="COORDINATOR_LEAD"?leadsCoordinationTeam:[]}));
  return {writes};
}

