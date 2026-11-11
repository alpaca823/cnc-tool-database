const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto, randomBytes} = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'local-core.js'), 'utf8');
const KEY = 'cnc-tool-database-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7l8AAAAASUVORK5CYII=';
const PASSWORD_A = 'mentor-alpha';
const PASSWORD_B = 'mentor-bravo';

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

function app(saved, options = {}) {
  const store = options.store || new Map(saved == null ? [] : [[KEY, typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  let failWrites = false;
  let nextHash = null;
  const crypto = {
    getRandomValues: array => webcrypto.getRandomValues(array),
    subtle: {
      importKey: (...args) => webcrypto.subtle.importKey(...args),
      deriveBits: async (...args) => {
        const hold = nextHash;
        nextHash = null;
        const result = await webcrypto.subtle.deriveBits(...args);
        if (hold) {hold.reached.resolve(); await hold.release.promise;}
        return result;
      }
    }
  };
  const window = {crypto};
  const context = {
    window, navigator: options.navigator || {}, TextEncoder, Uint8Array,
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrites) throw new Error('QuotaExceededError');
        store.set(key, String(value));
      }
    },
    document: {getElementById: () => null}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    api: window.cncLocal, store,
    read: () => JSON.parse(store.get(KEY)),
    failWrites: value => {failWrites = value;},
    holdNextHash() {
      const hold = {reached: deferred(), release: deferred()};
      nextHash = hold;
      return {reached: hold.reached.promise, release: hold.release.resolve};
    }
  };
}

async function credential(password, id, label) {
  const salt = randomBytes(24).toString('hex');
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = Buffer.from(await webcrypto.subtle.deriveBits({name: 'PBKDF2', salt: Buffer.from(salt, 'hex'), iterations: 210000, hash: 'SHA-256'}, key, 256)).toString('hex');
  return {id, label, salt, hash, version: randomBytes(24).toString('hex'), iterations: 210000};
}

let base, customA, customB;
test.before(async () => {
  const initial = app();
  await initial.api.ready;
  base = initial.read();
  base.materials = [{name: 'Aluminum', version: 'material-unchanged', materialImage: PNG}];
  base.mills = [{number: '001', name: '', type: '', coating: '', location: '', notes: '', version: 'mill-unchanged'}];
  base.settings = [{mill: '001', material: 'Aluminum', rpm: '12000', feed: '10.25', depth: '.125', plungeRate: '2.5', coolantMist: true, units: 'inch', notes: 'Mentor approved setup', toolImage: PNG, version: 'setting-unchanged'}];
  customA = await credential(PASSWORD_A, 'credential-alpha', 'Mentor Alpha');
  customB = await credential(PASSWORD_B, 'credential-bravo', 'Mentor Bravo');
});

function seeded(...passwords) {
  const saved = clone(base);
  saved.auth.passwords = clone(passwords);
  return saved;
}

async function login(instance, password = 'Feds201') {
  await instance.api.ready;
  return (await instance.api.call('adminLogin', 'admin', password)).token;
}

test('unknown actions, forged tokens, and prototype-like IDs cannot reach privileged operations', async () => {
  const instance = app(seeded(customA));
  const token = await login(instance);
  const before = instance.store.get(KEY);
  for (const action of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'missing']) {
    await assert.rejects(instance.api.call(action, token), /Unknown local database action/);
  }
  for (const forged of [undefined, null, '', 'constructor', '__proto__', token + 'x', {}, [], 123]) {
    await assert.rejects(instance.api.call('adminListPasswords', forged), /AUTH_REQUIRED/);
    await assert.rejects(instance.api.call('adminDeletePassword', forged, customA.id), /AUTH_REQUIRED/);
  }
  for (const id of [undefined, null, '', 'constructor', '__proto__', 'missing', {}, []]) {
    await assert.rejects(instance.api.call('adminDeletePassword', token, id), /no longer exists/);
    await assert.rejects(instance.api.call('adminUpdatePassword', token, id, 'Renamed', ''), /no longer exists/);
  }
  assert.equal(instance.store.get(KEY), before);
});

