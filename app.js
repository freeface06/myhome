/**
 * 전세집 체크리스트 앱 - 핵심 로직
 * localStorage 기반 데이터 저장, SPA 뷰 전환, 체크리스트/사진/점수 관리
 */

// ========================================
// 상수 및 전역 상태
// ========================================
const STORAGE_KEY = 'myhome_houses';
const SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const CIRCUMFERENCE = 2 * Math.PI * 36; // 원형 프로그레스바 둘레

let appState = {
  houses: [],
  currentHouseId: null,
  currentTab: 'visit',     // 'visit' 또는 'contract'
  defaultChecklist: null,   // data.json에서 로드
  deleteTargetId: null
};

// ========================================
// 데이터 관리 (localStorage)
// ========================================

/** localStorage에서 집 목록 로드 */
function loadHouses() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('데이터 로드 실패:', e);
    return [];
  }
}

/** localStorage에 집 목록 저장 */
function saveHouses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.houses));
  } catch (e) {
    console.error('데이터 저장 실패:', e);
    showToast('⚠️ 저장 용량 초과! 사진을 줄여주세요.');
  }
}

/**
 * 기본 체크리스트 폴백 데이터
 * file:/// 프로토콜에서 fetch CORS 제한으로 data.json 로드 실패 시 사용
 */
const DEFAULT_CHECKLIST_DATA = {
  visit: {
    label: '🏠 방문 체크리스트',
    categories: [
      { name: '보안/안전', icon: '🔒', items: ['현관 이중잠금장치','CCTV 설치 여부','경비실/관리실 유무','현관 도어록 상태','소화기/화재경보기','저층 방범창 설치 여부'] },
      { name: '수압/배관', icon: '🚿', items: ['수압 상태 (싱크대/샤워기 동시 틀기)','온수 나오는 시간','배수구 물빠짐 상태','보일러 작동 상태','수도 계량기 누수 확인'] },
      { name: '채광/환기', icon: '☀️', items: ['남향 여부 (햇빛 방향)','창문 크기 및 개수','환기 상태 (맞통풍)','베란다 유무','조명 밝기 상태'] },
      { name: '곰팡이/누수', icon: '💧', items: ['벽면 곰팡이 흔적','천장 누수 자국','화장실 실리콘 상태','창문 주변 결로 흔적','장판/벽지 들뜸 여부','새 도배 뒤 곰팡이 은폐 여부'] },
      { name: '소음', icon: '🔇', items: ['층간소음 확인','도로 교통소음','엘리베이터 소음','주변 공사/상가 소음','방음 상태'] },
      { name: '옵션/가전', icon: '🔌', items: ['에어컨 작동 상태','세탁기 작동 상태','냉장고 작동 상태','가스레인지/인덕션 작동 상태','옵션 수리 필요 여부 확인'] },
      { name: '교통', icon: '🚇', items: ['지하철역 도보 거리','버스정류장 접근성','주차 가능 여부 (공간 넉넉한지)','자전거 보관소','택시 접근성'] },
      { name: '주변환경', icon: '🏪', items: ['편의점/마트 거리','병원/약국 접근성','공원/산책로 유무','학교/학원가','음식점/카페 밀집'] },
      { name: '건물상태', icon: '🏢', items: ['엘리베이터 유무/상태','복도/계단 청결도','건물 연식 확인','쓰레기 분리수거장','택배 보관함 유무'] },
      { name: '관리비', icon: '💰', items: ['월 관리비 금액 확인','관리비 포함 항목 (수도/인터넷/TV/청소비 등)','별도 납부 항목 확인 (전기/가스 등)'] }
    ]
  },
  contract: {
    label: '📋 계약 체크리스트',
    categories: [
      { name: '서류 확인', icon: '📄', items: ['등기부등본 갑구 (소유자 확인, 가압류/가처분/경매 여부)','등기부등본 을구 (근저당권/대출 금액 확인)','건축물대장 확인 (불법건축물/무단증축 여부)','토지이용계획 확인','집주인 신분증 대조 (등기부 소유자와 일치 여부)'] },
      { name: '임대인 확인', icon: '👤', items: ['대리인 계약 시 위임장/인감증명서 확인','대리인 시 집주인과 직접 통화 확인','국세/지방세 완납증명서 징구','임대인 세금 체납 여부 확인'] },
      { name: '전세 안전', icon: '🛡️', items: ['전세보증보험 가입 가능 여부 (HUG/SGI/HF)','근저당+보증금 합계 < 시세 70~80% 확인','전세가율 확인 (깡통전세 위험)','확정일자 부여 가능 여부'] },
      { name: '특약사항', icon: '✍️', items: ['전세자금대출 불가 시 계약 무효 및 계약금 반환 특약','계약~잔금까지 추가 근저당 설정 금지 특약','입주 전 하자 수리 임대인 부담 특약','기타 특약사항 협의 및 기재'] },
      { name: '계약 조건', icon: '📝', items: ['계약 기간 확인 (2년 이상)','중개수수료 확인','잔금일/입주일 확인','원상복구 범위 협의'] },
      { name: '입주 전 확인', icon: '🔑', items: ['전입신고 (잔금 당일 즉시)','확정일자 받기 (정부24/주민센터)','관리비 항목 및 금액 확인','공과금 정산 확인 (전기/가스/수도)','열쇠/도어락 비밀번호 변경','하자 보수 요청사항 정리'] }
    ]
  }
};

