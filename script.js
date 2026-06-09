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

// ────────────────────────────────────────────────
//  DOM 참조
// ────────────────────────────────────────────────
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

// 관리 탭
const fName       = document.getElementById('f-name');
const fBizno      = document.getElementById('f-bizno');
const fPw         = document.getElementById('f-pw');
const saveBtn     = document.getElementById('save-btn');
const cancelBtn   = document.getElementById('cancel-btn');
const formTitle   = document.getElementById('form-title');
const formError   = document.getElementById('form-error');
const formSuccess = document.getElementById('form-success');
const storeList   = document.getElementById('store-list');

// 모달
const modalOverlay = document.getElementById('modal-overlay');
const modalMsg     = document.getElementById('modal-msg');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

// ────────────────────────────────────────────────
//  탭 전환
// ────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// ────────────────────────────────────────────────
//  인증 상태 감지
// ────────────────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) {
    loginScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    initDashboard();
    initManage();
  } else {
    loginScreen.classList.remove('hidden');
    dashScreen.classList.add('hidden');
  }
});

// ────────────────────────────────────────────────
//  로그인 / 로그아웃
// ────────────────────────────────────────────────
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
  return map[code] || '로그인 실패. 다시 시도하세요.';
}

logoutBtn.addEventListener('click', () => auth.signOut());

// ────────────────────────────────────────────────
//  매출 대시보드
// ────────────────────────────────────────────────
let unsubscribe = null;

function initDashboard() {
  const now = new Date();
  periodLabel.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  if (unsubscribe) unsubscribe();

  db.collection('stores').get().then(snap => {
    if (snap.empty) {
      storeGrid.innerHTML = `<p style="color:var(--text-muted);font-size:14px">
        등록된 매장이 없습니다. 매장 관리 탭에서 추가하세요.</p>`;
      storeCountEl.textContent = '0';
      return;
    }

    const stores = [];
    snap.forEach(doc => stores.push({ id: doc.id, ...doc.data() }));
    storeCountEl.textContent = stores.length;
    storeGrid.innerHTML = stores.map(s => skeletonCard(s)).join('');

    unsubscribe = db.collection('salesData').onSnapshot(salesSnap => {
      const salesMap = {};
      salesSnap.forEach(doc => { salesMap[doc.id] = doc.data(); });
      stores.forEach(store => updateStoreCard(store, salesMap[store.id] || null));
      calcSummary(stores, salesMap);
      lastUpdatedEl.textContent = `마지막 갱신: ${timeStr(new Date())}`;
    }, err => showError('실시간 데이터 오류: ' + err.message));

  }).catch(err => showError('매장 목록 로드 실패: ' + err.message));
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.2" style="animation:spin .8s linear infinite">
    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0018.49 15"/>
  </svg> 수집 중...`;
  try {
    const FUNCTION_URL = 'https://asia-northeast3-pdashboard-603ad.cloudfunctions.net/scrapeAllStores';
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + idToken, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    showError('새로고침 요청 실패: ' + e.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.2">
      <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0018.49 15"/>
    </svg> 새로고침`;
  }
});

// ────────────────────────────────────────────────
//  매장 관리 (CRUD)
// ────────────────────────────────────────────────
let editingId = null;  // 수정 중인 문서 ID

