"""Package both verified builds with the common release number."""
from pathlib import Path
import importlib.util
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent


def archive(name, entries):
    target = ROOT / name
    payload = {name: file.read_bytes() for name, file in entries.items()}
    if target.exists():
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
    spec = importlib.util.spec_from_file_location('cnc_build', ROOT / 'build-both.py')
    builder = importlib.util.module_from_spec(spec);spec.loader.exec_module(builder);builder.build_both()
    version = (ROOT / 'cnc-local/VERSION').read_text().strip()
    local = {n:ROOT / 'cnc-local' / n for n in ['CNC-Tool-Database.html','README.md','TEST-RESULTS.md']}
    local_zip = archive(f'CNC-Tool-Database-v{version}.zip',local)
    pages = {str(f.relative_to(ROOT/'cnc-pages/public')):f for f in (ROOT/'cnc-pages/public').rglob('*') if f.is_file()}
    archive(f'CNC-Tool-Database-GitHub-Pages-v{version}.zip',pages)
    source = {n:ROOT/n for n in ['README.md','AGENTS.md','build-both.py','verify-both.py','package-both.py','package.json']}
    for folder in ['cnc-local','cnc-pages']:
        for f in (ROOT/folder).rglob('*'):
            if f.is_file() and not any(part in ['__pycache__','previews','archive'] for part in f.parts):source[str(f.relative_to(ROOT))]=f
    archive(f'CNC-Tool-Database-Source-v{version}.zip',source)
    shutil.copyfile(local_zip, ROOT/'CNC-Tool-Database.zip')
