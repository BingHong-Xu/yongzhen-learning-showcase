const { spawn } = require('child_process');

async function testMobile() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new',
    '--remote-debugging-port=9588',
    '--user-data-dir=C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-test-mobile-profile',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const listRes = await fetch('http://127.0.0.1:9588/json/list');
  const pages = await listRes.json();
  const page = pages.find(p => p.type === 'page') || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const callbacks = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (callbacks.has(d.id)) callbacks.get(d.id)(d); };
  const send = (method, params = {}) => new Promise(r => { const msgId = id++; callbacks.set(msgId, r); ws.send(JSON.stringify({ id: msgId, method, params })); });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'file:///C:/Users/user/.gemini/antigravity/scratch/yongzhen-learning-showcase/index.html' });
  await new Promise(r => setTimeout(r, 2000));

  const res = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      toolbarH: document.querySelector('.toolbar-section')?.offsetHeight,
      headerH: document.querySelector('.site-header')?.offsetHeight,
      scrollW: document.documentElement.scrollWidth,
      bodyW: document.body.offsetWidth,
      sdgChipH: document.querySelector('.sdg-chip')?.offsetHeight,
      sdgChipW: document.querySelector('.sdg-chip')?.offsetWidth
    })`
  });
  console.log('Mobile 375px Metrics:', JSON.parse(res.result.result.value));
  ws.close();
  edge.kill();
}
testMobile();