function initManage() {
  // 실시간으로 매장 목록 표시
  db.collection('stores').orderBy('name').onSnapshot(snap => {
    if (snap.empty) {
      storeList.innerHTML = `<p style="color:var(--text-muted);font-size:14px">
        등록된 매장이 없습니다. 위에서 추가해 주세요.</p>`;
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
          <span class="store-item-meta">사업자번호: ${esc(d.bizNo)} &nbsp;|&nbsp; 비밀번호: ${'●'.repeat(Math.min(d.password?.length || 4, 8))}</span>
        </div>
        <div class="store-item-btns">
          <button class="btn-edit" data-id="${doc.id}">수정</button>
          <button class="btn-danger" data-id="${doc.id}" data-name="${esc(d.name)}">삭제</button>
        </div>`;

      // 수정 버튼
      item.querySelector('.btn-edit').addEventListener('click', () => {
        editingId = doc.id;
        fName.value  = d.name;
        fBizno.value = d.bizNo;
        fPw.value    = d.password;
        formTitle.textContent = '✏️ 매장 수정';
        saveBtn.textContent   = '수정 저장';
        cancelBtn.classList.remove('hidden');
        formError.textContent   = '';
        formSuccess.textContent = '';
        // 관리 탭으로 스크롤
        document.querySelector('[data-tab="manage"]').click();
        fName.focus();
      });

      // 삭제 버튼
      item.querySelector('.btn-danger').addEventListener('click', () => {
        openDeleteModal(doc.id, d.name);
      });

      storeList.appendChild(item);
    });
  }, err => showError('매장 목록 오류: ' + err.message));
}

// 저장 (추가 / 수정)
saveBtn.addEventListener('click', async () => {
  const name  = fName.value.trim();
  const bizNo = fBizno.value.trim().replace(/-/g, '');
  const pw    = fPw.value.trim();

  formError.textContent   = '';
  formSuccess.textContent = '';

  if (!name)  { formError.textContent = '매장 이름을 입력하세요.'; return; }
  if (!bizNo) { formError.textContent = '사업자번호를 입력하세요.'; return; }
  if (bizNo.length !== 10 || isNaN(bizNo)) {
    formError.textContent = '사업자번호는 숫자 10자리로 입력하세요.'; return;
  }
  if (!pw)    { formError.textContent = '비밀번호를 입력하세요.'; return; }

  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';

  try {
    if (editingId) {
      // 수정
      await db.collection('stores').doc(editingId).update({ name, bizNo, password: pw });
      formSuccess.textContent = `"${name}" 매장 정보가 수정되었습니다.`;
      resetForm();
    } else {
      // 추가
      await db.collection('stores').add({
        name, bizNo, password: pw,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      formSuccess.textContent = `"${name}" 매장이 추가되었습니다.`;
      resetForm();
    }
    // 대시보드도 새로고침
    initDashboard();
  } catch (e) {
    formError.textContent = '저장 실패: ' + e.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = editingId ? '수정 저장' : '저장';
  }
});

// 취소 (수정 모드 해제)
cancelBtn.addEventListener('click', () => resetForm());

function resetForm() {
  editingId = null;
  fName.value  = '';
  fBizno.value = '';
  fPw.value    = '';
  formTitle.textContent = '➕ 매장 추가';
  saveBtn.textContent   = '저장';
  cancelBtn.classList.add('hidden');
  formError.textContent   = '';
}

// ── 삭제 모달 ──
let deleteTargetId = null;

function openDeleteModal(id, name) {
  deleteTargetId = id;
  modalMsg.textContent = `"${name}" 매장을 삭제하면 복구할 수 없습니다. 정말 삭제하시겠습니까?`;
  modalOverlay.classList.remove('hidden');
}

modalCancel.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
  deleteTargetId = null;
});

modalConfirm.addEventListener('click', async () => {
  if (!deleteTargetId) return;
  try {
    await db.collection('stores').doc(deleteTargetId).delete();
    // salesData도 함께 삭제
    await db.collection('salesData').doc(deleteTargetId).delete().catch(() => {});
    modalOverlay.classList.add('hidden');
    deleteTargetId = null;
    initDashboard();
  } catch (e) {
    showError('삭제 실패: ' + e.message);
    modalOverlay.classList.add('hidden');
  }
});

// 모달 바깥 클릭 시 닫기
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) {
    modalOverlay.classList.add('hidden');
    deleteTargetId = null;
  }
});

// ────────────────────────────────────────────────
//  카드 렌더링
// ────────────────────────────────────────────────
function skeletonCard(store) {
  return `
    <div class="store-card status-loading" id="card-${store.id}">
      <div class="store-name">${esc(store.name || store.id)}
        <span class="store-badge loading">대기 중</span>
      </div>
      <p style="color:var(--text-muted);font-size:13px;margin-top:8px">
        새로고침 버튼을 눌러 데이터를 수집하세요.</p>
    </div>`;
}

function updateStoreCard(store, data) {
  const el = document.getElementById(`card-${store.id}`);
  if (!el) return;

  if (!data) {
    el.className = 'store-card status-loading';
    el.innerHTML = `
      <div class="store-name">${esc(store.name || store.id)}
        <span class="store-badge loading">대기 중</span>
      </div>
      <p style="color:var(--text-muted);font-size:13px;margin-top:8px">
        새로고침 버튼을 눌러 데이터를 수집하세요.</p>`;
    return;
  }

  if (data.status === 'error') {
    el.className = 'store-card status-error';
    el.innerHTML = `
      <div class="store-name">${esc(store.name || store.id)}
        <span class="store-badge err">오류</span>
      </div>
      <p class="store-error-msg">⚠ ${esc(data.errorMsg || '데이터 수집 실패')}</p>
      <p class="store-updated">${updatedStr(data.updatedAt)}</p>`;
    return;
  }

  el.className = 'store-card status-ok';
  el.innerHTML = `
    <div class="store-name">${esc(store.name || store.id)}
      <span class="store-badge ok">정상</span>
    </div>
    <div class="store-rows">
      <div class="store-row">
        <span class="store-row-label">이번 달 매출</span>
        <span class="store-row-value highlight">${fmt(data.monthTotal)}</span>
      </div>
      <hr class="store-divider" />
      <div class="store-row">
        <span class="store-row-label">오늘 매출</span>
        <span class="store-row-value today-val">${fmt(data.todayTotal)}</span>
      </div>
      ${data.creditCard != null ? `
      <div class="store-row">
        <span class="store-row-label">신용카드</span>
        <span class="store-row-value">${fmt(data.creditCard)}</span>
      </div>` : ''}
      ${data.cash != null ? `
      <div class="store-row">
        <span class="store-row-label">현금수납</span>
        <span class="store-row-value">${fmt(data.cash)}</span>
      </div>` : ''}
    </div>
    <p class="store-updated">${updatedStr(data.updatedAt)}</p>`;
}

// ────────────────────────────────────────────────
//  요약 계산
// ────────────────────────────────────────────────
function calcSummary(stores, salesMap) {
  let totalMonth = 0, totalToday = 0;
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

// ────────────────────────────────────────────────
//  유틸
// ────────────────────────────────────────────────
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
  return `갱신: ${d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit' })}`;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
  setTimeout(() => errorBanner.classList.add('hidden'), 6000);
}

const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);