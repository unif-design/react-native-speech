'use strict';
require('./build-llms-core.test.js');
require('./build-llms-site.test.js');
const assert = require('node:assert/strict');
const { buildBundle } = require('./llms/bundle');
const path = require('node:path');
const bundle = buildBundle({ root: path.join(__dirname, '..') });
for (const name of ['credentials', 'realtime', 'capture', 'input']) {
  assert(bundle[`md/api/${name}.md`], `Missing public API ${name}`);
}
assert(bundle['md/native-setup.md'].toString('utf8').includes('宿主统一维护和应用'));
console.log('PASS Speech API 与原生补丁接线文档进入 LLM 资料');
