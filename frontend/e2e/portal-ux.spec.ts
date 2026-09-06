import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// Synthetic fixtures only: browser checks exercise the real UI without touching patient records.
const stamp="2026-09-05T12:00:00Z";
const subject="qa-coordinator";
const baseCase={country:"Kenya",careCategory:"cardiology",preferredLanguage:"en",createdAt:stamp,updatedAt:stamp,version:1,travelPackageRequested:false};
const portalAlerts=(page:Page)=>page.locator('[role="alert"]:not(#__next-route-announcer__)');
async function setup(page:Page, role="COORDINATOR", options:{documentsFail?:boolean;claimConflict?:boolean;reviews?:boolean;saveFail?:boolean;empty?:boolean}={}){
  const roles=role==="COORDINATOR_LEAD"?["COORDINATOR",role]:[role];
  await page.addInitScript(({roles,subject,authority})=>{
    const value=JSON.stringify({access_token:"synthetic-test-token",token_type:"Bearer",scope:"openid profile email",profile:{sub:subject,name:"Layla Hassan",email:"layla@example.test",roles},expires_at:Math.floor(Date.now()/1000)+3600});
    sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`,value);
  },{roles,subject,authority:process.env.PLAYWRIGHT_OIDC_AUTHORITY??"http://localhost:8180/realms/rehletshifaa"});
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
    if(api.endsWith("/intake-preview"))return reply({caseSummary:cases.find(c=>c.id==="unowned"),intakeSummary:"Cardiac reports submitted for review. Please assess the requested care pathway."});
    if(api.endsWith("/claim")){
      if(options.claimConflict){cases=cases.filter(c=>c.id!=="unowned");return reply({message:"Another coordinator has taken ownership. The queue has been refreshed."},409);}
      cases=cases.map(c=>c.id==="unowned"?{...c,coordinatorSubject:subject,patientName:"New Patient",status:"INTAKE_REVIEW"}:c);
      return reply({id:"assignment",status:"ACTIVE"});
    }
    if(api==="/tasks/mine")return reply([]);
    if(api.endsWith("/cases"))return reply(cases);
    if(api.endsWith("/documents"))return options.documentsFail?reply({message:"Documents temporarily unavailable"},503):reply(options.reviews?[{documentId:"doc",fileName:"Clinical report.pdf",contentType:"application/pdf",sizeBytes:1024,status:"CLEAN",createdAt:stamp}]:[]);
    if(/\/cases\/(owned|unowned|team)$/.test(api))return reply({caseSummary:cases.find(c=>api.endsWith(c.id)),intakeSummary:"Cardiac reports submitted for review.",timeline:[{type:"STATUS",label:"Received",status:"RECEIVED",occurredAt:stamp}],tasks:[],messages:[],assignments:[],clinicalReviews:options.reviews?[{id:"review",versionNumber:1,status:"APPROVED",recommendedTreatment:"Review finding visible to the care team",createdAt:stamp}]:[]});
    if(api.endsWith("/messages"))return options.saveFail?reply({message:"Unable to save changes"},500):reply({id:"message",status:"SENT"});
    if(api.endsWith("/me"))return reply({displayName:"Layla Hassan",specialty:"Cardiology"});
    if(api.endsWith("/readiness"))return reply({readyForCoordination:false,depositStatus:"REQUESTED",blockingItems:[{code:"DEPOSIT",labelEn:"Deposit outstanding",labelAr:"الوديعة مستحقة"}],updatedAt:stamp});
    if(api==="/admin/staff-teams")return reply([
      {subject:"lead",name:"Coordination Lead",role:"COORDINATOR_LEAD",staffFunction:"COORDINATOR"},{subject:"report",name:"Team Coordinator",role:"COORDINATOR",staffFunction:"COORDINATOR",leadSubject:"lead"},
      {subject:"ops-lead",name:"Operations Lead",role:"OPERATIONS_LEAD",staffFunction:"OPERATIONS"},{subject:"ops-staff",name:"Operations Staff",role:"OPERATIONS",staffFunction:"OPERATIONS"},
      {subject:"finance-lead",name:"Finance Lead",role:"FINANCE_LEAD",staffFunction:"FINANCE"},{subject:"finance-staff",name:"Finance Staff",role:"FINANCE",staffFunction:"FINANCE"}
    ]);
    if(api==="/identity-review/queue")return reply([{id:"identity",subjectType:"PATIENT",status:"MANUAL_REVIEW",documentType:"PASSPORT",issuingCountry:"Kenya",documentReferenceMasked:"***1234",requestedAt:stamp}]);
    return reply([]);
  });
  return {writes};
}

test("review first, claim last, stay in workspace and refresh tab counts",async({page})=>{
  const {writes}=await setup(page);
  await page.goto("/en/portal");
  await page.getByRole("tab",{name:/Needs ownership/}).click();
  await page.getByRole("button",{name:/Review case RS/}).click();
  await expect(page.getByRole("heading",{name:"Intake summary"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Patient documents"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Doctor reviews"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Patient proposal"})).toHaveCount(0);
  expect(writes.filter(w=>w.path.endsWith("/claim"))).toHaveLength(0);
  const claim=page.getByRole("button",{name:"Take ownership",exact:true});
  expect(await claim.evaluate(el=>Array.from(el.closest("fieldset")!.querySelectorAll("button")).at(-1)===el)).toBe(true);
  await claim.click();
  await expect(page.getByRole("heading",{name:"New Patient",exact:true})).toBeVisible();
  await page.getByRole("button",{name:/My dashboard/}).click();
  await expect(page.getByRole("tab",{name:/Needs ownership/})).toHaveAttribute("aria-selected","true");
  await expect(page.getByRole("tab",{name:/Needs ownership/})).toContainText("0");
  await expect(page.getByRole("tab",{name:/My cases/})).toContainText("2");
});

test("claim conflict returns to the refreshed queue with a useful message",async({page})=>{
  await setup(page,"COORDINATOR",{claimConflict:true});await page.goto("/en/portal");
  await page.getByRole("tab",{name:/Needs ownership/}).click();await page.getByRole("button",{name:/Review case RS/}).click();await page.getByRole("button",{name:"Take ownership",exact:true}).click();
  await expect(portalAlerts(page)).toContainText("Another coordinator");await expect(page.getByRole("tab",{name:/Needs ownership/})).toContainText("0");
});

test("team tab supports keyboard navigation and only appears for leads",async({page})=>{
  await setup(page,"COORDINATOR_LEAD");await page.goto("/en/portal");
  await page.getByRole("tab",{name:/My cases/}).focus();await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab",{name:/Team cases/})).toBeFocused();await expect(page.getByText("Omar Example")).toBeVisible();await expect(page.getByText("Maya Example")).toHaveCount(0);
});

test("administration assigns every staff function to its lead inline",async({page})=>{
  const {writes}=await setup(page,"SYSTEM_ADMIN");await page.goto("/en/portal");
  await page.getByRole("tab",{name:"Staff accounts"}).click();
  await expect(page.getByRole("heading",{name:"Staff teams & leads"})).toBeVisible();
  await page.getByRole("tab",{name:/Operations/}).click();
  await page.getByLabel("Lead: Operations Staff").selectOption("ops-lead");
  await expect(page.getByText("Saved")).toBeVisible();
  expect(writes).toContainEqual({path:"/admin/staff-teams/ops-staff",body:{leadSubject:"ops-lead"}});
});

test("account settings persist and keep the current case when switching language",async({page})=>{
  const {writes}=await setup(page);await page.goto("/en/portal");await expect(page.getByRole("tab",{name:/Team cases/})).toHaveCount(0);
  await page.getByRole("button",{name:/Open workspace RS/}).click();
  await page.getByLabel("Account: Layla Hassan",{exact:true}).click();await page.getByRole("button",{name:"Account settings",exact:true}).click();
  await page.getByLabel("Display name",{exact:true}).fill("Layla Updated");await page.locator('select[name="locale"]').selectOption("ar");await page.getByRole("button",{name:"Save changes"}).click();
  await expect(page).toHaveURL(/\/ar\/portal\?case=owned/);await expect(page.getByLabel("الحساب: Layla Updated",{exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Maya Example",exact:true})).toBeVisible();
  expect(writes.find(w=>w.path==="/account/preferences")?.body.displayName).toBe("Layla Updated");
});

test("search and filters survive opening and returning from a case",async({page})=>{
  await setup(page);await page.goto("/en/portal");const search=page.getByRole("searchbox");await search.fill("Maya");await page.getByRole("button",{name:/Open workspace RS/}).click();await page.getByRole("button",{name:/My dashboard/}).click();await expect(search).toHaveValue("Maya");
});

test("the clinical recommendation shows in the proposal section and document failures are not mistaken for empty data",async({page})=>{
  await setup(page,"COORDINATOR",{reviews:true,documentsFail:true});await page.goto("/en/portal");await page.getByRole("button",{name:/Open workspace RS/}).click();
  // The consultant's recommendation moved into the Patient proposal panel; there is no separate Doctor reviews panel for coordinators.
  await expect(page.getByRole("heading",{name:"Patient proposal"})).toBeVisible();await expect(page.getByRole("heading",{name:"Doctor reviews"})).toHaveCount(0);await expect(page.getByText("Review finding visible to the care team")).toBeVisible();await expect(portalAlerts(page)).toContainText("Documents could not be loaded");
});

test("failed message submission retains the draft",async({page})=>{
  await setup(page,"COORDINATOR",{saveFail:true});await page.goto("/en/portal");await page.getByRole("button",{name:/Open workspace RS/}).click();const draft=page.locator('textarea[dir="auto"]');await draft.fill("Please review these details");await page.getByRole("button",{name:"Send message",exact:true}).click();await expect(portalAlerts(page)).toContainText("Unable to save");await expect(draft).toHaveValue("Please review these details");
});

for(const locale of ["en","ar"]){
  for(const role of ["COORDINATOR_LEAD","DOCTOR","OPERATIONS","FINANCE","PATIENT","PATIENT_REPRESENTATIVE","CREDENTIALING_ADMIN","AUDITOR","PATIENT_IDENTITY_REVIEWER"]){
    test(`${role} ${locale}: responsive portal and account access`,async({page})=>{
      await setup(page,role);await page.setViewportSize({width:locale==="ar"?390:1440,height:900});await page.goto(`/${locale}/portal`);
      await expect(page.getByLabel(`${locale==="ar"?"الحساب":"Account"}: ${role==="DOCTOR"?"Dr. ":""}Layla Hassan`,{exact:true})).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir",locale==="ar"?"rtl":"ltr");
      await expect(portalAlerts(page)).toHaveCount(0);
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:path.join("../output/ux",`${role.toLowerCase()}-${locale}.png`),fullPage:true});
    });
  }
}