/** data.json에서 기본 체크리스트 템플릿 로드 (로드 실패 시 내장 폴백 사용) */
async function loadDefaultChecklist() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    appState.defaultChecklist = await res.json();
  } catch (e) {
    console.warn('data.json 로드 실패 (폴백 데이터 사용):', e.message);
    appState.defaultChecklist = DEFAULT_CHECKLIST_DATA;
  }
}

/** 새 집 데이터 객체 생성 */
function createHouse() {
  const template = appState.defaultChecklist;
  const now = new Date();

  // 체크리스트 항목 생성 (각 항목에 고유 ID 부여)
  const buildChecklist = (type) => {
    const src = template[type];
    return {
      label: src.label,
      categories: src.categories.map(cat => ({
        name: cat.name,
        icon: cat.icon,
        collapsed: false,
        items: cat.items.map(text => ({
          id: generateId(),
          text,
          checked: false
        }))
      }))
    };
  };

  return {
    id: generateId(),
    title: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    memo: '',
    photos: [],
    visit: buildChecklist('visit'),
    contract: buildChecklist('contract')
  };
}

/** 간단한 고유 ID 생성 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/** 현재 보고 있는 집 찾기 */
function getCurrentHouse() {
  return appState.houses.find(h => h.id === appState.currentHouseId);
}

// ========================================
// 점수 계산
// ========================================

/** 특정 체크리스트 타입의 점수 계산 */
function calcScore(house, type) {
  const checklist = house[type];
  let total = 0, checked = 0;
  checklist.categories.forEach(cat => {
    cat.items.forEach(item => {
      total++;
      if (item.checked) checked++;
    });
  });
  return total === 0 ? 0 : Math.round((checked / total) * 100);
}

/** 종합 점수: 방문(70%) + 계약(30%) 가중 평균 */
function calcTotalScore(house) {
  const visitScore = calcScore(house, 'visit');
  const contractScore = calcScore(house, 'contract');
  const visitTotal = house.visit.categories.reduce((s, c) => s + c.items.length, 0);
  const contractTotal = house.contract.categories.reduce((s, c) => s + c.items.length, 0);

  // 항목이 없으면 0점
  if (visitTotal + contractTotal === 0) return 0;

  // 한쪽만 항목이 있으면 해당 점수만 반환
  if (contractTotal === 0) return visitScore;
  if (visitTotal === 0) return contractScore;

  return Math.round(visitScore * 0.7 + contractScore * 0.3);
}