test('fallback is immutable through every password mutation and survives removing all customs', async () => {
  const instance = app(seeded(customA));
  const token = await login(instance);
  const before = instance.store.get(KEY);
  await assert.rejects(instance.api.call('adminDeletePassword', token, 'default-admin'), /cannot be changed or removed/);
  await assert.rejects(instance.api.call('adminUpdatePassword', token, 'default-admin', 'Changed', 'new-password'), /cannot be changed or removed/);
  await assert.rejects(instance.api.call('adminChangePassword', token, 'admin', 'new-password'), /cannot be changed or removed/);
  assert.equal(instance.store.get(KEY), before);
  await instance.api.call('adminDeletePassword', token, customA.id);
  assert.deepEqual(clone(await instance.api.call('adminListPasswords', token)), [{id: 'default-admin', label: 'Default fallback', isDefault: true}]);
  await login(app(instance.read()));
  await assert.rejects(instance.api.call('adminLogin', 'admin', PASSWORD_A), /Incorrect/);
});

test('labels reject invalid, overlong, reserved and case-insensitive duplicates without writing', async () => {
  const instance = app(seeded(customA, customB));
  const token = await login(instance);
  const before = instance.store.get(KEY);
  for (const label of [undefined, null, 42, {}, [], '', '  ', 'x'.repeat(81), ' MENTOR ALPHA ', 'DEFAULT FALLBACK']) {
    await assert.rejects(instance.api.call('adminAddPassword', token, label, 'valid-password'), /label/);
  }
  await assert.rejects(instance.api.call('adminUpdatePassword', token, customB.id, ' mentor alpha ', ''), /label/);
  assert.equal(instance.store.get(KEY), before);
});

test('password type and length boundaries reject before mutation, including reserved fallback', async () => {
  const instance = app(seeded(customA));
  const token = await login(instance);
  const before = instance.store.get(KEY);
  for (const password of [undefined, null, false, 12345678, {}, [], '', '1234567', 'x'.repeat(129), 'admin']) {
    await assert.rejects(instance.api.call('adminAddPassword', token, 'Unique label', password), /password/i);
  }
  for (const password of [false, 12345678, {}, [], '1234567', 'x'.repeat(129), 'admin']) {
    await assert.rejects(instance.api.call('adminUpdatePassword', token, customA.id, 'Mentor Alpha', password), /password/i);
  }
  assert.equal(instance.store.get(KEY), before);
});

test('8 and 128 character passwords and 80 character trimmed labels round-trip exactly', async () => {
  const instance = app(seeded());
  const token = await login(instance);
  const short = 'a1b2c3d4', long = 'z'.repeat(128), label = 'L'.repeat(80);
  await instance.api.call('adminAddPassword', token, ' Short password ', short);
  await instance.api.call('adminAddPassword', token, ' ' + label + ' ', long);
  const rows = await instance.api.call('adminListPasswords', token);
  assert.equal(rows[1].label, 'Short password');
  assert.equal(rows[2].label, label);
  assert.ok(await login(instance, short));
  assert.ok(await login(instance, long));
  const saved = instance.store.get(KEY);
  assert.ok(!saved.includes(short));
  assert.ok(!saved.includes(long));
  assert.ok(instance.read().auth.passwords.every(row => /^[a-f0-9]{64}$/.test(row.hash) && !('password' in row)));
  assert.deepEqual(rows.map(row => Object.keys(row).sort()), rows.map(() => ['id', 'isDefault', 'label']));
});

