"""Build both CNC Tool Database editions from the same canonical sources."""
from pathlib import Path
import importlib.util
import json

ROOT = Path(__file__).resolve().parent


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def replace_once(html, old, new):
    if html.count(old) != 1:
        raise ValueError('Google edition copy must match the shared interface exactly: ' + old[:100])
    return html.replace(old, new, 1)


def build_both():
    local = module('cnc_local_build', ROOT / 'cnc-local/build.py')
    engine = module('cnc_shared_engine', ROOT / 'cnc-scripts/build_engine.py')
    offline = local.build_local()
    scripts = ROOT / 'cnc-scripts'
    html = local.render_shell((scripts / 'google-adapter.js').read_text(encoding='utf-8'))
    copies = [
        ('<meta name="viewport"', '<base target="_top"><meta name="viewport"'),
        ('<span class="offline-pill">Offline</span>', '<span class="offline-pill">Google Sheets</span>'),
        ('<span>●</span> Saved in this browser', '<span>●</span> Shared Google database'),
        ('Your shop data, available offline.', 'Your shop data, shared across computers.'),
        ('Settings and materials save in this browser on this computer. Download an updated HTML copy to take them with you, or export a JSON backup to restore later. Imports replace current settings, libraries, tool inventory, and raw sheets.',
         'Shop data saves to your shared Google database. Export a JSON backup or download an offline HTML snapshot. Imports replace shared settings, libraries, tool inventory, and raw sheets for everyone.'),
        ('>Download updated HTML</button>', '>Download offline HTML</button>'),
        ('Replace all current cutting settings, materials, mills, and raw sheet inventory with this backup (',
         'Replace the shared cutting settings, materials, mills, and raw sheet inventory for ALL USERS with this backup ('),
        ('A copy opened in a fresh browser uses admin / admin. Additional admin passwords stay with this browser and are not included in data exports.',
         'Offline copies use admin / admin in a fresh browser. Additional passwords stay in this Google project and are not included in data exports. Offline copies do not sync with the shared database.'),
        ('The local app could not start. Save and open the complete CNC-Tool-Database.html file in Chrome, Edge, or Firefox. If you downloaded a ZIP, extract it first. The developer file app-shell.html cannot run on its own.',
         'The Google app could not start. Open the deployed Apps Script web app link. Rebuild and redeploy the complete Google edition if the problem continues.'),
    ]
    for old, new in copies:
        html = replace_once(html, old, new)
    # The local template has no credentials or shop data. Escape HTML-sensitive
    # text because it is embedded as JSON in the hosted edition's script tag.
    template = json.dumps(offline, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    html = replace_once(html, '<script id="cncEmbeddedData"', '<script id="cncOfflineTemplate" type="application/json">' + template + '</script><script id="cncEmbeddedData"')
    (scripts / 'Index.html').write_text(html, encoding='utf-8')
    core = (ROOT / 'cnc-local/local-core.js').read_text(encoding='utf-8')
    generated = engine.generate_engine(core)
    server = (scripts / 'server-template.gs').read_text(encoding='utf-8')
    version = (ROOT / 'cnc-local/VERSION').read_text(encoding='utf-8').strip()
    (scripts / 'Code.gs').write_text('// CNC Tool Database ' + version + ' — generated; edit source and run build-both.py.\n' + generated + '\n' + server.replace('__CNC_VERSION__', version), encoding='utf-8')
    print(f'Built Google Index.html ({len(html.encode()):,} bytes), Code.gs')
    helper = module('cnc_copy_helper', scripts / 'build-copy-helper.py')
    helper.build_helper(ROOT, scripts, version)
    pages = module('cnc_pages_build', ROOT / 'cnc-pages/build.py')
    pages.build_pages()


if __name__ == '__main__':
    build_both()
