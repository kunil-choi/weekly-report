/* ===== Step 2: Firebase(일정+메모) + GAS(유튜브) 병렬 연동 ===== */

// ── 기존 GAS URL (유튜브 전용으로 계속 사용) ──
var GAS_URL = 'https://script.google.com/macros/s/AKfycbw10SAC0ClWGl1LszMn9XfReDKJxyTfxf6aggdSxxiXKxxkOVlh4RczGrdYh9SNazb9Rw/exec';

// ── Firebase 설정 ──
const firebaseConfigV2 = {
  apiKey:            "AIzaSyB3WiHiR9zRoi8Q-xdmytjoGW-DASws1zI",
  authDomain:        "moneyhola-schedule.firebaseapp.com",
  databaseURL:       "https://moneyhola-schedule-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "moneyhola-schedule",
  storageBucket:     "moneyhola-schedule.firebasestorage.app",
  messagingSenderId: "816601350271",
  appId:             "1:816601350271:web:6784eff6061d5eb0277f4a"
};

// Firebase 초기화 (중복 방지)
let fbAppV2;
try {
  fbAppV2 = firebase.app('weekly-report-v2');
} catch(e) {
  fbAppV2 = firebase.initializeApp(firebaseConfigV2, 'weekly-report-v2');
}
const dbV2 = firebase.database(fbAppV2);
const authV2 = firebase.auth(fbAppV2);

// ── 익명 로그인 (Firebase DB 규칙이 인증을 요구하므로, 데이터 접근 전 필수) ──
function ensureAuthV2() {
  return new Promise(function(resolve, reject) {
    if (authV2.currentUser) { resolve(authV2.currentUser); return; }
    var unsubscribe = authV2.onAuthStateChanged(function(user) {
      unsubscribe();
      if (user) { resolve(user); return; }
      authV2.signInAnonymously().then(function(cred) {
        resolve(cred.user);
      }).catch(reject);
    }, reject);
  });
}

// ── 날짜 키 헬퍼 ("YYYY-MM-DD") ──
function toKeyV2(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Firebase 데이터 → weekly-report 형식 변환 ──
// V1의 cleanStudioRecord(studioRecord, recordTime, performer) 와 동일한 결과를 냄
// Firebase: slot = recordTime, guest = performer, upload = uploadItem, note = note
function convertFirebaseToScheduleRows(cloudSched) {
  var rows = [];
  for (var key in cloudSched) {
    var parts = key.split('-');
    if (parts.length !== 3) continue;
    var dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var slots = cloudSched[key];
    if (!Array.isArray(slots)) continue;

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var recordTime = (slot.slot   || '').trim(); // V1의 recordTime
      var performer  = (slot.guest  || '').trim(); // V1의 performer
      var uploadItem = (slot.upload || '').trim(); // V1의 uploadItem
      var note       = (slot.note   || '').trim(); // V1의 note

      // V1의 cleanStudioRecord 로직과 동일하게 "시간 출연자" 조합
      var studioRecordClean = '';
      if (recordTime && performer)  studioRecordClean = recordTime + ' ' + performer;
      else if (recordTime)          studioRecordClean = recordTime;
      else if (performer)           studioRecordClean = performer;

      rows.push({
        dateStr:           (dateObj.getMonth() + 1) + '/' + dateObj.getDate(),
        month:             dateObj.getMonth() + 1,
        day:               dateObj.getDate(),
        _date:             dateObj,
        studioRecordClean: studioRecordClean,
        uploadItem:        clean(uploadItem),
        note:              clean(note),
        // V1 호환용 원본 필드도 보존
        recordTime:        clean(recordTime),
        performer:         clean(performer),
      });
    }
  }
  rows.sort(function(a, b) { return a._date - b._date; });
  return rows;
}

