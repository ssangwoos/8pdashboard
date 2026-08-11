// ════════════════════════════════════════════════
//  Pharmpay 매출 대시보드 — script.js
// ════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyByAn44EGH-7YtISQwDtj4EZy8aWNyPJps",
  authDomain: "pdashboard-603ad.firebaseapp.com",
  projectId: "pdashboard-603ad",
  storageBucket: "pdashboard-603ad.firebasestorage.app",
  messagingSenderId: "734706245790",
  appId: "1:734706245790:web:45ac672dd1781a79205b8f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

const FUNCTION_URL = 'https://asia-northeast3-pdashboard-603ad.cloudfunctions.net/scrapeAllStores';

// ── 애월점 Firebase (별도 프로젝트) ──
const firebaseConfigAewol = {
  apiKey: "AIzaSyACOqns4PnakUaowOC107czAkNUsvvVhLA",
  authDomain: "ledger-aewol.firebaseapp.com",
  projectId: "ledger-aewol",
  storageBucket: "ledger-aewol.firebasestorage.app",
  messagingSenderId: "1085469734295",
  appId: "1:1085469734295:web:0dbdfd0d675321686300d2"
};
const aewolApp = firebase.initializeApp(firebaseConfigAewol, "aewol");
const dbAewol  = firebase.firestore(aewolApp);

// 애월점 데이터 상태
let aewolMonthTotal = 0;
let aewolTodayTotal = 0;
let aewolUpdatedAt  = null;

// ── DOM ──
const loginScreen   = document.getElementById('login-screen');
const dashScreen    = document.getElementById('dashboard-screen');
const loginEmail    = document.getElementById('login-email');
const loginPw       = document.getElementById('login-pw');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');
const logoutBtn     = document.getElementById('logout-btn');
const refreshBtn    = document.getElementById('refresh-btn');
const storeGrid     = document.getElementById('store-grid');
const totalSalesEl  = document.getElementById('total-sales');
const todaySalesEl  = document.getElementById('today-sales');
const storeCountEl  = document.getElementById('store-count');
const lastUpdatedEl = document.getElementById('last-updated');
const periodLabel   = document.getElementById('period-label');
const errorBanner   = document.getElementById('error-banner');
const errorText     = document.getElementById('error-text');
const fName         = document.getElementById('f-name');
const fBizno        = document.getElementById('f-bizno');
const fPw           = document.getElementById('f-pw');
const saveBtn       = document.getElementById('save-btn');
const cancelBtn     = document.getElementById('cancel-btn');
const formTitle     = document.getElementById('form-title');
const formError     = document.getElementById('form-error');
const formSuccess   = document.getElementById('form-success');
const storeList     = document.getElementById('store-list');
const modalOverlay  = document.getElementById('modal-overlay');
const modalMsg      = document.getElementById('modal-msg');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const historyDate   = document.getElementById('history-date');
const historyGrid   = document.getElementById('history-grid');
const compareMonth  = document.getElementById('compare-month');
const compareGrid   = document.getElementById('compare-grid');

// ── 탭 전환 ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// ── 인증 ──
auth.onAuthStateChanged(user => {
  if (user) {
    loginScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    initDashboard();
    initManage();
    initHistory();
    initCompare();
  } else {
    loginScreen.classList.remove('hidden');
    dashScreen.classList.add('hidden');
  }
});

// ── 로그인 ──
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const pw    = loginPw.value.trim();
  loginError.textContent = '';
  if (!email || !pw) { loginError.textContent = '이메일과 비밀번호를 입력하세요.'; return; }
  loginBtn.disabled = true;
  loginBtn.textContent = '로그인 중...';
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    loginError.textContent = loginErrMsg(e.code);
    loginBtn.disabled = false;
    loginBtn.textContent = '로그인';
  }
});
[loginEmail, loginPw].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); })
);
function loginErrMsg(code) {
  const map = {
    'auth/user-not-found':   '등록되지 않은 계정입니다.',
    'auth/wrong-password':   '비밀번호가 틀렸습니다.',
    'auth/invalid-email':    '이메일 형식이 올바르지 않습니다.',
    'auth/too-many-requests':'잠시 후 다시 시도하세요.',
  };
  return map[code] || '로그인 실패.';
}
logoutBtn.addEventListener('click', () => auth.signOut());

