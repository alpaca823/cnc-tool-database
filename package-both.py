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
    spec = importlib.util.spec_from_file_location('cnc_build_both', ROOT / 'build-both.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    builder.build_both()
    version = (ROOT / 'cnc-local/VERSION').read_text().strip()
    local = {name: ROOT / 'cnc-local' / name for name in
             ['CNC-Tool-Database.html', 'README.md', 'TEST-RESULTS.md']}
    google = {name: ROOT / 'cnc-scripts' / name for name in
              ['Code.gs', 'Index.html', 'appsscript.json', 'README.md', 'TEST-RESULTS.md']}
    local_zip = archive(f'CNC-Tool-Database-v{version}.zip', local)
    google_zip = archive(f'CNC-Tool-Database-Google-Scripts-v{version}.zip', google)
    source = {name: ROOT / name for name in
              ['README.md', 'AGENTS.md', 'build-both.py', 'verify-both.py', 'package-both.py', 'package.json']}
    for folder in ['cnc-local', 'cnc-scripts', 'cnc-pages']:
        for file in (ROOT / folder).iterdir():
            if file.is_file() and (file.suffix in ['.html', '.css', '.js', '.gs', '.json', '.py', '.md'] or file.name == 'VERSION'):
                source[str(file.relative_to(ROOT))] = file
        for file in (ROOT / folder / 'tests').glob('*.cjs'):
            source[str(file.relative_to(ROOT))] = file
    for file in (ROOT / 'cnc-pages').rglob('*'):
        if file.is_file() and '__pycache__' not in file.parts:
            source[str(file.relative_to(ROOT))] = file
    archive(f'CNC-Tool-Database-GitHub-Pages-v{version}.zip', {str(file.relative_to(ROOT / 'cnc-pages/public')):file for file in (ROOT / 'cnc-pages/public').rglob('*') if file.is_file()})
    source_zip = archive(f'CNC-Tool-Database-Source-v{version}.zip', source)
    archive(f'CNC-Tool-Database-Both-v{version}.zip', source)
    for name in ['CNC-Tool-Database.zip', 'CNC-Tool-Database-Workspace.zip',
                 'CNC-Tool-Database-Raw-Materials.zip', 'CNC-Tool-Database-Materials.zip',
                 'CNC-Tool-Database-Inches.zip', 'CNC-Tool-Database-Login-Fixed.zip',
                 'CNC-Tool-Database-With-Images.zip', 'CNC-Tool-Database-Plunge-Mist.zip']:
        shutil.copyfile(local_zip, ROOT / name)
    shutil.copyfile(google_zip, ROOT / 'CNC-Tool-Database-Google-Scripts.zip')
    shutil.copyfile(source_zip, ROOT / 'cnc-local-source.zip')
