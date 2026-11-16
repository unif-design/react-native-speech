import type { LogMetadata, LogMetadataInput } from '@unif/react-native-logger';

/** 只在断言时读取延迟元数据，不能靠JSON忽略函数冒充已检查诊断内容。 */
export function readLogMetadata(input?: LogMetadataInput): LogMetadata {
  return typeof input === 'function' ? input() : (input ?? {});
}
export function readLogCalls(
  calls: readonly (readonly unknown[])[],
): [unknown, LogMetadata][] {
  return calls.map(([event, input]) => [
    event,
    readLogMetadata(input as LogMetadataInput),
  ]);
}
