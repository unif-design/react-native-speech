export class SocketFixture {
  static instances: SocketFixture[] = [];
  static failAt = '';
  listeners = new Map<string, Set<(event: any) => void>>();
  sent: (string | ArrayBuffer)[] = [];
  onSend?: (data: string | ArrayBuffer) => void;
  close = jest.fn(() => {
    if (SocketFixture.failAt === 'close') throw new Error('private diagnostic');
  });
  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
    readonly options?: { headers: Record<string, string> },
  ) {
    if (SocketFixture.failAt === 'constructor')
      throw new Error('private diagnostic');
    SocketFixture.instances.push(this);
  }
  set binaryType(_value: string) {
    if (SocketFixture.failAt === 'binaryType')
      throw new Error('private diagnostic');
  }
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    if (SocketFixture.failAt === `listen:${type}`)
      throw new Error('private diagnostic');
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, data?: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener({ data });
  }
  send(data: string | ArrayBuffer) {
    if (SocketFixture.failAt === 'send') throw new Error('private diagnostic');
    this.sent.push(data);
    this.onSend?.(data);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce(
      (total, set) => total + set.size,
      0,
    );
  }
}
