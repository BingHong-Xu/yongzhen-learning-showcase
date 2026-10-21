const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runDeepRwdAudit() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-audit-deep-profile';
  const port = 9555;

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
    const localFileUrl = 'file:///C:/Users/user/.gemini/antigravity/scratch/yongzhen-learning-showcase/index.html';
    
    const viewports = [
      { name: 'iPhone_SE', width: 375, height: 667, mobile: true },
      { name: 'iPhone_14', width: 393, height: 852, mobile: true },
      { name: 'Android_Pixel', width: 412, height: 915, mobile: true },
      { name: 'iPad_Mini_Portrait', width: 768, height: 1024, mobile: true },
      { name: 'iPad_Air_Portrait', width: 820, height: 1180, mobile: true },
      { name: 'iPad_Landscape', width: 1024, height: 768, mobile: false },
      { name: 'Desktop_1440', width: 1440, height: 900, mobile: false }
    ];

    const auditResults = [];

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.mobile
      });

      await send('Page.navigate', { url: localFileUrl });
      await new Promise(r => setTimeout(r, 1500));

      // 1. Audit Overflow & Key Elements
      const metrics = await send('Runtime.evaluate', {
        expression: `(() => {
          const docW = document.documentElement.offsetWidth;
          const scrollW = document.documentElement.scrollWidth;
          const bodyScrollW = document.body.scrollWidth;
          const hasOverflow = scrollW > docW || bodyScrollW > docW;

          // Header & Toolbar offset check
          const header = document.querySelector('.site-header');
          const toolbar = document.querySelector('.toolbar-section');
          const headerH = header ? header.offsetHeight : 0;
          const toolbarTop = toolbar ? window.getComputedStyle(toolbar).top : null;

          // Search input font size (iOS auto-zoom test)
          const searchInput = document.getElementById('searchInput');
          const searchInputFontSize = searchInput ? window.getComputedStyle(searchInput).fontSize : null;

          // Touch Targets measurements
          const touchTargets = [];
          document.querySelectorAll('button, .btn-pill, .filter-btn, .view-btn, .sdg-chip, .btn-card-explore, .nav-link, .mobile-menu-btn').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              touchTargets.push({
                tag: el.tagName,
                cls: el.className.split(' ').slice(0, 2).join(' '),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
              });
            }
          });

          // Small touch targets (< 36px height)
          const smallTargets = touchTargets.filter(t => t.h < 36 && !t.cls.includes('badge'));

          // Activity cards count
          const cardsCount = document.querySelectorAll('.activity-card').length;

          return {
            docW,
            scrollW,
            bodyScrollW,
            hasOverflow,
            headerH,
            toolbarTop,
            searchInputFontSize,
            smallTargetsCount: smallTargets.length,
            smallTargetsSample: smallTargets.slice(0, 5),
            cardsCount
          };
        })()`,
        returnByValue: true
      });

      auditResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        ...metrics.result.value
      });

      // Capture screenshot
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`C:\\Users\\user\\.gemini\\antigravity\\scratch\\yongzhen-learning-showcase\\scripts\\audit_rwd_${vp.name}.png`, Buffer.from(shot.data, 'base64'));
    }

    console.log('AUDIT RESULTS:');
    console.log(JSON.stringify(auditResults, null, 2));

    ws.close();
  } catch (e) {
    console.error('Audit Error:', e);
  } finally {
    edge.kill();
  }
}

runDeepRwdAudit();