test('duplicate password values cannot be added or assigned to a different credential', async () => {
  const instance = app(seeded(customA, customB));
  const token = await login(instance);
  const before = instance.store.get(KEY);
  await assert.rejects(instance.api.call('adminAddPassword', token, 'Other label', PASSWORD_A), /already exists/);
  await assert.rejects(instance.api.call('adminUpdatePassword', token, customB.id, 'Mentor Bravo', PASSWORD_A), /already exists/);
  assert.equal(instance.store.get(KEY), before);
  await instance.api.call('adminUpdatePassword', token, customA.id, 'Same password preserved', PASSWORD_A);
  await login(instance, PASSWORD_A);
});

test('queued concurrent additions prevent duplicate labels and duplicate passwords', async () => {
  const instance = app(seeded());
  const token = await login(instance);
  const labelResults = await Promise.allSettled([
    instance.api.call('adminAddPassword', token, 'Concurrent', PASSWORD_A),
    instance.api.call('adminAddPassword', token, ' concurrent ', PASSWORD_B)
  ]);
  assert.equal(labelResults.filter(row => row.status === 'fulfilled').length, 1);
  assert.match(labelResults.find(row => row.status === 'rejected').reason.message, /label/);
  const passwordResults = await Promise.allSettled([
    instance.api.call('adminAddPassword', token, 'Other one', PASSWORD_B),
    instance.api.call('adminAddPassword', token, 'Other two', PASSWORD_B)
  ]);
  assert.equal(passwordResults.filter(row => row.status === 'fulfilled').length, 1);
  assert.match(passwordResults.find(row => row.status === 'rejected').reason.message, /already exists/);
  assert.equal(instance.read().auth.passwords.length, 2);
});

test('the 20 credential cap rejects an additional password before changing storage', async () => {
  const records = Array.from({length: 20}, (_, i) => ({...customA, id: 'record-' + i, label: 'Mentor ' + i}));
  const instance = app(seeded(...records));
  const token = await login(instance);
  const before = instance.store.get(KEY);
  await assert.rejects(instance.api.call('adminAddPassword', token, 'Mentor 21', 'another-password'), /at most 20/);
  assert.equal(instance.store.get(KEY), before);
});

test('renaming a credential revokes its sessions while unrelated custom and fallback sessions stay valid', async () => {
  const instance = app(seeded(customA, customB));
  const fallback = await login(instance), alpha = await login(instance, PASSWORD_A), bravo = await login(instance, PASSWORD_B);
  await instance.api.call('adminUpdatePassword', fallback, customA.id, 'Renamed mentor', '');
  await assert.rejects(instance.api.call('adminListPasswords', alpha), /AUTH_REQUIRED/);
  await instance.api.call('adminListPasswords', bravo);
  await instance.api.call('adminListPasswords', fallback);
  await login(instance, PASSWORD_A);
  assert.equal(instance.read().auth.passwords[0].hash, customA.hash);
});

test('password replacement revokes only that credential; deletion also invalidates cross-tab sessions', async () => {
  const first = app(seeded(customA, customB));
  const fallback = await login(first), alpha = await login(first, PASSWORD_A), bravo = await login(first, PASSWORD_B);
  const second = app(null, {store: first.store});
  const secondAlpha = await login(second, PASSWORD_A);
  await first.api.call('adminUpdatePassword', fallback, customA.id, 'Mentor Alpha', 'mentor-replacement');
  for (const [instance, token] of [[first, alpha], [second, secondAlpha]]) {
    await assert.rejects(instance.api.call('adminListPasswords', token), /AUTH_REQUIRED/);
  }
  await assert.rejects(first.api.call('adminLogin', 'admin', PASSWORD_A), /Incorrect/);
  const replaced = await login(first, 'mentor-replacement');
  await first.api.call('adminDeletePassword', fallback, customA.id);
  await assert.rejects(first.api.call('adminListPasswords', replaced), /AUTH_REQUIRED/);
  await first.api.call('adminListPasswords', fallback);
  await first.api.call('adminListPasswords', bravo);
});

