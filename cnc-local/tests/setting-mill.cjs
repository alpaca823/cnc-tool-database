// Create missing test mills through Mills, then select them in Feeds & Speeds.
async function fillSettingField(page,id,value){
 if(id!=='editMill')return page.locator('#'+id).fill(String(value));
 const exists=await page.locator('#editMill option').evaluateAll((options,value)=>options.some(o=>o.value===value),String(value));
 if(!exists){await page.locator('.nav-button[data-page=mills]').click();await page.locator('#addMill').click();await page.locator('#millNumber').fill(String(value));await page.locator('#saveMill').click();await page.waitForFunction(()=>!document.getElementById('millFields').disabled&&document.getElementById('adminStatus').textContent.includes('Mill saved'));await page.locator('.nav-button[data-page=feeds]').click();}
 await page.locator('#editMill').selectOption(String(value));
}
module.exports={fillSettingField};