// ── 영상 분류 (5개 실적 항목) ──
// 우선순위: GAS가 내려주는 재생목록 이름(v.playlists) → 없으면 제목 규칙
// main: 기존 유튜브 동영상 / cut1: 못본경제유튭 10분컷 / cut2: 못본증시리포트 10분컷
// shR: 라디올라_beta 쇼츠 / shM: 머니올라_shorts 쇼츠 / shU: 재생목록을 알 수 없는 쇼츠
function normKey(s) { return (s || '').replace(/\s+/g, '').toLowerCase(); }

function classifyVideo(v) {
  var pls = v.playlists || [];
  if (typeof pls === 'string') pls = [pls];
  for (var i = 0; i < pls.length; i++) {
    var p = normKey(pls[i]);
    if (p.indexOf('라디올라') > -1) return 'shR';
    if (p.indexOf('머니올라') > -1 && p.indexOf('shorts') > -1) return 'shM';
    if (p.indexOf('경제유튭') > -1 && p.indexOf('10분컷') > -1) return 'cut1';
    if (p.indexOf('증시리포트') > -1 && p.indexOf('10분컷') > -1) return 'cut2';
  }
  var t = normKey(v.title);
  if (t.indexOf('경제유튭') > -1 && t.indexOf('10분컷') > -1) return 'cut1';
  if (t.indexOf('증시리포트') > -1 && t.indexOf('10분컷') > -1) return 'cut2';
  // autoshorts가 붙이는 구분 표시. 제목이 "[쇼츠] [라디올라] ..." 처럼 [쇼츠]가 앞에 올 수 있으므로 위치와 무관하게 검사
  if (t.indexOf('[라디올라]') > -1) return 'shR';
  if (t.indexOf('[머니올라]') > -1) return 'shM';
  if (t.indexOf('[쇼츠]') === 0 || t.indexOf('#shorts') > -1) return 'shU';
  return 'main';
}

// 영상 목록 표 (날짜 / 제목 / 조회수)
function videoTableHtml(list) {
  if (!list || !list.length) return '<p class="ts tm">영상 없음</p>';
  var h = '<table class="tbl"><tr><th>날짜</th><th>제목</th><th>조회수</th></tr>';
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    h += '<tr><td>' + fmt(v._date) + '</td><td>' + v.title + '</td><td>' + Number(v.views).toLocaleString() + '</td></tr>';
  }
  return h + '</table>';
}

// 쇼츠 날짜별 조회수 총합 표
function shortsTableHtml(list) {
  if (!list || !list.length) return '<p class="ts tm">쇼츠 없음</p>';
  var byDay = {}, order = [];
  for (var i = 0; i < list.length; i++) {
    var k = toKeyV2(list[i]._date);
    if (!byDay[k]) { byDay[k] = { d: list[i]._date, n: 0, sum: 0 }; order.push(k); }
    byDay[k].n++;
    byDay[k].sum += Number(list[i].views) || 0;
  }
  var h = '<table class="tbl"><tr><th>날짜</th><th>쇼츠 수</th><th>조회수 합계</th></tr>';
  for (var j = 0; j < order.length; j++) {
    var g = byDay[order[j]];
    h += '<tr><td>' + fmt(g.d) + '</td><td>' + g.n + '</td><td>' + g.sum.toLocaleString() + '</td></tr>';
  }
  return h + '</table>';
}

