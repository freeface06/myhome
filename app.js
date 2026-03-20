/**
 * 전세집 체크리스트 앱 - 핵심 로직
 * Firebase Firestore + Storage 기반, SPA 뷰 전환, 체크리스트/사진/점수 관리
 */

// ========================================
// Supabase 클라이언트 초기화
// ========================================
const supabaseUrl = 'https://sgrluzhzkymbloqhpcai.supabase.co';
const supabaseKey = 'sb_publishable_TXnq8dLXUmrCWJXE-nzzfA_2i-7VSpz';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// 실시간 구독 객체
let realtimeChannel = null;

// ========================================
// 실시간 동기화 (Realtime) 리스너 설정
// ========================================
function setupRealtimeSubscription() {
  if (realtimeChannel) return;

  realtimeChannel = supabaseClient
    .channel('public:houses')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'houses' }, payload => {
      const { eventType, new: newRow, old: oldRow } = payload;

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const houseData = {
          id: newRow.id,
          title: newRow.title || '',
          memo: newRow.memo || '',
          photos: newRow.photos || [],
          visit: newRow.visit,
          contract: newRow.contract,
          createdAt: newRow.created_at,
          updatedAt: newRow.updated_at
        };

        const existingIdx = appState.houses.findIndex(h => h.id === newRow.id);

        if (existingIdx >= 0) {
          // 기존 객체의 참조를 유지한 채 값만 병합 (에코 판단 무관하게 무조건 동기화)
          Object.assign(appState.houses[existingIdx], houseData);
        } else {
          appState.houses.unshift(houseData);
        }

        // 현재 화면 부분 업데이트 로직 호출 (깜빡임 없이 즉각 반영)
        updateUIForRealtime(eventType, existingIdx >= 0 ? appState.houses[existingIdx] : houseData);

      } else if (eventType === 'DELETE') {
        appState.houses = appState.houses.filter(h => h.id !== oldRow.id);
        if (appState.currentHouseId === oldRow.id) {
          showToast('⚠️ 다른 사용자가 이 집을 삭제했습니다.');
          showListView();
        } else if (document.getElementById('listView').classList.contains('active')) {
          renderHouseList();
        }
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Supabase 실시간 동기화 연결됨');
      }
    });
}

function updateUIForRealtime(eventType, houseData) {
  const isListView = document.getElementById('listView').classList.contains('active');
  const isDetailView = document.getElementById('detailView').classList.contains('active');

  if (isListView) {
    renderHouseList();
  } else if (isDetailView && appState.currentHouseId === houseData.id) {
    // 1. 상태 즉각 UI 반영 (부분 업데이트 - 깜빡임 및 입력방해 원천 차단)
    const titleInput = document.getElementById('titleInput');
    if (titleInput && document.activeElement !== titleInput && houseData.title !== undefined) {
      titleInput.value = houseData.title;
    }
    const memoInput = document.getElementById('memoInput');
    if (memoInput && document.activeElement !== memoInput && houseData.memo !== undefined) {
      memoInput.value = houseData.memo;
    }
    
    // 체크박스 및 Input 상태 동기화
    ['visit', 'contract'].forEach(type => {
      if (houseData[type] && houseData[type].categories) {
        houseData[type].categories.forEach(cat => {
          cat.items.forEach(item => {
            if (item.type === 'input') {
              const inputEl = document.querySelector(`input.custom-item-input[data-item-id="${item.id}"]`);
              if (inputEl && document.activeElement !== inputEl && item.value !== undefined) {
                inputEl.value = item.value;
              }
            } else {
              const itemEl = document.querySelector(`.check-item[data-item-id="${item.id}"]`);
              if (itemEl) {
                itemEl.classList.toggle('checked', item.checked);
              }
            }
          });
        });
      }
    });

    // 점수 및 카운트 부분 업데이트
    updateScoreUI(houseData);
    updateCategoryCounts(houseData);

    // 2. 전체 리렌더가 필요한 구조적 변경(사진 목록 등) 감지
    let needsFullRender = false;
    const photoCells = document.querySelectorAll('.photo-cell img');
    if (houseData.photos && houseData.photos.length !== photoCells.length) {
      needsFullRender = true;
    } else if (houseData.photos) {
      for (let i = 0; i < houseData.photos.length; i++) {
        // 이미지가 다르거나 새로 추가/삭제된 경우
        const currentSrc = photoCells[i].getAttribute('src');
        if (currentSrc !== houseData.photos[i]) {
          needsFullRender = true;
          break;
        }
      }
    }

    if (needsFullRender) {
      const activeElem = document.activeElement;
      const isTyping = activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA');
      
      const photoModal = document.getElementById('photoModal');
      const isModalOpen = (photoModal && photoModal.classList.contains('active')) || document.querySelector('.viewer-container') !== null;
      
      if (!isTyping && !isModalOpen) {
        const scrollPos = window.scrollY; // 스크롤 위치 기억
        renderDetailView();
        window.scrollTo(0, scrollPos); // 스크롤 위치 복구
      }
    }
  }
}

