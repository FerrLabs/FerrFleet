import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export const TIMEOUT_MS = 10_000;

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class McpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, (msg: JsonRpcResponse) => void>();
  private nextId = 1;
  private buffer = '';

  constructor(
    entry: string,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {
    this.child = spawn(process.execPath, [entry], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env },
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk));
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) this.dispatch(line);
    }
  }

  private dispatch(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error(`  non-JSON line from server: ${line.slice(0, 120)}`);
      return;
    }
    const cb = this.pending.get(msg.id);
    if (!cb) return;
    this.pending.delete(msg.id);
    cb(msg);
  }

  rpc<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolveP, rejectP) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectP(new Error(`timed out waiting for ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) {
          rejectP(new Error(`${method} failed: ${msg.error.message}`));
          return;
        }
        resolveP(msg.result as T);
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method: string): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  }

  dispose(): void {
    this.child.stdin.end();
    this.child.kill();
  }
}
