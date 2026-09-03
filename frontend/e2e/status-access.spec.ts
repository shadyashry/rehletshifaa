import { expect, test } from "@playwright/test";

const BASE="http://localhost:8080/api/v1/public/cases/status-token";

test("patient verifies contact, sees a calm status and supplies requested information",async({page})=>{
 await page.route(BASE,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({caseNumber:"RS-2026-000001",purpose:"INFORMATION_RESPONSE",channel:"WHATSAPP",destinationHint:"***0001"})}));
 await page.route(`${BASE}/request-access`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({caseNumber:"RS-2026-000001",purpose:"INFORMATION_RESPONSE",channel:"WHATSAPP",destinationHint:"***0001"})}));
 await page.route(`${BASE}/verify`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({grant:"short-lived-grant",expiresAt:"2026-09-03T21:00:00Z"})}));
 await page.route(`${BASE}/view`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({caseNumber:"RS-2026-000001",status:"INFORMATION_REQUIRED",statusEn:"Action required from you",statusAr:"مطلوب إجراء منك",actionRequired:true})}));
 await page.route(`${BASE}/respond`,route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify("00000000-0000-0000-0000-000000000001")}));
 await page.goto("/en/status/status-token");
 await page.getByRole("button",{name:"Send verification code"}).click();
 await page.getByLabel("Verification code").fill("123456");
 await page.getByRole("button",{name:"Verify and continue"}).click();
 await expect(page.getByRole("heading",{name:"Action required from you"})).toBeVisible();
 await page.getByLabel("Add a short note").fill("I have attached the requested update.");
 await page.getByRole("button",{name:"Send information"}).click();
 await expect(page.getByText("Thank you — your information was sent securely.")).toBeVisible();
});
