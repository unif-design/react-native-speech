"""Extract the installed audio SDK; native compilation/execution is CI-only.

--extract-only never downloads tools or invokes any compiler. Complete classes are
used, with only system bindings substituted; coroutine scheduling remains real.
"""
import argparse
import hashlib
import os
import re
import subprocess
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = [
    ('kotlin.zip', 'https://github.com/JetBrains/kotlin/releases/download/v2.1.20/kotlin-compiler-2.1.20.zip',
     'a118197b0de55ffab2bc8d5cd03a5e39033cfb53383d6931bc761dec0784891a'),
    ('coroutines.jar', 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.10.2/kotlinx-coroutines-core-jvm-1.10.2.jar',
     '5ca175b38df331fd64155b35cd8cae1251fa9ee369709b36d42e0a288ccce3fd'),
    ('coroutines-test.jar', 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-test-jvm/1.10.2/kotlinx-coroutines-test-jvm-1.10.2.jar',
     '590a549f8c1db590c9d98a8a20424a1f581a34162a369e6a6bd884ce7d36d3d7'),
]


def install_tool(destination, url, expected):
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected:
        print(f'Using verified cached tool: {destination.name}', flush=True)
        return
    print(f'Downloading pinned tool: {destination.name}', flush=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Invalid pinned tool integrity: {url}')
    destination.write_bytes(data)


def block(source, signature):
    if source.count(signature) != 1:
        raise ValueError(f'Missing/ambiguous SDK boundary: {signature}')
    start = source.index(signature)
    opening = source.index('{', start)
    masked = re.sub(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"',
                    lambda match: ' ' * len(match.group()), source)
    depth = 0
    for index in range(opening, len(source)):
        if masked[index] == '{':
            depth += 1
        elif masked[index] == '}':
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise ValueError(f'Unclosed SDK boundary: {signature}')


def extract(sdk, out):
    android = sdk / 'android/src/main/java/expo/modules/audio'
    kotlin = (android / 'AudioStream.kt').read_text()
    # Keep real kotlinx.coroutines imports from the fixture. Android/Expo classes
    # and dispatcher/monotonic clock are the explicitly controlled boundaries.
    kotlin = re.sub(r'^(?:package|import) [^\n]*\n', '', kotlin, flags=re.M)
    media3_opt_in = '@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)\n'
    assert kotlin.count(media3_opt_in) == 1
    kotlin = kotlin.replace(media3_opt_in, '')
    assert kotlin.count('Dispatchers.IO') == 1
    assert kotlin.count('System.nanoTime()') == 4
    kotlin = kotlin.replace('Dispatchers.IO', 'captureDispatcher').replace('System.nanoTime()', 'audioNanoTime()')
    records = (android / 'AudioRecords.kt').read_text()
    options = '\n'.join(block(records, signature) for signature in
                        ['enum class AudioStreamEncoding(', 'class AudioStreamOptions : Record'])
    fixture = (HERE / 'KotlinBoundary.kt').read_text()
    fixture = fixture.replace('// SDK_OPTIONS', 'interface Enumerable\ninterface Record\nannotation class Field\n' + options)
    fixture = fixture.replace('// SDK_AUDIO_STREAM', kotlin)
    (out / 'KotlinBoundary.kt').write_text(fixture)
    stop_binding = '  @Synchronized\n  fun stop()'
    assert fixture.count(stop_binding) == 1
    # One exact counterexample, not a generic mutation harness: method body,
    # read lock and the complete test all remain unchanged.
    mutant = fixture.replace(stop_binding, '  fun stop()', 1)
    (out / 'KotlinBoundaryUnsynchronizedStop.kt').write_text(mutant)
    swift_records = (sdk / 'ios/AudioRecords.swift').read_text()
    swift_options = block(swift_records, 'struct AudioStreamOptions: Record')
    assert '@Field var sampleRate: Double = 48000' in swift_options
    assert '@Field var channels: Int = 1' in swift_options
    assert '@Field var encoding: AudioStreamEncoding = .float32' in swift_options
    swift = (sdk / 'ios/AudioStream.swift').read_text()
    swift = re.sub(r'^import (?:AVFoundation|ExpoModulesCore)\n', '', swift, flags=re.M)
    assert swift.count('DispatchQueue.main.async') == 1
    swift = swift.replace('DispatchQueue.main.async', 'BoundaryQueue.async')
    (out / 'SwiftBoundary.swift').write_text((HERE / 'SwiftBoundary.swift').read_text().replace('// SDK_AUDIO_STREAM', swift))
    # Verify the actual module registrations remain aligned with the class signatures.
    ios_registration = block((sdk / 'ios/AudioModule.swift').read_text(), 'Class(AudioStream.self)')
    android_registration = block((android / 'AudioModule.kt').read_text(), 'Class(AudioStream::class)')
    assert 'AsyncFunction("start")' in ios_registration and 'try stream.start()' in ios_registration
    assert 'Function("stop")' in ios_registration and 'try stream.stop()' in ios_registration
    assert 'AsyncFunction("start") Coroutine' in android_registration and 'stream.start()' in android_registration
    assert 'Function("stop")' in android_registration and 'stream.stop()' in android_registration
    (out / 'registrations.txt').write_text(ios_registration + '\n' + android_registration)
    inputs = [android / 'AudioStream.kt', android / 'AudioRecords.kt', android / 'AudioModule.kt',
              sdk / 'ios/AudioStream.swift', sdk / 'ios/AudioModule.swift', sdk / 'ios/AudioRecords.swift']
    manifest = '\n'.join(f'{hashlib.sha256(item.read_bytes()).hexdigest()}  {item.resolve()}' for item in inputs)
    (out / 'source-sha256.txt').write_text(manifest + '\n')
    print(manifest, flush=True)
    print('Extracted complete SDK classes and actual registrations; no native execution yet.', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk', type=Path, default=Path('node_modules/expo-audio'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--extract-only', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    extract(args.sdk, out)
    if args.extract_only:
        return
    if os.environ.get('CI') != 'true':
        raise SystemExit('Native compilation is CI-only. Locally use --extract-only.')
    for name, url, expected in TOOLS:
        install_tool(out / name, url, expected)
    with zipfile.ZipFile(out / 'kotlin.zip') as archive:
        archive.extractall(out)
    compiler = out / 'kotlinc/bin/kotlinc'
    compiler.chmod(0o755)
    classpath = os.pathsep.join(str(out / name) for name in ['coroutines.jar', 'coroutines-test.jar'])
    subprocess.run([str(compiler), str(out / 'KotlinBoundary.kt'), '-cp', classpath, '-include-runtime',
                    '-d', str(out / 'audio-boundary.jar')], check=True)
    subprocess.run(['java', '-cp', str(out / 'audio-boundary.jar') + os.pathsep + classpath, 'KotlinBoundaryKt'], check=True, timeout=30)
    # A compile error is a failed check, not an accepted counterexample.
    subprocess.run([str(compiler), str(out / 'KotlinBoundaryUnsynchronizedStop.kt'), '-cp', classpath,
                    '-include-runtime', '-d', str(out / 'audio-unsynchronized-stop.jar')], check=True)
    counterexample = subprocess.run(
        ['java', '-cp', str(out / 'audio-unsynchronized-stop.jar') + os.pathsep + classpath,
         'KotlinBoundaryUnsynchronizedStopKt'], capture_output=True, text=True, timeout=30)
    log = counterexample.stdout + counterexample.stderr
    (out / 'unsynchronized-stop-result.txt').write_text(log)
    expected = 'Exception in thread "main" java.lang.IllegalStateException: AUDIO_READ_RELEASE_RACE:'
    if counterexample.returncode == 0 or expected not in log:
        raise RuntimeError('Unsynchronized stop did not fail the specific in-flight release assertion:\n' + log)
    print('Compiled unsynchronized-stop counterexample failed the required AUDIO_READ_RELEASE_RACE assertion.', flush=True)
    print(log, flush=True)
    subprocess.run(['swiftc', '-swift-version', '5', str(out / 'SwiftBoundary.swift'), '-o', str(out / 'swift-audio-boundary')], check=True)
    subprocess.run([str(out / 'swift-audio-boundary')], check=True, timeout=30)


if __name__ == '__main__':
    main()
