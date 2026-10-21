const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyRWDComplete() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-rwd-complete-profile';
  const remoteDebuggingPort = 9277;

  const edgeProcess = spawn(edgePath, [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ]);

  console.log('Started Headless Edge for Full RWD Verification...');
  await wait(1800);

  try {
    const listRes = await fetch(`http://127.0.0.1:${remoteDebuggingPort}/json/list`);
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
    await send('DOM.enable');
    await send('Runtime.enable');

    const htmlPath = path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    const fileUrl = `file:///${htmlPath}`;
    await send('Page.navigate', { url: fileUrl });
    await wait(2200);

    const testDevices = [
      { name: 'Mobile_iPhoneSE_375x667', width: 375, height: 667, mobile: true },
      { name: 'Mobile_iPhone14_393x852', width: 393, height: 852, mobile: true },
      { name: 'Mobile_Pixel_412x915', width: 412, height: 915, mobile: true },
      { name: 'Tablet_iPadMini_768x1024', width: 768, height: 1024, mobile: true },
      { name: 'Tablet_iPadAir_820x1180', width: 820, height: 1180, mobile: true },
      { name: 'Tablet_Landscape_1024x768', width: 1024, height: 768, mobile: false },
      { name: 'Desktop_1440x900', width: 1440, height: 900, mobile: false },
    ];

    const results = [];

    for (const dev of testDevices) {
      console.log(`\n======================================================`);
      console.log(`Testing Viewport: ${dev.name} (${dev.width} x ${dev.height})`);
      console.log(`======================================================`);

      await send('Emulation.setDeviceMetricsOverride', {
        width: dev.width,
        height: dev.height,
        deviceScaleFactor: 2,
        mobile: dev.mobile,
      });
      await wait(400);

      const overflowRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const winW = window.innerWidth;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          
          // Check overflowing elements
          const badEls = [];
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > winW + 1.5 && r.width > 0 && !['HTML','BODY'].includes(el.tagName)) {
              badEls.push({
                tag: el.tagName,
                cls: (el.className ? String(el.className) : '').slice(0, 40),
                id: el.id,
                right: Math.round(r.right),
                width: Math.round(r.width)
              });
            }
          });

          return {
            winW,
            scrollW,
            hasOverflow: scrollW > winW + 1,
            badElementsCount: badEls.length,
            badElements: badEls.slice(0, 5)
          };
        })()`,
        returnByValue: true
      });

      const o = overflowRes.result.value;
      console.log(`Horizontal Overflow: ${o.hasOverflow ? '❌ FAILED' : '✅ PASSED'} (scrollWidth: ${o.scrollW}, innerWidth: ${o.winW})`);
      if (o.hasOverflow || o.badElementsCount > 0) {
        console.log(`Overflowing elements (${o.badElementsCount}):`, o.badElements);
      }

      // Capture screenshot of top
      const topShot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve(__dirname, `rwd_${dev.name}_home.png`), Buffer.from(topShot.data, 'base64'));

      // If mobile or tablet portrait, test mobile menu drawer
      if (dev.width <= 900) {
        console.log('Testing Mobile Menu Drawer Interaction...');
        const drawerOpenRes = await send('Runtime.evaluate', {
          expression: `(() => {
            const menuBtn = document.getElementById('mobileMenuBtn');
            const drawer = document.getElementById('mobileNavDrawer');
            if (!menuBtn || !drawer) return { error: 'elements not found' };
            menuBtn.click();
            return {
              isOpen: drawer.classList.contains('open'),
              height: drawer.offsetHeight,
              visible: window.getComputedStyle(drawer).display !== 'none'
            };
          })()`,
          returnByValue: true
        });
        console.log('Mobile menu opened:', drawerOpenRes.result.value);
        await wait(350);

        const drawerShot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.resolve(__dirname, `rwd_${dev.name}_drawer.png`), Buffer.from(drawerShot.data, 'base64'));

        // Close drawer
        await send('Runtime.evaluate', {
          expression: `(() => {
            const menuBtn = document.getElementById('mobileMenuBtn');
            if (menuBtn) menuBtn.click();
          })()`
        });
        await wait(350);
      }

      results.push({ device: dev.name, ...o });
    }

    // Now test Modals & Views on iPhone 14 (393 x 852)
    console.log('\n======================================================');
    console.log('Deep Interaction Tests on Mobile (393 x 852)');
    console.log('======================================================');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(300);

    // 1. Test Filter & Search
    console.log('1. Testing Toolbar & Filter on Mobile...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const tb = document.getElementById('filterToolbar');
        if (tb) tb.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()`
    });
    await wait(300);
    const toolbarShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'rwd_mobile_toolbar.png'), Buffer.from(toolbarShot.data, 'base64'));

    // 2. Test Timeline View
    console.log('2. Testing Timeline View on Mobile...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-view="timeline"]');
        if (btn) btn.click();
      })()`
    });
    await wait(400);

    const timelineMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const docEl = document.documentElement;
        return {
          scrollW: docEl.scrollWidth,
          winW: window.innerWidth,
          hasOverflow: docEl.scrollWidth > window.innerWidth + 1
        };
      })()`,
      returnByValue: true
    });
    console.log('Timeline View RWD:', timelineMetrics.result.value);
    const timelineShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'rwd_mobile_timeline.png'), Buffer.from(timelineShot.data, 'base64'));

    // 3. Test Gallery Wall View
    console.log('3. Testing Gallery Wall View on Mobile...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-view="gallery"]');
        if (btn) btn.click();
      })()`
    });
    await wait(400);

    const galleryMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const docEl = document.documentElement;
        return {
          scrollW: docEl.scrollWidth,
          winW: window.innerWidth,
          hasOverflow: docEl.scrollWidth > window.innerWidth + 1
        };
      })()`,
      returnByValue: true
    });
    console.log('Gallery Wall View RWD:', galleryMetrics.result.value);
    const galleryShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'rwd_mobile_gallery.png'), Buffer.from(galleryShot.data, 'base64'));

    // 4. Test Activity Detail Modal
    console.log('4. Testing Activity Detail Modal on Mobile...');
    // Switch to cards view first
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-view="cards"]');
        if (btn) btn.click();
      })()`
    });
    await wait(400);

    // Open first activity modal
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.btn-card-explore');
        if (btn) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      })()`
    });
    await wait(500);

    const modalMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const modal = document.getElementById('activityModal');
        const container = document.querySelector('#activityModal .modal-window');
        if (!modal || !container) return { isOpen: false };
        const r = container.getBoundingClientRect();
        return {
          isOpen: modal.classList.contains('open'),
          modalW: Math.round(r.width),
          winW: window.innerWidth,
          modalH: Math.round(r.height),
          winH: window.innerHeight,
          fitsHorizontally: r.width <= window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('Activity Modal RWD:', modalMetrics.result.value);
    const modalShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'rwd_mobile_modal.png'), Buffer.from(modalShot.data, 'base64'));

    // Close modal
    await send('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.getElementById('modalCloseBtn');
        if (closeBtn) closeBtn.click();
      })()`
    });
    await wait(300);

    // 5. Test Lightbox Modal
    console.log('5. Testing Lightbox on Mobile...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        // click first card media cover
        const cover = document.querySelector('.card-media-wrapper');
        if (cover) cover.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()`
    });
    await wait(500);

    const lightboxMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const lb = document.getElementById('lightboxModal');
        const img = document.getElementById('lightboxImg');
        if (!lb || !img) return { isOpen: false };
        const r = img.getBoundingClientRect();
        return {
          isOpen: lb.classList.contains('open'),
          imgW: Math.round(r.width),
          imgH: Math.round(r.height),
          winW: window.innerWidth,
          winH: window.innerHeight,
          fitsHorizontally: r.width <= window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('Lightbox RWD:', lightboxMetrics.result.value);
    const lightboxShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'rwd_mobile_lightbox.png'), Buffer.from(lightboxShot.data, 'base64'));

    // Test Lightbox Next and Swipe
    await send('Runtime.evaluate', {
      expression: `(() => {
        const nextBtn = document.getElementById('lightboxNextBtn');
        if (nextBtn) nextBtn.click();
      })()`
    });
    await wait(300);

    // Close Lightbox
    await send('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.getElementById('lightboxCloseBtn');
        if (closeBtn) closeBtn.click();
      })()`
    });
    await wait(300);

    // 6. Test PII Modal
    console.log('6. Testing PII Modal on Mobile...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const piiBtn = document.querySelector('.open-pii-modal');
        if (piiBtn) piiBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()`
    });
    await wait(400);

    const piiMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const modal = document.getElementById('piiModal');
        const container = document.querySelector('#piiModal .modal-window');
        if (!modal || !container) return { isOpen: false };
        const r = container.getBoundingClientRect();
        return {
          isOpen: modal.classList.contains('open'),
          modalW: Math.round(r.width),
          winW: window.innerWidth,
          fitsHorizontally: r.width <= window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('PII Modal RWD:', piiMetrics.result.value);
    const piiShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'rwd_mobile_pii.png'), Buffer.from(piiShot.data, 'base64'));

    // Close PII Modal
    await send('Runtime.evaluate', {
      expression: `(() => {
        const closeBtn = document.getElementById('piiModalCloseBtn');
        if (closeBtn) closeBtn.click();
      })()`
    });
    await wait(300);

    console.log('\n=== RWD Audit Summary ===');
    console.table(results);
    console.log('All automated tests completed successfully!');

    ws.close();
  } catch (err) {
    console.error('RWD Verification Failed:', err);
  } finally {
    edgeProcess.kill();
  }
}

verifyRWDComplete();
