'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const consumerPath = process.env.UNIF_SPEECH_CONSUMER;
const tarball = process.env.UNIF_SPEECH_TARBALL;
assert(
  consumerPath && path.isAbsolute(consumerPath),
  'Set UNIF_SPEECH_CONSUMER to the prepared clean native consumer',
);
assert(
  tarball && path.isAbsolute(tarball),
  'Set UNIF_SPEECH_TARBALL to the actual npm pack artifact',
);
const consumer = fs.realpathSync(consumerPath);
const installed = path.join(
  consumer,
  'node_modules',
  '@unif',
  'react-native-speech',
);
assert.equal(
  fs.realpathSync(installed),
  installed,
  'The consumer must install the tarball, not a workspace symlink',
);
const fromConsumer = createRequire(path.join(consumer, 'package.json'));
const manifest = fromConsumer.resolve('@unif/react-native-speech/package.json');
assert.equal(
  path.dirname(manifest),
  installed,
  'Consumer must resolve its own installed package',
);
const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const candidate = require('../package.json');
assert.equal(pkg.name, candidate.name);
assert.equal(pkg.version, candidate.version);
const lock = JSON.parse(
  fs.readFileSync(path.join(consumer, 'package-lock.json'), 'utf8'),
);
const record = lock.packages['node_modules/@unif/react-native-speech'];
assert(
  record &&
    typeof record.resolved === 'string' &&
    record.resolved.endsWith('.tgz'),
  'Consumer lock must record the installed tarball',
);
assert.equal(
  record.integrity,
  'sha512-' +
    createHash('sha512').update(fs.readFileSync(tarball)).digest('base64'),
);

const fixture = path.join(consumer, 'consumer.ts');
assert.equal(
  fs.readFileSync(fixture, 'utf8'),
  fs.readFileSync(path.join(__dirname, '../validation/consumer.ts'), 'utf8'),
  'Consumer must compile the complete public API fixture',
);

const fromLibrary = createRequire(manifest);
for (const name of ['expo-audio', '@unif/react-native-logger', 'react']) {
  assert.equal(
    fs.realpathSync(fromLibrary.resolve(name)),
    fs.realpathSync(fromConsumer.resolve(name)),
    `${name} must resolve to the host instance`,
  );
}
assert.equal(fromConsumer('expo-audio/package.json').version, '58.0.10');

const ts = require('typescript');
const configFile = path.join(consumer, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configFile, {}, ts.sys);
assert(parsed, 'Consumer must provide its own tsconfig.json');
assert(
  parsed.fileNames.includes(fixture),
  'consumer.ts must be included in type checking',
);
assert(
  parsed.options.strict && !parsed.options.noCheck,
  'Consumer requires strict type checking',
);
for (const subpath of ['', '/credentials', '/realtime', '/capture', '/input']) {
  const name = '@unif/react-native-speech' + subpath;
  assert(
    fromConsumer.resolve(name).startsWith(installed + path.sep),
    `Unexpected runtime resolution: ${name}`,
  );
  const resolved = ts.resolveModuleName(
    name,
    path.join(consumer, 'consumer.ts'),
    parsed.options,
    ts.sys,
  ).resolvedModule;
  assert(
    resolved &&
      resolved.resolvedFileName.startsWith(installed + '/lib/typescript/'),
    `Consumer must use published declarations for ${name}`,
  );
}

const sdk = path.dirname(fromConsumer.resolve('expo-audio/package.json'));
const required = require('../validation/audio-sdk-sha256.json');
for (const [file, hash] of Object.entries(required)) {
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync(path.join(sdk, file)))
      .digest('hex'),
    hash,
    `Host must prepare the adopted audio SDK: ${file}`,
  );
}
execFileSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '--noEmit', '--project', configFile],
  { cwd: consumer, stdio: 'inherit' },
);
console.log(
  `PASS ${pkg.name}@${pkg.version}: actual tarball, public declarations, one host runtime, adopted audio SDK`,
);