// ── runStep2 메인 함수 ──
function runStep2() {
  var st = document.getElementById('s2status');
  document.getElementById('s2log').innerHTML = '';
  st.textContent = '데이터를 불러오는 중...';
  addLog('=== 데이터 수집 시작 ===');

  // Firebase(일정+메모) + GAS(유튜브) 동시 호출
  var firebasePromise = ensureAuthV2()
    .then(function() {
      return Promise.all([
        dbV2.ref('schedule').once('value'),
        dbV2.ref('memos').once('value')
      ]);
    })
    .catch(function(e) {
      addLog('Firebase 인증 오류: ' + e.message, 'err');
      throw e;
    });

  var gasPromise = fetch(GAS_URL + '?action=all')
    .then(function(r) { return r.json(); })
    .catch(function(e) {
      addLog('GAS 오류: ' + e.message, 'err');
      return null;
    });

  Promise.all([firebasePromise, gasPromise])
    .then(function(results) {
      var firebaseResults = results[0];
      var gasData = results[1];

      // ── Firebase 일정 처리 ──
      try {
        var cloudSched = firebaseResults[0].val() || {};
        var cloudMemos = firebaseResults[1].val() || {};
        addLog('Firebase 응답 수신', 'ok');

        var allRows = convertFirebaseToScheduleRows(cloudSched);
        S.lastSch = allRows.filter(function(r) { return inRange(r._date, S.lws, S.lwe); });
        S.thisSch = allRows.filter(function(r) { return inRange(r._date, S.tws, S.twe); });
        addLog('일정: 전체 ' + allRows.length + '건 / 지난주 ' + S.lastSch.length + '건, 이번주 ' + S.thisSch.length + '건', 'ok');
        toast('일정표 수집 완료', 'success');

        // ── 팀원 메모 (Firebase) ──
        // V1: data.docnotes.yangNote → V2: cloudMemos[weekKey].yye
        // V1: data.docnotes.choiNote → V2: cloudMemos[weekKey].cgil
        // 일정표는 월요일 기준 키로 저장하므로, S.tws(화요일)에서 하루 빼서 월요일 키를 구함
        var thisMon = new Date(S.tws);
        thisMon.setDate(thisMon.getDate() - 1);
        var thisWeekKey = toKeyV2(thisMon);
        var memoData = cloudMemos[thisWeekKey] || {};
        if (memoData.yye)  { setV('noteY', memoData.yye);  addLog('양영은 메모: ' + memoData.yye, 'ok'); }
        if (memoData.cgil) { setV('noteC', memoData.cgil); addLog('최건일 메모: ' + memoData.cgil, 'ok'); }

      } catch(e) {
        addLog('Firebase 처리 오류: ' + e.message, 'err');
      }

      // ── GAS 유튜브 처리 (V1과 완전히 동일한 로직) ──
      if (gasData && gasData.youtube && gasData.youtube.success) {
        var vids = gasData.youtube.videos || [];
        for (var i = 0; i < vids.length; i++) {
          vids[i]._date = new Date(vids[i].published);
          vids[i].title = clean(vids[i].title);
        }
        var lastVids = vids.filter(function(v) { return inRange(v._date, S.lws, S.lwe); });
        lastVids.sort(function(a, b) { return a._date - b._date; });
        // GAS가 최근 영상 일부(예: 20건)만 내려주면 지난주 앞부분이 누락되므로 경고
        if (vids.length) {
          var oldest = vids.reduce(function(m, v) { return v._date < m ? v._date : m; }, vids[0]._date);
          if (oldest > S.lws)
            addLog('⚠ GAS가 받아온 영상 ' + vids.length + '건 중 가장 오래된 영상이 ' + fmt(oldest) + ' 입니다. 지난주 시작(' + fmt(S.lws) + ')부터의 영상이 누락됐을 수 있습니다 (GAS 조회 개수 제한 확인).', 'err');
        }
        S.yt = []; S.cut1 = []; S.cut2 = []; S.shR = []; S.shM = []; S.shU = [];
        for (var j = 0; j < lastVids.length; j++) {
          var kind = classifyVideo(lastVids[j]);
          (kind === 'main' ? S.yt : S[kind]).push(lastVids[j]);
        }
        addLog('유튜브: 전체 ' + vids.length + '건 / 지난주 ' + lastVids.length + '건 (동영상 ' + S.yt.length +
               ' · 경제유튭10분컷 ' + S.cut1.length + ' · 증시리포트10분컷 ' + S.cut2.length +
               ' · 라디올라 쇼츠 ' + S.shR.length + ' · 머니올라 쇼츠 ' + S.shM.length + ')', 'ok');
        if (S.shU.length) addLog('[라디올라]/[머니올라] 표시가 없는 쇼츠 ' + S.shU.length + '건 (보고서에서 제외됨)', 'err');
        toast('유튜브 수집 완료', 'success');
      } else {
        S.yt = []; S.cut1 = []; S.cut2 = []; S.shR = []; S.shM = []; S.shU = [];
        addLog('유튜브 데이터 없음', 'err');
      }

      document.getElementById('s2load').classList.add('hidden');
      document.getElementById('s2result').classList.remove('hidden');
      renderS2();
    })
    .catch(function(e) {
      addLog('오류: ' + e.message, 'err');
      document.getElementById('s2load').classList.add('hidden');
      document.getElementById('s2result').classList.remove('hidden');
      renderS2();
    });
}

