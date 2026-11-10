"""Build a local page with three copy buttons for the generated Google files."""
from pathlib import Path
import json


def build_helper(root: Path, scripts: Path, version: str):
    files = {name: (scripts / name).read_text(encoding='utf-8')
             for name in ['Code.gs', 'Index.html', 'appsscript.json']}
    payload = json.dumps(files, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    html = '''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CNC · Copy to Apps Script</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#172236;font:16px/1.6 system-ui,sans-serif}main{max-width:820px;margin:40px auto;padding:0 20px}h1{font-size:28px;line-height:1.2}h2{margin:0;font-size:20px}.muted{color:#59677b}.cards{display:grid;gap:16px;margin:24px 0}.card{background:white;border:1px solid #d8e0ec;border-radius:12px;padding:22px}.card p{margin:8px 0 16px}.copy{min-height:44px;border:0;border-radius:7px;background:#0867f9;color:white;padding:10px 20px;font:600 16px system-ui;cursor:pointer}button:focus-visible,summary:focus-visible{outline:3px solid #85b5ff;outline-offset:3px}.status{min-height:26px;margin-top:10px;color:#17653b}.manual{display:grid;gap:10px}.manual[hidden]{display:none}textarea{width:100%;height:180px;font:12px/1.4 monospace;border:1px solid #b9c6d8;border-radius:5px;padding:10px}footer{font-size:14px;margin:25px 0}.step{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#edf4ff;color:#075acb;margin-right:8px;font-size:15px}summary{cursor:pointer;color:#075acb;margin-top:14px}
</style></head><body><main><h1>Copy to Google Apps Script</h1><p class="muted">CNC Tool Database · Version __VERSION__</p><p>Click a button, switch to the matching file in Apps Script, select all its existing contents, and paste. Replace the whole file.</p>
<div class="cards">
<section class="card" data-file="Code.gs"><h2><span class="step">1</span>Code.gs</h2><p>Select <strong>Code.gs</strong> under Files in Apps Script.</p><button class="copy" type="button">Copy Code.gs</button><div class="status" role="status" aria-live="polite"></div><details><summary>View code / copy manually</summary><div class="manual"><textarea readonly aria-label="Code.gs contents" spellcheck="false"></textarea></div></details></section>
<section class="card" data-file="Index.html"><h2><span class="step">2</span>Index.html</h2><p>Choose <strong>Files → + → HTML</strong>, name it <strong>Index</strong>, then paste. If Index already exists, replace its contents.</p><button class="copy" type="button">Copy Index.html</button><div class="status" role="status" aria-live="polite"></div><details><summary>View code / copy manually</summary><div class="manual"><textarea readonly aria-label="Index.html contents" spellcheck="false"></textarea></div></details></section>
<section class="card" data-file="appsscript.json"><h2><span class="step">3</span>appsscript.json</h2><p>In <strong>Project Settings ⚙️</strong>, enable <strong>Show appsscript.json manifest file in editor</strong>. Return to Editor and select that file.</p><button class="copy" type="button">Copy appsscript.json</button><div class="status" role="status" aria-live="polite"></div><details><summary>View code / copy manually</summary><div class="manual"><textarea readonly aria-label="appsscript.json contents" spellcheck="false"></textarea></div></details></section>
</div><footer><strong>After all three:</strong> Save → Run <strong>setupDatabase</strong> → Deploy → Manage deployments → Edit → New version → Deploy. Use <strong>Execute as: Me</strong>. App editing login: <strong>admin / admin</strong>.</footer><p class="muted">Open this helper in Chrome or Edge. It works offline and contains the complete Google app files. Your saved shop data and passwords are not included. Pasting into the same project preserves its existing database configuration.</p>
<script id="files" type="application/json">__PAYLOAD__</script>
<script>
const files=JSON.parse(document.getElementById('files').textContent);
document.querySelectorAll('.card').forEach(card=>{
 const name=card.dataset.file,button=card.querySelector('button'),text=card.querySelector('textarea'),status=card.querySelector('.status');
 text.value=files[name];
 function selectText(){card.querySelector('details').open=true;text.focus();text.select();text.setSelectionRange(0,text.value.length);}
 text.addEventListener('click',()=>{text.select();text.setSelectionRange(0,text.value.length);});
 button.addEventListener('click',async()=>{
  let copied=false;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(files[name]);copied=true;}}catch(_){}
  if(!copied){selectText();try{copied=document.execCommand('copy');}catch(_){} }
  if(copied){status.textContent='Copied '+name+'. Paste it into the matching Apps Script file.';button.textContent='Copy '+name+' again';}
  else{selectText();status.textContent='The code is selected below. Press Ctrl+C (Windows) or Cmd+C (Mac), then paste into Apps Script.';}
 });
});
</script></main></body></html>'''.replace('__VERSION__', version).replace('__PAYLOAD__', payload)
    output = root / ('CNC-Scripts-Copy-Helper-v' + version + '.html')
    output.write_text(html, encoding='utf-8')
    print('Built ' + output.name)
    return output


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    build_helper(root, root / 'cnc-scripts', (root / 'cnc-local/VERSION').read_text().strip())
