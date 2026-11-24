/* ===== Gemini API Key 관리 ===== */
(function(){
  var saved = localStorage.getItem('gemini_api_key') || '';
  var inp = document.getElementById('geminiKey');
  var st  = document.getElementById('keyStatus');
  if(saved){
    inp.value = saved;
    st.textContent = '✅ 저장된 키가 있습니다.';
    st.style.color = '#34d399';
  }
  document.getElementById('btnSaveKey').addEventListener('click', function(){
    var k = inp.value.trim();
    if(!k){ st.textContent = '❌ 키를 입력하세요.'; st.style.color = '#f87171'; return; }
    localStorage.setItem('gemini_api_key', k);
    st.textContent = '✅ 저장되었습니다.';
    st.style.color = '#34d399';
    toast('API Key 저장됨','success');
  });
})();

function getGeminiKey(){
  return (document.getElementById('geminiKey').value || localStorage.getItem('gemini_api_key') || '').trim();
}

/* ===== 이미지 → Base64 변환 ===== */
function fileToBase64(file, callback){
  var reader = new FileReader();
  reader.onload = function(e){
    var dataUrl = e.target.result;
    var base64 = dataUrl.split(',')[1];
    var mimeType = dataUrl.split(';')[0].split(':')[1];
    callback(base64, mimeType);
  };
  reader.readAsDataURL(file);
}

/* ===== 모델 자동 선택 (모델이 종료/변경돼도 동작하도록) =====
   1) 알려진 모델을 순서대로 시도 → 2) 전부 "모델 없음"이면 ListModels로 flash 계열 자동 탐색 */
var GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/';

function geminiPost(model, key, body){
  return fetch(GEMINI_BASE + 'models/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body)
  }).then(function(r){
    if(r.ok) return r.json();
    return r.text().then(function(t){
      var e = new Error('Gemini API 오류 (' + r.status + ', ' + model + '): ' + t.slice(0, 300));
      e.status = r.status;
      throw e;
    });
  });
}

function findFlashModels(key){
  return fetch(GEMINI_BASE + 'models?pageSize=200', { headers: { 'x-goog-api-key': key } })
    .then(function(r){ return r.ok ? r.json() : { models: [] }; })
    .then(function(d){
      return (d.models || []).filter(function(m){
        return /flash/i.test(m.name) && !/lite|image|tts|live|audio|thinking|exp/i.test(m.name) &&
               (m.supportedGenerationMethods || []).indexOf('generateContent') > -1;
      }).map(function(m){ return m.name.replace('models/', ''); }).reverse();
    }).catch(function(){ return []; });
}

function callGeminiWithFallback(key, body){
  var tried = [];
  function attempt(list){
    if(!list.length) return Promise.reject(new Error('사용 가능한 Gemini 모델을 찾지 못했습니다 (시도: ' + tried.join(', ') + ')'));
    var model = list[0];
    tried.push(model);
    return geminiPost(model, key, body).catch(function(err){
      // 모델 없음(404) / 과부하(503) / 해당 모델 한도 초과(429)면 다음 모델 시도, 그 외(키 오류 등)는 즉시 실패
      if([404, 429, 503].indexOf(err.status) > -1) return attempt(list.slice(1));
      throw err;
    });
  }
  return attempt(GEMINI_MODELS).catch(function(err){
    if(err.status !== 404 && !/찾지 못했습니다/.test(err.message)) throw err;
    return findFlashModels(key).then(function(found){
      found = found.filter(function(m){ return tried.indexOf(m) === -1; });
      if(!found.length) throw err;
      return attempt(found);
    });
  });
}

/* ===== Gemini Vision API 호출 ===== */
function callGemini(base64, mimeType, prompt, statusElId, callback){
  var key = getGeminiKey();
  if(!key){
    var el = document.getElementById(statusElId);
    if(el){ el.textContent = '❌ Gemini API Key를 먼저 입력하세요 (Step 1).'; el.style.color = '#f87171'; }
    toast('API Key가 없습니다. Step 1에서 입력하세요.','error');
    return;
  }

  var statusEl = document.getElementById(statusElId);
  if(statusEl){ statusEl.textContent = '🤖 Gemini AI 분석 중...'; statusEl.style.color = '#fbbf24'; }

  var body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      response_mime_type: 'application/json'
    }
  };

  callGeminiWithFallback(key, body)
  .then(function(data){
    console.log('Gemini raw response:', JSON.stringify(data));
    var text = '';
    try{
      // 생각(thought) 파트는 제외하고 텍스트 파트만 이어 붙임
      text = data.candidates[0].content.parts
        .filter(function(p){ return !p.thought && typeof p.text === 'string'; })
        .map(function(p){ return p.text; }).join('');
      if(!text) throw new Error('empty');
    }catch(e){
      var why = (data.promptFeedback && data.promptFeedback.blockReason) ||
                (data.candidates && data.candidates[0] && data.candidates[0].finishReason) || '';
      throw new Error('응답 파싱 실패' + (why ? ' (' + why + ')' : '') + ': ' + JSON.stringify(data).slice(0, 300));
    }
    console.log('Gemini text:', text);

    var jsonStr = text.replace(/```json\s*/g,'').replace(/```/g,'').trim();
    var parsed;
    try{
      parsed = JSON.parse(jsonStr);
    }catch(e){
      throw new Error('JSON 파싱 실패: ' + jsonStr);
    }

    if(statusEl){ statusEl.textContent = '✅ AI 인식 완료'; statusEl.style.color = '#34d399'; }
    toast('Gemini AI 인식 완료','success');
    callback(parsed);
  })
  .catch(function(err){
    console.error('Gemini error:', err);
    if(statusEl){ statusEl.textContent = '❌ AI 인식 실패: ' + err.message; statusEl.style.color = '#f87171'; }
    toast('Gemini 인식 실패','error');
  });
}