// ════════════════════════════════════════════════
//  탭1 — 매출 현황
// ════════════════════════════════════════════════
let unsubscribe = null;

function initDashboard() {
  const now = new Date();
  periodLabel.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  if (unsubscribe) unsubscribe();

  db.collection('stores').get().then(snap => {
    const stores = [];
    if (!snap.empty) snap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));

    // 애월점 포함한 총 매장 수 (stores + 애월점 1개)
    storeCountEl.textContent = stores.length + 1;

    // 기존 매장 스켈레톤 + 애월점 스켈레톤
    storeGrid.innerHTML = stores.map(s => skeletonCard(s)).join('') +
      `<div class="store-card status-loading" id="card-aewol">
        <div class="store-name">애월점<span class="store-badge loading">로딩 중</span></div>
        <div class="skeleton skel-line wide"></div>
        <div class="skeleton skel-line narrow"></div>
      </div>`;

    // 기존 매장 실시간 구독
    if (stores.length > 0) {
      unsubscribe = db.collection('salesData').onSnapshot(salesSnap => {
        const salesMap = {};
        salesSnap.forEach(doc => { salesMap[doc.id] = doc.data(); });
        stores.forEach(store => updateStoreCard(store, salesMap[store.id] || null));
        calcSummaryWithAewol(stores, salesMap);
        lastUpdatedEl.textContent = `갱신: ${timeStr(new Date())}`;
      }, err => showError('데이터 오류: ' + err.message));
    }

    // 애월점 — 오늘 매출 (today_sales 최신 문서)
    dbAewol.collection('today_sales')
      .orderBy('crawledAt', 'desc')
      .limit(1)
      .onSnapshot(snap => {
        if (!snap.empty) {
          const d = snap.docs[0].data();
          aewolTodayTotal = d.todayTotal || 0;
          aewolUpdatedAt  = d.crawledAt;
        }
        updateAewolCard();
        calcSummaryWithAewol(stores, getCurrentSalesMap());
      }, err => console.error('애월점 오늘 매출 오류:', err));

    // 애월점 — 이번 달 월 매출 (dashboard_sales 합산)
    const now2 = new Date();
    const ym = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`;
    dbAewol.collection('dashboard_sales')
      .onSnapshot(snap => {
        let monthTotal = 0;
        snap.forEach(doc => {
          const d = doc.data();
          if (d.date && d.date.startsWith(ym)) {
            monthTotal += d.realPaymentTotal || 0;
          }
        });
        aewolMonthTotal = monthTotal;
        updateAewolCard();
        calcSummaryWithAewol(stores, getCurrentSalesMap());
      }, err => console.error('애월점 월 매출 오류:', err));

  }).catch(err => showError('매장 로드 실패: ' + err.message));
}

// 현재 salesMap 캐시 (calcSummary에서 사용)
let _currentSalesMap = {};
function getCurrentSalesMap() { return _currentSalesMap; }

// 애월점 카드 업데이트
function updateAewolCard() {
  const el = document.getElementById('card-aewol');
  if (!el) return;
  el.className = 'store-card status-ok';
  el.innerHTML = `
    <div class="store-name">애월점<span class="store-badge ok">정상</span></div>
    <div class="store-rows">
      <div class="store-row">
        <span class="store-row-label">이번 달 매출</span>
        <span class="store-row-value highlight">${fmt(aewolMonthTotal)}</span>
      </div>
      <hr class="store-divider"/>
      <div class="store-row">
        <span class="store-row-label">오늘 매출</span>
        <span class="store-row-value today-val">${fmt(aewolTodayTotal)}</span>
      </div>
    </div>
    <p class="store-updated">${aewolUpdatedAt ? updatedStr(aewolUpdatedAt) : ''}</p>`;
}

// 애월점 포함 요약 계산
function calcSummaryWithAewol(stores, salesMap) {
  _currentSalesMap = salesMap;
  let totalMonth = aewolMonthTotal;
  let totalToday = aewolTodayTotal;
  stores.forEach(s => {
    const d = salesMap[s.id];
    if (d && d.status !== 'error') {
      totalMonth += d.monthTotal || 0;
      totalToday += d.todayTotal || 0;
    }
  });
  totalSalesEl.textContent = fmt(totalMonth);
  todaySalesEl.textContent = fmt(totalToday);
}

// 새로고침
refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" style="animation:spin .8s linear infinite">
    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0018.49 15"/>
  </svg><span class="btn-label"> 수집 중...</span>`;
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + idToken, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    showError('새로고침 실패: ' + e.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5">
      <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0018.49 15"/>
    </svg><span class="btn-label"> 새로고침</span>`;
  }
});

// ════════════════════════════════════════════════
//  탭2 — 일별 히스토리
// ════════════════════════════════════════════════
function initHistory() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('history-month').value = monthStr;
  loadHistory(monthStr);
  document.getElementById('history-month').addEventListener('change', e => {
    loadHistory(e.target.value);
  });
}

async function loadHistory(monthStr) {
  historyGrid.innerHTML = `<p style="color:var(--text-muted);font-size:14px;padding:8px">로딩 중...</p>`;

  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const storesSnap = await db.collection('stores').get();
  if (storesSnap.empty) {
    historyGrid.innerHTML = `<p style="color:var(--text-muted);font-size:14px">등록된 매장이 없습니다.</p>`;
    return;
  }

  const stores = [];
  storesSnap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));

  // 모든 매장의 해당 월 일별 데이터 로드
  const allData = await Promise.all(stores.map(async store => {
    const daily = {};
    await Promise.all(
      Array.from({ length: daysInMonth }, (_, i) => i + 1).map(async d => {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const snap = await db.collection('salesHistory').doc(store.id)
          .collection('daily').doc(dateStr).get();
        if (snap.exists) daily[d] = snap.data().todayTotal || 0;
      })
    );
    return { store, daily };
  }));

  const colors = ['#4f8ef7', '#6ee7b7', '#fbbf24', '#f87171', '#a78bfa'];

  // 달력 HTML 생성
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const firstDay = new Date(year, month - 1, 1).getDay();

  let html = `
    <div class="cal-wrap">
      <div class="cal-header">
        <span class="cal-title">${year}년 ${month}월</span>
        <div class="cal-legend">
          ${stores.map((s, i) => `
            <span class="cal-legend-item">
              <span class="cal-dot" style="background:${colors[i % colors.length]}"></span>
              ${esc(s.name)}
            </span>`).join('')}
        </div>
      </div>
      <div class="cal-grid">
        ${dayNames.map((d, i) => `
          <div class="cal-dayname ${i===0?'sun':i===6?'sat':''}">${d}</div>`).join('')}`;

  // 빈 칸 채우기
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  // 날짜별 칸
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDay + d - 1) % 7;
    const isToday = (new Date().getDate() === d &&
      new Date().getMonth() + 1 === month &&
      new Date().getFullYear() === year);

    html += `<div class="cal-cell ${dow===0?'sun':dow===6?'sat':''} ${isToday?'today':''}">
      <div class="cal-date">${d}</div>`;

    allData.forEach((sd, i) => {
      const amt = sd.daily[d];
      if (amt != null && amt > 0) {
        html += `<div class="cal-amount" style="color:${colors[i % colors.length]}">
          ${Number(amt).toLocaleString('ko-KR')}
        </div>`;
      } else {
        html += `<div class="cal-amount empty-amt">-</div>`;
      }
    });

    html += `</div>`;
  }

  html += `</div></div>`;
  historyGrid.innerHTML = html;
}

// ════════════════════════════════════════════════
//  탭3 — 월별 비교
// ════════════════════════════════════════════════
let compareChart = null;

function initCompare() {
  const now = new Date();
  compareMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  loadCompare(compareMonth.value);
  compareMonth.addEventListener('change', () => loadCompare(compareMonth.value));
}

async function loadCompare(monthStr) {
  compareGrid.innerHTML = `<p style="color:var(--text-muted);font-size:14px;padding:8px">로딩 중...</p>`;

  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const storesSnap = await db.collection('stores').get();
  if (storesSnap.empty) return;

  const stores = [];
  storesSnap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));

  const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const storeData = await Promise.all(stores.map(async store => {
    const dailyData = await Promise.all(dates.map(async d => {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const snap = await db.collection('salesHistory').doc(store.id)
        .collection('daily').doc(dateStr).get();
      return snap.exists ? (snap.data().todayTotal || 0) : 0;
    }));
    return { store, dailyData, total: dailyData.reduce((a, b) => a + b, 0) };
  }));

  // 선 그래프
  const ctx = document.getElementById('compare-chart').getContext('2d');
  if (compareChart) compareChart.destroy();

  const colors = ['#4f8ef7', '#6ee7b7', '#fbbf24', '#f87171', '#a78bfa'];

  compareChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => `${d}일`),
      datasets: storeData.map((sd, i) => ({
        label: sd.store.name,
        data: sd.dailyData,
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '22',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
      }))
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e8eaf6', font: { size: 12 }, boxWidth: 16 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('ko-KR')}원`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#7b88b0', font: { size: 11 } },
          grid: { color: '#2a3050' }
        },
        y: {
          ticks: {
            color: '#7b88b0',
            callback: v => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v.toLocaleString()
          },
          grid: { color: '#2a3050' }
        }
      }
    }
  });

  // 매장별 월 합계 카드
  compareGrid.innerHTML = '';
  storeData.forEach((sd, i) => {
    const activeDays = sd.dailyData.filter(v => v > 0).length;
    const avg = activeDays > 0 ? Math.round(sd.total / activeDays) : 0;
    const card = document.createElement('div');
    card.className = 'store-card status-ok';
    card.innerHTML = `
      <div class="store-name" style="color:${colors[i % colors.length]}">${esc(sd.store.name)}</div>
      <div class="store-rows">
        <div class="store-row">
          <span class="store-row-label">${monthStr} 총 매출</span>
          <span class="store-row-value highlight" style="color:${colors[i % colors.length]}">${fmt(sd.total)}</span>
        </div>
        <div class="store-row">
          <span class="store-row-label">일 평균</span>
          <span class="store-row-value">${fmt(avg)}</span>
        </div>
        <div class="store-row">
          <span class="store-row-label">영업일</span>
          <span class="store-row-value">${activeDays}일</span>
        </div>
      </div>`;
    compareGrid.appendChild(card);
  });
}

