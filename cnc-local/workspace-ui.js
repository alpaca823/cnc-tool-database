  let wsDrawingFiles = [], wsDrawingIds = [], wsNewDrawingFiles = [], wsPreviewUrl = null;
  let wsVisitRequest = 0;
  // Workspace navigation, public browsing, inventory, and appearance.
  let wsReports = [], wsBrokenOriginal = null;
  let wsCuts = [], wsCutOriginal = null, wsSheetCutOriginal = null;
  let wsNotes = [], wsNoteOriginal = null;
  let wsPage = 'dashboard', wsMills = [], wsMaterials = [], wsRawMaterials = [], wsDashboard = {}, wsSelectedMill = '', wsAfterLogin = null;
  let wsMillOriginal = null, wsMillBase = null, wsMillPhoto = '', wsMillPhotoDirty = false, wsMillEditorOpen = false, wsInventoryOriginal = null, wsDataRevision = 0;
  const wsThemeKey = 'cnc-tool-theme-v1';
  const wsThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  let wsTheme = 'dark', wsFeedSignature = '';
  let wsRawOriginal = null, wsRawEditorOpen = false, wsSelectedMaterialName = '';
  const wsPages = {
    beta:['Beta Testing','Experimental drawing placement and shaped stock.'],
    dashboard:['Dashboard','Your tool library and stock levels at a glance.'],
    feeds:['Feeds & Speeds','Find the saved cutting settings for your mill and material.'],
    mills:['Mills','Manage your cutting tools, specifications, and saved cutting data.'],
    inventory:['Inventory','Track mills, full sheets, and leftover material pieces.'],
    materials:['Materials','Select a material to see sheet quantities, sizes, and storage locations.'],
    cuts:['Cut List','Plan and track the cuts your shop needs to complete.'],
    notes:['Notes','Shop reminders and information.'],
    'whats-new':['What’s new','Short release highlights.'],
    settings:['Settings','Appearance, backups, and admin access for this workspace.']
  };
  function wsNode(tag, text, className) {
    const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node;
  }
  function wsButton(text, action, className = 'secondary small') {
    const button = wsNode('button',text,className); button.type = 'button'; button.addEventListener('click',action); return button;
  }
  function wsStock(item) {
    const status = item.stockStatus || 'untracked';
    return wsNode('span', {in:'In stock',low:'Low stock',out:'Out of stock',untracked:'Not counted'}[status] || 'Not counted', 'badge ' + status);
  }
  function wsFiltered(items, fields) {
    const query = el('globalSearch').value.trim().toLowerCase();
    return query ? items.filter(item => fields.some(field => String(item[field] == null ? '' : item[field]).toLowerCase().includes(query))) : items;
  }
  function wsGo(page) {
    if (page === 'raw-materials') page = 'materials';
    if (!wsPages[page] || (page==='beta'&&!token)) return;
    if (wsPage !== page) el('globalSearch').value = '';
    wsPage = page;
    if(page==='settings'&&typeof wsRefreshVisits==='function')wsRefreshVisits(false);
    document.querySelectorAll('.workspace-view').forEach(panel => panel.hidden = panel.dataset.page !== page);
    document.querySelectorAll('.nav-button').forEach(button => {
      const active = button.dataset.page === page; button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    el('pageTitle').textContent = wsPages[page][0]; el('pageDescription').textContent = wsPages[page][1];
    el('globalSearch').disabled = page === 'dashboard' || page === 'settings' || page === 'whats-new';
    el('globalSearch').placeholder = page === 'mills' ? 'Search mill numbers, names, types…' : page === 'inventory' ? 'Search mills, materials, or sizes…' : page === 'materials' ? 'Search materials, sheet sizes, or locations…' : 'Search this workspace…';
    el('sidebar').classList.remove('mobile-open'); el('menuToggle').setAttribute('aria-expanded','false');
    wsRenderAll();
    if (window.cncLocal) refreshWorkspaceData().catch(error => {el('adminStatus').textContent = message(error);});
  }
  function wsRequestLogin(after) {
    if (token) {if (typeof after === 'function') after(); return;}
    wsAfterLogin = typeof after === 'function' ? after : null;
    el('adminPanel').hidden = false; el('loginCard').hidden = false; el('username').focus();
  }
  function wsCloseLogin() {el('adminPanel').hidden = true;}
  function wsCompleteLogin() {const after = wsAfterLogin; wsAfterLogin = null; if (after) after();}
  function wsRequireAdmin(action) {if (token) action(); else wsRequestLogin(action);}
  function wsAuthChanged() {
    const signedIn = !!token;
    betaAuth();
    document.querySelectorAll('.admin-only').forEach(node => node.hidden = !signedIn);
    document.querySelectorAll('.login-callout').forEach(node => node.hidden = signedIn);
    el('workspace').hidden = !signedIn; el('toggleView').textContent = signedIn ? 'Admin settings' : 'Admin';
    el('publicMaterials').hidden = false;
    el('cuttingDetails').open = signedIn;
    if (!signedIn) {el('cutEditor').hidden=true;el('sheetCutEditor').hidden=true;wsCutOriginal=null;wsSheetCutOriginal=null;el('noteEditor').hidden = true; wsNoteOriginal = null; wsMillEditorOpen = false; wsMillOriginal = null; wsInventoryOriginal = null; wsRawOriginal = null; wsRawEditorOpen = false; el('rawMaterialForm').reset(); el('materialManagement').open = false;}
    el('millEditor').hidden = !signedIn || !wsMillEditorOpen;
    el('rawMaterialEditor').hidden = !signedIn || !wsRawEditorOpen;
    wsRenderAll();
  }
  async function refreshWorkspaceData() {
    const revision = ++wsDataRevision;
    const data = typeof localDatabase().workspaceData === 'function' ? await localDatabase().workspaceData() : null;
    const [mills,materials,dashboard,rawMaterials,notes,cuts,drawings] = data ? [data.mills,data.materials,data.dashboard,data.rawMaterials,data.notes || [],data.cuts || [],data.drawings || []] : await Promise.all([rpc('getMills'),rpc('getMaterials'),rpc('getDashboard'),rpc('getRawMaterials'),rpc('getNotes'),rpc('getCuts'),rpc('getCutDrawings')]);
    const reportToken=token;const reports=reportToken?await rpc('adminListReports',reportToken):[];
    if (revision !== wsDataRevision || token!==reportToken) return;
    wsReports=reports;
    wsDrawingFiles = drawings; wsCuts = cuts; wsNotes = notes; wsMills = mills; wsMaterials = materials; wsDashboard = dashboard; wsRawMaterials = rawMaterials;
    el('sheetSyncStatus').textContent = dashboard.sheetSyncWarning || ''; el('sheetSyncStatus').hidden = !dashboard.sheetSyncWarning;
    if (wsSelectedMill && !mills.some(item => item.number === wsSelectedMill)) wsSelectedMill = '';
    if (!wsSelectedMill && mills.length) wsSelectedMill = mills[0].number;
    el('sideMillCount').textContent = dashboard.mills; el('sideMaterialCount').textContent = dashboard.materials; el('sideSettingCount').textContent = dashboard.settings; el('sideRawSheetCount').textContent = dashboard.rawSheets == null ? rawMaterials.reduce((sum,item) => sum + item.quantity,0) : dashboard.rawSheets;
    const rawSelected = el('rawMaterialMaterial').value;
    fill(el('rawMaterialMaterial'),materials.map(item => item.name),'Select material');
    if (materials.some(item => item.name === rawSelected)) el('rawMaterialMaterial').value = rawSelected;
    el('rawMaterialMaterial').disabled = !materials.length;
    el('rawMaterialSelectHelp').textContent = materials.length ? 'Choose a material from your shared library.' : 'Create a material in the Materials tab before adding sheets.';
    const selected = el('inventoryMill').value;
    fill(el('inventoryMill'),mills.map(item => item.number),'Select mill');
    if (mills.some(item => item.number === selected)) el('inventoryMill').value = selected;
    const datalist = el('millSuggestions'); datalist.replaceChildren(...mills.map(item => {const option = wsNode('option'); option.value = item.number; option.label = item.name || item.number; return option;}));
    el('cutMaterialChoices').replaceChildren(...materials.map(item=>{const option=wsNode('option');option.value=item.name;return option;}));
    wsRenderAll();
  }
  function wsStats(target,items) {
    el(target).replaceChildren(...items.map(([label,value,note]) => {
      const card = wsNode('div',null,'stat-card'); card.append(wsNode('span',label,'stat-label'),wsNode('strong',String(value == null ? 0 : value),'stat-value'));
      if (note) card.append(wsNode('span',note,'hint')); return card;
    }));
  }
  function wsPurchaseLink(item) {
    const link = wsNode('a','Buy this mill','purchase-link');
    link.href = item.purchaseUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label','Buy this mill: ' + (item.name || item.number));
    return link;
  }
  function wsRenderDashboard() {
    wsStats('dashboardStats', [['Mills',wsDashboard.mills,'Tools in your library'],['Materials',wsDashboard.materials,'Shared material records'],['Cutting settings',wsDashboard.settings,'Saved mill/material pairs'],['Tools on hand',wsDashboard.unitsInStock,'From counted tools']]);
    const stock = wsMills.filter(item => item.stockStatus === 'low' || item.stockStatus === 'out');
    el('dashboardStock').replaceChildren();
    if (!stock.length) el('dashboardStock').append(wsNode('p',wsDashboard.trackedMills ? 'No counted tools are low or out of stock.' : 'No tool counts yet. Record quantities in Inventory to track tool availability.','empty-state'));
    stock.slice(0,8).forEach(item => {
      const row = wsNode('div',null,'stock-attention'); row.append(wsNode('span',(item.name || 'Mill ' + item.number) + ' · ' + item.quantity + ' on hand'),wsStock(item));
      if (item.purchaseUrl) row.append(wsPurchaseLink(item));
      row.append(wsButton('View',() => {wsGo('inventory'); if (token) wsSelectInventory(item.number);})); el('dashboardStock').append(row);
    });
    wsRenderDashboardCuts();
    wsStats('inventoryStats',[['Counted mills',wsDashboard.trackedMills],['Mills on hand',wsDashboard.unitsInStock],['Low mill inventory',wsDashboard.lowStock],['Mills out of stock',wsDashboard.outOfStock],['Material pieces',wsRawMaterials.reduce((total,item)=>total+item.quantity,0)],['Material stock entries',wsRawMaterials.length]]);
  }
  function wsRenderMills() {
    const items = wsFiltered(wsMills,['number','name','type','coating','location','notes']);
    if (!items.some(item => item.number === wsSelectedMill)) wsSelectedMill = items[0]?.number || '';
    el('millListCount').textContent = items.length + ' of ' + wsMills.length + ' mills';
    el('millListBody').replaceChildren(); el('millEmpty').hidden = !!items.length;
    el('millEmpty').textContent = wsMills.length ? 'No mills match your search.' : 'No mills yet. Add a mill or save cutting settings to start your library.';
    items.forEach(item => {
      const row = wsNode('tr'); row.classList.toggle('selected',item.number === wsSelectedMill);
      row.setAttribute('aria-selected',String(item.number === wsSelectedMill));
      row.addEventListener('click',event=>{if(event.target.closest('button,a,input,select,textarea'))return;wsSelectedMill=item.number;wsRenderMills();});
      const name = wsNode('td');
      const identity = wsNode('div',null,'tool-identity');
      if (item.toolImage) {const image = wsNode('img'); image.src = item.toolImage; image.alt = ''; image.className = 'tool-thumb'; identity.append(image);}
      else {const placeholder = wsNode('span',null,'tool-placeholder'); const icon = document.querySelector('.nav-button[data-page="mills"] svg'); if (icon) placeholder.append(icon.cloneNode(true)); identity.append(placeholder);}
      const title = wsNode('div'); title.append(wsButton(item.name || 'Mill ' + item.number,() => {wsSelectedMill = item.number; wsRenderMills();},'table-link'),wsNode('small',item.number,'hint'));
      identity.append(title); name.append(identity); row.append(name,wsNode('td',item.type || '—'),wsNode('td',item.diameter ? item.diameter + ' inch' : '—'),wsNode('td',item.flutes || '—'));
      const stock = wsNode('td'); stock.append(wsStock(item)); row.append(stock,wsNode('td',item.quantity == null ? '—' : item.quantity));
      const actions = wsNode('td');
      if (token) actions.append(wsButton('Edit',() => wsOpenMill(item)));
      row.append(actions); el('millListBody').append(row);
    });
    wsRenderMillDetail();
  }
  function wsRenderMillDetail() {
    const item = wsMills.find(mill => mill.number === wsSelectedMill); const detail = el('millDetails'); detail.replaceChildren();
    if (!item) {detail.append(wsNode('p','Select a mill to view its details.','empty-state')); return;}
    const header = wsNode('div',null,'detail-heading'); header.append(wsNode('h2',item.name || 'Mill ' + item.number),wsStock(item)); detail.append(header,wsNode('p',item.number,'hint'));
    if (item.toolImage) {const photo = wsNode('img'); photo.src = item.toolImage; photo.alt = 'Tool · Mill ' + item.number; photo.className = 'tool-hero'; detail.append(photo);}
    const specs = wsNode('dl',null,'detail-specs');
    [['Tool type',item.type || 'Not specified'],['Diameter',item.diameter ? item.diameter + ' inch' : 'Not specified'],['Flutes',item.flutes || 'Not specified'],['Coating',item.coating || 'Not specified'],['Cutting settings',item.usageCount],['Quantity',item.quantity == null ? 'Not counted' : item.quantity],['Storage location',item.location || 'Not specified']].forEach(([label,value])=>specs.append(wsNode('dt',label),wsNode('dd',String(value))));
    detail.append(specs); if (item.notes) detail.append(wsNode('p',item.notes,'detail-notes'));
    const actions = wsNode('div',null,'actions');
    actions.append(wsButton('View cutting data',() => {wsGo('feeds'); el('mill').value = item.number; millChanged(); if (!el('mill').value) el('status').textContent = 'No cutting settings saved for this mill yet.';}));
    if (token) {
      const edit = wsButton('Edit mill',() => wsOpenMill(item)); edit.id = 'editSelectedMill'; actions.append(edit);
      actions.append(wsButton('Delete',() => wsDeleteMill(item),'danger small'));
    }
    if (item.quantity>0) actions.append(wsButton('Report broken',()=>wsOpenBroken(item)));
    if (item.purchaseUrl) actions.append(wsPurchaseLink(item));
    detail.append(actions);
  }
  function wsRenderInventory() {
    const items = wsFiltered(wsMills,['number','name','type']);
    el('inventoryListBody').replaceChildren(); el('inventoryEmpty').hidden = !!items.length;
    el('inventoryEmpty').textContent = wsMills.length ? 'No inventory records match your search.' : 'No mills to track. Add a mill first.';
    items.forEach(item => {
      const row = wsNode('tr'); const name = wsNode('td'); name.append(wsNode('strong',item.name || 'Mill ' + item.number),wsNode('small',item.number,'hint'));
      row.append(name,wsNode('td',item.quantity == null ? 'Not counted' : item.quantity),wsNode('td',item.reorderLevel == null ? '—' : item.reorderLevel));
      const stock = wsNode('td'); stock.append(wsStock(item)); row.append(stock);
      const actions = wsNode('td'); if (item.purchaseUrl && ['low','out'].includes(item.stockStatus)) actions.append(wsPurchaseLink(item)); if(item.quantity>0)actions.append(wsButton('Report broken',()=>wsOpenBroken(item))); if (token) actions.append(wsButton('Update stock',() => wsSelectInventory(item.number))); row.append(actions); el('inventoryListBody').append(row);
    });
  }
  function wsRenderInventoryMaterials() {
    const items=wsFiltered(wsRawMaterials,['material','length','width','thickness','notes']);
    el('inventoryMaterialBody').replaceChildren();el('inventoryMaterialEmpty').hidden=items.length>0;
    el('inventoryMaterialEmpty').textContent=wsRawMaterials.length?'No material stock matches your search.':'No material stock recorded. Add sheet entries in Materials to start tracking stock.';
    el('inventoryMaterialCount').textContent=items.length+' of '+wsRawMaterials.length+' stock entries · '+items.reduce((total,item)=>total+item.quantity,0)+' pieces shown';
    items.forEach(item=>{
      const row=wsNode('tr');row.dataset.stockId=item.id;const name=wsNode('td');name.append(wsNode('strong',item.material));
      row.append(name,wsNode('td',item.length+' × '+item.width+(item.cutouts?.length?' · shaped remnant (bounds)':'')),wsNode('td',item.thickness||'Not specified'),wsNode('td',String(item.quantity)));
      const status=wsNode('td');status.append(wsNode('span',item.quantity>0?'In stock':'Out of stock','badge '+(item.quantity>0?'in':'out')));row.append(status);
      const actions=wsNode('td');if(item.quantity>0)actions.append(wsButton(item.cutouts?.length?'Use whole piece':'Record cut',()=>wsOpenSheetCut(item)));
      if(token&&item.quantity>0&&item.cutouts?.length)actions.append(wsButton('Place drawing',()=>{betaStockId=item.id;wsGo('beta');}));
      actions.append(wsButton('View material',()=>{wsSelectedMaterialName=item.material;wsGo('materials');}));
      if(token)actions.append(wsButton('Edit stock',()=>wsOpenRawMaterial(item)));row.append(actions);el('inventoryMaterialBody').append(row);
    });
  }
  function wsRenderMaterials() {
    const query = wsPage === 'materials' ? el('globalSearch').value.trim().toLowerCase() : '';
    const fields = ['length','width','thickness','location','notes'];
    const items = wsMaterials.filter(item => !query || item.name.toLowerCase().includes(query) || wsRawMaterials.some(row => row.material === item.name && fields.some(field => String(row[field] == null ? '' : row[field]).toLowerCase().includes(query))));
    if (!items.some(item => item.name === wsSelectedMaterialName)) wsSelectedMaterialName = items.length ? items[0].name : '';
    el('publicMaterialList').replaceChildren();
    if (!items.length) el('publicMaterialList').append(wsNode('p',wsMaterials.length ? 'No materials match your search.' : 'No materials yet. An admin can add your first material.','empty-state'));
    items.forEach(item => {
      const rows = wsRawMaterials.filter(row => row.material === item.name), sheets = rows.reduce((sum,row) => sum + row.quantity,0);
      const card = wsNode('button',null,'material-choice'); card.type = 'button'; card.dataset.material = item.name;
      card.classList.toggle('selected',item.name === wsSelectedMaterialName); card.setAttribute('aria-pressed',String(item.name === wsSelectedMaterialName));
      if (item.materialImage) {const image = wsNode('img'); image.src = item.materialImage; image.alt = ''; card.append(image);}
      card.append(wsNode('h3',item.name),wsNode('p',rows.length ? sheets + ' sheets recorded · ' + rows.length + (rows.length === 1 ? ' entry' : ' entries') : 'No sheet inventory recorded'));
      card.addEventListener('click',() => {wsSelectedMaterialName = item.name; wsRawOriginal = null; wsRawEditorOpen = false; el('rawMaterialEditor').hidden = true; wsRenderMaterials(); wsRenderRawMaterials();});
      el('publicMaterialList').append(card);
    });
    const selected = wsMaterials.find(item => item.name === wsSelectedMaterialName);
    const rows = wsRawMaterials.filter(row => row.material === wsSelectedMaterialName), sheets = rows.reduce((sum,row) => sum + row.quantity,0);
    el('materialDetailTitle').textContent = selected ? selected.name : 'Select a material';
    el('selectedMaterialSummary').textContent = selected ? sheets + ' sheets recorded · ' + rows.length + (rows.length === 1 ? ' sheet entry' : ' sheet entries') + ' · ' + selected.usageCount + ' cutting settings' : 'Choose a material from the list to view its inventory.';
    const photo = el('selectedMaterialPhoto'); photo.hidden = !selected || !selected.materialImage;
    if (selected && selected.materialImage) {photo.src = selected.materialImage; photo.alt = selected.name;} else {photo.removeAttribute('src'); photo.alt = '';}
    el('materialSheetContent').hidden = !selected; el('materialDetailEmpty').hidden = !!selected;
    el('materialDetailEmpty').textContent = wsMaterials.length ? 'No materials match this search. Clear the search to browse your library.' : 'No materials yet. An admin can add the materials used in your shop.';
    el('editSelectedMaterial').hidden = !token || !selected;
    document.querySelectorAll('#materialList > article').forEach(card => card.hidden = !!query && !card.textContent.toLowerCase().includes(query));
  }
  function wsFilterFeeds() {
    if (wsPage !== 'feeds') return;
    const query = el('globalSearch').value.trim().toLowerCase();
    const filtered = options.filter(item => !query || item.mill.toLowerCase().includes(query) || item.materials.some(name => name.toLowerCase().includes(query)) || wsMills.some(mill => mill.number === item.mill && (mill.name || '').toLowerCase().includes(query)));
    const signature = JSON.stringify([query,filtered]);
    if (signature !== wsFeedSignature) {
      wsFeedSignature = signature;
      const previousMill = el('mill').value, previousMaterial = el('material').value;
      fill(el('mill'),filtered.map(item => item.mill),'Select mill number');
      if (filtered.some(item => item.mill === previousMill)) el('mill').value = previousMill;
      el('mill').disabled = !filtered.length; millChanged(previousMaterial);
      if (query && !filtered.length) el('status').textContent = 'No saved cutting settings match your search.';
    }
    document.querySelectorAll('#settingList > article').forEach(card => card.hidden = !!query && !card.textContent.toLowerCase().includes(query));
  }
  function wsRenderAll() {betaRefresh();wsRenderDashboard(); wsRenderMills(); wsRenderInventory(); wsRenderInventoryMaterials(); wsRenderMaterials(); wsRenderRawMaterials(); wsRenderNotes(); wsRenderCuts(); wsRenderReports(); wsFilterFeeds();}
  function wsShowMillPhoto() {
    const img = el('millImagePreview'); img.hidden = !wsMillPhoto; el('removeMillImage').hidden = !wsMillPhoto;
    if (wsMillPhoto) img.src = wsMillPhoto; else img.removeAttribute('src');
  }
  function wsOpenMill(item) {
    wsRequireAdmin(() => {
      wsGo('mills'); wsMillEditorOpen = true; el('millEditor').hidden = false; el('millForm').reset(); el('millFormStatus').textContent = '';
      wsMillOriginal = item ? {number:item.number,version:item.version} : null; wsMillBase = item ? {...item} : {};
      const fields = {number:'millNumber',name:'millName',type:'millType',diameter:'millDiameter',flutes:'millFlutes',coating:'millCoating',purchaseUrl:'millPurchaseUrl',notes:'millNotes'};
      Object.entries(fields).forEach(([key,id]) => el(id).value = item && item[key] != null ? item[key] : '');
      wsMillPhoto = item && item.toolImage ? item.toolImage : ''; wsMillPhotoDirty = false; wsShowMillPhoto();
      el('millEditorTitle').textContent = item ? 'Edit mill' : 'Add mill'; el('millNumber').focus();
    });
  }
  async function wsDeleteMill(item) {
    if (!token || adminBusy) return;
    if (!window.confirm('Delete mill ' + item.number + '? Mills with saved cutting settings cannot be deleted.')) return;
    const active = token; setBusy(true);
    try {await rpc('adminDeleteMill',active,{number:item.number,version:item.version}); if (token !== active) return; await fetchSettings(active); el('adminStatus').textContent = 'Mill deleted.';}
    catch (error) {if (token === active) adminError(error);} finally {if (token === active) setBusy(false);}
  }
  function wsSelectInventory(number) {
    const item = wsMills.find(mill => mill.number === number); if (!item) {wsInventoryOriginal = null; el('inventoryQuantity').value = ''; el('inventoryReorderLevel').value = ''; return;}
    el('inventoryMill').value = number; wsInventoryOriginal = {number:item.number,version:item.version,location:item.location || ''};
    el('inventoryQuantity').value = item.quantity == null ? '' : item.quantity; el('inventoryReorderLevel').value = item.reorderLevel == null ? '' : item.reorderLevel;
    el('inventoryStatus').textContent = ''; if (wsPage === 'inventory') el('inventoryQuantity').focus();
  }
  function wsApplyTheme() {
    const resolved = wsTheme === 'system' ? (wsThemeMedia.matches ? 'dark' : 'light') : wsTheme;
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {const active = button.dataset.themeChoice === wsTheme; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));});
    el('themeStatus').textContent = wsTheme === 'system' ? 'Following your system appearance (' + resolved + ').' : (wsTheme === 'dark' ? 'Dark' : 'Light') + ' appearance is selected.';
  }
  function initWorkspace() {
    try {const saved = localStorage.getItem(wsThemeKey); if (['light','dark','system'].includes(saved)) wsTheme = saved;} catch (_) {}
    wsApplyTheme(); wsThemeMedia.addEventListener('change',() => {if (wsTheme === 'system') wsApplyTheme();});
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click',() => {
      wsTheme = button.dataset.themeChoice; wsApplyTheme();
      try {localStorage.setItem(wsThemeKey,wsTheme);} catch (_) {el('themeStatus').textContent += ' This browser could not save your appearance preference.';}
    }));
    document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click',() => wsGo(button.dataset.page)));
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click',() => wsGo(button.dataset.go)));
    document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click',() => wsRequestLogin()));
    el('closeLogin').addEventListener('click',() => {if (!loginBusy) {wsAfterLogin = null; wsCloseLogin();}});
    el('menuToggle').addEventListener('click',() => {const open = el('sidebar').classList.toggle('mobile-open'); el('menuToggle').setAttribute('aria-expanded',String(open));});
    el('globalSearch').addEventListener('input',wsRenderAll);
    window.addEventListener('keydown',event => {if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {event.preventDefault(); el('globalSearch').focus(); el('globalSearch').select();} if (event.key === 'Escape' && !loginBusy) {wsCloseLogin(); el('sidebar').classList.remove('mobile-open'); el('menuToggle').setAttribute('aria-expanded','false');}});
    el('addInventoryStock').addEventListener('click',()=>wsOpenRawMaterial(null));
    el('addMill').addEventListener('click',() => wsOpenMill(null));
    el('cancelMillEdit').addEventListener('click',() => {if (!adminBusy) {wsMillEditorOpen = false; el('millEditor').hidden = true;}});
    el('millImageUpload').addEventListener('change',async () => {
      const file = el('millImageUpload').files[0]; if (!file || !token || adminBusy) return; const active = token; setBusy(true);
      try {const data = await prepareImage(file); if (token === active) {wsMillPhoto = data; wsMillPhotoDirty = true; wsShowMillPhoto(); el('millFormStatus').textContent = 'Tool image ready. Save the mill to keep it.';}}
      catch (error) {el('millFormStatus').textContent = message(error);} finally {el('millImageUpload').value = ''; if (token === active) setBusy(false);}
    });
    el('removeMillImage').addEventListener('click',() => {if (!adminBusy) {wsMillPhoto = ''; wsMillPhotoDirty = true; wsShowMillPhoto();}});
    el('millForm').addEventListener('submit',async event => {
      event.preventDefault(); if (!token || adminBusy) return;
      const mill = {...wsMillBase,number:el('millNumber').value.trim(),name:el('millName').value.trim(),type:el('millType').value.trim(),diameter:el('millDiameter').value.trim(),flutes:el('millFlutes').value,coating:el('millCoating').value.trim(),purchaseUrl:el('millPurchaseUrl').value.trim(),notes:el('millNotes').value};
      delete mill.toolImage; if (wsMillPhotoDirty || !wsMillOriginal) mill.toolImage = wsMillPhoto;
      const active = token; setBusy(true); el('millFormStatus').textContent = 'Saving mill…';
      try {await rpc('adminSaveMill',active,mill,wsMillOriginal); if (token !== active) return; wsSelectedMill = mill.number; wsMillEditorOpen = false; el('millEditor').hidden = true; await Promise.all([fetchSettings(active),loadOptions()]); el('adminStatus').textContent = 'Mill saved.';}
      catch (error) {if (token === active) {adminError(error); el('millFormStatus').textContent = message(error);}} finally {if (token === active) setBusy(false);}
    });
    el('refreshInventory').addEventListener('click',async () => {
      const number = el('inventoryMill').value;
      try {await refreshWorkspaceData(); if (token) wsSelectInventory(number);}
      catch (error) {el('inventoryStatus').textContent = message(error);}
    });
    el('inventoryMill').addEventListener('change',() => {wsInventoryOriginal = null; wsSelectInventory(el('inventoryMill').value);});
    el('inventoryForm').addEventListener('submit',async event => {
      event.preventDefault(); if (!token || adminBusy) return;
      if (!wsInventoryOriginal || wsInventoryOriginal.number !== el('inventoryMill').value) {el('inventoryStatus').textContent = 'Select a mill before updating stock.'; return;}
      const active = token; setBusy(true); el('inventoryStatus').textContent = 'Saving inventory…';
      try {await rpc('adminSetInventory',active,wsInventoryOriginal.number,el('inventoryQuantity').value,el('inventoryReorderLevel').value,wsInventoryOriginal.location,wsInventoryOriginal.version); if (token !== active) return; const number = wsInventoryOriginal.number; await fetchSettings(active); wsSelectInventory(number); el('inventoryStatus').textContent = 'Inventory saved.';}
      catch (error) {if (token === active) {adminError(error); el('inventoryStatus').textContent = message(error);}} finally {if (token === active) setBusy(false);}
    });
    wsInitRawMaterials();
    wsInitNotes();
    wsInitCuts();
    wsInitReports();
    wsInitDrawings();
    wsInitVisits();
    wsAuthChanged(); wsGo('dashboard');
  }

  function wsRenderRawMaterials() {
    const materialRows = wsRawMaterials.filter(item => item.material === wsSelectedMaterialName);
    if(wsSheetCutOriginal&&!materialRows.some(item=>item.id===wsSheetCutOriginal.id)){el('sheetCutEditor').hidden=true;wsSheetCutOriginal=null;}
    const query = wsPage === 'materials' ? el('globalSearch').value.trim().toLowerCase() : '';
    const items = query ? materialRows.filter(item => ['material','length','width','thickness','location','notes'].some(field => String(item[field] == null ? '' : item[field]).toLowerCase().includes(query))) : materialRows;
    const totalSheets = materialRows.reduce((sum,item) => sum + item.quantity,0);
    const selected = wsMaterials.find(item => item.name === wsSelectedMaterialName);
    wsStats('rawMaterialStats',[['Sheet entries',materialRows.length,'Sizes and storage batches'],['Sheets on hand',totalSheets,'Recorded sheet quantities'],['Cutting settings',selected ? selected.usageCount : 0,'Saved for this material']]);
    el('rawMaterialListCount').textContent = items.length + ' of ' + materialRows.length + ' sheet entries · All dimensions in inches';
    const body = el('rawMaterialListBody'); body.replaceChildren();
    el('rawMaterialEmpty').hidden = !!items.length;
    el('rawMaterialEmpty').textContent = materialRows.length ? 'No sheet entries match your search for this material.' : 'No sheet inventory recorded for ' + (wsSelectedMaterialName || 'this material') + ' yet.';
    items.forEach(item => {
      const row = wsNode('tr'); const material = wsNode('td'); const identity = wsNode('div',null,'tool-identity');
      if (item.materialImage) {const img = wsNode('img'); img.className = 'tool-thumb'; img.src = item.materialImage; img.alt = ''; identity.append(img);}
      identity.append(wsNode('strong',item.material)); material.append(identity);
      const quantity = wsNode('td'); quantity.append(wsNode('span',String(item.quantity),'badge ' + (item.quantity === 0 ? 'out' : 'in')));
      const noteCell = wsNode('td'); const note = wsNode('span',item.notes || '—','raw-material-note'); note.title = item.notes || ''; noteCell.append(note);
      row.append(material,wsNode('td',item.length + ' × ' + item.width+(item.cutouts?.length?' · shaped remnant (bounds)':'')),wsNode('td',item.thickness || 'Not specified'),quantity,wsNode('td',item.location || '—'),noteCell);
      const actions = wsNode('td');
      if(item.quantity>0)actions.append(wsButton(item.cutouts?.length?'Use whole piece':'Record cut',()=>wsOpenSheetCut(item)));
      if(token&&item.quantity>0&&item.cutouts?.length)actions.append(wsButton('Place drawing',()=>{betaStockId=item.id;wsGo('beta');}));
      if (token) {
        const group = wsNode('div',null,'actions'); group.append(wsButton('Edit',() => wsOpenRawMaterial(item)),wsButton('Delete',() => wsDeleteRawMaterial(item),'danger small')); actions.append(group);
      }
      row.append(actions); body.append(row);
    });
  }
  function wsOpenRawMaterial(item) {
    wsRequireAdmin(() => {
      if (item) wsSelectedMaterialName = item.material;
      wsGo('materials');el('sheetCutEditor').hidden=true;wsSheetCutOriginal=null; wsRawEditorOpen = true; el('rawMaterialEditor').hidden = false;
      el('rawMaterialForm').reset(); wsRawOriginal = item ? {id:item.id,version:item.version} : null;
      const fields = {material:'rawMaterialMaterial',length:'rawMaterialLength',width:'rawMaterialWidth',thickness:'rawMaterialThickness',quantity:'rawMaterialQuantity',location:'rawMaterialLocation',notes:'rawMaterialNotes'};
      Object.entries(fields).forEach(([key,id]) => el(id).value = item && item[key] != null ? item[key] : '');
      if (!item) el('rawMaterialMaterial').value = wsSelectedMaterialName;
      el('rawMaterialEditorTitle').textContent = item ? 'Edit sheet entry' : 'Add sheet entry'; el('rawMaterialStatus').textContent = '';
      el('rawMaterialMaterial').focus();
    });
  }
  async function wsDeleteRawMaterial(item) {
    if (!token || adminBusy || !window.confirm('Delete this sheet entry for ' + item.material + ' (' + item.length + ' × ' + item.width + ' inch, ' + item.quantity + ' sheets)?')) return;
    const active = token; setBusy(true);
    try {
      await rpc('adminDeleteRawMaterial',active,{id:item.id,version:item.version}); if (token !== active) return;
      if (wsRawOriginal && wsRawOriginal.id === item.id) {wsRawOriginal = null; wsRawEditorOpen = false; el('rawMaterialEditor').hidden = true;}
      await fetchSettings(active); el('adminStatus').textContent = 'Sheet entry deleted.';
    } catch (error) {if (token === active) adminError(error);} finally {if (token === active) setBusy(false);}
  }
  function wsInitRawMaterials() {
    el('manageMaterials').addEventListener('click',() => {if (!token || adminBusy) return; resetMaterialEditor(); el('materialManagement').open = true; el('materialName').focus();});
    el('editSelectedMaterial').addEventListener('click',() => {
      if (!token || adminBusy) return;
      const item = materialCatalog.find(material => material.name === wsSelectedMaterialName); if (!item) return;
      el('materialManagement').open = true; materialOriginal = {name:item.name,version:item.version}; materialPhoto = item.materialImage || '';
      el('materialName').value = item.name; refreshMaterialImageEditor(); el('materialEditorTitle').textContent = 'Edit material'; el('saveMaterial').textContent = 'Save material changes'; el('cancelMaterialEdit').textContent = 'Cancel edit'; el('materialName').focus();
    });
    el('addRawMaterial').addEventListener('click',() => wsOpenRawMaterial(null));
    el('cancelRawMaterialEdit').addEventListener('click',() => {if (!adminBusy) {wsRawOriginal = null; wsRawEditorOpen = false; el('rawMaterialEditor').hidden = true;}});
    el('rawMaterialForm').addEventListener('submit',async event => {
      event.preventDefault(); if (!token || adminBusy) return;
      const record = {material:el('rawMaterialMaterial').value,length:el('rawMaterialLength').value.trim(),width:el('rawMaterialWidth').value.trim(),thickness:el('rawMaterialThickness').value.trim(),quantity:el('rawMaterialQuantity').value,location:el('rawMaterialLocation').value.trim(),notes:el('rawMaterialNotes').value};
      const active = token; setBusy(true); el('rawMaterialStatus').textContent = 'Saving sheet entry…';
      try {
        await rpc('adminSaveRawMaterial',active,record,wsRawOriginal); if (token !== active) return;
        wsSelectedMaterialName = record.material; el('globalSearch').value = '';
        wsRawOriginal = null; wsRawEditorOpen = false; el('rawMaterialEditor').hidden = true;
        await fetchSettings(active); el('adminStatus').textContent = 'Sheet entry saved.';
      } catch (error) {if (token === active) {adminError(error); el('rawMaterialStatus').textContent = message(error);}} finally {if (token === active) setBusy(false);}
    });
  }

  function wsRenderNotes() {
    const notes = wsFiltered(wsNotes,['title','body']).slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)); el('noteList').replaceChildren();
    el('notesEmpty').hidden = notes.length > 0;
    el('notesEmpty').textContent = wsNotes.length ? 'No notes match your search.' : 'No notes yet.';
    notes.forEach(item => {
      const card = wsNode('article',null,'shop-note'); if(item.pinned){card.classList.add('pinned-note');card.append(wsNode('span','Pinned','badge in'));}card.append(wsNode('h3',item.title),wsNode('p',item.body,'note-body'));
      if (token) {const actions = wsNode('div',null,'actions'); const pin=wsButton(item.pinned?'Unpin':'Pin',()=>wsSaveAction('adminSetNotePinned',{id:item.id,version:item.version},!item.pinned));pin.setAttribute('aria-pressed',String(item.pinned));actions.append(pin,wsButton('Edit',()=>wsOpenNote(item)),wsButton('Delete',async()=>{
        if (adminBusy || !window.confirm('Delete note “'+item.title+'”?')) return;
        const active = token; setBusy(true);
        try {await rpc('adminDeleteNote',active,{id:item.id,version:item.version});if(token!==active)return;if(wsNoteOriginal?.id===item.id)el('noteEditor').hidden=true;await refreshWorkspaceData();}
        catch(error){if(token===active)adminError(error);}finally{if(token===active)setBusy(false);}
      }));card.append(actions);}el('noteList').append(card);
    });
  }
  function wsOpenNote(item) {
    if (!token || adminBusy) return;
    wsNoteOriginal = item ? {id:item.id,version:item.version} : null;
    el('noteTitle').value = item?.title || ''; el('noteBody').value = item?.body || '';
    el('noteEditorTitle').textContent = item ? 'Edit note' : 'Add note'; el('noteStatus').textContent = '';el('noteEditor').hidden = false;el('noteTitle').focus();
  }
  function wsInitNotes() {
    el('addNote').addEventListener('click',()=>wsOpenNote(null));
    el('cancelNote').addEventListener('click',()=>{if(!adminBusy){el('noteEditor').hidden=true;wsNoteOriginal=null;}});
    el('noteForm').addEventListener('submit',async event=>{
      event.preventDefault();if(!token||adminBusy)return;const active=token;setBusy(true);el('noteFields').disabled=true;el('noteStatus').textContent='Saving note…';
      try {await rpc('adminSaveNote',active,{title:el('noteTitle').value,body:el('noteBody').value},wsNoteOriginal);if(token!==active)return;el('noteEditor').hidden=true;wsNoteOriginal=null;await refreshWorkspaceData();}
      catch(error){if(token===active)el('noteStatus').textContent=message(error);}finally{el('noteFields').disabled=false;if(token===active)setBusy(false);}
    });
  }

  async function wsSaveAction(name,...args) {
    if(!token||adminBusy)return;const active=token;setBusy(true);
    try {await rpc(name,active,...args);if(token===active)await refreshWorkspaceData();}
    catch(error){if(token===active)adminError(error);}finally{if(token===active)setBusy(false);}
  }
  const wsPriorities = {low:'Low',normal:'Normal',high:'High',urgent:'Urgent'};
  function wsRenderCuts() {
    const filter=el('cutFilter').value,priorityFirst=el('cutSort').value==='priority',query=el('globalSearch').value.trim(),rank={urgent:0,high:1,normal:2,low:3};
    const pending=wsCuts.filter(item=>!item.completed);
    const cuts=wsFiltered(wsCuts,['title','material','notes','length','width','thickness','priority']).filter(item=>filter==='all'||(filter==='completed')===item.completed).sort((a,b)=>Number(a.completed)-Number(b.completed)||(priorityFirst?rank[a.priority]-rank[b.priority]:0));
    el('cutList').replaceChildren();el('cutsEmpty').hidden=cuts.length>0;
    el('cutCount').textContent=pending.length+' to do · '+wsCuts.filter(item=>item.completed).length+' completed';
    cuts.forEach(item=>{
      const position=pending.findIndex(cut=>cut.id===item.id),card=wsNode('article',null,'shop-note');card.dataset.cutId=item.id;
      card.append(wsNode('span',item.completed?'Completed':'To do','badge '+(item.completed?'in':'low')),wsNode('span',wsPriorities[item.priority]||'Normal','badge priority-'+(item.priority||'normal')),wsNode('h3',item.title));
      if(!item.completed)card.append(wsNode('p','Planned order: #'+(position+1),'hint'));
      const size=['length','width','thickness'].map(key=>item[key]||'—').join(' × ');
      card.append(wsNode('p','Quantity: '+item.quantity+' · Material: '+(item.material||'Not specified')),wsNode('p','Size: '+size+' inch','hint'));if(item.notes)card.append(wsNode('p',item.notes,'note-body'));
      wsAppendDrawings(card,item);
      {
        const original={id:item.id,version:item.version},actions=wsNode('div',null,'actions');
        const label=wsNode('label','Priority','cut-priority-label'),priority=wsNode('select');priority.setAttribute('aria-label','Priority for '+item.title);
        for(const [value,text] of Object.entries(wsPriorities)){const option=wsNode('option',text);option.value=value;priority.append(option);}priority.value=item.priority||'normal';
        priority.addEventListener('change',async()=>{await wsPublicCutAction('reportSetCutPriority',original,priority.value);wsRenderCuts();});label.append(priority);card.append(label);
        if(!item.completed)for(const [text,offset]of [['Move up',-1],['Move down',1]]){
          const neighbor=pending[position+offset],button=wsButton(text,async()=>{
            await wsPublicCutAction('reportMoveCut',original,{id:neighbor.id,version:neighbor.version});
            const updated=Array.from(el('cutList').children).find(node=>node.dataset.cutId===item.id);const control=updated&&Array.from(updated.querySelectorAll('button')).find(node=>node.textContent===text);if(control&&!control.disabled)control.focus();
          });button.disabled=!neighbor||priorityFirst||!!query;button.setAttribute('aria-label',text+' '+item.title);actions.append(button);
        }
        if(item.completed)actions.append(wsButton('Reopen',()=>wsPublicCutAction('reportReopenCut',original)));
        actions.append(wsButton('Edit',()=>wsOpenCut(item)),wsButton('Delete',()=>{if(window.confirm('Delete cut “'+item.title+'”?'))wsPublicCutAction('reportDeleteCut',original);},'danger small'));card.append(actions);
      }if(!item.completed)card.append(wsButton('Mark done',()=>wsReportDone(item)));el('cutList').append(card);
    });
  }
  function wsOpenCut(item) {
    if(adminBusy)return;wsCutOriginal=item?{id:item.id,version:item.version}:null;
    for(const name of ['title','material','quantity','length','width','thickness','notes','priority'])el('cut'+name[0].toUpperCase()+name.slice(1)).value=item?.[name]??(name==='quantity'?'1':name==='priority'?'normal':'');
    wsDrawingIds=(item?.drawingIds||[]).slice();wsNewDrawingFiles=[];el('cutDrawingUpload').value='';el('cutDrawingStatus').textContent='';wsRenderDrawingEditor();
    el('planReporter').value='';
    el('cutEditorTitle').textContent=item?'Edit cut':'Add cut';el('cutStatus').textContent='';el('cutEditor').hidden=false;el('cutTitle').focus();
  }
  function wsOpenSheetCut(item) {
    if(adminBusy)return;if(wsPage!=='materials'){wsSelectedMaterialName=item.material;wsGo('materials');}wsRawEditorOpen=false;el('rawMaterialEditor').hidden=true;wsSheetCutOriginal={id:item.id,version:item.version};el('sheetCutForm').reset();el('keepRemainder').disabled=!!item.cutouts?.length;if(item.cutouts?.length)el('keepRemainder').checked=false;el('sheetCutStatus').textContent='';el('sheetCutEditor').hidden=false;wsToggleRemainder();
    el('sheetCutSource').textContent=item.material+' · '+item.length+' × '+item.width+' inch · '+item.quantity+' pieces available';el('remainderLength').focus();
  }
  function wsToggleRemainder() {
    const keep=el('keepRemainder').checked;el('remainderFields').hidden=!keep;
    for(const id of ['remainderLength','remainderWidth']){el(id).required=keep;el(id).disabled=!keep;}
  }
  function wsInitCuts() {
    el('dashboardAddCut').addEventListener('click',()=>{wsGo('cuts');el('cutFilter').value='pending';wsOpenCut(null);});
    el('addCut').addEventListener('click',()=>wsOpenCut(null));el('cutFilter').addEventListener('change',wsRenderCuts);el('cutSort').addEventListener('change',wsRenderCuts);
    el('cancelCut').addEventListener('click',()=>{if(!adminBusy){el('cutEditor').hidden=true;wsCutOriginal=null;}});
    el('cutForm').addEventListener('submit',async event=>{
      event.preventDefault();if(adminBusy)return;const record={};for(const name of ['title','material','quantity','length','width','thickness','notes','priority'])record[name]=el('cut'+name[0].toUpperCase()+name.slice(1)).value;
      record.drawingIds=wsDrawingIds.slice();record.newDrawings=wsNewDrawingFiles.slice();
      setBusy(true);el('cutFields').disabled=true;el('cutStatus').textContent='Saving cut…';
      try {await rpc('reportSaveCut',record,wsCutOriginal,{reporter:el('planReporter').value});if(!wsCutOriginal)el('cutFilter').value='pending';el('globalSearch').value='';el('cutEditor').hidden=true;wsCutOriginal=null;await refreshWorkspaceData();}
      catch(error){el('cutStatus').textContent=message(error);}finally{el('cutFields').disabled=false;setBusy(false);}
    });
    el('keepRemainder').addEventListener('change',wsToggleRemainder);
    el('cancelSheetCut').addEventListener('click',()=>{if(!adminBusy){el('sheetCutEditor').hidden=true;wsSheetCutOriginal=null;}});
    el('sheetCutForm').addEventListener('submit',async event=>{
      event.preventDefault();if(adminBusy||!wsSheetCutOriginal)return;const remainder=el('keepRemainder').checked?{length:el('remainderLength').value,width:el('remainderWidth').value}:null;
      setBusy(true);el('sheetCutFields').disabled=true;el('sheetCutStatus').textContent='Recording cut…';
      try {await rpc('reportMaterialCut',wsSheetCutOriginal,remainder,{reporter:el('cutReporter').value,details:el('cutReportDetails').value});el('sheetCutEditor').hidden=true;wsSheetCutOriginal=null;el('globalSearch').value='';await refreshWorkspaceData();el('adminStatus').textContent='Cut recorded. Material quantities updated.';}
      catch(error){el('sheetCutStatus').textContent=message(error);}finally{el('sheetCutFields').disabled=false;setBusy(false);}
    });
  }

  function wsRenderReports() {
    el('reportList').replaceChildren();const reports=token?wsReports:[];el('reportsEmpty').hidden=reports.length>0;
    reports.forEach(report=>{const card=wsNode('article',null,'shop-note');card.append(wsNode('h3',({material:'Material cut',mill:'Broken mill',cut:'Completed cut',plan:'Cut List change'})[report.kind]+' · '+report.label),wsNode('p',new Date(report.time).toLocaleString()+(report.reporter?' · '+report.reporter:''),'hint'));
      if(report.details)card.append(wsNode('p',report.details,'note-body'));
      if(report.undone)card.append(wsNode('span','Undone','badge'));else card.append(wsButton('Undo',()=>{if(window.confirm('Undo this report and restore its changes?'))wsSaveAction('adminUndoReport',{id:report.id,version:report.version});}));el('reportList').append(card);
    });
  }
  async function wsReportDone(item) {
    if(adminBusy||!window.confirm('Mark “'+item.title+'” as done? An admin can undo this report.'))return;setBusy(true);
    try {await rpc('reportCompletedCut',{id:item.id,version:item.version},{});await refreshWorkspaceData();el('adminStatus').textContent='Cut completion recorded.';}
    catch(error){el('adminStatus').textContent=message(error);}finally{setBusy(false);}
  }
  function wsOpenBroken(item) {
    if(adminBusy)return;wsBrokenOriginal={number:item.number,version:item.version};el('brokenMillForm').reset();el('brokenMillStatus').textContent='';el('brokenMillSubject').textContent=(item.name||'Mill')+' · '+item.number+' · '+item.quantity+' available';el('brokenMillDialog').showModal();el('brokenReporter').focus();
  }
  function wsInitReports() {
    el('cancelBrokenMill').addEventListener('click',()=>{if(!adminBusy)el('brokenMillDialog').close();});
    el('brokenMillDialog').addEventListener('cancel',event=>{if(adminBusy)event.preventDefault();});
    el('brokenMillForm').addEventListener('submit',async event=>{
      event.preventDefault();if(adminBusy||!wsBrokenOriginal)return;setBusy(true);el('brokenMillFields').disabled=true;el('brokenMillStatus').textContent='Recording broken mill…';
      try {await rpc('reportBrokenMill',wsBrokenOriginal,{reporter:el('brokenReporter').value,details:el('brokenDetails').value});el('brokenMillDialog').close();wsBrokenOriginal=null;await refreshWorkspaceData();el('adminStatus').textContent='Broken mill recorded. One removed from inventory.';}
      catch(error){el('brokenMillStatus').textContent=message(error);}finally{el('brokenMillFields').disabled=false;setBusy(false);}
    });
  }

  function wsInitVisits() {
    el('refreshVisitorStats').addEventListener('click',()=>wsRefreshVisits(false));
    wsRefreshVisits(true);
  }
  async function wsRefreshVisits(initial) {
    const request=++wsVisitRequest,db=localDatabase();
    if(db.kind!=='shared'){el('refreshVisitorStats').hidden=true;el('visitorStats').hidden=true;return;}
    el('refreshVisitorStats').hidden=false;el('refreshVisitorStats').disabled=true;el('visitorStatus').textContent='Loading visit totals…';
    try {
      const counted=await db.countVisit();const stats=initial?counted:await db.visitorStats();
      if(request!==wsVisitRequest)return;
      if(!Number.isSafeInteger(stats?.today)||!Number.isSafeInteger(stats?.total)||stats.today<0||stats.total<stats.today)throw new Error('Invalid visitor totals');
      el('visitorToday').textContent=stats.today.toLocaleString();el('visitorTotal').textContent=stats.total.toLocaleString();el('visitorStats').hidden=false;
      el('visitorStatus').textContent='Anonymous website visit totals. Offline use is not counted.';
    }catch(_){if(request===wsVisitRequest)el('visitorStatus').textContent='Visitor counts are unavailable right now. You can still use the rest of the app.';}
    finally{if(request===wsVisitRequest)el('refreshVisitorStats').disabled=false;}
  }

  async function wsPublicCutAction(name,...args) {
    if(adminBusy)return;setBusy(true);
    try {await rpc(name,...args);await refreshWorkspaceData();}
    catch(error){el('adminStatus').textContent=message(error);}finally{setBusy(false);}
  }
  function wsRenderDashboardCuts() {
    const pending=wsCuts.filter(item=>!item.completed);el('dashboardCuts').replaceChildren();el('dashboardCutCount').textContent=pending.length+' to do · '+wsCuts.filter(item=>item.completed).length+' completed · Planned cutting order';
    if(!pending.length)el('dashboardCuts').append(wsNode('p','No pending cuts. Add a cut to plan the next job.','empty-state'));
    pending.slice(0,6).forEach((item,index)=>{const row=wsNode('div',null,'dashboard-cut');row.append(wsNode('strong','#'+(index+1)+' · '+item.title),wsNode('span',wsPriorities[item.priority]||'Normal','badge priority-'+(item.priority||'normal')),wsNode('p','Quantity: '+item.quantity+(item.material?' · '+item.material:''),'hint'),wsButton('Mark done',()=>wsReportDone(item)));wsAppendDrawings(row,item);el('dashboardCuts').append(row);});
  }

  const wsDrawingTypes={pdf:'application/pdf',svg:'image/svg+xml',dxf:'application/dxf',dwg:'image/vnd.dwg',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
  function wsAppendDrawings(target,item) {
    if(!item.drawingIds?.length)return;const list=wsNode('div',null,'drawing-list');list.append(wsNode('p','Drawings ('+item.drawingIds.length+')','hint'));
    for(const id of item.drawingIds){const file=wsDrawingFiles.find(row=>row.id===id);if(!file)continue;const row=wsNode('div',null,'drawing-file');row.append(wsNode('span',file.name),wsButton('Download',()=>wsOpenDrawing(id,false)));row.lastChild.setAttribute('aria-label','Download '+file.name);
      if(['image/png','image/jpeg','image/webp'].includes(file.type)){const preview=wsButton('Preview',()=>wsOpenDrawing(id,true));preview.setAttribute('aria-label','Preview '+file.name);row.append(preview);}list.append(row);
    }target.append(list);
  }
  async function wsOpenDrawing(id,preview) {
    try {const file=await rpc('getCutDrawing',id),bytes=Uint8Array.from(atob(file.data),char=>char.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file.type}));
      if(preview&&['image/png','image/jpeg','image/webp'].includes(file.type)){
        if(wsPreviewUrl)URL.revokeObjectURL(wsPreviewUrl);wsPreviewUrl=url;el('drawingPreviewImage').src=url;el('drawingPreviewImage').alt=file.name;el('drawingPreviewTitle').textContent=file.name;el('drawingPreviewDialog').showModal();
      }else {const link=wsNode('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(error){el('adminStatus').textContent=message(error);}
  }
  function wsRenderDrawingEditor() {
    el('cutDrawingEditor').replaceChildren();
    const files=[...wsDrawingIds.map(id=>({id,...wsDrawingFiles.find(row=>row.id===id)})),...wsNewDrawingFiles.map((file,index)=>({...file,newIndex:index}))];
    files.forEach(file=>{const row=wsNode('div',null,'drawing-file');row.append(wsNode('span',(file.name||'Drawing')+' · '+Math.ceil((file.size||0)/1024)+' KB'),wsButton('Remove',()=>{if(adminBusy)return;if(file.newIndex!==undefined)wsNewDrawingFiles.splice(file.newIndex,1);else wsDrawingIds=wsDrawingIds.filter(id=>id!==file.id);wsRenderDrawingEditor();}));el('cutDrawingEditor').append(row);});
  }
  function wsInitDrawings() {
    el('closeDrawingPreview').addEventListener('click',()=>el('drawingPreviewDialog').close());
    el('drawingPreviewDialog').addEventListener('close',()=>{el('drawingPreviewImage').removeAttribute('src');if(wsPreviewUrl)URL.revokeObjectURL(wsPreviewUrl);wsPreviewUrl=null;});
    el('cutDrawingUpload').addEventListener('change',async()=>{
      if(adminBusy)return;const files=Array.from(el('cutDrawingUpload').files);if(!files.length)return;
      setBusy(true);el('cutFields').disabled=true;el('cutDrawingStatus').textContent='Reading drawings…';
      try {if(wsDrawingIds.length+wsNewDrawingFiles.length+files.length>3)throw new Error('A cut can have up to 3 drawings.');const added=[];
        for(const file of files){const type=wsDrawingTypes[file.name.split('.').pop().toLowerCase()];if(!type||file.size<1||file.size>1048576)throw new Error('Use PDF, SVG, DXF, DWG, PNG, JPG, or WebP files up to 1 MB each.');
          const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('This drawing could not be read.'));reader.readAsDataURL(file);});added.push({name:file.name,type,data,size:file.size});
        }
        const total=wsDrawingIds.reduce((sum,id)=>sum+(wsDrawingFiles.find(file=>file.id===id)?.size||0),0)+[...wsNewDrawingFiles,...added].reduce((sum,file)=>sum+file.size,0);if(total>2097152)throw new Error('Drawings for one cut must total 2 MB or less.');
        wsNewDrawingFiles.push(...added);wsRenderDrawingEditor();el('cutDrawingStatus').textContent='Drawings ready. Save the cut to attach them.';
      }catch(error){el('cutDrawingStatus').textContent=message(error);}finally{el('cutDrawingUpload').value='';el('cutFields').disabled=false;setBusy(false);}
    });
  }
