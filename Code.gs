// CNC Tool Database 1.13.0 — generated; edit source and run build-both.py.
// GENERATED from cnc-local/local-core.js by build_engine.py. Do not edit.
// Browser and Apps Script use the same validation, reference and stale-write rules.
function createCncDataApi_(host) {
  'use strict';
  const uid = () => host.uid();
  const readState = () => host.readState();
  const storageWrite = state => host.storageWrite(state);
  const requireAdmin = (token,state) => host.requireAdmin(token,state);
  const MAX_SETTINGS = 10000;
  const keyOf = item => ({mill:item.mill, material:item.material});
  const sameKey = (item,key) => !!key && item.mill === key.mill && item.material === key.material;

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
    return {settings,rawMaterials,materials:materialLibrary(settings,seed.materials,false,rawMaterials),mills:millLibrary(settings,seed.mills,false)};
  }

  const api = {
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
    adminExportBackup(token) {
      const state = readState(); requireAdmin(token,state);
      return {format:'cnc-local-backup',schemaVersion:1,settings:plainSettings(state),materials:plainMaterials(state),mills:plainMills(state),rawMaterials:plainRawMaterials(state),exportedAt:new Date().toISOString()};
    },
    adminPortableData(token) {
      const state = readState(); requireAdmin(token,state);
      return {format:'cnc-local-portable',schemaVersion:1,settings:plainSettings(state),materials:plainMaterials(state),mills:plainMills(state),rawMaterials:plainRawMaterials(state)};
    },
    adminImportBackup(token,backup) {
      const state = readState(); requireAdmin(token,state);
      const data = portable(backup); // Validate the complete backup before writing anything.
      state.settings = data.settings; state.materials = data.materials; state.mills = data.mills; state.rawMaterials = data.rawMaterials; commit(state); return true;
    }
  };
  function validateData(state) {
    if (!state || state.format !== 'cnc-local-database' || state.schemaVersion !== 1 ||
        !Number.isSafeInteger(state.revision) || state.revision < 0)
      throw new Error('Unsupported saved database format.');
    const settings = validateSettings(state.settings,true);
    const rawMaterials = state.rawMaterials === undefined ? [] : validateRawMaterials(state.rawMaterials,true);
    return {...state,settings,rawMaterials,
      materials:materialLibrary(settings,state.materials,true,rawMaterials),
      mills:millLibrary(settings,state.mills,true)};
  }
  return Object.freeze({...api,actions:Object.freeze(Object.keys(api)),normalizeBackup:portable,validateData});
}

/* Google Apps Script host for the shared CNC data engine.
 * The build adds the data engine generated from the local data core to Code.gs.
 * Canonical data lives in two staged Google Sheets snapshots. Images remain
 * private Drive files; the active snapshot pointer changes only after flush.
 */
const CNC_SERVER_VERSION_ = '1.13.0';
const CNC_CHUNK_SIZE_ = 38000;
const CNC_MAX_SNAPSHOT_SIZE_ = 12000000;
const CNC_SESSION_SECONDS_ = 3600;
const CNC_DEFAULT_ID_ = 'default-admin';
const CNC_DEFAULT_LABEL_ = 'Default fallback';
const CNC_AUTH_ACTIONS_ = ['adminLogin','adminLogout','adminListPasswords','adminAddPassword','adminUpdatePassword','adminDeletePassword','adminChangePassword'];