/* ===== 채널 현황 프롬프트 & 적용 ===== */
var CHANNEL_PROMPT = [
  '이 이미지는 유튜브 채널 분석 스크린샷입니다.',
  '다음 항목을 정확하게 읽어서 JSON으로 반환하세요.',
  '숫자에 콤마(,)를 포함하고, 통화 기호(₩)는 제외하세요.',
  '구독자 변화는 +/- 기호를 포함하세요.',
  '',
  '반환할 JSON 형식:',
  '{',
  '  "views": "조회수 (예: 484,567)",',
  '  "subs": "구독자 변화 (예: +485)",',
  '  "revenue": "예상 수익 (예: 1,265,641)",',
  '  "cpm": "재생 기반 CPM (예: 6,645)",',
  '  "rpm": "RPM (예: 3,309)",',
  '  "ctr": "썸네일 클릭률 (예: 6.3%)",',
  '  "avgDuration": "평균 시청 지속 시간 (예: 9:16)"',
  '}',
  '',
  '이미지에 해당 항목이 없으면 빈 문자열("")로 반환하세요.',
  '반드시 유효한 JSON만 반환하세요.'
].join('\n');

function applyChannelData(data){
  console.log('채널 데이터 적용:', data);
  if(data.views)       setV('ch_views', data.views);
  if(data.subs)        setV('ch_subs', data.subs);
  if(data.revenue)     setV('ch_rev', data.revenue);
  if(data.cpm)         setV('ch_cpm', data.cpm);
  if(data.rpm)         setV('ch_rpm', data.rpm);
  if(data.ctr)         setV('ch_ctr', data.ctr);
  if(data.avgDuration) setV('ch_avg', data.avgDuration);
}

/* ===== 콘텐츠 유형 프롬프트 & 적용 ===== */
var CONTENT_PROMPT = [
  '이 이미지는 유튜브 콘텐츠 유형별 분석 스크린샷입니다.',
  '"동영상"과 "Shorts" 각각의 조회수와 시청 시간(시간)을 읽어 JSON으로 반환하세요.',
  '',
  '각 값은 "숫자(퍼센트%)" 형식으로 반환하되:',
  '- 10,000 이상이면 "만" 단위로 변환 (예: 349,262 → "34.9만", 59,591.6 → "6.0만")',
  '- 10,000 미만이면 콤마 포함 숫자 또는 소수점 (예: 828.5)',
  '- 퍼센트는 소수점 1자리 (예: 69.4%)',
  '',
  '반환할 JSON 형식:',
  '{',
  '  "videoViews": "동영상 조회수 (예: 34.9만(69.4%))",',
  '  "videoWatchTime": "동영상 시청 시간 (예: 6.0만(98.7%))",',
  '  "shortsViews": "Shorts 조회수 (예: 15.4만(30.6%))",',
  '  "shortsWatchTime": "Shorts 시청 시간 (예: 828.5(1.3%))"',
  '}',
  '',
  '이미지에 해당 항목이 없으면 빈 문자열("")로 반환하세요.',
  '반드시 유효한 JSON만 반환하세요.'
].join('\n');

function applyContentData(data){
  console.log('콘텐츠 데이터 적용:', data);
  if(data.videoViews)      setV('ct_vv', data.videoViews);
  if(data.videoWatchTime)  setV('ct_vw', data.videoWatchTime);
  if(data.shortsViews)     setV('ct_sv', data.shortsViews);
  if(data.shortsWatchTime) setV('ct_sw', data.shortsWatchTime);
}

/* ===== 이미지 업로드 핸들러 ===== */
document.getElementById('chImg').addEventListener('change', function(e){
  var f = e.target.files[0];
  if(!f) return;
  var img = document.getElementById('chImgP');
  img.src = URL.createObjectURL(f);
  img.classList.remove('hidden');
  ['ch_views','ch_subs','ch_rev','ch_cpm','ch_rpm','ch_ctr','ch_avg'].forEach(function(id){
    setV(id,'');
  });
  document.getElementById('chOcrStatus').textContent = '';
  document.getElementById('chOcrStatus').style.color = '#fbbf24';

  fileToBase64(f, function(base64, mimeType){
    callGemini(base64, mimeType, CHANNEL_PROMPT, 'chOcrStatus', applyChannelData);
  });
});

document.getElementById('ctImg').addEventListener('change', function(e){
  var f = e.target.files[0];
  if(!f) return;
  var img = document.getElementById('ctImgP');
  img.src = URL.createObjectURL(f);
  img.classList.remove('hidden');
  ['ct_vv','ct_vw','ct_sv','ct_sw'].forEach(function(id){
    setV(id,'');
  });
  document.getElementById('ctOcrStatus').textContent = '';
  document.getElementById('ctOcrStatus').style.color = '#fbbf24';

  fileToBase64(f, function(base64, mimeType){
    callGemini(base64, mimeType, CONTENT_PROMPT, 'ctOcrStatus', applyContentData);
  });
});