// 상수 및 전역 상태
// ========================================
const SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const CIRCUMFERENCE = 2 * Math.PI * 36;

let appState = {
  houses: [],
  currentHouseId: null,
  currentTab: 'visit',
  defaultChecklist: null,
  deleteTargetId: null,
  deleteTargetType: null,
  deletePhotoIndex: null,
  isTitleEditMode: false,
  isMemoEditMode: false,
  viewer: null
};


// ========================================
// 데이터 관리 (Supabase)
// ========================================

/** Supabase에서 데이터 로드 시작 */
async function loadHousesFromDB(callback) {
  try {
    const { data, error } = await supabaseClient
      .from('houses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      appState.houses = data.map(row => ({
        id: row.id,
        title: row.title || '',
        memo: row.memo || '',
        photos: row.photos || [],
        visit: row.visit,
        contract: row.contract,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } else {
      appState.houses = []; // 캐시 폴백 없이 무조건 DB 값만 로드 (빈 배열)
    }
    
    // 데이터 로드 성공 후 실시간 동기화 채널 열기
    setupRealtimeSubscription();

    if (callback) callback();
  } catch (error) {
    console.error('클라우드 동기화 실패:', error);
    appState.houses = [];
    if (callback) callback();
    showToast('⚠️ 데이터 로드에 실패했습니다. DB 환경을 확인해주세요.');
  }
}

async function saveHouse(house) {
  house.updatedAt = new Date().toISOString();
  
  appState.lastSavedAt = Date.now();
  appState.lastSavedHouseId = house.id;
  
  try {
    const { error } = await supabaseClient
      .from('houses')
      .upsert({
        id: house.id,
        title: house.title,
        memo: house.memo,
        photos: house.photos,
        visit: house.visit,
        contract: house.contract,
        created_at: house.createdAt,
        updated_at: house.updatedAt
      });
      
    if (error) throw error;
    console.log('✅ 클라우드 저장 완료:', house.id);
  } catch (e) {
    console.error('❌ 클라우드 저장 실패:', e);
    showToast('⚠️ 데이터 클라우드 동기화에 실패했습니다.');
  }
}

/** 호환성 유지: 기존 saveHouses() 호출 래핑 */
function saveHouses() {
  const house = getCurrentHouse();
  if (house) saveHouse(house);
}