function doGet() {
  let output;
  try {output = HtmlService.createHtmlOutputFromFile('Index');}
  catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (!/No HTML file named ["']?Index["']? was found/i.test(message)) throw error;
    output = HtmlService.createHtmlOutput('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font:16px/1.6 Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 24px"><h1>Add the missing Index HTML file</h1><p>This Apps Script project needs the HTML file supplied with CNC Tool Database.</p><ol><li>In the Apps Script editor, select <strong>Files → + → HTML</strong>.</li><li>Name the file <strong>Index</strong> with a capital I. The editor adds the .html extension.</li><li>Paste the complete supplied <strong>Index.html</strong> contents into that file and save.</li><li>For an existing deployment, select <strong>Deploy → Manage deployments → Edit → New version → Deploy</strong>, then reopen its web app link.</li></ol><p>Keep the existing project, spreadsheet, image folder, and Script Properties.</p></body></html>');
  }
  return output.setTitle('CNC Tool Database').addMetaTag('viewport','width=device-width, initial-scale=1');
}

// Run once in the Apps Script editor, then deploy as a web app. Reruns retain
// existing database contents and additional admin passwords.
function setupDatabase() {
  return cncWithLock_(function () {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty('CNC_IMAGE_FOLDER_ID');
    if (!folderId) {
      const folder = DriveApp.createFolder('CNC Tool Database');
      folderId = folder.getId();
      props.setProperty('CNC_IMAGE_FOLDER_ID',folderId);
    }
    const folder = DriveApp.getFolderById(folderId);
    let spreadsheetId = props.getProperty('CNC_SPREADSHEET_ID');
    if (!spreadsheetId) {
      const spreadsheet = SpreadsheetApp.create('CNC Tool Database');
      spreadsheetId = spreadsheet.getId();
      props.setProperty('CNC_SPREADSHEET_ID',spreadsheetId);
      DriveApp.getFileById(spreadsheetId).moveTo(folder);
    }
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    for (const name of ['CNC Data A','CNC Data B']) {
      if (!spreadsheet.getSheetByName(name)) spreadsheet.insertSheet(name);
    }
    let info = spreadsheet.getSheetByName('Read me');
    if (!info) info = spreadsheet.insertSheet('Read me');
    info.getRange(1,1,8,2).setValues([
      ['CNC Tool Database',CNC_SERVER_VERSION_],
      ['Edit records','Use the deployed web app. Snapshot cells are managed automatically.'],
      ['Storage','Mills = tool inventory; Material Stock = raw sheets. Edit in the app; CNC Data A/B are internal snapshots.'],
      ['Images','Private image files live in this spreadsheet’s Drive folder.'],
      ['Backup','Admin > Settings > Export JSON backup.'],
      ['Local version','The standalone HTML remains available separately.'],
      ['Sync','All visitors to this script project share this database.'],
      ['Mentor','A mentor must be present for all CNC cutting.']
    ]);
    info.setFrozenRows(1);
    info.autoResizeColumns(1,2);
    cncAuthState_(true);
    if (!props.getProperty('CNC_ACTIVE_SNAPSHOT')) {
      cncWriteState_({format:'cnc-local-database',schemaVersion:1,revision:0,
        settings:[],materials:[],mills:[],rawMaterials:[]});
    } else {
      cncReadState_(); // Verify the existing store; never replace a broken store.
    }
    cncSyncInventoryViews_(cncReadState_());
    spreadsheet.setActiveSheet(spreadsheet.getSheetByName('Mills'));
    const result = {spreadsheetId:spreadsheetId,spreadsheetUrl:spreadsheet.getUrl(),imageFolderId:folderId,version:CNC_SERVER_VERSION_};
    console.log('CNC database ready. Spreadsheet: ' + result.spreadsheetUrl + '. Default login: admin / admin.');
    return result;
  });
}

// This is the sole browser RPC entry point. All helpers end with an underscore
// so google.script.run cannot bypass the allowlist, server auth, or script lock.
function cncCall(name,args) {
  try {
    if (typeof name !== 'string' || !Array.isArray(args) || args.length > 10)
      throw new Error('Invalid database request.');
    return cncWithLock_(function () {
      cncRequireSetup_();
      const api = createCncDataApi_({
        uid:cncUid_,readState:cncReadState_,storageWrite:cncWriteState_,requireAdmin:cncRequireAdmin_
      });
      let value;
      if (CNC_AUTH_ACTIONS_.indexOf(name) !== -1) value = cncAuthCall_(name,args);
      else {
        if (api.actions.indexOf(name) === -1 || !Object.prototype.hasOwnProperty.call(api,name))
          throw new Error('Unknown database action.');
        value = api[name].apply(api,args);
        if (name === 'getDashboard') {
          try {
            if (cncProps_().getProperty('CNC_INVENTORY_VIEW_REVISION') !== String(cncPointer_().revision))
              cncSyncInventoryViews_(cncReadState_());
          } catch (error) {
            value.sheetSyncWarning = 'Your app data is saved, but the Mills and Material Stock spreadsheet tabs could not refresh. ' + error.message;
          }
        }
      }
      return {ok:true,value:JSON.parse(JSON.stringify(value === undefined ? null : value))};
    });
  } catch (error) {
    return {ok:false,error:error && error.message ? error.message : 'The shared database request failed. Please try again.'};
  }
}

function cncWithLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {return callback();} finally {lock.releaseLock();}
}