// ════════════════════════════════════════════════
//  탭4 — 매장 관리
// ════════════════════════════════════════════════
let editingId = null;

function initManage() {
  db.collection('stores').orderBy('name').onSnapshot(snap => {
    if (snap.empty) {
      storeList.innerHTML = `<p style="color:var(--text-muted);font-size:14px">등록된 매장이 없습니다.</p>`;
      return;
    }
    storeList.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const item = document.createElement('div');
      item.className = 'store-item';
      item.innerHTML = `
        <div class="store-item-info">
          <span class="store-item-name">${esc(d.name)}</span>
          <span class="store-item-meta">사업자번호: ${esc(d.bizNo)}</span>
        </div>
        <div class="store-item-btns">
          <button class="btn-edit" data-id="${doc.id}">수정</button>
          <button class="btn-danger" data-id="${doc.id}" data-name="${esc(d.name)}">삭제</button>
        </div>`;
      item.querySelector('.btn-edit').addEventListener('click', () => {
        editingId = doc.id;
        fName.value  = d.name;
        fBizno.value = d.bizNo;
        fPw.value    = d.password;
        formTitle.textContent = '✏️ 매장 수정';
        saveBtn.textContent   = '수정 저장';
        cancelBtn.classList.remove('hidden');
        formError.textContent = formSuccess.textContent = '';
        document.querySelector('[data-tab="manage"]').click();
        fName.focus();
      });
      item.querySelector('.btn-danger').addEventListener('click', () => openDeleteModal(doc.id, d.name));
      storeList.appendChild(item);
    });
  });
}

