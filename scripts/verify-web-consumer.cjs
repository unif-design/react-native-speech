'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const consumer = process.env.UNIF_SPEECH_CONSUMER;
assert(
  consumer && path.isAbsolute(consumer),
  'Set UNIF_SPEECH_CONSUMER to the prepared tarball consumer',
);
const fromConsumer = createRequire(path.join(consumer, 'package.json'));
const fromWebsite = createRequire(
  path.join(__dirname, '../website/package.json'),
);
const fromDocusaurus = createRequire(
  fromWebsite.resolve('@docusaurus/core/package.json'),
);
const webpack = fromDocusaurus('webpack');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-web-consumer-'));
const entry = path.join(output, 'consumer-entry.mjs');
fs.writeFileSync(entry, "export * from '@unif/react-native-speech';\n");

webpack(
  {
    mode: 'development',
    target: 'web',
    context: consumer,
    entry,
    output: {
      path: output,
      filename: 'speech.js',
      library: { type: 'window', name: 'Speech' },
    },
    resolve: {
      modules: [path.join(consumer, 'node_modules'), 'node_modules'],
      alias: { 'react-native$': fromConsumer.resolve('react-native-web') },
      extensions: ['.web.js', '.js', '.json'],
      conditionNames: ['browser', 'import', 'default'],
    },
  },
  (error, stats) => {
    try {
      if (error) throw error;
      assert(
        stats && !stats.hasErrors(),
        stats?.toString({ all: false, errors: true }),
      );
      const modules = stats.toJson({ all: false, modules: true }).modules ?? [];
      assert(
        !modules.some((module) => /\/expo-audio\//.test(module.name ?? '')),
        'Web must not load the native audio SDK',
      );
      console.log(
        'PASS Web tarball build: public browser entry and no native audio SDK',
      );
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  },
);
