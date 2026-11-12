/* Local-only storage and settings API. This password gate is a convenience on a
   shared workstation; people with access to this file/browser can inspect it. */
(() => {
  'use strict';
  const STORAGE_KEY = 'cnc-tool-database-v1';
  const ITERATIONS = 210000;
  const MAX_SETTINGS = 10000;
  const MAX_PASSWORDS = 20;
  const DEFAULT_PASSWORD_ID = 'default-admin';
  const DEFAULT_PASSWORD_LABEL = 'Default fallback';
  const sessions = new Map();
  const cryptoApi = window.crypto;
  let mutationQueue = Promise.resolve();
  const clone = value => JSON.parse(JSON.stringify(value));
  const keyOf = item => ({mill:item.mill, material:item.material});
  const sameKey = (item,key) => !!key && item.mill === key.mill && item.material === key.material;
  const uid = () => Array.from(cryptoApi.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2,'0')).join('');
  const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
  const fromHex = value => Uint8Array.from(value.match(/../g), byte => parseInt(byte,16));

  function storageRead() {
    try {return localStorage.getItem(STORAGE_KEY);}
    catch (_) {throw new Error('Browser storage is unavailable. Open this file in a regular browser window with local storage enabled.');}
  }
  function storageWrite(state) {
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
    catch (_) {throw new Error('Your changes could not be saved to browser storage. Export a backup, remove some images or free browser storage, then try again. Make sure storage is enabled. Existing saved data was not replaced.');}
  }
  function validateImage(value,label) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 250000)
      throw new Error(label + ' must be an embedded JPEG, PNG, or WebP image of at most 250,000 characters.');
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(match[2]))
      throw new Error(label + ' must be a valid embedded JPEG, PNG, or WebP image.');
    // Decode only the file header so this also works in small JS test runtimes
    // without browser atob(). Images are decoded fully by the upload preview.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const header = [];
    let accumulator = 0, bits = 0;
    for (const character of match[2].slice(0,16)) {
      if (character === '=') break;
      accumulator = (accumulator << 6) | alphabet.indexOf(character); bits += 6;
      if (bits >= 8) {bits -= 8; header.push((accumulator >>> bits) & 255);}
    }
    const bytes = (...expected) => expected.every((byte,index) => header[index] === byte);
    const png = bytes(137,80,78,71,13,10,26,10);
    const jpeg = bytes(255,216,255);
    const webp = bytes(82,73,70,70) && header[8] === 87 && header[9] === 69 && header[10] === 66 && header[11] === 80;
    if (!({png,jpeg,webp})[match[1]]) throw new Error(label + ' does not match its image format. Choose a JPEG, PNG, or WebP file.');
    return value;
  }
  function validateSetting(setting) {
    if (!setting || typeof setting !== 'object' || Array.isArray(setting)) throw new Error('Enter valid cutting settings.');
    const result = {};
    for (const [name,max,label] of [['mill',100,'Mill number'],['material',200,'Material']]) {
      result[name] = typeof setting[name] === 'string' ? setting[name].trim() : '';
      if (!result[name] || result[name].length > max) throw new Error(label + ' is required and must be at most ' + max + ' characters.');
    }
    for (const [name,label] of [['rpm','RPM'],['feed','Feed rate'],['depth','Depth of cut'],['plungeRate','Plunge rate']]) {
      const value = setting[name];
      if (name === 'plungeRate' && (value == null || (typeof value === 'string' && !value.trim()))) continue;
      result[name] = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
      if (result[name].length > 400 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(result[name]) || !Number.isFinite(Number(result[name])) || Number(result[name]) <= 0)
        throw new Error(label + ' must be a positive decimal number, without commas or unit labels.');
    }
    if (setting.coolantMist != null) {
      if (typeof setting.coolantMist !== 'boolean') throw new Error('Coolant mist must be enabled or disabled.');
      result.coolantMist = setting.coolantMist;
    }
    result.units = typeof setting.units === 'string' ? setting.units.trim().toLowerCase() : '';
    if (!['mm','inch'].includes(result.units)) throw new Error('Units must be mm or inch.');
    // Older browser databases and backups may contain metric entries.
    // Convert the actual values before making inches the canonical unit.
    if (result.units === 'mm') {
      for (const name of ['feed','depth','plungeRate']) {
        if (result[name] === undefined) continue;
        const inches = Number(result[name]) / 25.4;
        if (!Number.isFinite(inches) || inches <= 0) throw new Error('The metric ' + name + ' is too small to convert to inches.');
        result[name] = inches.toLocaleString('en-US', {useGrouping:false,maximumSignificantDigits:15});
      }
    }
    result.units = 'inch';
    result.notes = typeof setting.notes === 'string' ? setting.notes.trim() : '';
    if (result.notes.length > 2000) throw new Error('Notes must be at most 2000 characters.');
    for (const [name,label] of [['toolImage','Tool image'],['materialImage','Material image']]) {
      const image = validateImage(setting[name],label);
      if (image != null) result[name] = image;
    }
    return result;
  }
  function validateSettings(settings, keepVersions) {
    if (!Array.isArray(settings) || settings.length > MAX_SETTINGS) throw new Error('The database must contain at most 10,000 settings entries.');
    const keys = new Set();
    return settings.map(setting => {
      const result = validateSetting(setting);
      const key = JSON.stringify([result.mill,result.material]);
      if (keys.has(key)) throw new Error('Duplicate mill/material pair: ' + result.mill + ' / ' + result.material + '.');
      keys.add(key);
      if (keepVersions && (typeof setting.version !== 'string' || !setting.version)) throw new Error('A saved entry is missing its version.');
      const converted = typeof setting.units === 'string' && setting.units.trim().toLowerCase() === 'mm';
      result.version = keepVersions && !converted ? setting.version : uid();
      return result;
    });
  }
  function validateMaterials(materials, keepVersions) {
    if (!Array.isArray(materials) || materials.length > MAX_SETTINGS) throw new Error('The material list must contain at most 10,000 entries.');
    const names = new Set();
    return materials.map(material => {
      if (!material || typeof material !== 'object' || Array.isArray(material)) throw new Error('Enter a valid material.');
      const name = typeof material.name === 'string' ? material.name.trim() : '';
      if (!name || name.length > 200) throw new Error('Material name is required and must be at most 200 characters.');
      if (names.has(name)) throw new Error('That material already exists: ' + name + '.');
      names.add(name);
      if (keepVersions && (typeof material.version !== 'string' || !material.version)) throw new Error('A saved material is missing its version.');
      const result = {name,version:keepVersions ? material.version : uid()};
      const image = validateImage(material.materialImage,'Material image');
      if (image != null) result.materialImage = image;
      return result;
    });
  }
  function materialLibrary(settings, source, keepVersions, rawMaterials = []) {
    if (source !== undefined) {
      const materials = validateMaterials(source,keepVersions);
      const names = new Set(materials.map(material => material.name));
      if (settings.some(setting => !names.has(setting.material))) throw new Error('A cutting setting refers to a material that is missing from the material list.');
      if (rawMaterials.some(record => !names.has(record.material))) throw new Error('A raw material record refers to a material that is missing from the material list.');
      return materials;
    }
    // Earlier copies stored materials only inside cutting settings. Preserve
    // those names and photos while creating the shared library once.
    const materials = [];
    settings.forEach(setting => {
      let material = materials.find(item => item.name === setting.material);
      if (!material) {material = {name:setting.material,version:uid()}; materials.push(material);}
      if (!material.materialImage && setting.materialImage) material.materialImage = setting.materialImage;
    });
    rawMaterials.forEach(record => {
      if (!materials.some(material => material.name === record.material)) materials.push({name:record.material,version:uid()});
    });
    return materials;
  }
  function optionalInteger(value,label,min,max) {
    if (value == null || (typeof value === 'string' && !value.trim())) return undefined;
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const number = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < min || (max !== undefined && number > max))
      throw new Error(label + ' must be a whole number ' + (max === undefined ? 'of at least ' + min : 'from ' + min + ' to ' + max) + '.');
    return number;
  }
  function validateRawMaterial(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Enter a valid raw material record.');
    if (record.units !== undefined && record.units !== 'inch') throw new Error('Raw material sizes must be entered in inches.');
    const material = typeof record.material === 'string' ? record.material.trim() : '';
    if (!material || material.length > 200) throw new Error('Material is required and must be at most 200 characters.');
    const result = {material};
    for (const [name,label] of [['length','Length'],['width','Width'],['thickness','Thickness']]) {
      const value = record[name];
      if (name === 'thickness' && (value == null || (typeof value === 'string' && !value.trim()))) continue;
      const decimal = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
      if (decimal.length > 400 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(decimal) || !Number.isFinite(Number(decimal)) || Number(decimal) <= 0)
        throw new Error(label + ' must be a positive decimal number in inches, without commas or unit labels.');
      result[name] = decimal;
    }
    const quantity = optionalInteger(record.quantity,'Sheet quantity',0);
    if (quantity === undefined) throw new Error('Sheet quantity is required and must be a whole number of at least 0.');
    result.quantity = quantity;
    for (const [name,max,label] of [['location',160,'Location'],['notes',2000,'Raw material notes']]) {
      if (record[name] != null && typeof record[name] !== 'string') throw new Error(label + ' must be text.');
      result[name] = typeof record[name] === 'string' ? record[name].trim() : '';
      if (result[name].length > max) throw new Error(label + ' must be at most ' + max + ' characters.');
    }
    if (Object.prototype.hasOwnProperty.call(record,'materialImage') || Object.prototype.hasOwnProperty.call(record,'toolImage'))
      throw new Error('Raw material images belong in the shared material library.');
    return result;
  }
  function validateRawMaterials(records,keepVersions) {
    if (!Array.isArray(records) || records.length > MAX_SETTINGS) throw new Error('The raw material list must contain at most 10,000 entries.');
    const ids = new Set();
    return records.map(record => {
      const result = validateRawMaterial(record);
      if ((keepVersions || record.id !== undefined) && (typeof record.id !== 'string' || !record.id.trim() || record.id !== record.id.trim() || record.id.length > 100))
        throw new Error('A raw material record is missing its valid ID.');
      result.id = record.id === undefined ? uid() : record.id;
      if (ids.has(result.id)) throw new Error('The raw material list contains a duplicate record ID.');
      ids.add(result.id);
      if (keepVersions && (typeof record.version !== 'string' || !record.version)) throw new Error('A saved raw material record is missing its version.');
      result.version = keepVersions ? record.version : uid();
      return result;
    });
  }
  function validateMills(mills,keepVersions) {
    if (!Array.isArray(mills) || mills.length > MAX_SETTINGS) throw new Error('The mill list must contain at most 10,000 entries.');
    const numbers = new Set();
    return mills.map(mill => {
      if (!mill || typeof mill !== 'object' || Array.isArray(mill)) throw new Error('Enter a valid mill.');
      const number = typeof mill.number === 'string' ? mill.number.trim() : '';
      if (!number || number.length > 100) throw new Error('Mill number is required and must be at most 100 characters.');
      if (numbers.has(number)) throw new Error('That mill already exists: ' + number + '.');
      numbers.add(number);
      if (keepVersions && (typeof mill.version !== 'string' || !mill.version)) throw new Error('A saved mill is missing its version.');
      const result = {number,version:keepVersions ? mill.version : uid()};
      for (const [name,max,label] of [['name',160,'Mill name'],['type',80,'Mill type'],['coating',80,'Coating'],['location',160,'Location'],['notes',2000,'Mill notes']]) {
        if (mill[name] != null && typeof mill[name] !== 'string') throw new Error(label + ' must be text.');
        result[name] = typeof mill[name] === 'string' ? mill[name].trim() : '';
        if (result[name].length > max) throw new Error(label + ' must be at most ' + max + ' characters.');
      }
      if (mill.purchaseUrl != null && typeof mill.purchaseUrl !== 'string') throw new Error('Purchase link must be a website URL.');
      const purchaseUrl = typeof mill.purchaseUrl === 'string' ? mill.purchaseUrl.trim() : '';
      if (purchaseUrl) {
        if (purchaseUrl.length > 2048 || !/^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s<>"']*)?$/i.test(purchaseUrl))
          throw new Error('Purchase link must be a full http:// or https:// website URL.');
        result.purchaseUrl = purchaseUrl;
      }
      if (mill.diameter != null && !(typeof mill.diameter === 'string' && !mill.diameter.trim())) {
        const diameter = typeof mill.diameter === 'string' || typeof mill.diameter === 'number' ? String(mill.diameter).trim() : '';
        if (diameter.length > 400 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(diameter) || !Number.isFinite(Number(diameter)) || Number(diameter) <= 0)
          throw new Error('Diameter must be a positive decimal number in inches, without commas or unit labels.');
        result.diameter = diameter;
      }
      for (const [name,label,min,max] of [['flutes','Flutes',1,100],['quantity','Quantity',0],['reorderLevel','Reorder level',0]]) {
        const integer = optionalInteger(mill[name],label,min,max);
        if (integer !== undefined) result[name] = integer;
      }
      const image = validateImage(mill.toolImage,'Tool image');
      if (image != null) result.toolImage = image;
      return result;
    });
  }
  function millLibrary(settings,source,keepVersions) {
    if (source !== undefined) {
      const mills = validateMills(source,keepVersions);
      const numbers = new Set(mills.map(mill => mill.number));
      if (settings.some(setting => !numbers.has(setting.mill))) throw new Error('A cutting setting refers to a mill that is missing from the mill list.');
      return mills;
    }
    // Legacy files know only the mill number. Keep every setting and photo,
    // and leave stock untracked until someone enters an actual quantity.
    const mills = [], byNumber = new Map();
    settings.forEach(setting => {
      let mill = byNumber.get(setting.mill);
      if (!mill) {
        mill = validateMills([{number:setting.mill}],false)[0];
        mills.push(mill); byNumber.set(mill.number,mill);
      }
      if (!mill.toolImage && setting.toolImage) mill.toolImage = setting.toolImage;
    });
    return mills;
  }
  function validateNotes(value,keepVersions) {
    if (!Array.isArray(value) || value.length > 1000) throw new Error('Notes must be a list of at most 1,000 entries.');
    const ids = new Set();
    return value.map(record => {
      if (!record || typeof record.title !== 'string' || !record.title.trim() || record.title.trim().length > 120 || typeof record.body !== 'string' || !record.body.trim() || record.body.length > 10000) throw new Error('Each note needs a title (up to 120 characters) and text (up to 10,000 characters).');
      if (typeof record.id !== 'string' || !record.id || record.id.length > 100 || ids.has(record.id)) throw new Error('The note ID is invalid or duplicated.');
      if (keepVersions && (typeof record.version !== 'string' || !record.version)) throw new Error('The note version is invalid.');
      if (record.pinned !== undefined && typeof record.pinned !== 'boolean') throw new Error('Pinned must be true or false.');
      ids.add(record.id);
      return {id:record.id,title:record.title.trim(),body:record.body,pinned:record.pinned === true,version:keepVersions ? record.version : uid()};
    });
  }
  function noteIndex(records,original) {
    if (!original || typeof original.id !== 'string' || typeof original.version !== 'string') throw new Error('Select an existing note first.');
    const index = records.findIndex(item => item.id === original.id);
    if (index < 0 || records[index].version !== original.version) throw new Error('This note changed or was deleted. Refresh and select Edit again.');
    return index;
  }
  const DRAWING_TYPES={pdf:'application/pdf',svg:'image/svg+xml',dxf:'application/dxf',dwg:'image/vnd.dwg',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
  function validateDrawingFiles(records,newFiles=false) {
    if(!Array.isArray(records)||records.length>250)throw new Error('The drawing library is invalid or full.');
    const ids=new Set();let total=0;
    return records.map(record=>{
      if(!record||typeof record.name!=='string'||!record.name.trim()||record.name.length>200||/[\\/\x00-\x1f]/.test(record.name))throw new Error('Enter a valid drawing filename.');
      const ext=record.name.split('.').pop().toLowerCase(),type=DRAWING_TYPES[ext];
      if(!type||record.type!==type||typeof record.data!=='string'||record.data.length>1398104||record.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(record.data))throw new Error('Use a PDF, SVG, DXF, DWG, PNG, JPG, or WebP file of at most 1 MB.');
      const size=record.data.length/4*3-(record.data.endsWith('==')?2:record.data.endsWith('=')?1:0);
      if(size<1||size>1048576)throw new Error('Each drawing must be between 1 byte and 1 MB.');
      if((type==='image/png'&&!record.data.startsWith('iVBORw0KGgo'))||(type==='image/jpeg'&&!record.data.startsWith('/9j/'))||(type==='image/webp'&&!record.data.startsWith('UklGR'))||(type==='application/pdf'&&!record.data.startsWith('JVBERi0')))throw new Error('The drawing contents do not match the file type.');
      const id=newFiles?uid():record.id;
      if(typeof id!=='string'||!id||id.length>100||ids.has(id))throw new Error('The drawing ID is invalid or duplicated.');
      ids.add(id);total+=size;if(total>8388608)throw new Error('Drawing storage is full. No changes were saved.');
      return {id,name:record.name.trim(),type,data:record.data,size};
    });
  }
  function checkDrawingRefs(data) {
    const ids=new Set(data.cutDrawings.map(file=>file.id)),cuts=[...data.cuts];
    for(const report of data.reports)if(report.kind==='plan')cuts.push(...report.plan.before,...report.plan.after);
    if(cuts.some(cut=>cut.drawingIds.some(id=>!ids.has(id))))throw new Error('A cut or its undo history refers to a missing drawing.');
    const sizes=new Map(data.cutDrawings.map(file=>[file.id,file.size]));if(cuts.some(cut=>cut.drawingIds.reduce((sum,id)=>sum+sizes.get(id),0)>2097152))throw new Error('Drawings for one cut must total 2 MB or less.');
  }
  function prepareCutDrawings(state,record,index) {
    let ids=record?.drawingIds===undefined&&index>=0?state.cuts[index].drawingIds:(record?.drawingIds===undefined?[]:record.drawingIds);
    if(!Array.isArray(ids)||ids.length>3||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('A cut can have up to 3 unique drawings.');
    ids=ids.slice();if(ids.some(id=>!state.cutDrawings.some(file=>file.id===id)))throw new Error('A selected drawing no longer exists. Refresh and try again.');
    const files=validateDrawingFiles(record?.newDrawings===undefined?[]:record.newDrawings,true);
    for(const file of files){let existing=state.cutDrawings.find(row=>row.name===file.name&&row.type===file.type&&row.data===file.data);if(!existing){state.cutDrawings.push(file);existing=file;}if(!ids.includes(existing.id))ids.push(existing.id);}
    if(ids.length>3||ids.reduce((sum,id)=>sum+state.cutDrawings.find(file=>file.id===id).size,0)>2097152)throw new Error('A cut can have up to 3 drawings, totaling at most 2 MB.');
    if(state.cutDrawings.length>250||state.cutDrawings.reduce((sum,file)=>sum+file.size,0)>8388608)throw new Error('Drawing storage is full. No changes were saved.');
    return ids;
  }
  function validateCuts(value,keepVersions) {
    if (!Array.isArray(value) || value.length > 1000) throw new Error('The cut list must contain at most 1,000 entries.');
    const ids = new Set();
    return value.map(record => {
      if (!record || typeof record.title !== 'string' || !record.title.trim() || record.title.trim().length > 120) throw new Error('A cut needs a title of up to 120 characters.');
      if (typeof record.id !== 'string' || !record.id || record.id.length > 100 || ids.has(record.id)) throw new Error('The cut ID is invalid or duplicated.');
      if (keepVersions && (typeof record.version !== 'string' || !record.version)) throw new Error('The cut version is invalid.');
      if (record.completed !== undefined && typeof record.completed !== 'boolean') throw new Error('Completed must be true or false.');
      if (record.priority !== undefined && !['low','normal','high','urgent'].includes(record.priority)) throw new Error('Choose Low, Normal, High, or Urgent priority.');
      const quantity = optionalInteger(record.quantity,'Cut quantity',1,1000000);
      if (quantity === undefined) throw new Error('Enter a cut quantity.');
      const item = {id:record.id,title:record.title.trim(),quantity,priority:record.priority || 'normal',completed:record.completed === true,version:keepVersions ? record.version : uid()};
      const drawingIds=record.drawingIds===undefined?[]:record.drawingIds;
      if(!Array.isArray(drawingIds)||drawingIds.length>3||drawingIds.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(drawingIds).size!==drawingIds.length)throw new Error('A cut can have up to 3 unique drawings.');
      item.drawingIds=drawingIds.slice();
      for (const [name,max] of [['material',200],['notes',2000]]) {
        if (record[name] !== undefined && (typeof record[name] !== 'string' || record[name].length > max)) throw new Error(name + ' is too long or invalid.');
        item[name] = (record[name] || '').trim();
      }
      for (const name of ['length','width','thickness']) {
        const value = record[name]; if (value == null || value === '') continue;
        const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
        if (text.length > 400 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0) throw new Error('Cut dimensions must be positive decimal inches.');
        item[name] = text;
      }
      ids.add(item.id); return item;
    });
  }
  function cutIndex(records,original) {
    if (!original || typeof original.id !== 'string' || typeof original.version !== 'string') throw new Error('Select an existing cut first.');
    const index = records.findIndex(item => item.id === original.id);
    if (index < 0 || records[index].version !== original.version) throw new Error('This cut changed or was deleted. Refresh and select it again.');
    return index;
  }
  function reportText(value,max,label) {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > max) throw new Error(label+' is invalid or too long.');
    return value.trim();
  }
  function validateReports(records,keepVersions) {
    if (!Array.isArray(records) || records.length > 10000) throw new Error('Report history must contain at most 10,000 entries.');
    const ids=new Set(),valid=value=>typeof value==='string'&&value.length>0&&value.length<=200;
    return records.map(row=>{
      if (!row || !valid(row.id) || ids.has(row.id) || !['material','mill','cut','plan'].includes(row.kind) || typeof row.undone!=='boolean' || !valid(row.time) || !Number.isFinite(Date.parse(row.time))) throw new Error('The report history is invalid.');
      if (keepVersions&&!valid(row.version)) throw new Error('The report version is invalid.');
      if(row.kind==='plan') {
        const plan=row.plan;
        if(!plan||!['create','edit','delete','move'].includes(plan.action)||!Array.isArray(plan.before)||!Array.isArray(plan.after)||plan.before.length>2||plan.after.length>2)throw new Error('The cut-plan history is invalid.');
        const before=validateCuts(plan.before,true),after=validateCuts(plan.after,true),sizes={create:[0,1],edit:[1,1],delete:[1,0],move:[2,2]};
        if(before.length!==sizes[plan.action][0]||after.length!==sizes[plan.action][1]||(['edit','move'].includes(plan.action)&&before.some(record=>!after.some(item=>item.id===record.id))))throw new Error('The cut-plan snapshots are invalid.');
        const anchors={};for(const name of ['previous','next']){const anchor=plan[name];if(anchor!=null&&(!valid(anchor.key)||!valid(anchor.version)))throw new Error('The cut-plan position is invalid.');anchors[name]=anchor?{key:anchor.key,version:anchor.version}:null;}
        ids.add(row.id);return {id:row.id,version:keepVersions?row.version:uid(),kind:'plan',undone:row.undone,time:row.time,label:reportText(row.label,1500,'Report label'),reporter:reportText(row.reporter,80,'Reporter'),details:reportText(row.details,500,'Details'),plan:{action:plan.action,before,after,...anchors}};
      }
      const source=row.source;
      if (!source || !valid(source.key) || !valid(source.beforeVersion) || !valid(source.afterVersion) || (row.kind!=='cut'&&(!Number.isSafeInteger(source.quantityBefore)||source.quantityBefore<1))) throw new Error('The report source is invalid.');
      if (row.leftover && (row.kind!=='material'||!valid(row.leftover.id)||!valid(row.leftover.version))) throw new Error('The report leftover is invalid.');
      ids.add(row.id);
      return {id:row.id,version:keepVersions?row.version:uid(),kind:row.kind,undone:row.undone,time:row.time,label:reportText(row.label,1500,'Report label'),reporter:reportText(row.reporter,80,'Reporter'),details:reportText(row.details,500,'Details'),source:{key:source.key,beforeVersion:source.beforeVersion,afterVersion:source.afterVersion,...(row.kind==='cut'?{}:{quantityBefore:source.quantityBefore})},...(row.leftover?{leftover:{id:row.leftover.id,version:row.leftover.version}}:{})};
    });
  }
  function appendReport(state,kind,label,source,leftover,meta={}) {
    if (state.reports.length>=10000) throw new Error('Report history is full. No inventory changes were saved.');
    const report={id:uid(),version:uid(),kind,label,source,undone:false,time:new Date().toISOString(),reporter:meta?.reporter,details:meta?.details,...(leftover?{leftover:{id:leftover.id,version:leftover.version}}:{})};
    state.reports.unshift(validateReports([report],true)[0]);
  }
  function appendPlanReport(state,action,label,before,after,anchors={},meta={}) {
    if(state.reports.length>=10000)throw new Error('Report history is full. No changes were saved.');
    state.reports.unshift(validateReports([{id:uid(),version:uid(),kind:'plan',undone:false,time:new Date().toISOString(),label,reporter:meta?.reporter,details:meta?.details,plan:{action,before,after,...anchors}}],true)[0]);
  }
  function rebindPlan(report,id,oldVersion,fresh) {
    let changed=false;
    if(report.kind==='cut'&&report.source.key===id&&report.source.afterVersion===oldVersion){report.source.afterVersion=fresh;changed=true;}
    if(report.kind==='plan'){
      for(const row of report.plan.after)if(row.id===id&&row.version===oldVersion){row.version=fresh;changed=true;}
      for(const name of ['previous','next'])if(report.plan[name]?.key===id&&report.plan[name].version===oldVersion){report.plan[name].version=fresh;changed=true;}
    }
    return changed;
  }
  function undoPlanReport(state,report) {
    const plan=report.plan,fail=()=>{throw new Error('The cut plan changed after this report. Undo newer changes first. Nothing was changed.');};
    for(const expected of plan.after){const current=state.cuts.find(row=>row.id===expected.id);if(!current||current.version!==expected.version)fail();}
    if(plan.action==='create'){
      const id=plan.after[0].id,index=state.reports.indexOf(report);
      if(state.reports.slice(0,index).some(row=>!row.undone&&row.kind==='plan'&&(row.plan.previous?.key===id||row.plan.next?.key===id)))fail();
      state.cuts.splice(state.cuts.findIndex(row=>row.id===id),1);
    }else if(plan.action==='delete'){
      if(state.cuts.some(row=>row.id===plan.before[0].id)||state.cuts.length>=1000)fail();
      let previous=-1,next=-1;
      for(const name of ['previous','next'])if(plan[name]){const index=state.cuts.findIndex(row=>row.id===plan[name].key&&row.version===plan[name].version);if(index<0)fail();if(name==='previous')previous=index;else next=index;}
      if(previous>=0&&next>=0&&next!==previous+1)fail();
      const restored={...plan.before[0],version:uid()};state.cuts.splice(next>=0?next:previous>=0?previous+1:0,0,restored);
      for(const older of state.reports)if(older!==report&&!older.undone&&rebindPlan(older,restored.id,plan.before[0].version,restored.version))older.version=uid();
    }else {
      const positions=plan.before.map(row=>state.cuts.findIndex(item=>item.id===row.id));
      for(let i=0;i<plan.before.length;i++){
        const before=plan.before[i],restored={...before,version:uid()};state.cuts[positions[i]]=restored;
        for(const older of state.reports)if(older!==report&&!older.undone&&rebindPlan(older,restored.id,before.version,restored.version))older.version=uid();
      }
      if(plan.action==='move')[state.cuts[positions[0]],state.cuts[positions[1]]]=[state.cuts[positions[1]],state.cuts[positions[0]]];
    }
    report.undone=true;report.version=uid();commit(state);return true;
  }
  function reportMaterial(state,original,remainder,meta) {
    const source=state.rawMaterials[originalRawMaterialIndex(state.rawMaterials,original)];
    if(source.quantity<1)throw new Error('There are no pieces left in this entry.');
    let leftover=null;
    if(remainder!==null){
      if(!remainder||typeof remainder!=='object'||Array.isArray(remainder))throw new Error('Enter a valid leftover size or use the whole piece.');
      if(state.rawMaterials.length>=MAX_SETTINGS)throw new Error('The sheet list is full. No quantity has been changed.');
      leftover=validateRawMaterial({...source,length:remainder.length,width:remainder.width,quantity:1});
      const l=Number(leftover.length),w=Number(leftover.width),sl=Number(source.length),sw=Number(source.width);
      if(!((l<=sl&&w<=sw)||(l<=sw&&w<=sl))||l*w>=sl*sw)throw new Error('The leftover must fit inside the original piece and be smaller.');
      leftover.id=uid();leftover.version=uid();
    }
    const change={key:source.id,beforeVersion:source.version,afterVersion:uid(),quantityBefore:source.quantity};
    appendReport(state,'material',source.material+' · '+source.length+' × '+source.width+' inch',change,leftover,meta);
    source.quantity--;source.version=change.afterVersion;if(leftover)state.rawMaterials.push(leftover);commit(state);return true;
  }
  function reportArchive(state) {
    return {reports:state.reports.map(({version,...row})=>row),reportVersions:{mills:state.mills.map(row=>({key:row.number,version:row.version})),rawMaterials:state.rawMaterials.map(row=>({key:row.id,version:row.version})),cuts:state.cuts.map(row=>({key:row.id,version:row.version}))}};
  }
  function restoreReportVersions(data,metadata) {
    if(!data.reports.length)return;
    if(!metadata||typeof metadata!=='object')throw new Error('Report history requires undo-version metadata.');
    const map=new Map();
    for(const [group,kind]of [['mills','mill'],['rawMaterials','material'],['cuts','cut']]){
      const entries=metadata[group];if(!Array.isArray(entries)||entries.length>MAX_SETTINGS)throw new Error('Invalid report-version metadata.');
      const keys=new Set();
      for(const row of entries){const record=data[group].find(item=>(kind==='mill'?item.number:item.id)===row?.key);
        if(!record||keys.has(row.key)||typeof row.version!=='string'||!row.version||row.version.length>200||map.has(row.version))throw new Error('Report-version metadata does not match the inventory.');
        keys.add(row.key);map.set(row.version,{key:row.key,kind,version:record.version});
      }
    }
    for(const report of data.reports){
      if(report.kind==='plan'){
        for(const row of report.plan.after){const current=map.get(row.version);if(current?.kind==='cut'&&current.key===row.id)row.version=current.version;}
        for(const name of ['previous','next'])if(report.plan[name]){const current=map.get(report.plan[name].version);if(current?.kind==='cut'&&current.key===report.plan[name].key)report.plan[name].version=current.version;}
        continue;
      }
      const current=map.get(report.source.afterVersion);if(current&&current.key===report.source.key&&current.kind===report.kind)report.source.afterVersion=current.version;
      if(report.leftover){const current=map.get(report.leftover.version);if(current?.kind==='material'&&current.key===report.leftover.id)report.leftover.version=current.version;}
    }
  }
  function validateState(value) {
    if (!value || value.format !== 'cnc-local-database' || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0)
      throw new Error('Unsupported saved database format.');
    const auth = value.auth;
    if (!validCredential(auth))
      throw new Error('The saved admin credentials are invalid.');
    if (auth.passwords !== undefined) {
      if (!Array.isArray(auth.passwords) || auth.passwords.length > MAX_PASSWORDS) throw new Error('The saved admin password list is invalid.');
      const ids = new Set([DEFAULT_PASSWORD_ID]), labels = new Set([DEFAULT_PASSWORD_LABEL.toLowerCase()]);
      for (const credential of auth.passwords) {
        if (!validCredential(credential) || typeof credential.id !== 'string' || !credential.id || ids.has(credential.id) ||
            typeof credential.label !== 'string' || credential.label !== credential.label.trim() || !credential.label || credential.label.length > 80 || labels.has(credential.label.toLowerCase()))
          throw new Error('The saved admin password list is invalid.');
        ids.add(credential.id); labels.add(credential.label.toLowerCase());
      }
    }
    const settings = validateSettings(value.settings,true);
    const rawMaterials = value.rawMaterials === undefined ? [] : validateRawMaterials(value.rawMaterials,true);
    const data = {...value,settings,rawMaterials,cutDrawings:validateDrawingFiles(value.cutDrawings===undefined?[]:value.cutDrawings),reports:validateReports(value.reports===undefined?[]:value.reports,true),cuts:validateCuts(value.cuts === undefined ? [] : value.cuts,true),notes:validateNotes(value.notes === undefined ? [] : value.notes,true),materials:materialLibrary(settings,value.materials,true,rawMaterials),mills:millLibrary(settings,value.mills,true)};
    checkDrawingRefs(data);return data;
  }
  function readState() {
    const raw = storageRead();
    if (raw == null) throw new Error('The local database is missing. Reload this file to initialize it, then import a backup if needed.');
    try {
      const saved = JSON.parse(raw);
      const state = validateState(saved);
      // Persist only after every row and the credential record have validated.
      // The unit tag changes in the same write, so reloads cannot convert twice.
      if (saved.materials === undefined || saved.mills === undefined || saved.rawMaterials === undefined || saved.settings.some(item => item.units.trim().toLowerCase() === 'mm')) commit(state);
      return state;
    }
    catch (error) {throw new Error('The saved database cannot be read: ' + error.message + ' No data has been replaced. Restore a backup or use a different browser profile.');}
  }
  async function hashPassword(password,salt) {
    const material = await cryptoApi.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits = await cryptoApi.subtle.deriveBits({name:'PBKDF2',salt:fromHex(salt),iterations:ITERATIONS,hash:'SHA-256'},material,256);
    return hex(bits);
  }
  async function createAuth(password) {
    const salt = uid();
    return {salt,hash:await hashPassword(password.toLowerCase(),salt),version:uid(),iterations:ITERATIONS};
  }
  function validCredential(credential) {
    return !!credential && typeof credential === 'object' && !Array.isArray(credential) &&
      typeof credential.salt === 'string' && /^[0-9a-f]{48}$/.test(credential.salt) &&
      typeof credential.hash === 'string' && /^[0-9a-f]{64}$/.test(credential.hash) &&
      typeof credential.version === 'string' && !!credential.version && credential.iterations === ITERATIONS;
  }
  function passwordsEqual(a,b) {
    let delta = a.length ^ b.length;
    for (let i=0;i<a.length;i++) delta |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
    return delta === 0;
  }
  function requireAdmin(token,state) {
    const session = typeof token === 'string' ? sessions.get(token) : null;
    const credentialValid = session && (session.credentialId === DEFAULT_PASSWORD_ID ||
      state.auth.passwords.some(credential => credential.id === session.credentialId && credential.version === session.credentialVersion));
    if (!session || session.expiresAt <= Date.now() || session.version !== state.auth.version || !credentialValid) {
      if (typeof token === 'string') sessions.delete(token);
      throw new Error('AUTH_REQUIRED: Your admin session expired. Please sign in again.');
    }
    return session;
  }
  function passwordLabel(label,passwords,exceptId) {
    const result = typeof label === 'string' ? label.trim() : '';
    if (!result || result.length > 80) throw new Error('Password label is required and must be at most 80 characters.');
    const key = result.toLowerCase();
    if (key === DEFAULT_PASSWORD_LABEL.toLowerCase() || passwords.some(credential => credential.id !== exceptId && credential.label.toLowerCase() === key))
      throw new Error('That password label already exists. Choose a different label.');
    return result;
  }
  function validateNewPassword(password) {
    if (typeof password === 'string' && password.toLowerCase() === 'feds201') throw new Error('The password Feds201 is reserved for the permanent default fallback.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('New password must have 8 to 128 characters.');
  }
  function customPassword(state,id) {
    if (id === DEFAULT_PASSWORD_ID) throw new Error('The default admin / Feds201 fallback cannot be changed or removed. Add an additional password instead.');
    const credential = state.auth.passwords.find(item => item.id === id);
    if (!credential) throw new Error('That admin password no longer exists. Refresh the list and try again.');
    return credential;
  }
  async function rejectDuplicatePassword(password,passwords,exceptId) {
    for (const credential of passwords) {
      if (credential.id !== exceptId && (passwordsEqual(await hashPassword(password,credential.salt),credential.hash) || passwordsEqual(await hashPassword(password.toLowerCase(),credential.salt),credential.hash)))
        throw new Error('That admin password already exists. Choose a different password.');
    }
  }
  function verifyPasswordListUnchanged(state,latest) {
    if (state.auth.version !== latest.auth.version || JSON.stringify(state.auth.passwords) !== JSON.stringify(latest.auth.passwords))
      throw new Error('The admin password list changed. Refresh the list and try again.');
  }
  function revokePasswordSessions(id) {
    for (const [token,session] of sessions) if (session.credentialId === id) sessions.delete(token);
  }
  function withStorageLock(callback) {
    if (navigator.locks && typeof navigator.locks.request === 'function') return navigator.locks.request(STORAGE_KEY,callback);
    return callback();
  }
  async function migratePasswords() {
    // Older versions stored only one credential. Keep a customized password as
    // an additional login, while restoring the permanent admin/Feds201 fallback.
    for (;;) {
      const state = readState();
      if (state.auth.passwords !== undefined) return;
      const defaultHash = await hashPassword('admin',state.auth.salt);
      const currentDefaultHash = await hashPassword('feds201',state.auth.salt);
      const latest = readState();
      if (latest.auth.passwords !== undefined) return;
      if (JSON.stringify(state.auth) !== JSON.stringify(latest.auth)) continue;
      latest.auth.passwords = (passwordsEqual(defaultHash,state.auth.hash) || passwordsEqual(currentDefaultHash,state.auth.hash)) ? [] :
        [{id:uid(),label:'Existing admin password',salt:state.auth.salt,hash:state.auth.hash,version:uid(),iterations:ITERATIONS}];
      commit(latest); return;
    }
  }
  function originalIndex(settings,original) {
    if (!original || !original.key || typeof original.version !== 'string') throw new Error('Select an existing entry first.');
    const index = settings.findIndex(item => sameKey(item,original.key));
    if (index < 0) throw new Error('No settings found. Refresh the list and try again.');
    if (settings[index].version !== original.version) throw new Error('This entry changed after you loaded it. Refresh the list and select Edit again.');
    return index;
  }
  function commit(state) {state.revision++; storageWrite(state);}
  function plainSettings(state) {
    return state.settings.map(({version,...item}) => item);
  }
  function plainMaterials(state) {
    return state.materials.map(({version,...item}) => item);
  }
  function plainMills(state) {
    return state.mills.map(({version,...item}) => item);
  }
  function plainRawMaterials(state) {
    return state.rawMaterials.map(({version,...item}) => item);
  }
  function stockStatus(mill) {
    if (mill.quantity === undefined) return 'untracked';
    if (mill.quantity === 0) return 'out';
    if (mill.reorderLevel !== undefined && mill.quantity <= mill.reorderLevel) return 'low';
    return 'in';
  }
  function displayedMills(state) {
    const usage = new Map(), images = new Map();
    state.settings.forEach(setting => {
      usage.set(setting.mill,(usage.get(setting.mill) || 0) + 1);
      if (setting.toolImage && !images.has(setting.mill)) images.set(setting.mill,setting.toolImage);
    });
    return state.mills.map(mill => {
      const result = {...mill,usageCount:usage.get(mill.number) || 0,stockStatus:stockStatus(mill)};
      if (!result.toolImage && images.has(mill.number)) result.toolImage = images.get(mill.number);
      return result;
    });
  }
  function displayedMaterials(state) {
    const usage = new Map(), rawUsage = new Map();
    state.settings.forEach(setting => usage.set(setting.material,(usage.get(setting.material) || 0) + 1));
    state.rawMaterials.forEach(record => rawUsage.set(record.material,(rawUsage.get(record.material) || 0) + 1));
    return state.materials.map(material => ({...material,usageCount:usage.get(material.name) || 0,rawUsageCount:rawUsage.get(material.name) || 0}));
  }
  function displayedRawMaterials(state) {
    const materials = new Map(state.materials.map(material => [material.name,material]));
    return state.rawMaterials.map(record => {
      const result = {...record}, material = materials.get(record.material);
      if (material && material.materialImage) result.materialImage = material.materialImage;
      return result;
    });
  }
  function displayedSetting(state,item) {
    const result = {...item};
    const material = state.materials.find(candidate => candidate.name === item.material);
    const mill = state.mills.find(candidate => candidate.number === item.mill);
    // Keep old per-tool photos intact until the administrator explicitly saves
    // that material's shared image. New settings use the shared image directly.
    if (!result.materialImage && material && material.materialImage) result.materialImage = material.materialImage;
    if (!result.toolImage && mill && mill.toolImage) result.toolImage = mill.toolImage;
    return result;
  }
  function originalMaterialIndex(materials,original) {
    if (!original || typeof original.name !== 'string' || typeof original.version !== 'string') throw new Error('Select an existing material first.');
    const index = materials.findIndex(material => material.name === original.name);
    if (index < 0) throw new Error('This material no longer exists. Refresh the list and try again.');
    if (materials[index].version !== original.version) throw new Error('This material changed after you loaded it. Refresh the list and select Edit again.');
    return index;
  }
  function originalMillIndex(mills,original) {
    if (!original || typeof original.number !== 'string' || typeof original.version !== 'string') throw new Error('Select an existing mill first.');
    const index = mills.findIndex(mill => mill.number === original.number);
    if (index < 0) throw new Error('This mill no longer exists. Refresh the list and try again.');
    if (mills[index].version !== original.version) throw new Error('This mill changed after you loaded it. Refresh the list and select Edit again.');
    return index;
  }
  function originalRawMaterialIndex(records,original) {
    if (!original || typeof original.id !== 'string' || typeof original.version !== 'string') throw new Error('Select an existing raw material record first.');
    const index = records.findIndex(record => record.id === original.id);
    if (index < 0) throw new Error('This raw material record no longer exists. Refresh the list and try again.');
    if (records[index].version !== original.version) throw new Error('This raw material record changed after you loaded it. Refresh the list and select Edit again.');
    return index;
  }
  function portable(seed) {
    if (!seed || !['cnc-local-portable','cnc-local-backup'].includes(seed.format) || seed.schemaVersion !== 1)
      throw new Error('Choose a version 1 CNC database backup.');
    const settings = validateSettings(seed.settings,false);
    const rawMaterials = seed.rawMaterials === undefined ? [] : validateRawMaterials(seed.rawMaterials,false);
    const data = {settings,rawMaterials,cutDrawings:validateDrawingFiles(seed.cutDrawings===undefined?[]:seed.cutDrawings),reports:validateReports(seed.reports===undefined?[]:seed.reports,false),cuts:validateCuts(seed.cuts === undefined ? [] : seed.cuts,false),notes:validateNotes(seed.notes === undefined ? [] : seed.notes,false),materials:materialLibrary(settings,seed.materials,false,rawMaterials),mills:millLibrary(settings,seed.mills,false)};
    restoreReportVersions(data,seed.reportVersions);checkDrawingRefs(data);return data;
  }

  const ready = (async () => {
    if (!cryptoApi || !cryptoApi.subtle || !cryptoApi.getRandomValues)
      throw new Error('This browser does not support the local password feature. Open the file in a current Chrome, Edge, or Firefox browser.');
    return withStorageLock(async () => {
      if (storageRead() != null) {await migratePasswords(); return;}
      const element = document.getElementById('cncEmbeddedData');
      let seed;
      try {seed = element ? JSON.parse(element.textContent) : {format:'cnc-local-portable',schemaVersion:1,settings:[]};}
      catch (_) {throw new Error('The settings embedded in this file are invalid. No data has been saved.');}
      const data = portable(seed);
      const auth = {...await createAuth('Feds201'),passwords:[]};
      // Another tab may have initialized the shared browser store while hashing.
      if (storageRead() != null) {await migratePasswords(); return;}
      storageWrite({format:'cnc-local-database',schemaVersion:1,revision:0,...data,auth});
    });
  })();
  // Keep initialization errors available to the UI through call(), without an
  // unhandled rejection if a caller waits until the first user interaction.
  ready.catch(() => {});

  const api = {
    getCutDrawings() {
      const state=readState(),active=new Set(state.cuts.flatMap(cut=>cut.drawingIds));
      return state.cutDrawings.filter(file=>active.has(file.id)).map(({data,...file})=>file);
    },
    getCutDrawing(id) {
      const state=readState();if(typeof id!=='string'||!state.cuts.some(cut=>cut.drawingIds.includes(id)))throw new Error('This drawing is not attached to a current cut.');
      const file=state.cutDrawings.find(row=>row.id===id);if(!file)throw new Error('Drawing not found.');return file;
    },
    getCuts() {return readState().cuts;},
    reportSaveCut(record,original,meta) {
      const state=readState(),index=original==null?-1:cutIndex(state.cuts,original),before=index<0?[]:[{...state.cuts[index]}];
      const drawingIds=prepareCutDrawings(state,record,index);
      const item=validateCuts([{...record,drawingIds,priority:record?.priority===undefined&&index>=0?state.cuts[index].priority:record?.priority,completed:record?.completed===undefined&&index>=0?state.cuts[index].completed:record?.completed,id:index<0?uid():state.cuts[index].id}],false)[0];
      if(index<0){if(state.cuts.length>=1000)throw new Error('The cut list has reached its 1,000 entry limit.');state.cuts.push(item);}else state.cuts[index]=item;
      appendPlanReport(state,index<0?'create':'edit',(index<0?'Added cut':'Edited cut')+' · '+item.title,before,[item],{},meta);commit(state);return true;
    },
    reportSetCutPriority(original,priority) {
      const state=readState(),item=state.cuts[cutIndex(state.cuts,original)];return api.reportSaveCut({...item,priority},original,{});
    },
    reportReopenCut(original) {
      const state=readState(),item=state.cuts[cutIndex(state.cuts,original)];if(!item.completed)throw new Error('This cut is already pending.');return api.reportSaveCut({...item,completed:false},original,{});
    },
    reportDeleteCut(original,meta) {
      const state=readState(),index=cutIndex(state.cuts,original),before={...state.cuts[index]},anchor=row=>row?{key:row.id,version:row.version}:null;
      const anchors={previous:anchor(state.cuts[index-1]),next:anchor(state.cuts[index+1])};
      state.cuts.splice(index,1);appendPlanReport(state,'delete','Deleted cut · '+before.title,[before],[],anchors,meta);commit(state);return true;
    },
    reportMoveCut(original,neighbor) {
      const state=readState(),index=cutIndex(state.cuts,original),other=cutIndex(state.cuts,neighbor),pending=state.cuts.filter(row=>!row.completed);
      if(state.cuts[index].completed||state.cuts[other].completed||Math.abs(pending.findIndex(row=>row.id===original.id)-pending.findIndex(row=>row.id===neighbor.id))!==1)throw new Error('The cut order changed. Refresh and try again.');
      const before=[{...state.cuts[index]},{...state.cuts[other]}];[state.cuts[index],state.cuts[other]]=[state.cuts[other],state.cuts[index]];state.cuts[index].version=uid();state.cuts[other].version=uid();
      const after=before.map(row=>state.cuts.find(item=>item.id===row.id));appendPlanReport(state,'move','Reordered cuts · '+before[0].title,before,after);commit(state);return true;
    },
    adminSaveCut(token,record,original) {
      const state = readState(); requireAdmin(token,state);
      const index = original == null ? -1 : cutIndex(state.cuts,original);
      const drawingIds=prepareCutDrawings(state,record,index);
      const item = validateCuts([{...record,drawingIds,priority:record?.priority === undefined && index >= 0 ? state.cuts[index].priority : record?.priority,completed:record?.completed === undefined && index >= 0 ? state.cuts[index].completed : record?.completed,id:index < 0 ? uid() : state.cuts[index].id}],false)[0];
      if (index < 0) {if (state.cuts.length >= 1000) throw new Error('The cut list has reached its 1,000 entry limit.');state.cuts.push(item);} else state.cuts[index] = item;
      commit(state); return true;
    },
    adminSetCutPriority(token,original,priority) {
      const state = readState(); requireAdmin(token,state);
      if (!['low','normal','high','urgent'].includes(priority)) throw new Error('Choose Low, Normal, High, or Urgent priority.');
      const item = state.cuts[cutIndex(state.cuts,original)];item.priority = priority;item.version = uid();commit(state);return true;
    },
    adminMoveCut(token,original,neighbor) {
      const state = readState(); requireAdmin(token,state);
      const index = cutIndex(state.cuts,original), other = cutIndex(state.cuts,neighbor);
      if (state.cuts[index].completed || state.cuts[other].completed) throw new Error('Only pending cuts can be reordered.');
      const pending = state.cuts.filter(item=>!item.completed), position = pending.findIndex(item=>item.id === original.id), target = pending.findIndex(item=>item.id === neighbor.id);
      if (Math.abs(position-target) !== 1) throw new Error('The cut order changed. Refresh and try again.');
      [state.cuts[index],state.cuts[other]] = [state.cuts[other],state.cuts[index]];
      state.cuts[index].version = uid();state.cuts[other].version = uid();commit(state);return true;
    },
    adminSetCutCompleted(token,original,completed) {
      const state = readState(); requireAdmin(token,state);
      if (typeof completed !== 'boolean') throw new Error('Completed must be true or false.');
      const item = state.cuts[cutIndex(state.cuts,original)]; item.completed = completed; item.version = uid(); commit(state); return true;
    },
    adminDeleteCut(token,original) {
      const state = readState(); requireAdmin(token,state);state.cuts.splice(cutIndex(state.cuts,original),1);commit(state);return true;
    },
    adminSetNotePinned(token,original,pinned) {
      const state = readState(); requireAdmin(token,state);
      if (typeof pinned !== 'boolean') throw new Error('Pinned must be true or false.');
      const item = state.notes[noteIndex(state.notes,original)];item.pinned = pinned;item.version = uid();commit(state);return true;
    },
    adminCutRawMaterial(token,original,remainder) {
      const state=readState();requireAdmin(token,state);return reportMaterial(state,original,remainder,{});
    },
    reportMaterialCut(original,remainder,meta) {return reportMaterial(readState(),original,remainder,meta);},
    reportBrokenMill(original,meta) {
      const state=readState(),source=state.mills[originalMillIndex(state.mills,original)];
      if(!Number.isSafeInteger(source.quantity)||source.quantity<1)throw new Error('No counted mills are available. Ask an admin to update inventory first.');
      const change={key:source.number,beforeVersion:source.version,afterVersion:uid(),quantityBefore:source.quantity};
      appendReport(state,'mill',(source.name||'Mill')+' · '+source.number,change,null,meta);source.quantity--;source.version=change.afterVersion;commit(state);return true;
    },
    reportCompletedCut(original,meta) {
      const state=readState(),source=state.cuts[cutIndex(state.cuts,original)];if(source.completed)throw new Error('This cut is already completed.');
      const change={key:source.id,beforeVersion:source.version,afterVersion:uid()};appendReport(state,'cut',source.title,change,null,meta);source.completed=true;source.version=change.afterVersion;commit(state);return true;
    },
    adminListReports(token) {const state=readState();requireAdmin(token,state);return state.reports;},
    adminUndoReport(token,original) {
      const state=readState();requireAdmin(token,state);
      const report=state.reports.find(row=>row.id===original?.id);
      if(!report||report.version!==original?.version||report.undone)throw new Error('This report changed or was already undone. Refresh and try again.');
      if(report.kind==='plan')return undoPlanReport(state,report);
      const group=report.kind==='material'?'rawMaterials':report.kind==='mill'?'mills':'cuts';
      const record=state[group].find(row=>(report.kind==='mill'?row.number:row.id)===report.source.key);
      const leftover=report.leftover&&state.rawMaterials.find(row=>row.id===report.leftover.id);
      if(!record||record.version!==report.source.afterVersion||(report.leftover&&(!leftover||leftover.version!==report.leftover.version)))throw new Error('This item changed after the report. Undo newer reports first, or adjust inventory manually. Nothing was changed.');
      const previous=report.source.beforeVersion,fresh=uid();
      if(report.kind==='cut')record.completed=false;else record.quantity=report.source.quantityBefore;record.version=fresh;
      if(leftover)state.rawMaterials.splice(state.rawMaterials.indexOf(leftover),1);
      for(const older of state.reports){if(older.id===report.id||older.undone)continue;let changed=false;
        if(older.source?.afterVersion===previous){older.source.afterVersion=fresh;changed=true;}
        if(older.leftover?.version===previous){older.leftover.version=fresh;changed=true;}
        if(report.kind==='cut'&&rebindPlan(older,record.id,previous,fresh))changed=true;
        if(changed)older.version=uid();
      }
      report.undone=true;report.version=uid();commit(state);return true;
    },
    getNotes() {return readState().notes;},
    adminSaveNote(token,record,original) {
      const state = readState(); requireAdmin(token,state);
      const index = original == null ? -1 : noteIndex(state.notes,original);
      const item = validateNotes([{...record,pinned:record?.pinned === undefined && index >= 0 ? state.notes[index].pinned : record?.pinned,id:index < 0 ? uid() : state.notes[index].id}],false)[0];
      if (index < 0) {
        if (state.notes.length >= 1000) throw new Error('The notes list has reached its 1,000 entry limit.');
        state.notes.unshift(item);
      } else state.notes[index] = item;
      commit(state); return true;
    },
    adminDeleteNote(token,original) {
      const state = readState(); requireAdmin(token,state);
      state.notes.splice(noteIndex(state.notes,original),1); commit(state); return true;
    },
    getMills() {return displayedMills(readState());},
    getMaterials() {return displayedMaterials(readState());},
    getRawMaterials() {return displayedRawMaterials(readState());},
    getDashboard() {
      const state = readState();
      return {mills:state.mills.length,materials:state.materials.length,settings:state.settings.length,
        trackedMills:state.mills.filter(mill => mill.quantity !== undefined).length,
        unitsInStock:state.mills.reduce((total,mill) => total + (mill.quantity || 0),0),
        lowStock:state.mills.filter(mill => stockStatus(mill) === 'low').length,
        outOfStock:state.mills.filter(mill => stockStatus(mill) === 'out').length,
        rawMaterialRecords:state.rawMaterials.length,
        rawSheets:state.rawMaterials.reduce((total,record) => total + record.quantity,0)};
    },
    getOptions() {
      const settings = readState().settings;
      return [...new Set(settings.map(item => item.mill))].sort((a,b) => a.localeCompare(b,undefined,{numeric:true}))
        .map(mill => ({mill,materials:settings.filter(item => item.mill === mill).map(item => item.material).sort()}));
    },
    getSettings(mill,material) {
      const state = readState();
      const item = state.settings.find(item => item.mill === mill && item.material === material);
      if (!item) throw new Error('No settings found. Refresh the list and try again.');
      const result = {...displayedSetting(state,item),rpm:Number(item.rpm),feed:Number(item.feed),depth:Number(item.depth)};
      if (item.plungeRate !== undefined) result.plungeRate = Number(item.plungeRate);
      return result;
    },
    async adminLogin(username,password) {
      const state = readState();
      if (String(username).toLowerCase() !== 'admin' || typeof password !== 'string' || password.length > 128) throw new Error('Incorrect username or password.');
      let credential = null;
      if (password.toLowerCase() !== 'feds201') {
        for (const item of state.auth.passwords) {
          if ((passwordsEqual(await hashPassword(password,item.salt),item.hash) || passwordsEqual(await hashPassword(password.toLowerCase(),item.salt),item.hash))) {credential = item; break;}
        }
        if (!credential) throw new Error('Incorrect username or password.');
      }
      const current = readState();
      if (current.auth.version !== state.auth.version || (credential && !current.auth.passwords.some(item =>
          item.id === credential.id && item.version === credential.version && item.salt === credential.salt && item.hash === credential.hash)))
        throw new Error('The admin password changed. Please sign in again.');
      const token = uid(), expiresAt = Date.now() + 3600000;
      sessions.set(token,{expiresAt,version:current.auth.version,credentialId:credential ? credential.id : DEFAULT_PASSWORD_ID,
        credentialVersion:credential ? credential.version : DEFAULT_PASSWORD_ID});
      return {token,expiresAt};
    },
    adminLogout(token) {sessions.delete(token); return true;},
    adminListPasswords(token) {
      const state = readState(); requireAdmin(token,state);
      return [{id:DEFAULT_PASSWORD_ID,label:DEFAULT_PASSWORD_LABEL,isDefault:true},
        ...state.auth.passwords.map(({id,label}) => ({id,label,isDefault:false}))];
    },
    async adminAddPassword(token,label,password) {
      const state = readState(); requireAdmin(token,state);
      const name = passwordLabel(label,state.auth.passwords);
      validateNewPassword(password);
      if (state.auth.passwords.length >= MAX_PASSWORDS) throw new Error('You can save at most 20 additional admin passwords.');
      await rejectDuplicatePassword(password,state.auth.passwords);
      const credential = {id:uid(),label:name,...await createAuth(password)};
      const latest = readState(); requireAdmin(token,latest); verifyPasswordListUnchanged(state,latest);
      latest.auth.passwords.push(credential); commit(latest); return true;
    },
    async adminUpdatePassword(token,id,label,newPassword) {
      const state = readState(); requireAdmin(token,state);
      const previous = customPassword(state,id);
      const name = passwordLabel(label,state.auth.passwords,id);
      const changePassword = newPassword !== undefined && newPassword !== null && newPassword !== '';
      let credential = {...previous,label:name,version:uid()};
      if (changePassword) {
        validateNewPassword(newPassword);
        await rejectDuplicatePassword(newPassword,state.auth.passwords,id);
        credential = {id,label:name,...await createAuth(newPassword)};
      }
      const latest = readState(); requireAdmin(token,latest); verifyPasswordListUnchanged(state,latest);
      latest.auth.passwords[latest.auth.passwords.findIndex(item => item.id === id)] = credential;
      commit(latest); revokePasswordSessions(id); return true;
    },
    adminDeletePassword(token,id) {
      const state = readState(); requireAdmin(token,state); customPassword(state,id);
      state.auth.passwords = state.auth.passwords.filter(item => item.id !== id);
      commit(state); revokePasswordSessions(id); return true;
    },
    adminListSettings(token) {
      const state = readState(); requireAdmin(token,state);
      return state.settings.map(item => ({...displayedSetting(state,item),key:keyOf(item)}));
    },
    adminListMaterials(token) {
      const state = readState(); requireAdmin(token,state);
      return displayedMaterials(state);
    },
    adminSaveRawMaterial(token,record,original) {
      const state = readState(); requireAdmin(token,state);
      const item = validateRawMaterial(record);
      const index = original == null ? -1 : originalRawMaterialIndex(state.rawMaterials,original);
      if (!state.materials.some(material => material.name === item.material)) throw new Error('Choose a saved material from the material list. Add the material first if it is missing.');
      item.id = index < 0 ? uid() : state.rawMaterials[index].id;
      item.version = uid();
      if (index < 0) {
        if (state.rawMaterials.length >= MAX_SETTINGS) throw new Error('The raw material list has reached its 10,000 entry limit.');
        state.rawMaterials.push(item);
      } else state.rawMaterials[index] = item;
      commit(state); return true;
    },
    adminDeleteRawMaterial(token,original) {
      const state = readState(); requireAdmin(token,state);
      state.rawMaterials.splice(originalRawMaterialIndex(state.rawMaterials,original),1);
      commit(state); return true;
    },
    adminSaveMill(token,mill,original) {
      const state = readState(); requireAdmin(token,state);
      const item = validateMills([mill],false)[0];
      const index = original == null ? -1 : originalMillIndex(state.mills,original);
      if (state.mills.some((saved,i) => i !== index && saved.number === item.number)) throw new Error('That mill number already exists. Edit the existing mill instead.');
      if (index < 0) {
        if (state.mills.length >= MAX_SETTINGS) throw new Error('The mill list has reached its 10,000 entry limit.');
        state.mills.push(item);
      } else {
        const previous = state.mills[index];
        const imageUpdated = Object.prototype.hasOwnProperty.call(mill,'toolImage');
        if (!imageUpdated && previous.toolImage) item.toolImage = previous.toolImage;
        if (previous.number !== item.number || imageUpdated) state.settings.forEach(setting => {
          if (setting.mill !== previous.number) return;
          setting.mill = item.number;
          if (imageUpdated) delete setting.toolImage;
          setting.version = uid();
        });
        state.mills[index] = item;
      }
      commit(state); return true;
    },
    adminDeleteMill(token,original) {
      const state = readState(); requireAdmin(token,state);
      const index = originalMillIndex(state.mills,original);
      if (state.settings.some(setting => setting.mill === state.mills[index].number)) throw new Error('This mill is used by saved cutting settings. Change or delete those settings before removing the mill.');
      state.mills.splice(index,1); commit(state); return true;
    },
    adminSetInventory(token,number,quantity,reorderLevel,location,version) {
      const state = readState(); requireAdmin(token,state);
      const index = originalMillIndex(state.mills,{number,version});
      state.mills[index] = validateMills([{...state.mills[index],quantity,reorderLevel,location}],false)[0];
      commit(state); return true;
    },
    adminSaveMaterial(token,material,original) {
      const state = readState(); requireAdmin(token,state);
      const item = validateMaterials([material],false)[0];
      const index = original == null ? -1 : originalMaterialIndex(state.materials,original);
      if (state.materials.some((saved,i) => i !== index && saved.name === item.name)) throw new Error('That material already exists. Edit the existing material instead.');
      if (index < 0) {
        if (state.materials.length >= MAX_SETTINGS) throw new Error('The material list has reached its 10,000 entry limit.');
        state.materials.push(item);
      } else {
        const oldName = state.materials[index].name;
        state.settings.forEach(setting => {
          if (setting.material !== oldName) return;
          setting.material = item.name; delete setting.materialImage; setting.version = uid();
        });
        if (oldName !== item.name) state.rawMaterials.forEach(record => {
          if (record.material !== oldName) return;
          record.material = item.name; record.version = uid();
        });
        state.materials[index] = item;
      }
      commit(state); return true;
    },
    adminDeleteMaterial(token,original) {
      const state = readState(); requireAdmin(token,state);
      const index = originalMaterialIndex(state.materials,original);
      if (state.settings.some(setting => setting.material === state.materials[index].name)) throw new Error('This material is used by saved cutting settings. Change or delete those settings before removing the material.');
      if (state.rawMaterials.some(record => record.material === state.materials[index].name)) throw new Error('This material is used by raw material records. Change or delete those records before removing the material, including records with zero sheets.');
      state.materials.splice(index,1); commit(state); return true;
    },
    adminSaveSetting(token,setting,original) {
      const state = readState(); requireAdmin(token,state);
      const item = {...validateSetting(setting),version:uid()};
      const index = original == null ? -1 : originalIndex(state.settings,original);
      if (!state.materials.some(material => material.name === item.material)) throw new Error('Choose a saved material from the material list. Add the material first if it is missing.');
      // Images added through the material manager apply to every associated
      // mill. Preserve legacy overrides only while their existing pair remains.
      delete item.materialImage;
      if (index >= 0 && state.settings[index].material === item.material && state.settings[index].materialImage)
        item.materialImage = state.settings[index].materialImage;
      if (state.settings.some((saved,i) => i !== index && sameKey(saved,item))) throw new Error('That mill and material already have settings. Edit the existing entry instead.');
      if (!state.mills.some(mill => mill.number === item.mill)) {
        if (state.mills.length >= MAX_SETTINGS) throw new Error('The mill list has reached its 10,000 entry limit.');
        state.mills.push(validateMills([{number:item.mill}],false)[0]);
      }
      if (index < 0) {
        if (state.settings.length >= MAX_SETTINGS) throw new Error('The database has reached its 10,000 entry limit.');
        state.settings.push(item);
      } else state.settings[index] = item;
      commit(state); return true;
    },
    adminDeleteSetting(token,original) {
      const state = readState(); requireAdmin(token,state);
      state.settings.splice(originalIndex(state.settings,original),1);
      commit(state); return true;
    },
    async adminChangePassword(token,currentPassword,newPassword) {
      const state = readState(); const session = requireAdmin(token,state);
      const credential = customPassword(state,session.credentialId);
      if (typeof currentPassword !== 'string' || currentPassword.length > 128 ||
          !passwordsEqual(await hashPassword(currentPassword,credential.salt),credential.hash)) throw new Error('Current password is incorrect.');
      validateNewPassword(newPassword);
      await rejectDuplicatePassword(newPassword,state.auth.passwords,credential.id);
      const replacement = {id:credential.id,label:credential.label,...await createAuth(newPassword)};
      const latest = readState(); requireAdmin(token,latest);
      verifyPasswordListUnchanged(state,latest);
      latest.auth.passwords[latest.auth.passwords.findIndex(item => item.id === credential.id)] = replacement;
      commit(latest); revokePasswordSessions(credential.id); return true;
    },
    adminExportBackup(token) {
      const state = readState(); requireAdmin(token,state);
      return {...reportArchive(state),cutDrawings:state.cutDrawings,format:'cnc-local-backup',schemaVersion:1,settings:plainSettings(state),materials:plainMaterials(state),mills:plainMills(state),rawMaterials:plainRawMaterials(state),notes:state.notes.map(({version,...item})=>item),cuts:state.cuts.map(({version,...item})=>item),exportedAt:new Date().toISOString()};
    },
    adminPortableData(token) {
      const state = readState(); requireAdmin(token,state);
      return {...reportArchive(state),cutDrawings:state.cutDrawings,format:'cnc-local-portable',schemaVersion:1,settings:plainSettings(state),materials:plainMaterials(state),mills:plainMills(state),rawMaterials:plainRawMaterials(state),notes:state.notes.map(({version,...item})=>item),cuts:state.cuts.map(({version,...item})=>item)};
    },
    adminImportBackup(token,backup) {
      const state = readState(); requireAdmin(token,state);
      const data = portable(backup); // Validate the complete backup before writing anything.
      state.settings = data.settings; state.materials = data.materials; state.mills = data.mills; state.rawMaterials = data.rawMaterials; state.notes = data.notes; state.cuts = data.cuts; state.reports = data.reports; state.cutDrawings = data.cutDrawings; commit(state); return true;
    }
  };
  const writes = new Set(['reportSaveCut','reportSetCutPriority','reportReopenCut','reportDeleteCut','reportMoveCut','reportMaterialCut','reportBrokenMill','reportCompletedCut','adminUndoReport','adminSetCutPriority','adminMoveCut','adminSaveCut','adminSetCutCompleted','adminDeleteCut','adminSetNotePinned','adminCutRawMaterial','adminSaveNote','adminDeleteNote','adminSaveSetting','adminDeleteSetting','adminChangePassword','adminAddPassword','adminUpdatePassword','adminDeletePassword','adminImportBackup','adminSaveMaterial','adminDeleteMaterial','adminSaveMill','adminDeleteMill','adminSetInventory','adminSaveRawMaterial','adminDeleteRawMaterial']);
  window.cncLocal = Object.freeze({
    ready,
    async call(name,...args) {
      await ready;
      if (!Object.prototype.hasOwnProperty.call(api,name)) throw new Error('Unknown local database action.');
      if (!writes.has(name)) return clone(await api[name](...args));
      const run = mutationQueue.then(() => withStorageLock(() => api[name](...args)));
      mutationQueue = run.catch(() => {});
      return clone(await run);
    }
  });
})();
