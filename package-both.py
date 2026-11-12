"""Package both verified builds with the common release number."""
from pathlib import Path
import importlib.util
import shutil
import zipfile
import argparse

ROOT = Path(__file__).resolve().parent


def archive(name, entries, immutable=True):
    target = ROOT / name
    payload = {name: file.read_bytes() for name, file in entries.items()}
    if target.exists() and immutable:
        with zipfile.ZipFile(target) as current:
            if {name: current.read(name) for name in current.namelist()} != payload:
                raise ValueError('Numbered releases are immutable; bump VERSION before replacing ' + name)
        return target
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as result:
        for name, value in sorted(payload.items()):
            result.writestr(name, value)
    with zipfile.ZipFile(target) as result:
        if result.testzip() is not None:
            raise ValueError('Invalid archive: ' + name)
    print('Packaged ' + target.name)
    return target


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--beta',action='store_true',help='Build unnumbered admin beta packages without changing public releases')
    args=parser.parse_args()
    if (ROOT/'BETA-CHANGELOG.md').exists() and not args.beta:
        parser.error('Pending admin beta: use --beta; public numbered releases must remain unchanged.')
    spec = importlib.util.spec_from_file_location('cnc_build', ROOT / 'build-both.py')
    builder = importlib.util.module_from_spec(spec);spec.loader.exec_module(builder);builder.build_both()
    version = (ROOT / 'cnc-local/VERSION').read_text().strip()
    local = {n:ROOT / 'cnc-local' / n for n in ['CNC-Tool-Database.html','README.md','TEST-RESULTS.md','CHANGELOG.md']}
    local['THIRD-PARTY-NOTICES.md']=ROOT/'cnc-local/THIRD-PARTY-NOTICES.md'
    for f in (ROOT/'cnc-local/vendor').rglob('*'):
        if f.is_file():local[str(f.relative_to(ROOT/'cnc-local'))]=f
    local['vendor/libredwg/dwg-worker.js']=ROOT/'cnc-local/dwg-worker.js'
    if args.beta:local['BETA-CHANGELOG.md']=ROOT/'BETA-CHANGELOG.md'
    local_zip = archive('CNC-Tool-Database-Beta.zip' if args.beta else f'CNC-Tool-Database-v{version}.zip',local,immutable=not args.beta)
    pages = {str(f.relative_to(ROOT/'cnc-pages/public')):f for f in (ROOT/'cnc-pages/public').rglob('*') if f.is_file()}
    archive('CNC-Tool-Database-GitHub-Pages-Beta.zip' if args.beta else f'CNC-Tool-Database-GitHub-Pages-v{version}.zip',pages,immutable=not args.beta)
    source = {n:ROOT/n for n in ['README.md','CHANGELOG.md','AGENTS.md','build-both.py','verify-both.py','package-both.py','package.json']}
    for folder in ['cnc-local','cnc-pages']:
        for f in (ROOT/folder).rglob('*'):
            if f.is_file() and not any(part in ['__pycache__','previews','archive'] for part in f.parts):source[str(f.relative_to(ROOT))]=f
    if args.beta:source['BETA-CHANGELOG.md']=ROOT/'BETA-CHANGELOG.md'
    archive('CNC-Tool-Database-Source-Beta.zip' if args.beta else f'CNC-Tool-Database-Source-v{version}.zip',source,immutable=not args.beta)
    if not args.beta:shutil.copyfile(local_zip, ROOT/'CNC-Tool-Database.zip')