function cncUid_() {return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g,'');}
function cncProps_() {return PropertiesService.getScriptProperties();}
function cncRequireSetup_() {
  const props = cncProps_();
  if (!props.getProperty('CNC_SPREADSHEET_ID') || !props.getProperty('CNC_IMAGE_FOLDER_ID') || !props.getProperty('CNC_ACTIVE_SNAPSHOT'))
    throw new Error('The shared database has not been set up. Ask the owner to run setupDatabase in the Apps Script editor first.');
}
function cncDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8)
    .map(function (byte) {return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);}).join('');
}
function cncEqual_(left,right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let delta = left.length ^ right.length;
  for (let i=0;i<left.length;i++) delta |= left.charCodeAt(i) ^ (right.charCodeAt(i) || 0);
  return delta === 0;
}
function cncPointer_() {
  const raw = cncProps_().getProperty('CNC_ACTIVE_SNAPSHOT');
  if (!raw) throw new Error('The database snapshot is missing. Run setupDatabase before using the web app.');
  let pointer;
  try {pointer = JSON.parse(raw);} catch (_) {throw new Error('The shared database pointer is invalid. No data was replaced.');}
  if (!pointer || ['CNC Data A','CNC Data B'].indexOf(pointer.sheet) === -1 ||
      !Number.isSafeInteger(pointer.parts) || pointer.parts < 1 || pointer.parts > Math.ceil(CNC_MAX_SNAPSHOT_SIZE_/CNC_CHUNK_SIZE_) ||
      typeof pointer.digest !== 'string' || !/^[a-f0-9]{64}$/.test(pointer.digest) || !Number.isSafeInteger(pointer.revision) || pointer.revision < 0)
    throw new Error('The shared database pointer is invalid. No data was replaced.');
  return pointer;
}
function cncSpreadsheet_() {
  const id = cncProps_().getProperty('CNC_SPREADSHEET_ID');
  if (!id) throw new Error('Run setupDatabase in the Apps Script editor first.');
  return SpreadsheetApp.openById(id);
}
function cncReadState_() {
  const pointer = cncPointer_();
  const sheet = cncSpreadsheet_().getSheetByName(pointer.sheet);
  if (!sheet) throw new Error('The active database sheet is missing. No data was replaced.');
  const rows = sheet.getRange(2,1,pointer.parts,2).getValues();
  const parts = rows.map(function (row,index) {
    if (String(row[0]) !== String(index+1) || typeof row[1] !== 'string' || row[1].slice(0,2) !== 'j:')
      throw new Error('The active database snapshot is incomplete. No data was replaced.');
    return row[1].slice(2);
  });
  const json = parts.join('');
  if (cncDigest_(json) !== pointer.digest) throw new Error('The active database snapshot failed its integrity check. No data was replaced.');
  let saved;
  try {saved = JSON.parse(json);} catch (_) {throw new Error('The active database JSON is invalid. No data was replaced.');}
  if (saved.revision !== pointer.revision) throw new Error('The database revision is inconsistent. No data was replaced.');
  const state = cncHydrateImages_(saved,{});
  const api = createCncDataApi_({uid:cncUid_,readState:function () {return state;},storageWrite:cncWriteState_,requireAdmin:cncRequireAdmin_});
  return api.validateData(state);
}
function cncStringChunks_(text,size) {
  const chunks = [];
  for (let offset=0;offset<text.length;) {
    let end = Math.min(offset+size,text.length);
    const last = text.charCodeAt(end-1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(text.slice(offset,end));offset=end;
  }
  return chunks;
}
function cncWriteState_(state) {
  // Domain validation is also performed on server writes before any Drive or
  // Sheets change, even if a future API method forgets to validate its input.
  const api = createCncDataApi_({uid:cncUid_,readState:function () {return state;},storageWrite:function () {},requireAdmin:cncRequireAdmin_});
  const valid = api.validateData(state);
  const stored = cncExternalizeImages_(valid,{});
  const json = JSON.stringify(stored);
  if (json.length > CNC_MAX_SNAPSHOT_SIZE_) throw new Error('The shared database is too large to save. Export a backup and reduce its size. Existing saved data was not replaced.');
  const props = cncProps_();
  const previousRaw = props.getProperty('CNC_ACTIVE_SNAPSHOT');
  let active = null;
  if (previousRaw) active = cncPointer_();
  const name = active && active.sheet === 'CNC Data A' ? 'CNC Data B' : 'CNC Data A';
  const sheet = cncSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('The staging database sheet is missing. Existing saved data was not replaced.');
  const rows = cncStringChunks_(json,CNC_CHUNK_SIZE_).map(function (chunk,index) {return [String(index+1),'j:' + chunk];});
  if (sheet.getMaxRows() < rows.length+1) sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  sheet.clearContents();
  sheet.getRange(1,1,1,2).setValues([['Part','JSON chunk — use the web app to edit']]);
  sheet.getRange(2,1,rows.length,2).setNumberFormat('@').setValues(rows);
  SpreadsheetApp.flush();
  const staged = sheet.getRange(2,1,rows.length,2).getValues();
  if (JSON.stringify(staged.map(function (row) {return row.map(String);})) !== JSON.stringify(rows))
    throw new Error('The staged database could not be verified. Existing saved data was not replaced.');
  const pointer = {sheet:name,parts:rows.length,digest:cncDigest_(json),revision:valid.revision};
  // A single property update is the commit point. Never clear the active slot
  // first. Failed staging writes leave the prior complete snapshot readable.
  props.setProperty('CNC_ACTIVE_SNAPSHOT',JSON.stringify(pointer));
  // These readable views are derived from the committed snapshot. A failed
  // report refresh must never misreport an already committed save as failed.
  try {cncSyncInventoryViews_(valid);} catch (error) {console.warn('Inventory views need refresh: ' + error.message);}
}
function cncSyncInventoryViews_(state) {
  const book = cncSpreadsheet_();
  cncProps_().deleteProperty('CNC_INVENTORY_VIEW_REVISION');
  const mills = [['Mill number','Tool name','Tool type','Diameter (inch)','Flutes','Tools on hand','Low inventory threshold','Storage location','Inventory status','Coating','Notes']];
  state.mills.forEach(function (mill) {
    const status = mill.quantity === undefined ? 'Not counted' : mill.quantity === 0 ? 'Out of stock' :
      mill.reorderLevel !== undefined && mill.quantity <= mill.reorderLevel ? 'Low inventory' : 'Available';
    mills.push([mill.number,mill.name,mill.type,mill.diameter,mill.flutes,mill.quantity,mill.reorderLevel,mill.location,status,mill.coating,mill.notes]);
  });
  const stock = [['Material','Sheet entry ID','Length (inch)','Width (inch)','Thickness (inch)','Sheets on hand','Storage location','Notes']];
  state.rawMaterials.forEach(function (sheet) {
    stock.push([sheet.material,sheet.id,sheet.length,sheet.width,sheet.thickness,sheet.quantity,sheet.location,sheet.notes]);
  });
  for (const view of [{name:'Mills',rows:mills,numbers:[4,5,6,7]}, {name:'Material Stock',rows:stock,numbers:[3,4,5,6]}]) {
    let sheet = book.getSheetByName(view.name);
    if (sheet && sheet.getLastRow() > 0) {
      const headers = sheet.getRange(1,1,1,view.rows[0].length).getValues()[0];
      if (JSON.stringify(headers) !== JSON.stringify(view.rows[0]))
        throw new Error('Rename the existing "' + view.name + '" tab so the app can create its inventory view without overwriting unrelated data.');
    }
  }
  for (const view of [{name:'Mills',rows:mills,numbers:[4,5,6,7]}, {name:'Material Stock',rows:stock,numbers:[3,4,5,6]}]) {
    const sheet = book.getSheetByName(view.name) || book.insertSheet(view.name);
    if (sheet.getMaxRows() < view.rows.length) sheet.insertRowsAfter(sheet.getMaxRows(),view.rows.length-sheet.getMaxRows());
    if (sheet.getMaxColumns() < view.rows[0].length) sheet.insertColumnsAfter(sheet.getMaxColumns(),view.rows[0].length-sheet.getMaxColumns());
    sheet.clearContents();
    // Rich text preserves leading-zero tool numbers and treats notes beginning
    // with '=' as text. Quantity and dimension columns then receive numbers.
    const text = view.rows.map(function (row) {return row.map(function (value) {return SpreadsheetApp.newRichTextValue().setText(value == null ? '' : String(value)).build();});});
    sheet.getRange(1,1,text.length,text[0].length).setRichTextValues(text);
    if (view.rows.length > 1) view.numbers.forEach(function (column) {
      const values = view.rows.slice(1).map(function (row) {const value = row[column-1];return [value == null || value === '' ? '' : Number(value)];});
      sheet.getRange(2,column,values.length,1).setNumberFormat('0.###############').setValues(values);
    });
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1,view.rows[0].length);
  }
  SpreadsheetApp.flush();
  cncProps_().setProperty('CNC_INVENTORY_VIEW_REVISION',String(state.revision));
  ['CNC Data A','CNC Data B'].forEach(function (name) {const sheet = book.getSheetByName(name);if (sheet) sheet.hideSheet();});
}
function cncExternalizeImages_(value,memo) {
  if (Array.isArray(value)) return value.map(function (item) {return cncExternalizeImages_(item,memo);});
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).forEach(function (key) {
    if ((key === 'toolImage' || key === 'materialImage') && typeof value[key] === 'string') {
      const data = value[key], digest = cncDigest_(data);
      if (!memo[digest]) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
        if (!match) throw new Error('Only validated embedded images can be stored.');
        const folder = DriveApp.getFolderById(cncProps_().getProperty('CNC_IMAGE_FOLDER_ID'));
        const name = 'cnc-image-' + digest + '.' + match[1].slice(6);
        const files = folder.getFilesByName(name);
        const file = files.hasNext() ? files.next() : folder.createFile(Utilities.newBlob(Utilities.base64Decode(match[2]),match[1],name));
        memo[digest] = {cncImageId:file.getId(),mime:match[1],digest:digest};
      }
      result[key] = memo[digest];
    } else result[key] = cncExternalizeImages_(value[key],memo);
  });
  return result;
}
function cncHydrateImages_(value,memo) {
  if (Array.isArray(value)) return value.map(function (item) {return cncHydrateImages_(item,memo);});
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).forEach(function (key) {
    const ref = value[key];
    if ((key === 'toolImage' || key === 'materialImage') && ref && typeof ref === 'object') {
      if (typeof ref.cncImageId !== 'string' || typeof ref.mime !== 'string' || !/^image\/(png|jpeg|webp)$/.test(ref.mime) ||
          typeof ref.digest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest)) throw new Error('A saved image reference is invalid. No data was replaced.');
      if (!memo[ref.cncImageId]) {
        const blob = DriveApp.getFileById(ref.cncImageId).getBlob();
        const data = 'data:' + ref.mime + ';base64,' + Utilities.base64Encode(blob.getBytes());
        if (cncDigest_(data) !== ref.digest) throw new Error('A saved image has changed or is incomplete. No data was replaced.');
        memo[ref.cncImageId] = data;
      }
      result[key] = memo[ref.cncImageId];
    } else result[key] = cncHydrateImages_(ref,memo);
  });
  return result;
}

