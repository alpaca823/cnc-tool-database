"""Build the offline edition from the canonical shared interface and data core."""
from pathlib import Path
import json
import base64
import hashlib
import gzip
import re
from html import escape

ROOT = Path(__file__).resolve().parent


def render_shell(backend: str) -> str:
    shell = (ROOT / 'app-shell.html').read_text(encoding='utf-8')
    version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if shell.count('/* LOCAL_CORE */') != 1:
        raise ValueError('The app shell must contain exactly one backend marker.')
    if '</script' in backend.lower():
        raise ValueError('The backend must not contain an HTML script terminator.')
    built = shell.replace('/* LOCAL_CORE */', backend).replace('/* STOCK_GEOMETRY */',(ROOT / 'stock-geometry.js').read_text()).replace('__CNC_VERSION__', version)
    vendor = ROOT / 'vendor/libredwg'
    wasm = (vendor / 'libredwg-web.wasm.gz').read_bytes()
    if hashlib.sha256(gzip.decompress(wasm)).hexdigest() != '8f8dbfe1ba3a0ae9ceb8856ed2090c0f44decd9d7febde68016df8c1fca50f9b':
        raise ValueError('Unexpected DWG decoder binary.')
    glue = (vendor / 'libredwg-web.js').read_text().replace('import.meta.url', "'cnc-dwg-worker'").replace('export default createModule;', '')
    worker = glue + '\n' + (ROOT / 'dwg-worker.js').read_text()
    runtime = 'window.cncDwgRuntime=' + json.dumps({'code':worker,'wasmGzip':base64.b64encode(wasm).decode()}).replace('<','\\u003c') + ';'
    built = built.replace('/* DWG_RUNTIME */',runtime)
    highlights = json.loads((ROOT / 'whats-new.json').read_text(encoding='utf-8'))
    if not isinstance(highlights,list) or not highlights or highlights[0].get('version') != version:
        raise ValueError('Add short What’s new highlights for VERSION ' + version)
    versions = set()
    changelog = (ROOT.parent / 'CHANGELOG.md').read_text(encoding='utf-8')
    entries = []
    for entry in highlights:
        number, notes = entry.get('version'), entry.get('notes')
        if not isinstance(number,str) or not re.fullmatch(r'\d+\.\d+\.\d+',number) or number in versions or ('## ' + number + '\n') not in changelog:
            raise ValueError('What’s new versions must be unique and recorded in CHANGELOG.md.')
        if not isinstance(notes,list) or not 1 <= len(notes) <= 3 or any(not isinstance(note,str) or not note.strip() or len(note) > 100 for note in notes):
            raise ValueError('What’s new needs 1–3 short bullets of at most 100 characters per release.')
        versions.add(number)
        badge = '<span class="badge in">Latest</span>' if number == version else ''
        entries.append('<article class="release-note"><div class="release-heading"><h3>v' + escape(number) + '</h3>' + badge + '</div><ul>' + ''.join('<li>' + escape(note) + '</li>' for note in notes) + '</ul></article>')
    content = '<div id="recentReleases" class="release-list">' + ''.join(entries[:3]) + '</div>'
    if len(entries) > 3:
        content += '<details id="olderReleaseNotes"><summary>Older updates</summary><div class="release-list">' + ''.join(entries[3:]) + '</div></details>'
    if built.count('<!-- WHATS_NEW -->') != 1:
        raise ValueError('Missing What’s new build marker.')
    built = built.replace('<!-- WHATS_NEW -->',content)
    for token, filename in [('/* WORKSPACE_CSS */', 'workspace.css'), ('/* WORKSPACE_UI */', 'workspace-ui.js'), ('/* STOCK_BETA */', 'stock-beta.js'), ('/* STOCK_PREVIEW */', 'stock-preview.js'), ('/* DRAWING_OUTLINES */', 'drawing-outlines.js'), ('/* DWG_READER */', 'dwg-reader.js'), ('/* SOLITAIRE_UI */', 'solitaire.js'), ('/* ARCADE_UI */', 'arcade.js')]:
        if built.count(token) != 1:
            raise ValueError('Missing or repeated workspace build marker: ' + token)
        built = built.replace(token, (ROOT / filename).read_text(encoding='utf-8'))
    return built


def build_local() -> str:
    built = render_shell((ROOT / 'local-core.js').read_text(encoding='utf-8'))
    if 'window.cncLocal = Object.freeze({' not in built:
        raise ValueError('The local database backend must be embedded.')
    output = ROOT / 'CNC-Tool-Database.html'
    output.write_text(built, encoding='utf-8')
    print(f'Built local {output.name} ({output.stat().st_size:,} bytes)')
    return built


if __name__ == '__main__':
    build_local()
