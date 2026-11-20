// Drive the native existing-mill selector and the explicit new-mill field.
async function fillSettingField(page,id,value){
 if(id!=='editMill')return page.locator('#'+id).fill(String(value));
 const exists=await page.locator('#editMill option').evaluateAll((options,value)=>options.some(o=>o.value===value),String(value));
 const adding=await page.locator('#newSettingMillGroup').isVisible();
 if(exists){if(adding)await page.locator('#toggleNewSettingMill').click();await page.locator('#editMill').selectOption(String(value));}
 else{if(!adding)await page.locator('#toggleNewSettingMill').click();await page.locator('#newSettingMill').fill(String(value));}
}
module.exports={fillSettingField};
