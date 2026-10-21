const { spawn } = require('child_process');
const fs = require('fs');

async function testLive() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-live-profile';
  const port = 9388;

  const edge = spawn(edgePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const pages = await listRes.json();
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        const { resolve, reject } = callbacks.get(data.id);
        callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        callbacks.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Navigating to GitHub Pages live URL...');
    await send('Page.navigate', { url: 'https://binghong-xu.github.io/yongzhen-learning-showcase/' });
    await new Promise(r => setTimeout(r, 4500));

    const evalRes = await send('Runtime.evaluate', {
      expression: '({ title: document.title, cards: document.querySelectorAll(".activity-card").length, statCount: document.getElementById("statTotalActivities")?.innerText, imgLoaded: Array.from(document.querySelectorAll("img")).filter(i => i.complete && i.naturalWidth > 0).length, totalImgs: document.querySelectorAll("img").length })',
      returnByValue: true
    });
    console.log('Live Evaluation Result:', evalRes.result.value);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:\\Users\\user\\.gemini\\antigravity\\scratch\\yongzhen-learning-showcase\\preview_live_deployed.png', Buffer.from(shot.data, 'base64'));
    console.log('Successfully saved preview_live_deployed.png!');
    ws.close();
  } catch(e) {
    console.error('Error:', e);
  } finally {
    edge.kill();
  }
}
testLive();
