"""Build the supported local and GitHub Pages editions."""
from pathlib import Path
import importlib.util
ROOT=Path(__file__).resolve().parent
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def build_both():
 module('local_build',ROOT/'cnc-local/build.py').build_local()
 module('pages_build',ROOT/'cnc-pages/build.py').build_pages()
if __name__=='__main__':build_both()