/** 점수에 따른 등급 */
function getScoreClass(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

// ========================================
// 뷰 전환
// ========================================

function showListView() {
  appState.currentHouseId = null;
  document.getElementById('listView').classList.add('active');
  document.getElementById('detailView').classList.remove('active');
  document.getElementById('fabBtn').classList.remove('hidden');
  renderHeader('list');
  renderHouseList();
}

function showDetailView(houseId) {
  appState.currentHouseId = houseId;
  appState.currentTab = 'visit';
  document.getElementById('listView').classList.remove('active');
  document.getElementById('detailView').classList.add('active');
  document.getElementById('fabBtn').classList.add('hidden');
  renderHeader('detail');
  renderDetailView();
}

// ========================================
// 렌더링: 헤더
// ========================================

function renderHeader(view) {
  const el = document.getElementById('headerContent');
  if (view === 'list') {
    el.innerHTML = `
      <div class="header-title">
        <span class="logo">🏠</span>
        <h1>전세집 체크리스트</h1>
      </div>
      <span style="font-size:0.8rem;color:var(--text-muted)">${appState.houses.length}건</span>
    `;
  } else {
    el.innerHTML = `
      <button class="header-back" id="backBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        목록
      </button>
      <span style="font-size:0.8rem;color:var(--text-muted)">상세보기</span>
    `;
    document.getElementById('backBtn').addEventListener('click', showListView);
  }
}

// ========================================
// 렌더링: 집 목록
// ========================================

function renderHouseList() {
  const container = document.getElementById('houseList');

  if (appState.houses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏡</div>
        <h3>아직 등록된 집이 없어요</h3>
        <p>하단의 + 버튼을 눌러<br>방문할 전세집을 추가해보세요!</p>
      </div>
    `;
    return;
  }

  // 점수 높은 순 정렬
  const sorted = [...appState.houses].sort((a, b) => calcTotalScore(b) - calcTotalScore(a));

  container.innerHTML = sorted.map(house => {
    const score = calcTotalScore(house);
    const scoreClass = getScoreClass(score);
    const visitChecked = countChecked(house, 'visit');
    const contractChecked = countChecked(house, 'contract');
    const photoCount = house.photos.length;
    const date = new Date(house.createdAt).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
    const title = house.title || '이름 없는 집';

    return `
      <div class="house-card" data-id="${house.id}">
        <div class="house-card-header">
          <div class="house-card-info">
            <h3>${escapeHtml(title)}</h3>
            <div class="house-card-date">${date}</div>
          </div>
          <div class="score-badge ${scoreClass}">${score}</div>
        </div>
        <div class="house-card-stats">
          <span>🏠 방문 ${visitChecked.checked}/${visitChecked.total}</span>
          <span>📋 계약 ${contractChecked.checked}/${contractChecked.total}</span>
          <span>📷 ${photoCount}장</span>
        </div>
      </div>
    `;
  }).join('');

  // 카드 클릭 이벤트
  container.querySelectorAll('.house-card').forEach(card => {
    card.addEventListener('click', () => showDetailView(card.dataset.id));
  });
}

/** 체크된 항목 수 카운트 */
function countChecked(house, type) {
  let total = 0, checked = 0;
  house[type].categories.forEach(cat => {
    cat.items.forEach(item => {
      total++;
      if (item.checked) checked++;
    });
  });
  return { total, checked };
}

// ========================================
// 렌더링: 상세 화면
// ========================================

function renderDetailView() {
  const house = getCurrentHouse();
  if (!house) return showListView();

  const container = document.getElementById('detailContainer');
  const score = calcTotalScore(house);
  const visitScore = calcScore(house, 'visit');
  const contractScore = calcScore(house, 'contract');
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

  container.innerHTML = `
    <!-- 제목 -->
    <div class="title-section">
      <div class="title-input-wrapper">
        <input type="text" class="title-input" id="titleInput" 
               value="${escapeHtml(house.title)}" 
               placeholder="집 이름을 입력하세요 (예: 역삼역 5분 투룸)">
      </div>
    </div>

    <!-- 종합 점수 -->
    <div class="score-section">
      <div class="circle-progress">
        <svg viewBox="0 0 80 80">
          <circle class="bg" cx="40" cy="40" r="36"/>
          <circle class="progress" cx="40" cy="40" r="36"
                  stroke-dasharray="${CIRCUMFERENCE}"
                  stroke-dashoffset="${offset}"/>
        </svg>
        <div class="score-text" style="color:${score >= 70 ? '#06d6a0' : score >= 40 ? '#f59e0b' : '#ef4444'}">${score}</div>
      </div>
      <div class="score-details">
        <h3>종합 점수</h3>
        <p>🏠 방문: ${visitScore}점 · 📋 계약: ${contractScore}점</p>
      </div>
    </div>

    <!-- 체크리스트 탭 -->
    <div class="checklist-tabs">
      <button class="checklist-tab ${appState.currentTab === 'visit' ? 'active' : ''}" data-tab="visit">🏠 방문</button>
      <button class="checklist-tab ${appState.currentTab === 'contract' ? 'active' : ''}" data-tab="contract">📋 계약</button>
    </div>

    <!-- 방문 체크리스트 -->
    <div class="tab-content ${appState.currentTab === 'visit' ? 'active' : ''}" id="tabVisit">
      <div class="checklist-section">
        ${renderCategories(house, 'visit')}
      </div>
      <div class="add-category-section">
        <button class="add-category-btn" id="addCategoryVisitBtn">＋ 카테고리 추가</button>
        <div class="add-category-form" id="addCategoryVisitForm">
          <div class="form-row">
            <input type="text" class="emoji-input" id="newCatVisitIcon" placeholder="🔍" maxlength="2">
            <input type="text" id="newCatVisitName" placeholder="카테고리 이름">
          </div>
          <div class="form-row form-actions">
            <button class="form-cancel-btn" id="cancelCatVisit">취소</button>
            <button class="form-save-btn" id="saveCatVisit">추가</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 계약 체크리스트 -->
    <div class="tab-content ${appState.currentTab === 'contract' ? 'active' : ''}" id="tabContract">
      <div class="checklist-section">
        ${renderCategories(house, 'contract')}
      </div>
      <div class="add-category-section">
        <button class="add-category-btn" id="addCategoryContractBtn">＋ 카테고리 추가</button>
        <div class="add-category-form" id="addCategoryContractForm">
          <div class="form-row">
            <input type="text" class="emoji-input" id="newCatContractIcon" placeholder="🔍" maxlength="2">
            <input type="text" id="newCatContractName" placeholder="카테고리 이름">
          </div>
          <div class="form-row form-actions">
            <button class="form-cancel-btn" id="cancelCatContract">취소</button>
            <button class="form-save-btn" id="saveCatContract">추가</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 사진 섹션 -->
    <div class="photo-section">
      <div class="section-header">
        <div class="section-title">📷 사진</div>
        <span style="font-size:0.8rem;color:var(--text-muted)">${house.photos.length}장</span>
      </div>
      <div class="photo-grid" id="photoGrid">
        ${house.photos.map((photo, i) => `
          <div class="photo-cell" data-index="${i}">
            <img src="${photo}" alt="사진 ${i + 1}" loading="lazy">
            <button class="photo-delete" data-index="${i}">✕</button>
          </div>
        `).join('')}
        <div class="photo-add" id="photoAddBtn">
          ${SVG_CAMERA}
          <span>사진 추가</span>
        </div>
      </div>
      <input type="file" id="photoInput" accept="image/*" capture="environment" multiple hidden>
    </div>

    <!-- 메모 -->
    <div class="memo-section">
      <div class="section-header">
        <div class="section-title">📝 메모</div>
      </div>
      <textarea class="memo-textarea" id="memoInput" placeholder="추가 메모를 남겨보세요...">${escapeHtml(house.memo)}</textarea>
    </div>

    <!-- 삭제 -->
    <div class="danger-zone">
      <button class="delete-house-btn" id="deleteHouseBtn">🗑️ 이 집 삭제하기</button>
    </div>
  `;

  // 이벤트 바인딩
  bindDetailEvents();
}

/** 카테고리별 체크리스트 HTML 렌더 */
function renderCategories(house, type) {
  const checklist = house[type];
  return checklist.categories.map((cat, catIdx) => {
    const checkedCount = cat.items.filter(i => i.checked).length;
    const isCollapsed = cat.collapsed;

    return `
      <div class="category-group" data-type="${type}" data-cat-index="${catIdx}">
        <div class="category-header" data-type="${type}" data-cat-index="${catIdx}">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-name">${escapeHtml(cat.name)}</span>
          <span class="category-count">${checkedCount}/${cat.items.length}</span>
          <span class="category-toggle ${isCollapsed ? 'collapsed' : ''}">▼</span>
        </div>
        <div class="checklist-items ${isCollapsed ? 'collapsed' : ''}">
          ${cat.items.map(item => `
            <div class="check-item ${item.checked ? 'checked' : ''}" data-item-id="${item.id}">
              <div class="custom-checkbox">${SVG_CHECK}</div>
              <span class="check-label">${escapeHtml(item.text)}</span>
              <button class="check-item-delete" data-item-id="${item.id}" data-type="${type}" data-cat-index="${catIdx}">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="add-item-row">
          <input type="text" class="add-item-input" placeholder="항목 추가..." 
                 data-type="${type}" data-cat-index="${catIdx}">
          <button class="add-item-btn" data-type="${type}" data-cat-index="${catIdx}">추가</button>
        </div>
      </div>
    `;
  }).join('');
}

// ========================================
// 이벤트 바인딩: 상세 화면
// ========================================

function bindDetailEvents() {
  const house = getCurrentHouse();
  if (!house) return;

  // 제목 변경
  const titleInput = document.getElementById('titleInput');
  titleInput.addEventListener('input', debounce(() => {
    house.title = titleInput.value.trim();
    house.updatedAt = new Date().toISOString();
    saveHouses();
  }, 300));

  // 탭 전환
  document.querySelectorAll('.checklist-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      appState.currentTab = tab.dataset.tab;
      document.querySelectorAll('.checklist-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(tab.dataset.tab === 'visit' ? 'tabVisit' : 'tabContract').classList.add('active');
    });
  });

  // 카테고리 접기/펼치기
  document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', () => {
      const type = header.dataset.type;
      const catIdx = parseInt(header.dataset.catIndex);
      const cat = house[type].categories[catIdx];
      cat.collapsed = !cat.collapsed;
      saveHouses();

      const group = header.closest('.category-group');
      const items = group.querySelector('.checklist-items');
      const toggle = header.querySelector('.category-toggle');
      items.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    });
  });

  // 체크 토글 (부분 업데이트로 깜빡임 방지)
  document.querySelectorAll('.check-item').forEach(itemEl => {
    itemEl.addEventListener('click', (e) => {
      // 삭제 버튼 클릭 시 무시
      if (e.target.closest('.check-item-delete')) return;

      const itemId = itemEl.dataset.itemId;
      const isChecked = toggleCheckItem(house, itemId);
      saveHouses();

      // 해당 아이템만 DOM 업데이트
      itemEl.classList.toggle('checked', isChecked);

      // 카테고리 카운트 및 점수 부분 업데이트
      updateScoreUI(house);
      updateCategoryCounts(house);
    });
  });

  // 항목 삭제
  document.querySelectorAll('.check-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.itemId;
      const type = btn.dataset.type;
      const catIdx = parseInt(btn.dataset.catIndex);
      house[type].categories[catIdx].items = house[type].categories[catIdx].items.filter(i => i.id !== itemId);
      saveHouses();
      renderDetailView();
      showToast('항목이 삭제되었습니다');
    });
  });

  // 항목 추가
  document.querySelectorAll('.add-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const catIdx = parseInt(btn.dataset.catIndex);
      const input = document.querySelector(`.add-item-input[data-type="${type}"][data-cat-index="${catIdx}"]`);
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      house[type].categories[catIdx].items.push({
        id: generateId(),
        text,
        checked: false
      });
      saveHouses();
      renderDetailView();
      showToast('항목이 추가되었습니다');
    });
  });

  // Enter 키로 항목 추가
  document.querySelectorAll('.add-item-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const type = input.dataset.type;
        const catIdx = input.dataset.catIndex;
        document.querySelector(`.add-item-btn[data-type="${type}"][data-cat-index="${catIdx}"]`).click();
      }
    });
  });

  // 카테고리 추가 (방문)
  bindCategoryAdd('Visit', 'visit');
  // 카테고리 추가 (계약)
  bindCategoryAdd('Contract', 'contract');

  // 사진 추가
  document.getElementById('photoAddBtn').addEventListener('click', () => {
    document.getElementById('photoInput').click();
  });

  document.getElementById('photoInput').addEventListener('change', handlePhotoUpload);

  // 사진 클릭 (확대)
  document.querySelectorAll('.photo-cell img').forEach(img => {
    img.addEventListener('click', () => {
      document.getElementById('photoModalImg').src = img.src;
      document.getElementById('photoModal').classList.add('active');
    });
  });

  // 사진 삭제
  document.querySelectorAll('.photo-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      house.photos.splice(idx, 1);
      saveHouses();
      renderDetailView();
      showToast('사진이 삭제되었습니다');
    });
  });

  // 메모
  const memoInput = document.getElementById('memoInput');
  memoInput.addEventListener('input', debounce(() => {
    house.memo = memoInput.value;
    house.updatedAt = new Date().toISOString();
    saveHouses();
  }, 300));

  // 삭제 버튼
  document.getElementById('deleteHouseBtn').addEventListener('click', () => {
    appState.deleteTargetId = house.id;
    document.getElementById('confirmModal').classList.add('active');
  });
}

