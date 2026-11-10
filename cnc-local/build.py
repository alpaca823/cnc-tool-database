"""Build the offline edition from the canonical shared interface and data core."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def render_shell(backend: str) -> str:
    shell = (ROOT / 'app-shell.html').read_text(encoding='utf-8')
    version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if shell.count('/* LOCAL_CORE */') != 1:
        raise ValueError('The app shell must contain exactly one backend marker.')
    if '</script' in backend.lower():
        raise ValueError('The backend must not contain an HTML script terminator.')
    built = shell.replace('/* LOCAL_CORE */', backend).replace('__CNC_VERSION__', version)
    for token, filename in [('/* WORKSPACE_CSS */', 'workspace.css'), ('/* WORKSPACE_UI */', 'workspace-ui.js')]:
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
