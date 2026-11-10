"""Generate the synchronous Apps Script data API from the canonical local core.

No database rules are duplicated here. The canonical core uses a deliberately
stable two-space function/four-space API-method layout. Extraction preserves the
complete source text of those declarations and fails closed if that layout or
the API inventory changes. Browser storage, initialization and credentials are
provided by each target separately.
"""
from __future__ import annotations

import re

DATA_FUNCTIONS = (
    'validateImage', 'validateSetting', 'validateSettings', 'validateMaterials',
    'materialLibrary', 'optionalInteger', 'validateRawMaterial',
    'validateRawMaterials', 'validateMills', 'millLibrary', 'originalIndex',
    'commit', 'plainSettings', 'plainMaterials', 'plainMills',
    'plainRawMaterials', 'stockStatus', 'displayedMills', 'displayedMaterials',
    'displayedRawMaterials', 'displayedSetting', 'originalMaterialIndex',
    'originalMillIndex', 'originalRawMaterialIndex', 'portable',
)
DATA_ACTIONS = (
    'getMills', 'getMaterials', 'getRawMaterials', 'getDashboard', 'getOptions',
    'getSettings', 'adminListSettings', 'adminListMaterials',
    'adminSaveRawMaterial', 'adminDeleteRawMaterial', 'adminSaveMill',
    'adminDeleteMill', 'adminSetInventory', 'adminSaveMaterial',
    'adminDeleteMaterial', 'adminSaveSetting', 'adminDeleteSetting',
    'adminExportBackup', 'adminPortableData', 'adminImportBackup',
)
AUTH_ACTIONS = (
    'adminLogin', 'adminLogout', 'adminListPasswords', 'adminAddPassword',
    'adminUpdatePassword', 'adminDeletePassword', 'adminChangePassword',
)


def _function(core: str, name: str) -> str:
    """Read an entire canonical declaration, using its exact layout boundary.

    This avoids interpreting braces in JS regular expressions, comments or
    strings as source boundaries. A multiline top-level declaration must close
    at its opening indentation; nested declarations are indented more deeply.
    """
    pattern = re.compile(r'^  function ' + re.escape(name) + r'\([^\n]*', re.M)
    matches = list(pattern.finditer(core))
    if len(matches) != 1:
        raise ValueError('Expected one canonical data function: ' + name)
    start = matches[0].start()
    opening = matches[0].group(0)
    if opening.rstrip().endswith('}'):
        return opening
    if not opening.rstrip().endswith('{'):
        raise ValueError('Unsupported function layout: ' + name)
    closing = re.search(r'^  }\s*$', core[matches[0].end():], re.M)
    if closing is None:
        raise ValueError('Missing canonical function terminator: ' + name)
    text = core[start:matches[0].end() + closing.end()].rstrip()
    if re.search(r'^  (?:async )?function ', text[len(opening):], re.M):
        raise ValueError('Unclosed canonical function: ' + name)
    return text


def _actions(core: str) -> dict[str, str]:
    starts = list(re.finditer(r'^  const api = \{\s*$', core, re.M))
    if len(starts) != 1:
        raise ValueError('Expected one canonical API object.')
    start = starts[0].end()
    ending = re.search(r'^  };\s*$', core[start:], re.M)
    if ending is None:
        raise ValueError('Missing canonical API terminator.')
    body = core[start:start + ending.start()].strip('\n')
    headers = list(re.finditer(r'^    (?:async )?(\w+)\([^\n]*', body, re.M))
    if not headers or body[:headers[0].start()].strip():
        raise ValueError('Unsupported canonical API layout.')
    actions = {}
    for index, header in enumerate(headers):
        name = header.group(1)
        if name in actions:
            raise ValueError('Duplicate canonical action: ' + name)
        stop = headers[index + 1].start() if index + 1 < len(headers) else len(body)
        text = body[header.start():stop].rstrip().removesuffix(',')
        if not text.endswith('}'):
            raise ValueError('Unsupported canonical API method layout: ' + name)
        if '\n' in text and not text.endswith('\n    }'):
            raise ValueError('Missing canonical API method boundary: ' + name)
        actions[name] = text
    expected = set(DATA_ACTIONS) | set(AUTH_ACTIONS)
    if set(actions) != expected:
        raise ValueError('Canonical API inventory changed. Choose the data/auth target for each action. '
                         + 'Unknown: ' + repr(sorted(set(actions) - expected))
                         + '; missing: ' + repr(sorted(expected - set(actions))))
    return actions


def _canonical_line(core: str, name: str) -> str:
    matches = re.findall(r'^  const ' + re.escape(name) + r' = [^\n]+;', core, re.M)
    if len(matches) != 1:
        raise ValueError('Expected one canonical helper constant: ' + name)
    return matches[0]


def generate_engine(core_text: str) -> str:
    actions = _actions(core_text)
    selected = [actions[name] for name in DATA_ACTIONS]
    copied = '\n\n'.join(_function(core_text, name) for name in DATA_FUNCTIONS)
    methods = ',\n'.join(selected)
    helpers = '\n'.join(_canonical_line(core_text, name) for name in ('MAX_SETTINGS', 'keyOf', 'sameKey'))
    output = '''// GENERATED from cnc-local/local-core.js by build_engine.py. Do not edit.
// Browser and Apps Script use the same validation, reference and stale-write rules.
function createCncDataApi_(host) {
  'use strict';
  const uid = () => host.uid();
  const readState = () => host.readState();
  const storageWrite = state => host.storageWrite(state);
  const requireAdmin = (token,state) => host.requireAdmin(token,state);
''' + helpers + '\n\n' + copied + '\n\n  const api = {\n' + methods + '''
  };
  function validateData(state) {
    if (!state || state.format !== 'cnc-local-database' || state.schemaVersion !== 1 ||
        !Number.isSafeInteger(state.revision) || state.revision < 0)
      throw new Error('Unsupported saved database format.');
    const settings = validateSettings(state.settings,true);
    const rawMaterials = state.rawMaterials === undefined ? [] : validateRawMaterials(state.rawMaterials,true);
    return {...state,settings,rawMaterials,
      materials:materialLibrary(settings,state.materials,true,rawMaterials),
      mills:millLibrary(settings,state.mills,true)};
  }
  return Object.freeze({...api,actions:Object.freeze(Object.keys(api)),normalizeBackup:portable,validateData});
}
'''
    forbidden = r'\b(?:window|localStorage|navigator|async|await|Promise)\b'
    if re.search(forbidden, output):
        raise ValueError('The generated synchronous engine contains a browser or asynchronous dependency.')
    return output