/** 카테고리 추가 폼 바인딩 */
function bindCategoryAdd(suffix, type) {
  const house = getCurrentHouse();
  const btn = document.getElementById(`addCategory${suffix}Btn`);
  const form = document.getElementById(`addCategory${suffix}Form`);
  const cancelBtn = document.getElementById(`cancelCat${suffix}`);
  const saveBtn = document.getElementById(`saveCat${suffix}`);

  if (!btn) return;

  btn.addEventListener('click', () => {
    btn.classList.add('hidden');
    form.classList.add('active');
    document.getElementById(`newCat${suffix}Name`).focus();
  });

  cancelBtn.addEventListener('click', () => {
    btn.classList.remove('hidden');
    form.classList.remove('active');
  });

  saveBtn.addEventListener('click', () => {
    const icon = document.getElementById(`newCat${suffix}Icon`).value || '📌';
    const name = document.getElementById(`newCat${suffix}Name`).value.trim();
    if (!name) {
      document.getElementById(`newCat${suffix}Name`).focus();
      return;
    }
    house[type].categories.push({
      name,
      icon,
      collapsed: false,
      items: []
    });
    saveHouses();
    renderDetailView();
    showToast(`"${name}" 카테고리가 추가되었습니다`);
  });
}

/** 체크 아이템 토글 (새 상태 반환) */
function toggleCheckItem(house, itemId) {
  let newState = false;
  ['visit', 'contract'].forEach(type => {
    house[type].categories.forEach(cat => {
      cat.items.forEach(item => {
        if (item.id === itemId) {
          item.checked = !item.checked;
          newState = item.checked;
        }
      });
    });
  });
  return newState;
}

