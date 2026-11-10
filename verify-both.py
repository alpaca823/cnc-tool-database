"""Build and verify both editions. Requires Node, Playwright, and Chromium."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def check(command):
    env = dict(os.environ, CNC_TEST_LOOPBACK='1')
    result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    label = ' '.join(command)
    return label, result.returncode, result.stdout


if __name__ == '__main__':
    subprocess.run([sys.executable, str(ROOT / 'build-both.py')], check=True)
    commands = [
        ['node', 'cnc-local/tests/inches.test.cjs'],
        ['node', '--test', 'cnc-local/tests/passwords.stress.cjs'],
        ['node', '--test', 'cnc-pages/tests/backend.test.cjs'],
    ]
    commands += [['node', str(file.relative_to(ROOT))]
                 for folder in ['cnc-local/tests', 'cnc-pages/tests']
                 for file in sorted((ROOT / folder).glob('*.browser.cjs'))]
    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for label, status, output in pool.map(check, commands):
            print(('PASS ' if status == 0 else 'FAIL ') + label, flush=True)
            if status:
                failures.append(label)
                print(output, flush=True)
    print(f'{len(commands) - len(failures)}/{len(commands)} test commands passed.')
    sys.exit(1 if failures else 0)
