"""Build the GitHub Pages edition and its shared database engine."""
from pathlib import Path
import importlib.util,json
ROOT=Path(__file__).resolve().parent.parent

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def build_pages():
 local=load('cnc_pages_local',ROOT/'cnc-local/build.py')
 offline=(ROOT/'cnc-local/CNC-Tool-Database.html').read_text()
 html=local.render_shell((ROOT/'cnc-pages/pages-adapter.js').read_text())
 replacements={
 '<meta name="viewport"':'<base target="_top"><meta name="viewport"',
 '<span class="offline-pill">Offline</span>':'<span class="offline-pill">Shared inventory</span>',
 '<span>●</span> Saved in this browser':'<span>●</span> Shared database',
 'Your shop data, available offline.':'Your shared shop tools and materials.',
 'Settings and materials save in this browser on this computer. Download an updated HTML copy to take them with you, or export a JSON backup to restore later. Imports replace current settings, libraries, tool inventory, and raw sheets.':'Shop data saves to the shared database. Export JSON or download an offline snapshot. Imports replace inventory, libraries, and cutting settings for everyone.',
 'A copy opened in a fresh browser uses admin / admin. Additional admin passwords stay with this browser and are not included in data exports.':'Offline copies use admin / admin in a fresh browser. Shared passwords stay in the database and are not included in exports. Offline copies do not sync automatically.',
 '>Download updated HTML</button>':'>Download offline HTML</button>',
 'Replace all current cutting settings, materials, mills, and raw sheet inventory with this backup (':'Replace the shared cutting settings, materials, mills, and raw sheet inventory for ALL USERS with this backup (',
 }
 for old,new in replacements.items():
  if html.count(old)!=1:raise ValueError('Shared UI copy changed: '+old[:70])
  html=html.replace(old,new,1)
 payload=json.dumps(offline).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
 html=html.replace('<script id="cncEmbeddedData"','<script id="cncOfflineTemplate" type="application/json">'+payload+'</script><script id="cncEmbeddedData"',1)
 html=html.replace('/* GitHub Pages transport.', '/* GitHub Pages transport.',1)
 html=html.replace('<script>\n/* GitHub Pages transport.', '<script src="config.js"></script><script>\n/* GitHub Pages transport.',1)
 public=ROOT/'cnc-pages/public';public.mkdir(exist_ok=True)
 (public/'index.html').write_text(html)
 (public/'.nojekyll').write_text('')
 preview=offline.replace('<span class="offline-pill">Offline</span>','<span class="offline-pill">Prototype preview</span>')
 preview=preview.replace('<aside id="mentorNotice"','<aside class="mentor-notice" role="note"><strong>Prototype preview</strong><p>Changes save only in this browser. The shared database is not connected yet. Export JSON if you want to keep your preview data.</p></aside><aside id="mentorNotice"',1)
 (public/'preview.html').write_text(preview)
 if not (public/'config.js').exists():(public/'config.js').write_text('window.CNC_CONFIG = { supabaseUrl: "", publicKey: "" };\n')
 core=(ROOT/'cnc-local/local-core.js').read_text()
 if core.count('const sessions = new Map();')!=1:raise ValueError('Canonical session adapter changed')
 core=core.replace('const sessions = new Map();','const sessions = host.sessions;')
 engine='// GENERATED from cnc-local/local-core.js. Do not edit.\nexport function createDatabase(host) {\n const window={crypto:host.crypto};\n const localStorage={getItem:()=>host.read(),setItem:(_,value)=>host.write(value)};\n const navigator={};\n const document={getElementById:()=>null};\n'+core+'\nreturn window.cncLocal;\n}\n'
 (ROOT/'cnc-pages/supabase/functions/cnc-api/engine.mjs').write_text(engine)
 print('Built GitHub Pages frontend and shared canonical backend')

if __name__=='__main__':build_pages()
