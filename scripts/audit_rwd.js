const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function auditRWD() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-rwd-audit-profile';
  const remoteDebuggingPort = 9233;

  const edgeProcess = spawn(edgePath, [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ]);

  console.log('Spawned headless Edge for RWD audit...');
  await wait(1800);

  try {
    const listRes = await fetch(`http://127.0.0.1:${remoteDebuggingPort}/json/list`);
    const pages = await listRes.json();
    const wsUrl = pages[0].webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

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
    await send('DOM.enable');
    await send('Runtime.enable');

    const htmlPath = path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    const fileUrl = `file:///${htmlPath}`;
    console.log('Navigating to:', fileUrl);
    await send('Page.navigate', { url: fileUrl });
    await wait(2000);

    const testDevices = [
      { name: 'Mobile_375x667', width: 375, height: 667, mobile: true },
      { name: 'Mobile_390x844', width: 390, height: 844, mobile: true },
      { name: 'Tablet_768x1024', width: 768, height: 1024, mobile: true },
      { name: 'Tablet_1024x768', width: 1024, height: 768, mobile: false },
    ];

    const auditResults = [];

    for (const dev of testDevices) {
      console.log(`\n=== Auditing: ${dev.name} (${dev.width}x${dev.height}) ===`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: dev.width,
        height: dev.height,
        deviceScaleFactor: 2,
        mobile: dev.mobile,
      });
      await wait(500);

      // Evaluate overflow and metrics
      const evalRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const winWidth = window.innerWidth;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const hasHorizontalOverflow = scrollWidth > winWidth;

          // Find overflowing elements
          const allEls = document.querySelectorAll('*');
          const overflowing = [];
          allEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.right > winWidth + 1) { // 1px margin of error
              overflowing.push({
                tag: el.tagName,
                id: el.id,
                className: el.className ? String(el.className).slice(0, 50) : '',
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                winWidth: winWidth
              });
            }
          });

          // Check touch targets under 40px
          const interactive = document.querySelectorAll('button, a, input, select, [role="button"]');
          const smallTargets = [];
          interactive.forEach(el => {
            const rect = el.getBoundingClientRect();
            // only check visible ones
            if (rect.width > 0 && rect.height > 0 && (rect.width < 36 || rect.height < 36)) {
              smallTargets.push({
                tag: el.tagName,
                text: (el.innerText || el.ariaLabel || el.title || '').trim().slice(0, 30),
                className: el.className ? String(el.className).slice(0, 40) : '',
                w: Math.round(rect.width),
                h: Math.round(rect.height)
              });
            }
          });

          return {
            winWidth,
            scrollWidth,
            hasHorizontalOverflow,
            overflowingCount: overflowing.length,
            overflowingSample: overflowing.slice(0, 10),
            smallTargetsCount: smallTargets.length,
            smallTargetsSample: smallTargets.slice(0, 10),
          };
        })()`,
        returnByValue: true
      });

      const metrics = evalRes.result.value;
      console.log(`Overflow: ${metrics.hasHorizontalOverflow ? '❌ YES' : '✅ NO'} (scrollWidth: ${metrics.scrollWidth}, winWidth: ${metrics.winWidth})`);
      if (metrics.hasHorizontalOverflow) {
        console.log('Sample overflowing elements:', JSON.stringify(metrics.overflowingSample, null, 2));
      }
      console.log(`Small touch targets (<36px): ${metrics.smallTargetsCount}`);
      if (metrics.smallTargetsCount > 0) {
        console.log('Sample small targets:', JSON.stringify(metrics.smallTargetsSample, null, 2));
      }

      // Take a screenshot of top
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const imgPath = path.resolve(__dirname, `audit_${dev.name}_top.png`);
      fs.writeFileSync(imgPath, Buffer.from(screenshot.data, 'base64'));
      console.log(`Captured screenshot: ${imgPath}`);

      auditResults.push({ dev: dev.name, ...metrics });
    }

    // Now test opening modal on 390x844
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(300);

    // Click first activity card
    console.log('\n--- Testing Mobile Modal Opening ---');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const card = document.querySelector('.activity-card');
        if (card) {
          const btn = card.querySelector('.btn-detail-trigger');
          if (btn) btn.click();
          else card.click();
        }
      })()`
    });
    await wait(600);

    const modalEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const modal = document.getElementById('activityModal');
        const modalContent = document.querySelector('#activityModal .modal-container');
        if (!modal || !modalContent) return { isOpen: false };
        const rect = modalContent.getBoundingClientRect();
        return {
          isOpen: modal.classList.contains('active'),
          modalWidth: Math.round(rect.width),
          modalHeight: Math.round(rect.height),
          winWidth: window.innerWidth,
          winHeight: window.innerHeight,
          fitsHorizontally: rect.width <= window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('Modal status on mobile 390x844:', modalEval.result.value);

    const modalShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'audit_Mobile_390x844_modal.png'), Buffer.from(modalShot.data, 'base64'));

    // Close modal
    await send('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.querySelector('#activityModal .modal-close');
        if (closeBtn) closeBtn.click();
      })()`
    });
    await wait(400);

    // Switch to Timeline View and inspect
    console.log('\n--- Testing Mobile Timeline View ---');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const timelineBtn = document.querySelector('[data-view="timeline"]');
        if (timelineBtn) timelineBtn.click();
      })()`
    });
    await wait(500);

    const timelineEval = await send('Runtime.evaluate', {
      expression: `(() => {
        const docEl = document.documentElement;
        return {
          scrollWidth: docEl.scrollWidth,
          winWidth: window.innerWidth,
          hasHorizontalOverflow: docEl.scrollWidth > window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('Timeline view overflow:', timelineEval.result.value);

    const timelineShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'audit_Mobile_390x844_timeline.png'), Buffer.from(timelineShot.data, 'base64'));

    ws.close();
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    edgeProcess.kill();
  }
}

auditRWD();