test('storage quota failures are atomic and do not revoke current credential sessions', async () => {
  const instance = app(seeded(customA, customB));
  const fallback = await login(instance), alpha = await login(instance, PASSWORD_A);
  const before = instance.store.get(KEY);
  instance.failWrites(true);
  for (const [action, ...args] of [
    ['adminAddPassword', 'Another mentor', 'another-mentor'],
    ['adminUpdatePassword', customA.id, 'Renamed', ''],
    ['adminUpdatePassword', customA.id, 'Renamed', 'replacement-value'],
    ['adminDeletePassword', customA.id]
  ]) {
    await assert.rejects(instance.api.call(action, fallback, ...args), /could not be saved/);
    assert.equal(instance.store.get(KEY), before);
    await instance.api.call('adminListPasswords', alpha);
  }
  instance.failWrites(false);
  await instance.api.call('adminUpdatePassword', fallback, customA.id, 'Save after failure', '');
  assert.equal(instance.read().auth.passwords[0].label, 'Save after failure');
});

test('legacy customized single password migrates once, and an explicit empty list never resurrects it', async () => {
  const legacy = seeded();
  legacy.auth = {salt: customA.salt, hash: customA.hash, version: 'old-custom-version', iterations: 210000};
  const originalData = clone({settings: legacy.settings, materials: legacy.materials});
  const instance = app(legacy);
  const fallback = await login(instance);
  await login(instance, PASSWORD_A);
  const list = await instance.api.call('adminListPasswords', fallback);
  assert.equal(list[1].label, 'Existing admin password');
  assert.deepEqual({settings: instance.read().settings, materials: instance.read().materials}, originalData);
  const migrated = instance.store.get(KEY);
  const reloaded = app(migrated);
  await reloaded.api.ready;
  assert.equal(reloaded.store.get(KEY), migrated);
  await instance.api.call('adminDeletePassword', fallback, list[1].id);
  const removed = app(instance.read());
  await login(removed);
  await assert.rejects(removed.api.call('adminLogin', 'admin', PASSWORD_A), /Incorrect/);
  assert.equal(removed.read().auth.passwords.length, 0);
});

test('legacy default login migrates without adding an unnecessary custom credential', async () => {
  const old = seeded();
  delete old.auth.passwords;
  const instance = app(old);
  await login(instance);
  assert.deepEqual(instance.read().auth.passwords, []);
  assert.equal(instance.read().revision, old.revision + 1);
});

test('malformed auth records and migrations never overwrite the original bytes', async () => {
  const cases = [];
  for (const auth of [null, [], {}, {...base.auth, hash: 'x'}, {...base.auth, iterations: 1}]) {
    cases.push({...seeded(), auth});
  }
  for (const passwords of [null, {}, [null], [customA, {...customB, id: customA.id}], [customA, {...customB, label: 'mentor alpha'}], [{...customA, id: 'default-admin'}], [{...customA, label: 'Default fallback'}], [{...customA, label: ' padded '}], [{...customA, label: ''}], [{...customA, iterations: 1}], [{...customA, hash: 'bad'}]]) {
    const saved = seeded(); saved.auth.passwords = passwords; cases.push(saved);
  }
  const malformedLegacy = seeded(); delete malformedLegacy.auth.passwords; malformedLegacy.settings[0].plungeRate = 'bad'; cases.push(malformedLegacy);
  for (const value of ['{bad-json', ...cases]) {
    const instance = app(value);
    const before = instance.store.get(KEY);
    await assert.rejects(instance.api.ready, /cannot be read/);
    assert.equal(instance.store.get(KEY), before);
  }
  const legacy = seeded(); delete legacy.auth.passwords;
  const blocked = app(legacy); blocked.failWrites(true);
  await assert.rejects(blocked.api.ready, /could not be saved/);
  assert.equal(blocked.store.get(KEY), JSON.stringify(legacy));
});