saveBtn.addEventListener('click', async () => {
  const name  = fName.value.trim();
  const bizNo = fBizno.value.trim().replace(/-/g, '');
  const pw    = fPw.value.trim();
  formError.textContent = formSuccess.textContent = '';

  if (!name)  { formError.textContent = '매장 이름을 입력하세요.'; return; }
  if (!bizNo || bizNo.length !== 10 || isNaN(bizNo)) {
    formError.textContent = '사업자번호는 숫자 10자리로 입력하세요.'; return;
  }
  if (!pw) { formError.textContent = '비밀번호를 입력하세요.'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';
  try {
    if (editingId) {
      await db.collection('stores').doc(editingId).update({ name, bizNo, password: pw });
      formSuccess.textContent = `"${name}" 수정 완료!`;
    } else {
      await db.collection('stores').add({ name, bizNo, password: pw, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      formSuccess.textContent = `"${name}" 추가 완료!`;
    }
    resetForm();
    initDashboard();
  } catch (e) {
    formError.textContent = '저장 실패: ' + e.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = editingId ? '수정 저장' : '저장';
  }
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  editingId = null;
  fName.value = fBizno.value = fPw.value = '';
  formTitle.textContent = '➕ 매장 추가';
  saveBtn.textContent   = '저장';
  cancelBtn.classList.add('hidden');
  formError.textContent = formSuccess.textContent = '';
}

let deleteTargetId = null;
function openDeleteModal(id, name) {
  deleteTargetId = id;
  modalMsg.textContent = `"${name}" 매장을 삭제하면 복구할 수 없습니다. 정말 삭제하시겠습니까?`;
  modalOverlay.classList.remove('hidden');
}
modalCancel.addEventListener('click', () => { modalOverlay.classList.add('hidden'); deleteTargetId = null; });
modalConfirm.addEventListener('click', async () => {
  if (!deleteTargetId) return;
  try {
    await db.collection('stores').doc(deleteTargetId).delete();
    await db.collection('salesData').doc(deleteTargetId).delete().catch(() => {});
    modalOverlay.classList.add('hidden');
    deleteTargetId = null;
    initDashboard();
  } catch (e) {
    showError('삭제 실패: ' + e.message);
    modalOverlay.classList.add('hidden');
  }
});
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) { modalOverlay.classList.add('hidden'); deleteTargetId = null; }
});

// ════════════════════════════════════════════════
//  카드 렌더링
// ════════════════════════════════════════════════
function skeletonCard(store) {
  return `<div class="store-card status-loading" id="card-${store.id}">
    <div class="store-name">${esc(store.name)}<span class="store-badge loading">대기 중</span></div>
    <div class="skeleton skel-line wide"></div>
    <div class="skeleton skel-line narrow"></div>
  </div>`;
}

function updateStoreCard(store, data) {
  const el = document.getElementById(`card-${store.id}`);
  if (!el) return;
  if (!data) {
    el.className = 'store-card status-loading';
    el.innerHTML = `<div class="store-name">${esc(store.name)}<span class="store-badge loading">대기 중</span></div>
      <p style="color:var(--text-muted);font-size:13px;margin-top:8px">새로고침 버튼을 눌러 데이터를 수집하세요.</p>`;
    return;
  }
  if (data.status === 'error') {
    el.className = 'store-card status-error';
    el.innerHTML = `<div class="store-name">${esc(store.name)}<span class="store-badge err">오류</span></div>
      <p class="store-error-msg">⚠ ${esc(data.errorMsg || '수집 실패')}</p>
      <p class="store-updated">${updatedStr(data.updatedAt)}</p>`;
    return;
  }
  el.className = 'store-card status-ok';
  el.innerHTML = `
    <div class="store-name">${esc(store.name)}<span class="store-badge ok">정상</span></div>
    <div class="store-rows">
      <div class="store-row">
        <span class="store-row-label">이번 달 매출</span>
        <span class="store-row-value highlight">${fmt(data.monthTotal)}</span>
      </div>
      <hr class="store-divider"/>
      <div class="store-row">
        <span class="store-row-label">오늘 매출</span>
        <span class="store-row-value today-val">${fmt(data.todayTotal)}</span>
      </div>
    </div>
    <p class="store-updated">${updatedStr(data.updatedAt)}</p>`;
}

function calcSummary(stores, salesMap) {
  calcSummaryWithAewol(stores, salesMap);
}

// ── 유틸 ──
function fmt(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('ko-KR') + '원';
}
function timeStr(d) {
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function updatedStr(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `갱신: ${d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
  setTimeout(() => errorBanner.classList.add('hidden'), 6000);
}
