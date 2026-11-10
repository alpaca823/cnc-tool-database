/* Google Apps Script host for the shared CNC data engine.
 * The build adds the data engine generated from the local data core to Code.gs.
 * Canonical data lives in two staged Google Sheets snapshots. Images remain
 * private Drive files; the active snapshot pointer changes only after flush.
 */
const CNC_SERVER_VERSION_ = '__CNC_VERSION__';
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
    cncSyncInventoryViews_(cncReadState_(),true);
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
      let requestState;
      const api = createCncDataApi_({
        uid:cncUid_,readState:function () {if (!requestState) requestState = cncReadState_();return requestState;},storageWrite:cncWriteState_,requireAdmin:cncRequireAdmin_
      });
      let value;
      if (name === 'getWorkspaceData') {
        value = {mills:api.getMills(),materials:api.getMaterials(),dashboard:api.getDashboard(),rawMaterials:api.getRawMaterials()};
        if (cncProps_().getProperty('CNC_INVENTORY_VIEW_REVISION') !== String(cncPointer_().revision)) value.dashboard.sheetSyncWarning = 'Spreadsheet inventory tabs need a refresh. Save an inventory change or run setupDatabase.';
      }
      else if (CNC_AUTH_ACTIONS_.indexOf(name) !== -1) value = cncAuthCall_(name,args);
      else {
        if (api.actions.indexOf(name) === -1 || !Object.prototype.hasOwnProperty.call(api,name))
          throw new Error('Unknown database action.');
        value = api[name].apply(api,args);
        if (name === 'getDashboard') {
          if (cncProps_().getProperty('CNC_INVENTORY_VIEW_REVISION') !== String(cncPointer_().revision))
            value.sheetSyncWarning = 'Your app data is saved, but the Mills and Material Stock spreadsheet tabs could not refresh. ' + (cncProps_().getProperty('CNC_INVENTORY_VIEW_ERROR') || 'Save an inventory change or run setupDatabase to refresh them.');
        }
      }
      return {ok:true,value:JSON.parse(JSON.stringify(value === undefined ? null : value))};
    });
  } catch (error) {
    return {ok:false,error:error && error.message ? error.message : 'The shared database request failed. Please try again.',retryable:!!(error && error.cncLockBusy)};
  }
}

function cncWithLock_(callback) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {acquired = lock.tryLock(5000);} catch (_) {}
  if (!acquired) {const error = new Error('The database is busy saving another request. Please try again shortly.');error.cncLockBusy = true;throw error;}
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
  try {cncSyncInventoryViews_(valid);} catch (error) {cncProps_().setProperty('CNC_INVENTORY_VIEW_ERROR',String(error.message).slice(0,1500));console.warn('Inventory views need refresh: ' + error.message);}
}
function cncSyncInventoryViews_(state,force) {
  const props = cncProps_(), viewHash = cncDigest_(JSON.stringify([state.mills,state.rawMaterials]));
  if (!force && props.getProperty('CNC_INVENTORY_VIEW_HASH') === viewHash) {
    props.setProperty('CNC_INVENTORY_VIEW_REVISION',String(state.revision));return;
  }
  const book = cncSpreadsheet_();
  cncProps_().deleteProperty('CNC_INVENTORY_VIEW_REVISION');
  cncProps_().deleteProperty('CNC_INVENTORY_VIEW_HASH');
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
    const existing = book.getSheetByName(view.name);
    const sheet = existing || book.insertSheet(view.name);
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
    if (!existing || force) sheet.autoResizeColumns(1,view.rows[0].length);
  }
  SpreadsheetApp.flush();
  cncProps_().deleteProperty('CNC_INVENTORY_VIEW_ERROR');
  cncProps_().setProperty('CNC_INVENTORY_VIEW_HASH',viewHash);
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
