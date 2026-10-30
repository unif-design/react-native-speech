// Only the AudioStream.types author file and its four existing outputs are emitted.
// Options follow expo-module-scripts 56.0.3; no package build or dependency emission.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(
  process.argv.find((value) => value.startsWith('--sdk='))?.slice(6) ||
    'node_modules/expo-audio',
);
const input = path.join(root, 'src/AudioStream.types.ts');
const program = ts.createProgram([input], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  moduleDetection: ts.ModuleDetectionKind.Force,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  strict: true,
  skipLibCheck: true,
  declaration: true,
  declarationMap: true,
  sourceMap: true,
  inlineSources: true,
  rootDir: path.join(root, 'src'),
  outDir: path.join(root, 'build'),
});
const source = program.getSourceFile(input);
if (!source || program.getSyntacticDiagnostics(source).length)
  throw new Error('Invalid audio type source');
const outputs = [];
const result = program.emit(source, (filename, content) => {
  const name = path.basename(filename);
  if (
    ![
      'AudioStream.types.js',
      'AudioStream.types.js.map',
      'AudioStream.types.d.ts',
      'AudioStream.types.d.ts.map',
    ].includes(name)
  )
    throw new Error(`Unexpected output: ${filename}`);
  outputs.push(filename);
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(filename, 'utf8') !== content)
      throw new Error(`Stale output: ${filename}`);
  } else {
    fs.writeFileSync(filename, content);
  }
});
if (result.emitSkipped || result.diagnostics.length || outputs.length !== 4)
  throw new Error('Audio static generation failed');
console.log(`Verified four limited outputs in ${root}`);