test('backup and portable exports exclude credentials and importing hostile auth fields preserves local logins', async () => {
  const instance = app(seeded(customA, customB));
  const token = await login(instance);
  const beforeAuth = clone(instance.read().auth);
  for (const action of ['adminExportBackup', 'adminPortableData']) {
    const data = await instance.api.call(action, token);
    const text = JSON.stringify(data);
    for (const value of [customA.salt, customA.hash, customB.salt, customB.hash, PASSWORD_A, PASSWORD_B, customA.label]) assert.ok(!text.includes(value));
    assert.ok(!('auth' in data));
    await instance.api.call('adminImportBackup', token, {...data, auth: {passwords: [], hash: 'hostile'}, passwords: ['plaintext']});
    assert.deepEqual(instance.read().auth, beforeAuth);
    await login(instance, PASSWORD_A);
  }
  const fresh = app();
  const freshToken = await login(fresh);
  await fresh.api.call('adminImportBackup', freshToken, await instance.api.call('adminExportBackup', token));
  await assert.rejects(fresh.api.call('adminLogin', 'admin', PASSWORD_A), /Incorrect/);
  assert.equal((await fresh.api.call('adminListPasswords', freshToken)).length, 1);
});

test('authentication mutations preserve settings, images, plunge and coolant values byte-for-byte', async () => {
  const instance = app(seeded(customA));
  const token = await login(instance);
  const data = clone({settings: instance.read().settings, materials: instance.read().materials});
  await instance.api.call('adminAddPassword', token, 'New mentor', PASSWORD_B);
  await instance.api.call('adminUpdatePassword', token, customA.id, 'Renamed mentor', '');
  await instance.api.call('adminDeletePassword', token, customA.id);
  assert.deepEqual({settings: instance.read().settings, materials: instance.read().materials}, data);
  const display = await instance.api.call('getSettings', '001', 'Aluminum');
  assert.equal(display.plungeRate, 2.5); assert.equal(display.coolantMist, true);
  assert.equal(display.toolImage, PNG); assert.equal(display.materialImage, PNG);
});

test('a concurrent data write during password hashing survives the later credential commit', async () => {
  const first = app(seeded());
  const firstToken = await login(first);
  const second = app(null, {store: first.store});
  const secondToken = await login(second);
  const hold = first.holdNextHash();
  const adding = first.api.call('adminAddPassword', firstToken, 'Mentor Alpha', PASSWORD_A);
  await hold.reached;
  await second.api.call('adminSaveMaterial', secondToken, {name: 'Steel', materialImage: PNG});
  const afterDataWrite = clone(second.read().materials);
  hold.release();
  await adding;
  assert.deepEqual(first.read().materials, afterDataWrite);
  assert.deepEqual(first.read().settings, base.settings);
  await login(first, PASSWORD_A);
});

test('cross-tab credential conflict is rejected without erasing the successful write', async () => {
  const first = app(seeded());
  const firstToken = await login(first);
  const second = app(null, {store: first.store});
  const secondToken = await login(second);
  const hold = first.holdNextHash();
  const stale = first.api.call('adminAddPassword', firstToken, 'Mentor Alpha', PASSWORD_A);
  const rejected = assert.rejects(stale, /password list changed/);
  await hold.reached;
  await second.api.call('adminAddPassword', secondToken, 'Mentor Bravo', PASSWORD_B);
  const successfulBytes = first.store.get(KEY);
  hold.release();
  await rejected;
  assert.equal(first.store.get(KEY), successfulBytes);
  await login(first, PASSWORD_B);
  await assert.rejects(first.api.call('adminLogin', 'admin', PASSWORD_A), /Incorrect/);
});

test('a credential removed while its login hash is in flight cannot create a session', async () => {
  const first = app(seeded(customA));
  const token = await login(first);
  const second = app(null, {store: first.store});
  await second.api.ready;
  const hold = second.holdNextHash();
  const attempt = second.api.call('adminLogin', 'admin', PASSWORD_A);
  const rejected = assert.rejects(attempt, /password changed/);
  await hold.reached;
  await first.api.call('adminDeletePassword', token, customA.id);
  hold.release();
  await rejected;
  await login(first);
});