/** 집 데이터 완전 삭제 (Supabase) */
async function deleteHouseFromDB(houseId) {
  const houseToDelete = appState.houses.find(h => h.id === houseId);
  appState.houses = appState.houses.filter(h => h.id !== houseId);
  
  try {
    // 2. 해당 집의 이미지들이 스토리지에 있다면 파일 삭제
    if (houseToDelete && houseToDelete.photos && houseToDelete.photos.length > 0) {
      const filePaths = houseToDelete.photos
        .filter(url => url.includes('supabase.co/storage/v1/object/public/house-images/'))
        .map(url => url.split('house-images/')[1]);
      
      if (filePaths.length > 0) {
         await supabaseClient.storage.from('house-images').remove(filePaths);
      }
    }

    // 3. DB 레코드 삭제
    const { error } = await supabaseClient
      .from('houses')
      .delete()
      .eq('id', houseId);
      
    if (error) throw error;
    console.log(`✅ 데이터 클라우드 삭제 완료: ${houseId}`);
  } catch(e) {
    console.warn('데이터 삭제 중 오류:', e.message);
    showToast('⚠️ 클라우드에서 완벽히 삭제되지 않았을 수 있습니다.');
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
      { name: '전/월세', icon: '💰', items: [{ label: '전세 / 월세', type: 'input', placeholder: '전세 또는 월세' }, { label: '전세금 / 월세금', type: 'input', placeholder: '금액 입력' }, { label: '관리비', type: 'input', placeholder: '관리비 입력' }] },
      { name: '보안/안전', icon: '🔒', items: ['현관 이중잠금장치','CCTV 설치 여부','경비실/관리실 유무','현관 도어록 상태','소화기/화재경보기','저층 방범창 설치 여부'] },
      { name: '수압/배관', icon: '🚿', items: ['수압 상태 (싱크대/샤워기 동시 틀기)','온수 나오는 시간','배수구 물빠짐 상태','보일러 작동 상태','수도 계량기 누수 확인'] },
      { name: '채광/환기', icon: '☀️', items: ['남향 여부 (햇빛 방향)','창문 크기 및 개수','환기 상태 (맞통풍)','베란다 유무','조명 밝기 상태'] },
      { name: '곰팡이/누수', icon: '💧', items: ['벽면 곰팡이 흔적','천장 누수 자국','화장실 실리콘 상태','창문 주변 결로 흔적','장판/벽지 들뜸 여부','새 도배 뒤 곰팡이 은폐 여부'] },
      { name: '소음', icon: '🔇', items: ['층간소음 확인','도로 교통소음','엘리베이터 소음','주변 공사/상가 소음','방음 상태'] },
      { name: '옵션/가전', icon: '🔌', items: ['에어컨 작동 상태','세탁기 작동 상태','냉장고 작동 상태','가스레인지/인덕션 작동 상태','옵션 수리 필요 여부 확인'] },
      { name: '교통', icon: '🚇', items: ['지하철역 도보 거리','버스정류장 접근성','주차 가능 여부 (공간 넉넉한지)','자전거 보관소','택시 접근성'] },
      { name: '주변환경', icon: '🏪', items: ['편의점/마트 거리','병원/약국 접근성','공원/산책로 유무','학교/학원가','음식점/카페 밀집'] },
      { name: '건물상태', icon: '🏢', items: ['엘리베이터 유무/상태','복도/계단 청결도','건물 연식 확인','쓰레기 분리수거장','택배 보관함 유무'] },
      { name: '관리비', icon: '💰', items: ['월 관리비 금액 확인','관리비 포함 항목 (수도/인터넷/TV/청소비 등)','별도 납부 항목 확인 (전기/가스 등)'] },
      { name: '입주 조건', icon: '📋', items: ['반려동물 가능 여부','주차 가능 여부'] }
    ]
  },
  contract: {
    label: '📋 계약 체크리스트',
    categories: [
      { name: '서류 확인', icon: '📄', items: ['등기부등본 갑구 (소유자 확인, 가압류/가처분/경매 여부)','등기부등본 을구 (근저당권/대출 금액 확인)','건축물대장 확인 (불법건축물/무단증축 여부)','토지이용계획 확인','집주인 신분증 대조 (등기부 소유자와 일치 여부)'] },
      { name: '임대인 확인', icon: '👤', items: ['대리인 계약 시 위임장/인감증명서 확인','대리인 시 집주인과 직접 통화 확인','국세/지방세 완납증명서 징구','임대인 세금 체납 여부 확인'] },
      { name: '전세 안전', icon: '🛡️', items: ['전세보증보험 가입 가능 여부 (HUG/SGI/HF)','근저당+보증금 합계 < 시세 70~80% 확인','전세가율 확인 (깡통전세 위험)','확정일자 부여 가능 여부'] },
      { name: '특약사항', icon: '✍️', items: ['대출 안 나올 경우 계약 해지 및 계약금 반환 특약','보증보험 가입 불가 시 계약 해지 및 계약금 반환 특약','계약~잔금까지 추가 근저당 설정 금지 특약','입주 전 하자 수리 임대인 부담 특약','기타 특약사항 협의 및 기재'] },
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
        items: cat.items.map(item => {
          if (typeof item === 'string') {
            return {
              id: generateId(),
              type: 'check',
              text: item,
              checked: false
            };
          } else {
            return {
              id: generateId(),
              type: item.type || 'check',
              text: item.label || item.text || '',
              checked: item.checked || false,
              value: item.value || '',
              placeholder: item.placeholder || ''
            };
          }
        })
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
      if (item.type !== 'input') {
        total++;
        if (item.checked) checked++;
      }
    });
  });
  return total === 0 ? 0 : Math.round((checked / total) * 100);
}

