/* Google Apps Script transport for the shared interface. Data stays on the server. */
(() => {
  'use strict';
  function invoke(name,args,attempt=0) {
    return new Promise((resolve,reject) => {
      if (!window.google || !google.script || !google.script.run) {
        reject(new Error('Open the deployed Google Apps Script web app link. Index.html needs Google Apps Script and cannot run as a local file.'));
        return;
      }
      google.script.run.withSuccessHandler(result => {
        if (!result || typeof result.ok !== 'boolean') {reject(new Error('The server returned an invalid response. Refresh the app and try again.')); return;}
        if (!result.ok && result.retryable === true && attempt < 3) {setTimeout(() => resolve(invoke(name,args,attempt+1)),500 * (2 ** attempt));return;}
        if (!result.ok) {reject(new Error(typeof result.error === 'string' ? result.error : 'The server could not complete this request.')); return;}
        resolve(result.value);
      }).withFailureHandler(error => {
        reject(new Error(error && error.message ? error.message : 'Cannot reach Google Apps Script. Check your connection and reopen the web app.'));
      }).cncCall(name,args);
    });
  }
  let queue = Promise.resolve(), workspacePending = null;
  function enqueue(name,args) {const next = queue.then(() => invoke(name,args));queue = next.catch(() => {});return next;}
  const ready = enqueue('getDashboard',[]).then(() => undefined);
  ready.catch(() => {});
  window.cncLocal = Object.freeze({
    kind:'google',
    ready,
    async call(name,...args) {await ready; return enqueue(name,args);},
    workspaceData() {
      if (!workspacePending) workspacePending = ready.then(() => enqueue('getWorkspaceData',[])).finally(() => {workspacePending = null;});
      return workspacePending;
    },
    offlineTemplate() {
      const element = document.getElementById('cncOfflineTemplate');
      if (!element) throw new Error('The offline template is missing. Rebuild and deploy the complete Google edition.');
      return JSON.parse(element.textContent);
    }
  });
})();
