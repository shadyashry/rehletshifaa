import { expect, test } from "@playwright/test";
import { OIDC_AUTHORITY } from "./env";

// Synthetic HTTP fixtures exercise the browser contract; backend enforcement has separate integration tests.
for(const locale of ["en","ar"] as const) test(`Access governance draft review and responsive layout (${locale})`,async({page},testInfo)=>{
  await page.addInitScript(({authority})=>sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`,JSON.stringify({
    access_token:"synthetic-access",token_type:"Bearer",scope:"openid",profile:{sub:"reviewer"},expires_at:Math.floor(Date.now()/1000)+3600,
  })),{authority:OIDC_AUTHORITY});
  const keys=["access.role.view","access.role.create","access.role.edit_draft","access.role.simulate","access.role.publish","access.effective_access.view","access.audit.view"];
  const role={id:"role-1",key:"CUSTOM_REVIEW",name:"Access Reviewer",description:"Review scoped access",purpose:"Review access safely",systemTemplate:false,currentVersion:null,draftStatus:"DRAFT"};
  const version={id:"version-1",number:1,status:"DRAFT",revision:0,actorType:"GOVERNANCE",channel:"ADMIN_WEB",createdBy:"maker",publishedBy:null};
  const grants=[{permission:"access.role.view",scope:"PLATFORM",relationship:null}];
  const writes:{path:string;body:Record<string,unknown>}[]=[];
  await page.route("**/api/v1/**",async route=>{
    const path=new URL(route.request().url()).pathname;const body=route.request().postDataJSON();
    if(route.request().method()==="OPTIONS")return route.fulfill({status:204});
    if(body)writes.push({path,body});
    let data:unknown=[];
    if(path.endsWith("/me"))data=keys.map(permission=>({permission,allowed:true,reason:"ALLOWED"}));
    else if(path.endsWith("/permissions"))data=[{key:"access.role.view",name:"View roles and capabilities",description:"Review roles",family:"access",risk:"LOW",scopes:["PLATFORM"],actors:["GOVERNANCE"],channels:["ADMIN_WEB"],dependencies:[],conflicts:[],executable:true}];
    else if(path.endsWith("/validate")){version.status="VALIDATED";version.revision++;data={valid:true,errors:[],warnings:[]};}
    else if(path.endsWith("/simulate"))data={permission:"access.role.view",allowed:true,reason:"ALLOWED",scope:"PLATFORM",roleVersionId:version.id};
    else if(path.endsWith("/publish")){version.status="PUBLISHED";version.revision++;data={version,grants};}
    else if(path.endsWith("/roles/role-1"))data={role,versions:[{version,grants}]};
    else if(path.endsWith("/roles"))data=[role];
    return route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
  });
  await page.goto(`/${locale}/portal/control-center/access/roles`);
  await page.getByRole("button",{name:/Access Reviewer/}).click();
  await page.getByRole("button",{name:locale==="en"?"Continue the prepared change":"متابعة التغيير قيد الإعداد"}).click();
  const steps=page.getByRole("list",{name:locale==="en"?"Role change steps":"خطوات تعديل الدور"});
  await expect(steps.getByRole("button")).toHaveCount(5);
  await steps.getByRole("button").nth(3).click();
  await page.getByRole("button",{name:locale==="en"?"Check the configuration":"فحص الإعداد"}).click();
  // Simulation is an advanced diagnostic: the person is picked (here through the account-identifier fallback).
  await page.getByText(locale==="en"?"Advanced: try the draft on a person":"متقدم: جرّب المسودة على شخص").click();
  await page.getByText(locale==="en"?"Use an account identifier instead":"استخدام معرّف حساب بدلًا من ذلك").click();
  await page.getByLabel(locale==="en"?"Account identifier":"معرّف الحساب").fill("reviewer");
  await page.getByRole("button",{name:locale==="en"?"Open":"فتح"}).click();
  await page.getByLabel(locale==="en"?"Action":"الإجراء").selectOption("access.role.view");
  await page.getByRole("button",{name:locale==="en"?"Check access":"فحص الوصول"}).click();
  await expect.poll(()=>writes.some(w=>w.path.endsWith("/simulate")&&w.body.draftVersionId==="version-1")).toBeTruthy();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:testInfo.outputPath(`access-${locale}-desktop.png`),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator(".cc")).toHaveAttribute("dir",locale==="ar"?"rtl":"ltr");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:testInfo.outputPath(`access-${locale}-mobile.png`),fullPage:true});
  await steps.getByRole("button").nth(4).click();
  await page.getByLabel(locale==="en"?"Effective from":"ساري من").fill("2026-10-01T12:00");
  await page.getByLabel(locale==="en"?/Reason for publishing/:/سبب النشر/).fill("Independent access review");
  await page.getByRole("button",{name:locale==="en"?"Publish version":"نشر الإصدار"}).click();
  await expect.poll(()=>writes.some(w=>w.path.endsWith("/publish"))).toBeTruthy();
});