/** 종합 점수: 방문(100%) 점수만 사용 */
function calcTotalScore(house) {
  const visitScore = calcScore(house, 'visit');
  const visitTotal = house.visit.categories.reduce((s, c) => s + c.items.filter(i => i.type !== 'input').length, 0);
  if (visitTotal === 0) return 0;
  return visitScore;
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

function showListView(isPopState = false) {
  appState.currentHouseId = null;
  document.getElementById('listView').classList.add('active');
  document.getElementById('detailView').classList.remove('active');
  document.getElementById('fabBtn').classList.remove('hidden');
  renderHeader('list');
  renderHouseList();

  if (!isPopState) {
    history.pushState({ view: 'list' }, '', window.location.pathname);
  }
}

function showDetailView(houseId, isPopState = false) {
  appState.currentHouseId = houseId;
  appState.currentTab = 'visit';
  appState.isTitleEditMode = false;
  appState.isMemoEditMode = false;
  document.getElementById('listView').classList.remove('active');
  document.getElementById('detailView').classList.add('active');
  document.getElementById('fabBtn').classList.add('hidden');
  renderHeader('detail');
  renderDetailView();

  if (!isPopState) {
    history.pushState({ view: 'detail', id: houseId }, '', '#detail');
  }
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
      <button class="header-delete" id="headerDeleteBtn">삭제</button>
    `;
    document.getElementById('backBtn').addEventListener('click', () => {
      appState.isTitleEditMode = false;
      appState.isMemoEditMode = false;
      if (history.state && history.state.view === 'detail') {
        history.back();
      } else {
        showListView();
      }
    });
    document.getElementById('headerDeleteBtn').addEventListener('click', () => {
      const house = getCurrentHouse();
      if (house) {
        appState.deleteTargetType = 'house';
        appState.deleteTargetId = house.id;
        document.getElementById('confirmMessage').innerHTML = '이 집 정보를 삭제하시겠습니까?<br>삭제된 데이터는 복구할 수 없습니다.';
        document.getElementById('confirmModal').classList.add('active');
      }
    });
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
    const firstPhoto = house.photos && house.photos.length > 0 ? house.photos[0] : null;
    const thumbHtml = firstPhoto 
      ? `<img src="${firstPhoto}" class="house-card-thumb" alt="썸네일" loading="lazy">` 
      : `<div class="house-card-thumb empty">🏚️</div>`;

    return `
      <div class="house-card" data-id="${house.id}">
        <div class="house-card-thumb-container">
          ${thumbHtml}
        </div>
        <div class="house-card-content">
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
      if (item.type !== 'input') {
        total++;
        if (item.checked) checked++;
      }
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
  const titleReadOnlyAttr = appState.isTitleEditMode ? '' : 'readonly';
  const memoReadOnlyAttr = appState.isMemoEditMode ? '' : 'readonly';

  container.innerHTML = `
    <!-- 제목 및 수정 버튼 -->
    <div class="title-section">
      <div class="title-input-wrapper">
        <input type="text" class="title-input" id="titleInput" 
               value="${escapeHtml(house.title)}" 
               placeholder="집 이름을 입력하세요 (예: 역삼역 5분 투룸)" ${titleReadOnlyAttr}>
        <div class="title-actions">
          <button class="action-btn-small" id="titleEditBtn">${appState.isTitleEditMode ? '저장' : '수정'}</button>
        </div>
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
        <p>🏠 방문: ${visitScore}점</p>
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

    </div>

    <!-- 계약 체크리스트 -->
    <div class="tab-content ${appState.currentTab === 'contract' ? 'active' : ''}" id="tabContract">
      <div class="checklist-section">
        ${renderCategories(house, 'contract')}
      </div>

    </div>

    <!-- 사진 섹션 -->
    <div class="photo-section">
      <div class="section-header">
        <div class="section-title">📷 사진</div>
        <div class="photo-header-actions" style="display:flex; gap:8px; align-items:center;">
          <span style="font-size:0.8rem;color:var(--text-muted)">${house.photos.length}장</span>
          ${house.photos.length > 0 ? `<button class="action-btn-small" id="btnDownloadAllPhotos" style="padding:4px 8px; font-size:0.8rem; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-color); cursor:pointer;">🗂️ 전체 저장</button>` : ''}
        </div>
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
      <input type="file" id="photoInputCamera" accept="image/*" capture="environment" multiple hidden>
      <input type="file" id="photoInputGallery" accept="image/*" multiple hidden>
    </div>

    <!-- 메모 -->
    <div class="memo-section">
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="section-title">📝 메모</div>
        <button class="action-btn-small" id="memoEditBtn">${appState.isMemoEditMode ? '저장' : '수정'}</button>
      </div>
      <textarea class="memo-textarea" id="memoInput" placeholder="${appState.isMemoEditMode ? '추가 메모를 남겨보세요...' : ''}" ${memoReadOnlyAttr}>${escapeHtml(house.memo)}</textarea>
    </div>

    <!-- 기존 맨 아래 삭제 섹션은 상단으로 이동했으므로 제거 -->
  `;

  // 이벤트 바인딩
  bindDetailEvents();
}

/** 카테고리별 체크리스트 HTML 렌더 */
function renderCategories(house, type) {
  const checklist = house[type];
  return checklist.categories.map((cat, catIdx) => {
    const checkableItems = cat.items.filter(i => i.type !== 'input');
    const checkedCount = checkableItems.filter(i => i.checked).length;
    const isCollapsed = cat.collapsed;

    return `
      <div class="category-group" data-type="${type}" data-cat-index="${catIdx}">
        <div class="category-header" data-type="${type}" data-cat-index="${catIdx}">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-name">${escapeHtml(cat.name)}</span>
          <span class="category-count">${checkedCount}/${checkableItems.length}</span>
          <span class="category-toggle ${isCollapsed ? 'collapsed' : ''}">▼</span>
        </div>
        <div class="checklist-items ${isCollapsed ? 'collapsed' : ''}">
          ${cat.items.map(item => {
            if (item.type === 'input') {
              return `
                <div class="check-item-input" data-item-id="${item.id}" style="display:flex; align-items:center; gap:8px; width:100%; margin-bottom: 8px;">
                  <span class="check-label" style="flex:1;">${escapeHtml(item.text)}</span>
                  <input type="text" class="custom-item-input" data-item-id="${item.id}" value="${escapeHtml(item.value || '')}" placeholder="${escapeHtml(item.placeholder || '')}" style="flex:2; padding:8px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-input, transparent); color:var(--text-color); font-size:1rem;">
                </div>
              `;
            } else {
              return `
                <div class="check-item ${item.checked ? 'checked' : ''}" data-item-id="${item.id}">
                  <div class="custom-checkbox">${SVG_CHECK}</div>
                  <span class="check-label">${escapeHtml(item.text)}</span>
                </div>
              `;
            }
          }).join('')}
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
  titleInput.addEventListener('input', () => {
    house.title = titleInput.value.trim();
    house.updatedAt = new Date().toISOString();
  });

  // 타이틀 수정/저장 버튼
  const titleEditBtn = document.getElementById('titleEditBtn');
  if (titleEditBtn) {
    titleEditBtn.addEventListener('click', () => {
      if (appState.isTitleEditMode) {
        appState.isTitleEditMode = false;
        saveHouses();
        renderHeader('detail');
        renderDetailView();
        showToast('💾 집 이름이 저장되었습니다.');
      } else {
        appState.isTitleEditMode = true;
        renderHeader('detail');
        renderDetailView();
        setTimeout(() => {
          const input = document.getElementById('titleInput');
          if (input) input.focus();
        }, 100);
      }
    });
  }

  // 메모 수정/저장 버튼
  const memoEditBtn = document.getElementById('memoEditBtn');
  if (memoEditBtn) {
    memoEditBtn.addEventListener('click', () => {
      if (appState.isMemoEditMode) {
        appState.isMemoEditMode = false;
        saveHouses();
        renderDetailView();
        showToast('💾 메모가 저장되었습니다.');
      } else {
        appState.isMemoEditMode = true;
        renderDetailView();
        setTimeout(() => {
          const input = document.getElementById('memoInput');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }, 100);
      }
    });
  }

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

  // 커스텀 인풋 항목 값 변경 시
  document.querySelectorAll('.custom-item-input').forEach(inputEl => {
    inputEl.addEventListener('input', (e) => {
      const itemId = inputEl.dataset.itemId;
      let found = false;
      ['visit', 'contract'].forEach(type => {
        if(found) return;
        house[type].categories.forEach(cat => {
          if(found) return;
          const target = cat.items.find(i => i.id === itemId);
          if (target) {
            target.value = inputEl.value;
            house.updatedAt = new Date().toISOString();
            found = true;
          }
        });
      });
    });
    inputEl.addEventListener('blur', () => {
      saveHouses();
    });
  });

  // 체크 토글 (부분 업데이트로 깜빡임 방지)
  document.querySelectorAll('.check-item').forEach(itemEl => {
    itemEl.addEventListener('click', (e) => {

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

  // 사진 추가버튼 클릭 시 액션 시트 띄우기
  const photoAddBtn = document.getElementById('photoAddBtn');
  if (photoAddBtn) {
    photoAddBtn.addEventListener('click', () => {
      document.getElementById('photoActionSheet').classList.add('active');
    });
  }

  const photoInputCamera = document.getElementById('photoInputCamera');
  if (photoInputCamera) {
    photoInputCamera.addEventListener('change', (e) => handlePhotoUpload(e));
  }
  const photoInputGallery = document.getElementById('photoInputGallery');
  if (photoInputGallery) {
    photoInputGallery.addEventListener('change', (e) => handlePhotoUpload(e));
  }

  // Viewer.js 초기화
  const photoGrid = document.getElementById('photoGrid');
  if (photoGrid && house.photos.length > 0) {
    if (appState.viewer) {
      appState.viewer.destroy();
    }
    appState.viewer = new Viewer(photoGrid, {
      url: 'src',
      filter(image) {
        return image.tagName === 'IMG'; // Add 버튼의 SVG 등은 제외
      },
      title: false,
      toolbar: false,
      navbar: false
    });

    // 모바일 환경 좌우 스와이프 네비게이션 적용
    const viewerElem = appState.viewer.viewer;
    if (viewerElem) {
      let touchStartX = 0;
      let touchStartY = 0;

      viewerElem.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      viewerElem.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        
        const swipeThreshold = 50;
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        // 세로 스크롤보다 가로 스와이프가 크고 임계값을 넘었을 때
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
          const imageData = appState.viewer.imageData;
          const initialImageData = appState.viewer.initialImageData;
          
          // 사진이 확대되지 않은 상태일 때만 슬라이드 전환 (오차 범위 1% 허용)
          const isZoomed = imageData && initialImageData && (imageData.ratio > initialImageData.ratio + 0.01);
          
          if (!isZoomed) {
            if (diffX > 0) {
              appState.viewer.next(); // 왼쪽으로 스와이프 => 다음 사진
            } else {
              appState.viewer.prev(); // 오른쪽으로 스와이프 => 이전 사진
            }
          }
        }
      }, { passive: true });
    }
  }

  // 전체 사진 저장 (개별 파일 순차 다운로드)
  const btnDownloadAllPhotos = document.getElementById('btnDownloadAllPhotos');
  if (btnDownloadAllPhotos) {
    btnDownloadAllPhotos.addEventListener('click', async () => {
      if (!house.photos || house.photos.length === 0) return;
      
      showToast('🗂️ 전체 사진 다운로드를 시작합니다 (다중 팝업 허용 필요)');
      
      for (let i = 0; i < house.photos.length; i++) {
        // 브라우저 환경에서 동시다발적 다운로드를 막는 것을 방지하기 위해 인터벌 부여
        await downloadSingleImage(house.photos[i]);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      showToast('✅ 모든 사진 다운로드 요청 완료!');
    });
  }

  // 사진 삭제 (커스텀 팝업)
  document.querySelectorAll('.photo-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      appState.deleteTargetType = 'photo';
      appState.deletePhotoIndex = parseInt(btn.dataset.index);
      document.getElementById('confirmMessage').innerHTML = '이 사진을 정말 삭제하시겠습니까?<br>삭제된 데이터는 복구할 수 없습니다.';
      document.getElementById('confirmModal').classList.add('active');
    });
  });

  // 메모
  const memoInput = document.getElementById('memoInput');
  memoInput.addEventListener('input', () => {
    house.memo = memoInput.value;
    house.updatedAt = new Date().toISOString();
  });

  // 삭제 버튼 로직은 헤더로 이동됨
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
    scoreDetails.innerHTML = `🏠 방문: ${visitScore}점`;
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

async function handlePhotoUpload(e) {
  const house = getCurrentHouse();
  if (!house) return;

  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  showToast(`📷 ${files.length}장 업로드 중...`);

  let uploadedCount = 0;
  for (const file of files) {
    try {
      // 1. 이미지 리사이징 후 Base64 문자열 반환
      const base64Data = await resizeImageToBase64(file, 800);
      // 2. Base64 문자열을 Blob 객체로 변환 (파일 업로드 포맷)
      const blob = dataURLtoBlob(base64Data);

      // 3. Supabase Storage에 업로드할 파일명 생성 (유니크한 이름)
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${house.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      // 4. 스토리지 버킷에 업로드
      const { error } = await supabaseClient.storage
        .from('house-images')
        .upload(fileName, blob, { contentType: file.type || 'image/jpeg' });

      if (error) throw error;

      // 5. 서버에 업로드된 공용 이미지 URL 획득
      const { data: urlData } = supabaseClient.storage
        .from('house-images')
        .getPublicUrl(fileName);

      house.photos.push(urlData.publicUrl);
      uploadedCount++;
    } catch (err) {
      console.error('사진 업로드 실패:', err);
      showToast('⚠️ 일부 사진 업로드에 실패했습니다.');
    }
  }

  house.updatedAt = new Date().toISOString();
  saveHouse(house);
  renderDetailView();
  showToast(`📷 ${uploadedCount}장 클라우드 반영 완료`);

  // input 초기화
  e.target.value = '';
}

/** 이미지 리사이징 → Data URL (Base64) 반환 (업로드 전 전처리용) */
function resizeImageToBase64(file, maxSize) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
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
        // 화질 저하 및 용량 감소를 위해 JPEG 최적화 (0.7)
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Base64 문자열을 Blob 객체로 변환하는 유틸리티 함수 */
function dataURLtoBlob(dataurl) {
  var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], {type:mime});
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

/** 개별 이미지 다운로드 */
async function downloadSingleImage(imgSrc) {
  if (!imgSrc) return;
  try {
    showToast('📥 사진 다운로드 중...');
    const response = await fetch(imgSrc);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `house_photo_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('다운로드 오류:', err);
    showToast('⚠️ 다운로드에 실패했습니다.');
  }
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
  // 사진 액션 시트 이벤트
  const actionSheet = document.getElementById('photoActionSheet');
  
  document.getElementById('btnTakeCamera').addEventListener('click', () => {
    document.getElementById('photoActionSheet').classList.remove('active');
    const input = document.getElementById('photoInputCamera');
    if (input) input.click();
  });

  document.getElementById('btnChooseGallery').addEventListener('click', () => {
    document.getElementById('photoActionSheet').classList.remove('active');
    const input = document.getElementById('photoInputGallery');
    if (input) input.click();
  });

  document.getElementById('btnCancelActionSheet').addEventListener('click', () => {
    actionSheet.classList.remove('active');
  });

  actionSheet.addEventListener('click', (e) => {
    if (e.target === actionSheet) {
      actionSheet.classList.remove('active');
    }
  });

  // 삭제 확인 모달 (집 & 사진 공용)
  document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('active');
    appState.deleteTargetType = null;
    appState.deleteTargetId = null;
    appState.deletePhotoIndex = null;
  });

  document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (appState.deleteTargetType === 'house' && appState.deleteTargetId) {
      showToast('삭제 중...');
      await deleteHouseFromDB(appState.deleteTargetId);
      document.getElementById('confirmModal').classList.remove('active');
      appState.deleteTargetType = null;
      appState.deleteTargetId = null;
      showToast('🗑️ 삭제되었습니다');
      showListView();
    } else if (appState.deleteTargetType === 'photo' && appState.deletePhotoIndex !== null) {
      const house = getCurrentHouse();
      if (!house) return;
      const idx = appState.deletePhotoIndex;
      const photoUrl = house.photos[idx];

      house.photos.splice(idx, 1);
      
      if (photoUrl && photoUrl.includes('supabase.co/storage/v1/object/public/house-images/')) {
        const filePath = photoUrl.split('house-images/')[1];
        try {
          await supabaseClient.storage.from('house-images').remove([filePath]);
        } catch (err) {
          console.warn('스토리지 이미지 삭제 실패:', err);
        }
      }

      saveHouse(house);
      renderDetailView();
      document.getElementById('confirmModal').classList.remove('active');
      appState.deleteTargetType = null;
      appState.deletePhotoIndex = null;
      showToast('사진이 삭제되었습니다');
    }
  });

  // 모달 배경 클릭으로 닫기
  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('confirmModal').classList.remove('active');
      appState.deleteTargetType = null;
      appState.deleteTargetId = null;
      appState.deletePhotoIndex = null;
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
    saveHouse(newHouse);
    
    showDetailView(newHouse.id);
    
    // 강제 편집 모드 진입
    appState.isEditMode = true;
    renderHeader('detail');
    renderDetailView();
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

  // UI 초기화
  initModals();
  initFAB();

  // IndexedDB 기반 로컬 데이터 로드 
  await loadHousesFromDB(() => {
    if (!appState.currentHouseId) {
      // 목록 화면 → 목록 갱신
      renderHouseList();
    } else {
      // 상세 화면
      renderDetailView();
    }
  });

  // 첫 화면 렌더 및 History 초기 상태 등록
  history.replaceState({ view: 'list' }, '', window.location.pathname);
  
  window.addEventListener('popstate', (e) => {
    // 뒤로가기 발생 시 상태 객체를 확인하여 알맞은 화면으로 분기
    if (e.state && e.state.view === 'detail') {
      showDetailView(e.state.id, true);
    } else {
      showListView(true);
    }
  });

  showListView(true);
}

// DOM 로드 후 시작
document.addEventListener('DOMContentLoaded', initApp);