/* ===== Step 2 렌더링 (V1과 완전히 동일) ===== */
function renderS2() {
  /* 유튜브 (5개 항목) */
  document.getElementById('ytR').innerHTML = videoTableHtml(S.yt);
  document.getElementById('cut1R').innerHTML = videoTableHtml(S.cut1);
  document.getElementById('cut2R').innerHTML = videoTableHtml(S.cut2);
  document.getElementById('shRR').innerHTML = shortsTableHtml(S.shR);
  document.getElementById('shMR').innerHTML = shortsTableHtml(S.shM);

  /* 지난주 일정: 녹화 + 특이사항만 (업로드 제외) */
  var ld = document.getElementById('schLast');
  if (!S.lastSch.length) {
    ld.innerHTML = '<p class="ts tm">일정 없음</p>';
  } else {
    var byDate = {}, order = [];
    for (var i = 0; i < S.lastSch.length; i++) {
      var r = S.lastSch[i];
      var key = r.dateStr;
      if (!byDate[key]) { byDate[key] = { dateStr: r.dateStr, records: [], notes: [] }; order.push(key); }
      if (r.studioRecordClean) byDate[key].records.push(r.studioRecordClean);
      if (r.note) byDate[key].notes.push(r.note);
    }
    var h = '<table class="tbl"><tr><th>날짜</th><th>녹화</th><th>특이사항</th></tr>';
    for (var oi = 0; oi < order.length; oi++) {
      var g = byDate[order[oi]];
      h += '<tr><td>' + g.dateStr + '</td>';
      h += '<td>' + (g.records.length ? g.records.join(', ') : '-') + '</td>';
      h += '<td>' + (g.notes.length ? g.notes.join(', ') : '-') + '</td></tr>';
    }
    h += '</table>';
    ld.innerHTML = h;
  }

  /* 이번주 일정 */
  var td = document.getElementById('schThis');
  if (!S.thisSch.length) {
    td.innerHTML = '<p class="ts tm">일정 없음</p>';
  } else {
    var byDate2 = {}, order2 = [];
    for (var i = 0; i < S.thisSch.length; i++) {
      var r = S.thisSch[i];
      var key = r.dateStr;
      if (!byDate2[key]) { byDate2[key] = { dateStr: r.dateStr, uploads: [], records: [], notes: [] }; order2.push(key); }
      if (r.uploadItem) byDate2[key].uploads.push(r.uploadItem);
      if (r.studioRecordClean) byDate2[key].records.push(r.studioRecordClean);
      if (r.note) byDate2[key].notes.push(r.note);
    }
    var h = '<table class="tbl"><tr><th>날짜</th><th>업로드</th><th>녹화</th><th>특이사항</th></tr>';
    for (var oi = 0; oi < order2.length; oi++) {
      var g = byDate2[order2[oi]];
      h += '<tr><td>' + g.dateStr + '</td>';
      h += '<td>' + (g.uploads.length ? g.uploads.join(', ') : '-') + '</td>';
      h += '<td>' + (g.records.length ? g.records.join(', ') : '-') + '</td>';
      h += '<td>' + (g.notes.length ? g.notes.join(', ') : '-') + '</td></tr>';
    }
    h += '</table>';
    td.innerHTML = h;
  }
}