/** 점수 UI만 부분 업데이트 (리렌더 없이) */
function updateScoreUI(house) {
  const score = calcTotalScore(house);
  const visitScore = calcScore(house, 'visit');
  const contractScore = calcScore(house, 'contract');
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

  const scoreText = document.querySelector('.circle-progress .score-text');
  const progressCircle = document.querySelector('.circle-progress .progress');
  const scoreDetails = document.querySelector('.score-details p');

  if (scoreText) {
    scoreText.textContent = score;
    scoreText.style.color = score >= 70 ? '#34c759' : score >= 40 ? '#ff9500' : '#ff3b30';
  }
  if (progressCircle) {
    progressCircle.setAttribute('stroke-dashoffset', offset);
  }
  if (scoreDetails) {
    scoreDetails.innerHTML = `🏠 방문: ${visitScore}점 · 📋 계약: ${contractScore}점`;
  }
}

/** 카테고리 카운트만 부분 업데이트 */
function updateCategoryCounts(house) {
  document.querySelectorAll('.category-group').forEach(group => {
    const type = group.dataset.type;
    const catIdx = parseInt(group.dataset.catIndex);
    const cat = house[type]?.categories[catIdx];
    if (!cat) return;
    const checkedCount = cat.items.filter(i => i.checked).length;
    const countEl = group.querySelector('.category-count');
    if (countEl) countEl.textContent = `${checkedCount}/${cat.items.length}`;
  });
}

