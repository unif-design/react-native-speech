'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('consumer verification rejects a workspace symlink even when package resolution follows it', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'speech-consumer-link-'),
  );
  try {
    const consumer = path.join(directory, 'consumer');
    const source = path.join(directory, 'source');
    fs.mkdirSync(path.join(consumer, 'node_modules', '@unif'), {
      recursive: true,
    });
    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({
        name: '@unif/react-native-speech',
        exports: { './package.json': './package.json' },
      }),
    );
    fs.symlinkSync(
      source,
      path.join(consumer, 'node_modules', '@unif', 'react-native-speech'),
      'dir',
    );
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'verify-consumer.cjs')],
      {
        env: {
          ...process.env,
          UNIF_SPEECH_CONSUMER: consumer,
          UNIF_SPEECH_TARBALL: path.join(directory, 'speech.tgz'),
        },
        encoding: 'utf8',
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not a workspace symlink/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('consumer verification rejects a different tarball before SDK or type verification', () => {
  const consumer = fs.mkdtempSync(
    path.join(os.tmpdir(), 'speech-consumer-integrity-'),
  );
  try {
    const installed = path.join(
      consumer,
      'node_modules',
      '@unif',
      'react-native-speech',
    );
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(
      path.join(installed, 'package.json'),
      JSON.stringify({
        ...require('../package.json'),
        exports: { './package.json': './package.json' },
      }),
    );
    fs.writeFileSync(
      path.join(consumer, 'package-lock.json'),
      JSON.stringify({
        packages: {
          'node_modules/@unif/react-native-speech': {
            resolved: 'file:speech.tgz',
            integrity: 'sha512-wrong',
          },
        },
      }),
    );
    const tarball = path.join(consumer, 'speech.tgz');
    fs.writeFileSync(tarball, 'different-artifact');
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'verify-consumer.cjs')],
      {
        env: {
          ...process.env,
          UNIF_SPEECH_CONSUMER: consumer,
          UNIF_SPEECH_TARBALL: tarball,
        },
        encoding: 'utf8',
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sha512-wrong/);
  } finally {
    fs.rmSync(consumer, { recursive: true, force: true });
  }
});

test('consumer verification rejects an empty public API fixture', () => {
  const consumer = fs.mkdtempSync(
    path.join(os.tmpdir(), 'speech-consumer-empty-'),
  );
  try {
    const installed = path.join(
      consumer,
      'node_modules',
      '@unif',
      'react-native-speech',
    );
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(
      path.join(installed, 'package.json'),
      JSON.stringify({
        ...require('../package.json'),
        exports: { './package.json': './package.json' },
      }),
    );
    const tarball = path.join(consumer, 'speech.tgz');
    fs.writeFileSync(tarball, 'controlled-artifact');
    const integrity =
      'sha512-' +
      require('node:crypto')
        .createHash('sha512')
        .update(fs.readFileSync(tarball))
        .digest('base64');
    fs.writeFileSync(
      path.join(consumer, 'package-lock.json'),
      JSON.stringify({
        packages: {
          'node_modules/@unif/react-native-speech': {
            resolved: 'file:speech.tgz',
            integrity,
          },
        },
      }),
    );
    fs.writeFileSync(path.join(consumer, 'consumer.ts'), '');
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'verify-consumer.cjs')],
      {
        env: {
          ...process.env,
          UNIF_SPEECH_CONSUMER: consumer,
          UNIF_SPEECH_TARBALL: tarball,
        },
        encoding: 'utf8',
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must compile the complete public API fixture/);
  } finally {
    fs.rmSync(consumer, { recursive: true, force: true });
  }
});
