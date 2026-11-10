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
    return {...value,settings,rawMaterials,materials:materialLibrary(settings,value.materials,true,rawMaterials),mills:millLibrary(settings,value.mills,true)};
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
    if (typeof password === 'string' && password.toLowerCase() === 'feds201') throw new Error('The password admin is reserved for the permanent default fallback.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('New password must have 8 to 128 characters.');
  }
  function customPassword(state,id) {
    if (id === DEFAULT_PASSWORD_ID) throw new Error('The default admin / admin fallback cannot be changed or removed. Add an additional password instead.');
    const credential = state.auth.passwords.find(item => item.id === id);
    if (!credential) throw new Error('That admin password no longer exists. Refresh the list and try again.');
    return credential;
  }
  async function rejectDuplicatePassword(password,passwords,exceptId) {
    for (const credential of passwords) {
      if (credential.id !== exceptId && passwordsEqual(await hashPassword(password,credential.salt),credential.hash))
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
    // an additional login, while restoring the permanent admin/admin fallback.
    for (;;) {
      const state = readState();
      if (state.auth.passwords !== undefined) return;
      const defaultHash = await hashPassword('admin',state.auth.salt);
      const latest = readState();
      if (latest.auth.passwords !== undefined) return;
      if (JSON.stringify(state.auth) !== JSON.stringify(latest.auth)) continue;
      latest.auth.passwords = passwordsEqual(defaultHash,state.auth.hash) ? [] :
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
    return {settings,rawMaterials,materials:materialLibrary(settings,seed.materials,false,rawMaterials),mills:millLibrary(settings,seed.mills,false)};
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
  const writes = new Set(['adminSaveSetting','adminDeleteSetting','adminChangePassword','adminAddPassword','adminUpdatePassword','adminDeletePassword','adminImportBackup','adminSaveMaterial','adminDeleteMaterial','adminSaveMill','adminDeleteMill','adminSetInventory','adminSaveRawMaterial','adminDeleteRawMaterial']);
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
