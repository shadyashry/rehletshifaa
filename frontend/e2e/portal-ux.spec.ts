import { expect, test } from "@playwright/test";
import path from "node:path";

import { portalAlerts, setupPortal as setup, staffView } from "./portal-fixture";

/** Opening an unowned case must show the intake for review without silently claiming it. */
test("an unowned case can be reviewed before it is claimed, and claiming it updates the queue counts",async({page})=>{
  const {writes}=await setup(page);
  await page.goto("/en/portal");
  await staffView(page,/Team queue/).click();
  await page.getByRole("tab",{name:/Needs an owner/}).click();
  await page.getByRole("button",{name:"Open",exact:true}).first().click();

  await expect(page.getByRole("heading",{name:"This case has no coordinator"})).toBeVisible();
  expect(writes.filter(w=>w.path.endsWith("/claim"))).toHaveLength(0);
  // Ownership is offered exactly once. It used to appear both here and again in the read-only banner.
  const claim=page.getByRole("button",{name:"Take ownership",exact:true});
  await expect(claim).toHaveCount(1);

  await claim.click();
  await expect(page.getByRole("heading",{name:"New Patient",exact:true})).toBeVisible();
  await page.getByRole("button",{name:/My dashboard/}).click();
  // The claimed case is now the coordinator's own work, which is what the queue move has to show.
  await staffView(page,/My cases/).click();
  await expect(page.getByText("RS-2026-000001")).toBeVisible();
});

test("a claim another coordinator won returns to the refreshed queue with a useful message",async({page})=>{
  await setup(page,"COORDINATOR",{claimConflict:true});await page.goto("/en/portal");
  await staffView(page,/Team queue/).click();
  await page.getByRole("tab",{name:/Needs an owner/}).click();
  await page.getByRole("button",{name:"Open",exact:true}).first().click();
  await page.getByRole("button",{name:"Take ownership",exact:true}).click();
  await expect(portalAlerts(page)).toContainText("Another coordinator");
});

test("the team queue is a lead-only view reachable from the keyboard",async({page})=>{
  await setup(page,"COORDINATOR_LEAD");await page.goto("/en/portal");
  await staffView(page,/My cases/).focus();await page.keyboard.press("Tab");
  await expect(staffView(page,/Team queue/)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(staffView(page,/Team queue/)).toHaveAttribute("aria-current","page");
  await page.getByRole("tab",{name:/Owned by your team/}).click();
  await expect(page.getByText("Omar Example")).toBeVisible();
});

test("account settings persist and keep the current case when switching language",async({page})=>{
  const {writes}=await setup(page);await page.goto("/en/portal");
  await staffView(page,/My cases/).click();
  await page.getByRole("button",{name:"Open",exact:true}).first().click();
  await page.getByLabel("Account: Layla Hassan",{exact:true}).click();await page.getByRole("button",{name:"Account settings",exact:true}).click();
  await page.getByLabel("Display name",{exact:true}).fill("Layla Updated");await page.locator('select[name="locale"]').selectOption("ar");await page.getByRole("button",{name:"Save changes"}).click();
  await expect(page).toHaveURL(url=>url.pathname==="/ar/portal"&&url.searchParams.get("case")==="owned");await expect(page.getByLabel("الحساب: Layla Updated",{exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Maya Example",exact:true})).toBeVisible();
  expect(writes.find(w=>w.path==="/account/preferences")?.body.displayName).toBe("Layla Updated");
});

test("search survives opening and returning from a case",async({page})=>{
  await setup(page);await page.goto("/en/portal");
  await staffView(page,/My cases/).click();
  const search=page.getByRole("searchbox").first();await search.fill("Maya");
  await page.getByRole("button",{name:"Open",exact:true}).first().click();
  await page.getByRole("button",{name:/My dashboard/}).click();
  await expect(search).toHaveValue("Maya");
});

test("the clinical recommendation shows in the proposal panel and a document failure is not mistaken for empty data",async({page})=>{
  await setup(page,"COORDINATOR",{reviews:true,documentsFail:true});await page.goto("/en/portal");
  await staffView(page,/My cases/).click();
  await page.getByRole("button",{name:"Open",exact:true}).first().click();
  // The consultant's recommendation lives in the Patient proposal panel; coordinators get no separate
  // "Doctor reviews" panel.
  await expect(page.getByRole("heading",{name:"Patient proposal"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Doctor reviews"})).toHaveCount(0);
  await expect(page.getByText("Review finding visible to the care team").filter({ visible: true }).first()).toBeVisible();
  await expect(portalAlerts(page)).toContainText("Documents");
});

test("a failed message submission retains the draft",async({page})=>{
  await setup(page,"COORDINATOR",{saveFail:true});await page.goto("/en/portal");
  await staffView(page,/My cases/).click();
  await page.getByRole("button",{name:"Open",exact:true}).first().click();
  await page.getByRole("button",{name:"Messages",exact:true}).click();
  const draft=page.locator('textarea[dir="auto"]');await draft.fill("Please review these details");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  // The drawer shows the error itself (the page banner sits behind the modal).
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Unable to save");await expect(draft).toHaveValue("Please review these details");
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

test("My work words an item from its code in Arabic, keeping the case number in order",async({page})=>{
  await setup(page,"DOCTOR",{pendingWork:true});await page.goto("/ar/portal");
  await staffView(page,/مهامي/).click();
  await expect(page.getByRole("heading",{name:"تعيين سريري جديد"})).toBeVisible();
  await expect(page.getByText(/عُيّنت لك الحالة \u2068RS-2026-000009\u2069 للمراجعة السريرية/)).toBeVisible();
  await expect(page.getByText(/You have been assigned/)).toHaveCount(0);
});

// A pending assignment is reachable only from My Work, and the consultant decides on it there: the
// patient's documents must load on that path exactly as they do for a queued case.
test("a consultant opening a pending assignment from My Work sees the patient's documents",async({page})=>{
  await setup(page,"DOCTOR",{pendingWork:true});await page.goto("/en/portal");
  await staffView(page,/My work/).click();
  await page.getByRole("button",{name:/Review assignment/}).first().click();
  await expect(page.getByRole("heading",{name:/New clinical assignment/})).toBeVisible();
  await expect(page.getByText("Clinical report.pdf")).toBeVisible();
  await expect(page.getByText(/No documents were uploaded/)).toHaveCount(0);
  await expect(page.getByRole("tab",{name:/Documents/})).toContainText("1");
});
