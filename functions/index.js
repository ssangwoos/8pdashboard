const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium');


admin.initializeApp();
const db = admin.firestore();

const PHARMPAY_LOGIN_URL = 'http://my.pharmpay.co.kr/pur/login/login.html';
const TIMEOUT = 30000;

// ── HTTP 함수 ──
exports.scrapeAllStores = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
 .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

      // 토큰 검증
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '인증 토큰이 없습니다.' });
        return;
      }
      try {
        await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      } catch (e) {
        res.status(403).json({ error: '토큰 검증 실패: ' + e.message });
        return;
      }

      // 매장 목록 조회
      const storesSnap = await db.collection('stores').get();
      if (storesSnap.empty) {
        res.status(200).json({ message: '등록된 매장 없음', results: [] });
        return;
      }

      const stores = [];
      storesSnap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));

      // 브라우저 실행
      let browser;
      try {
        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        });
      } catch (e) {
        res.status(500).json({ error: '브라우저 실행 실패: ' + e.message });
        return;
      }

      // 매장별 스크래핑
      const results = [];
      for (const store of stores) {
        const result = await scrapeStore(browser, store);
        results.push({ id: store.id, ...result });
        await db.collection('salesData').doc(store.id).set({
          ...result,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await browser.close();
      res.status(200).json({ message: '완료', count: results.length, results });

    });


// ── 스케줄 함수 (매일 9시, 18시) ──
exports.scrapeScheduled = functions
  .region('asia-northeast3')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .pubsub.schedule('0 9,18 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const storesSnap = await db.collection('stores').get();
    if (storesSnap.empty) return;

    const stores = [];
    storesSnap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));

    let browser;
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
      for (const store of stores) {
        const result = await scrapeStore(browser, store);
        await db.collection('salesData').doc(store.id).set({
          ...result,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } finally {
      if (browser) await browser.close();
    }
  });

// ── 단일 매장 스크래핑 ──
async function scrapeStore(browser, store) {
  const page = await browser.newPage();
  try {
    await page.setDefaultNavigationTimeout(TIMEOUT);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
    );

    await page.goto(PHARMPAY_LOGIN_URL, { waitUntil: 'networkidle2' });

    try {
      await page.click('li:first-child a');
      await new Promise(r => setTimeout(r, 500));

    } catch (_) {}

    await page.waitForSelector('input[placeholder="사업자번호"]', { timeout: TIMEOUT });
    await page.type('input[placeholder="사업자번호"]', store.bizNo, { delay: 50 });

    await page.waitForSelector('input[type="password"]', { timeout: TIMEOUT });
    await page.type('input[type="password"]', store.password, { delay: 50 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT }).catch(() => {}),
      page.click('button.btn_login'),
    ]);

  await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      throw new Error('로그인 실패 (아이디/비밀번호 확인 필요)');
    }

    const salesData = await parseSalesData(page);
    return { status: 'ok', storeName: store.name, ...salesData };

  } catch (e) {
    return { status: 'error', storeName: store.name, errorMsg: e.message };
  } finally {
    await page.close();
  }
}

// ── 매출 데이터 파싱 ──
async function parseSalesData(page) {
  return await page.evaluate(() => {
    function parseNum(str) {
      if (!str) return 0;
      return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
    }

    // ── 이번 달 총 매출액 ──
    // 마지막 행의 마지막 셀 .result_total
    const totalEls = document.querySelectorAll('.result_total.div_right');
    const lastTotal = totalEls[totalEls.length - 1];
    const monthTotal = lastTotal ? parseNum(lastTotal.textContent) : 0;

    // ── 오늘 매출액 ──
    const today = new Date().getDate();
    const todayEl = document.querySelector(`.total_${today}`);
    const todayTotal = todayEl ? parseNum(todayEl.textContent) : 0;

    // ── 이번 달 승인금액 / 취소금액 ──
    const approveEls = document.querySelectorAll('.result_approve.div_right');
    const cancelEls  = document.querySelectorAll('.result_cancel.div_right');
    const lastApprove = approveEls[approveEls.length - 1];
    const lastCancel  = cancelEls[cancelEls.length - 1];
    const creditCard = lastApprove ? parseNum(lastApprove.textContent) : null;
    const cash       = lastCancel  ? parseNum(lastCancel.textContent)  : null;

    return { monthTotal, todayTotal };
  });
}