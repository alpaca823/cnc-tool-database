"""Build the supported local and GitHub Pages editions."""
from pathlib import Path
import importlib.util
import re
ROOT=Path(__file__).resolve().parent
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def build_both():
 version=(ROOT/'cnc-local/VERSION').read_text().strip()
 log=(ROOT/'CHANGELOG.md').read_text()
 headings=re.findall(r'^## (\S+)\s*$',log,re.M)
 if not headings or headings[0]!=version:raise ValueError('Add a CHANGELOG.md entry for current VERSION '+version)
 module('local_build',ROOT/'cnc-local/build.py').build_local()
 module('pages_build',ROOT/'cnc-pages/build.py').build_pages()
 for target in [ROOT/'cnc-local/CHANGELOG.md',ROOT/'cnc-pages/public/CHANGELOG.md']:target.write_text(log)
if __name__=='__main__':build_both()
