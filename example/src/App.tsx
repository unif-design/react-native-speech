import { useEffect, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { createSpeechCredentialAccess } from '@unif/react-native-speech/credentials';
import type { SpeechCredential } from '@unif/react-native-speech/credentials';
import { openSpeechSession } from '@unif/react-native-speech/realtime';
import { useVoiceInput } from '@unif/react-native-speech/input';
import type {
  VoiceInputPermissions,
  VoiceInputResult,
} from '@unif/react-native-speech/input';

const permissions: VoiceInputPermissions = {
  async request() {
    await requestRecordingPermissionsAsync();
  },
  async read() {
    const result = await getRecordingPermissionsAsync();
    return [
      {
        id: 'microphone',
        status: result.granted
          ? 'granted'
          : result.canAskAgain
            ? 'requestable'
            : 'blocked',
      },
    ];
  },
};

function Recognition({ credential }: { credential: SpeechCredential }) {
  const [credentials] = useState(() =>
    createSpeechCredentialAccess(async () => ({
      status: 'success',
      credential,
    })),
  );
  const [result, setResult] = useState<Readonly<VoiceInputResult>>();
  const voice = useVoiceInput({
    permissions,
    openRecognition: (handlers) =>
      openSpeechSession({ credentials, createUuid: randomUUID }, handlers),
    onResult: setResult,
  });
  useEffect(() => () => credentials.dispose(), [credentials]);
  return (
    <View style={styles.group}>
      <Text accessibilityLiveRegion="polite">阶段：{voice.state}</Text>
      <Text selectable>{voice.transcript || '等待语音输入'}</Text>
      <Button
        title="开始录音"
        onPress={voice.start}
        disabled={voice.state !== 'idle' && voice.state !== 'error'}
      />
      <Button
        title="停止并取得文字"
        onPress={voice.stop}
        disabled={voice.state !== 'listening'}
      />
      <Button title="取消本轮" onPress={() => voice.cancel('user')} />
      <Text selectable>
        {result ? JSON.stringify(result, null, 2) : '结果将在本轮结束后显示'}
      </Text>
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const [expiry, setExpiry] = useState('');
  const [credential, setCredential] = useState<SpeechCredential>();
  const [revision, setRevision] = useState(0);
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Unif Speech</Text>
      <Text>
        输入服务端签发的临时凭证。只在当前示例内存中使用，不填写长期密钥。开始后使用设备麦克风进行真实识别。
      </Text>
      <TextInput
        accessibilityLabel="临时 token"
        placeholder="临时 token"
        value={token}
        onChangeText={setToken}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.field}
      />
      <TextInput
        accessibilityLabel="识别 WebSocket 地址"
        placeholder="wss://…"
        value={wsUrl}
        onChangeText={setWsUrl}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.field}
      />
      <TextInput
        accessibilityLabel="凭证到期时间，Unix 秒"
        placeholder="expiresAtSeconds"
        value={expiry}
        onChangeText={setExpiry}
        keyboardType="number-pad"
        style={styles.field}
      />
      <Button
        title="应用临时凭证"
        onPress={() => {
          setCredential({ token, wsUrl, expiresAtSeconds: Number(expiry) });
          setRevision((value) => value + 1);
          setToken('');
        }}
      />
      {credential ? (
        <Recognition key={revision} credential={credential} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  field: { borderWidth: 1, borderColor: '#777', borderRadius: 8, padding: 12 },
  group: { gap: 16 },
});
