const {chromium}=require('C:/Users/hp/Projects/rehletshifaa/frontend/node_modules/playwright-core');
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:1440,height:780},recordVideo:{dir:'rec',size:{width:1440,height:780}}});
 const p=await ctx.newPage();
 await p.goto('http://localhost:3000/en',{waitUntil:'networkidle'});
 await p.waitForTimeout(16000);
 await ctx.close(); await b.close();
})();