// Apps Script keeps its secret HMAC key on the server. Every custom credential
// has an independent random salt; exports contain neither credentials nor key.
// The permanent admin fallback intentionally remains available by product rule.
function cncAuthState_(initialize) {
  const props = cncProps_();
  let raw = cncAuthRaw_();
  if (!raw && initialize) {
    const auth = {version:cncUid_(),passwords:[]};
    if (!props.getProperty('CNC_AUTH_PEPPER')) props.setProperty('CNC_AUTH_PEPPER',cncUid_()+cncUid_());
    cncSaveAuth_(auth);
    raw = JSON.stringify(auth);
  }
  let auth;
  try {auth = JSON.parse(raw || 'null');} catch (_) {throw new Error('The shared admin password configuration is invalid.');}
  if (!auth || typeof auth.version !== 'string' || !auth.version || !Array.isArray(auth.passwords) || auth.passwords.length > 20 || !props.getProperty('CNC_AUTH_PEPPER'))
    throw new Error('The shared admin password configuration is invalid. Run setupDatabase if this is a new installation.');
  const ids = new Set([CNC_DEFAULT_ID_]), labels = new Set([CNC_DEFAULT_LABEL_.toLowerCase()]);
  auth.passwords.forEach(function (item) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.label !== 'string' || item.label !== item.label.trim() || !item.label || item.label.length > 80 || labels.has(item.label.toLowerCase()) ||
        typeof item.salt !== 'string' || !/^[a-f0-9]{64}$/.test(item.salt) || typeof item.hash !== 'string' || !/^[a-f0-9]{64}$/.test(item.hash) || typeof item.version !== 'string' || !item.version)
      throw new Error('The shared admin password configuration is invalid.');
    ids.add(item.id);labels.add(item.label.toLowerCase());
  });
  return auth;
}
function cncPasswordHash_(password,salt) {
  const pepper = cncProps_().getProperty('CNC_AUTH_PEPPER');
  if (!pepper) throw new Error('The shared admin password key is missing.');
  return Utilities.computeHmacSha256Signature(JSON.stringify([salt,password]),pepper,Utilities.Charset.UTF_8)
    .map(function (byte) {return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);}).join('');
}
function cncSessionKey_(token) {return 'cnc-session-' + cncDigest_(token);}
function cncRequireAdmin_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('AUTH_REQUIRED: Your admin session expired. Please sign in again.');
  const cache = CacheService.getScriptCache(), raw = cache.get(cncSessionKey_(token));
  let session;
  try {session = raw ? JSON.parse(raw) : null;} catch (_) {session = null;}
  const auth = cncAuthState_(false);
  const valid = session && session.authVersion === auth.version && session.expiresAt > Date.now() &&
    (session.credentialId === CNC_DEFAULT_ID_ || auth.passwords.some(function (item) {return item.id === session.credentialId && item.version === session.credentialVersion;}));
  if (!valid) {cache.remove(cncSessionKey_(token));throw new Error('AUTH_REQUIRED: Your admin session expired. Please sign in again.');}
  return session;
}
function cncNewPassword_(password) {
  if (password === 'admin') throw new Error('The password admin is reserved for the permanent default fallback.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('New password must have 8 to 128 characters.');
}
function cncPasswordLabel_(label,auth,exceptId) {
  const name = typeof label === 'string' ? label.trim() : '';
  if (!name || name.length > 80) throw new Error('Password label is required and must be at most 80 characters.');
  const key = name.toLowerCase();
  if (key === CNC_DEFAULT_LABEL_.toLowerCase() || auth.passwords.some(function (item) {return item.id !== exceptId && item.label.toLowerCase() === key;}))
    throw new Error('That password label already exists. Choose a different label.');
  return name;
}
function cncCustomPassword_(auth,id) {
  if (id === CNC_DEFAULT_ID_) throw new Error('The default admin / admin fallback cannot be changed or removed. Add an additional password instead.');
  const item = auth.passwords.find(function (credential) {return credential.id === id;});
  if (!item) throw new Error('That admin password no longer exists. Refresh the list and try again.');
  return item;
}
function cncRejectDuplicatePassword_(password,auth,exceptId) {
  if (auth.passwords.some(function (item) {return item.id !== exceptId && cncEqual_(cncPasswordHash_(password,item.salt),item.hash);}))
    throw new Error('That admin password already exists. Choose a different password.');
}
function cncCredential_(id,label,password) {
  const salt = cncUid_();
  return {id:id,label:label,salt:salt,hash:cncPasswordHash_(password,salt),version:cncUid_()};
}
function cncAuthPointer_(raw) {
  let pointer;
  try {pointer = JSON.parse(raw);} catch (_) {throw new Error('The shared admin password pointer is invalid.');}
  if (!pointer || ['A','B'].indexOf(pointer.slot) === -1 || !Number.isSafeInteger(pointer.parts) || pointer.parts < 1 || pointer.parts > 32 ||
      typeof pointer.digest !== 'string' || !/^[a-f0-9]{64}$/.test(pointer.digest)) throw new Error('The shared admin password pointer is invalid.');
  return pointer;
}
function cncAuthRaw_() {
  const props = cncProps_(), active = props.getProperty('CNC_AUTH_ACTIVE');
  // Read early variants once without silently replacing legacy credentials.
  if (!active) return props.getProperty('CNC_AUTH');
  const pointer = cncAuthPointer_(active), parts = [];
  for (let i=0;i<pointer.parts;i++) {
    const part = props.getProperty('CNC_AUTH_' + pointer.slot + '_' + i);
    if (typeof part !== 'string' || !part) throw new Error('The shared admin password snapshot is incomplete.');
    parts.push(part);
  }
  const json = parts.join('');
  if (cncDigest_(json) !== pointer.digest) throw new Error('The shared admin password snapshot failed its integrity check.');
  return json;
}
function cncSaveAuth_(auth) {
  const props = cncProps_(), activeRaw = props.getProperty('CNC_AUTH_ACTIVE');
  const active = activeRaw ? cncAuthPointer_(activeRaw) : null;
  const slot = active && active.slot === 'A' ? 'B' : 'A', json = JSON.stringify(auth);
  // A ScriptProperty has a 9 KB limit. Two thousand UTF-16 code units remain
  // below 6 KB of UTF-8, including 80-character non-ASCII labels. Keep surrogate
  // pairs intact so storage encoding cannot alter an image-free auth snapshot.
  const parts = cncStringChunks_(json,2000);
  if (parts.length > 32) throw new Error('The shared admin password list is too large.');
  parts.forEach(function (part,index) {props.setProperty('CNC_AUTH_' + slot + '_' + index,part);});
  if (parts.some(function (part,index) {return props.getProperty('CNC_AUTH_' + slot + '_' + index) !== part;}))
    throw new Error('The admin password changes could not be verified. Existing passwords remain active.');
  props.setProperty('CNC_AUTH_ACTIVE',JSON.stringify({slot:slot,parts:parts.length,digest:cncDigest_(json)}));
}
function cncAuthCall_(name,args) {
  if (name === 'adminLogout') {
    if (typeof args[0] === 'string' && /^[a-f0-9]{64}$/.test(args[0])) CacheService.getScriptCache().remove(cncSessionKey_(args[0]));
    return true;
  }
  const auth = cncAuthState_(false);
  if (name === 'adminLogin') {
    const username = args[0], password = args[1];
    const cache = CacheService.getScriptCache(), now = Date.now();
    let attempts;
    try {attempts = JSON.parse(cache.get('cnc-login-attempts') || 'null');} catch (_) {attempts = null;}
    if (!attempts || now >= attempts.until) attempts = {count:0,until:now+60000};
    if (attempts.count >= 20) throw new Error('Too many login attempts. Wait one minute and try again.');
    let credential = null;
    const validInput = username === 'admin' && typeof password === 'string' && password.length <= 128;
    if (validInput && password !== 'admin') credential = auth.passwords.find(function (item) {return cncEqual_(cncPasswordHash_(password,item.salt),item.hash);});
    if (!validInput || (password !== 'admin' && !credential)) {
      attempts.count++; cache.put('cnc-login-attempts',JSON.stringify(attempts),60);
      throw new Error('Incorrect username or password.');
    }
    cache.remove('cnc-login-attempts');
    const token = cncUid_(), expiresAt = now+CNC_SESSION_SECONDS_*1000;
    cache.put(cncSessionKey_(token),JSON.stringify({expiresAt:expiresAt,authVersion:auth.version,
      credentialId:credential ? credential.id : CNC_DEFAULT_ID_,credentialVersion:credential ? credential.version : CNC_DEFAULT_ID_}),CNC_SESSION_SECONDS_);
    return {token:token,expiresAt:expiresAt};
  }
  const session = cncRequireAdmin_(args[0]);
  if (name === 'adminListPasswords') return [{id:CNC_DEFAULT_ID_,label:CNC_DEFAULT_LABEL_,isDefault:true}]
    .concat(auth.passwords.map(function (item) {return {id:item.id,label:item.label,isDefault:false};}));
  if (name === 'adminAddPassword') {
    const label = cncPasswordLabel_(args[1],auth), password = args[2];
    cncNewPassword_(password);
    if (auth.passwords.length >= 20) throw new Error('You can save at most 20 additional admin passwords.');
    cncRejectDuplicatePassword_(password,auth);
    auth.passwords.push(cncCredential_(cncUid_(),label,password));cncSaveAuth_(auth);return true;
  }
  if (name === 'adminUpdatePassword') {
    const item = cncCustomPassword_(auth,args[1]), label = cncPasswordLabel_(args[2],auth,item.id), password = args[3];
    const change = password !== undefined && password !== null && password !== '';
    let replacement = {id:item.id,label:label,salt:item.salt,hash:item.hash,version:cncUid_()};
    if (change) {cncNewPassword_(password);cncRejectDuplicatePassword_(password,auth,item.id);replacement=cncCredential_(item.id,label,password);}
    auth.passwords[auth.passwords.indexOf(item)] = replacement;cncSaveAuth_(auth);return true;
  }
  if (name === 'adminDeletePassword') {
    const item = cncCustomPassword_(auth,args[1]);
    auth.passwords = auth.passwords.filter(function (credential) {return credential.id !== item.id;});cncSaveAuth_(auth);return true;
  }
  if (name === 'adminChangePassword') {
    const item = cncCustomPassword_(auth,session.credentialId);
    if (typeof args[1] !== 'string' || args[1].length > 128 || !cncEqual_(cncPasswordHash_(args[1],item.salt),item.hash)) throw new Error('Current password is incorrect.');
    cncNewPassword_(args[2]);cncRejectDuplicatePassword_(args[2],auth,item.id);
    auth.passwords[auth.passwords.indexOf(item)] = cncCredential_(item.id,item.label,args[2]);cncSaveAuth_(auth);return true;
  }
  throw new Error('Unknown admin action.');
}

// Compatibility for the setup function used by the preceding release.
function setupDatabase_() {return setupDatabase();}