// ========================================
// 사진 업로드
// ========================================

function handlePhotoUpload(e) {
  const house = getCurrentHouse();
  if (!house) return;

  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  let processed = 0;
  const totalFiles = files.length;

  files.forEach(file => {
    // 이미지 리사이징 후 Base64 변환 (최대 800px)
    const reader = new FileReader();
    reader.onload = (event) => {
      resizeImage(event.target.result, 800, (resizedDataUrl) => {
        house.photos.push(resizedDataUrl);
        processed++;
        if (processed === totalFiles) {
          house.updatedAt = new Date().toISOString();
          saveHouses();
          renderDetailView();
          showToast(`📷 ${totalFiles}장 추가 완료`);
        }
      });
    };
    reader.readAsDataURL(file);
  });

  // input 초기화 (같은 파일 재선택 가능하게)
  e.target.value = '';
}

/** 이미지 리사이징 (저장 용량 절약) */
function resizeImage(dataUrl, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width;
    let h = img.height;
    if (w > maxSize || h > maxSize) {
      if (w > h) {
        h = Math.round((h * maxSize) / w);
        w = maxSize;
      } else {
        w = Math.round((w * maxSize) / h);
        h = maxSize;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.7));
  };
  img.src = dataUrl;
}

// ========================================
// 유틸리티
// ========================================

