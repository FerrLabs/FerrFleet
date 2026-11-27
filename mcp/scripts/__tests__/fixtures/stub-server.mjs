const name = process.env.STUB_NAME ?? 'stub';

if (process.argv.includes('--version')) {
  console.log(`${name} 1.2.3`);
  process.exit(0);
}

const handlers = {
  initialize: () => ({ serverInfo: { name, version: '1.2.3' } }),
  'tools/list': () => ({ tools: [{ name: 'alpha' }, { name: 'beta' }] }),
  'prompts/list': () => ({ prompts: [{ name: 'review' }] }),
  'resources/templates/list': () => ({ resourceTemplates: [{ uriTemplate: 'x://{id}' }] }),
  'tools/call': (params) =>
    params.name === 'broken'
      ? { isError: true, content: [{ type: 'text', text: 'boom' }] }
      : { content: [{ type: 'text', text: JSON.stringify({ echoed: params.arguments }) }] },
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    const msg = JSON.parse(line);
    if (msg.id === undefined) continue;
    if (msg.method === 'fail' || msg.method === process.env.STUB_FAIL) {
      process.stdout.write(
        `not json\n${JSON.stringify({ jsonrpc: '2.0', id: 999, result: {} })}\n`,
      );
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -1, message: 'nope' } })}\n`,
      );
      continue;
    }
    if (msg.method === 'silent') continue;
    const result = handlers[msg.method]?.(msg.params);
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n`);
  }
});