/** HTML 이스케이프 (XSS 방지) */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 디바운스 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** 토스트 알림 */
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ========================================
// 모달 이벤트
// ========================================

function initModals() {
  // 사진 모달 닫기
  document.getElementById('photoModalClose').addEventListener('click', () => {
    document.getElementById('photoModal').classList.remove('active');
  });

  document.getElementById('photoModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('photoModal').classList.remove('active');
    }
  });

  // 삭제 확인 모달
  document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('active');
    appState.deleteTargetId = null;
  });

  document.getElementById('confirmDelete').addEventListener('click', () => {
    if (appState.deleteTargetId) {
      appState.houses = appState.houses.filter(h => h.id !== appState.deleteTargetId);
      saveHouses();
      document.getElementById('confirmModal').classList.remove('active');
      appState.deleteTargetId = null;
      showToast('🗑️ 삭제되었습니다');
      showListView();
    }
  });

  // 모달 배경 클릭으로 닫기
  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('confirmModal').classList.remove('active');
      appState.deleteTargetId = null;
    }
  });
}

// ========================================
// FAB (새 집 추가)
// ========================================

function initFAB() {
  document.getElementById('fabBtn').addEventListener('click', () => {
    const newHouse = createHouse();
    appState.houses.push(newHouse);
    saveHouses();
    showDetailView(newHouse.id);
    showToast('🏠 새 집이 추가되었습니다');

    // 제목 입력에 포커스
    setTimeout(() => {
      const titleInput = document.getElementById('titleInput');
      if (titleInput) titleInput.focus();
    }, 350);
  });
}

// ========================================
// 앱 초기화
// ========================================

async function initApp() {
  // 기본 체크리스트 템플릿 로드
  await loadDefaultChecklist();

  // 저장된 데이터 로드
  appState.houses = loadHouses();

  // UI 초기화
  initModals();
  initFAB();

  // 첫 화면 렌더
  showListView();
}

// DOM 로드 후 시작
document.addEventListener('DOMContentLoaded', initApp);
