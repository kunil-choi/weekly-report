/* ===== 보고서 제목 자동 생성 ===== */
function getReportTitle(){
  var w=reportWeekInfo(S.lws);
  return '머니올라 '+w.year+'년 '+w.month+'월 '+w.week+'주차 보고';
}
function getReportFileName(){
  var w=reportWeekInfo(S.lws);
  return '머니올라_'+String(w.year).slice(-2)+'년_'+w.month+'월_'+w.week+'주차_보고.docx';
}

/* ===== Step 6: 미리보기 ===== */
function buildPreview(){
  var a=document.getElementById('prevArea');var h='';
  var lwRange=fmtShort(S.lws)+'~'+fmtShort(S.lwe);
  var twRange=fmtShort(S.tws)+'~'+fmtShort(S.twe);
  var title=getReportTitle();

  h+='<h3>■ '+title+'</h3>';

  /* ===== 지난주 실적: 유튜브 업로드 콘텐츠 + 조회수 ===== */
  h+='<h4 style="color:#818cf8;margin:14px 0 6px">▸ 지난주 실적 ('+lwRange+')</h4>';
  var lwD=daysIn(S.lws,S.lwe);

  /* 날짜 / 제목 / 조회수 표 (같은 날 여러 건이면 날짜 칸은 첫 행만) */
  function videoTable(id,label,list){
    var t='<h5 style="margin:10px 0 4px">'+label+'</h5>';
    t+='<table class="tbl" id="'+id+'"><tr><th>날짜</th><th>'+(id==='t1a'?'유튜브 업로드 콘텐츠':'제목')+'</th><th>조회수</th></tr>';
    for(var di=0;di<lwD.length;di++){
      var d=lwD[di];var dateLabel=fmtShort(d)+'('+DK[d.getDay()]+')';
      var vid=list.filter(function(v){return sameDay(v._date,d)});
      if(!vid.length){
        t+='<tr><td>'+dateLabel+'</td><td contenteditable="true">-</td><td contenteditable="true">-</td></tr>';
        continue;
      }
      for(var vi=0;vi<vid.length;vi++){
        t+='<tr><td>'+(vi===0?dateLabel:'')+'</td><td contenteditable="true">'+(vid[vi].title||'-')+'</td><td contenteditable="true">'+(Number(vid[vi].views)||0).toLocaleString()+'</td></tr>';
      }
    }
    return t+'</table>';
  }

  /* 쇼츠 표: 날짜별 조회수 총합 */
  function shortsTable(id,label,list){
    var t='<h5 style="margin:10px 0 4px">'+label+'</h5>';
    t+='<table class="tbl" id="'+id+'"><tr><th>날짜</th><th>조회수 총합</th></tr>';
    for(var di=0;di<lwD.length;di++){
      var d=lwD[di];var dateLabel=fmtShort(d)+'('+DK[d.getDay()]+')';
      var vid=list.filter(function(v){return sameDay(v._date,d)});
      var sum=0;for(var vi=0;vi<vid.length;vi++)sum+=Number(vid[vi].views)||0;
      t+='<tr><td>'+dateLabel+'</td><td contenteditable="true">'+(vid.length?sum.toLocaleString():'-')+'</td></tr>';
    }
    return t+'</table>';
  }

  h+=videoTable('t1a','유튜브 동영상',S.yt);
  h+=videoTable('t1c','못본경제유튭 10분컷',S.cut1);
  h+=videoTable('t1d','못본증시리포트 10분컷',S.cut2);
  h+=shortsTable('t1e','라디올라_beta (Shorts)',S.shR);
  h+=shortsTable('t1f','머니올라_shorts (Shorts)',S.shM);

  /* ===== 이번주 계획 ===== */
  h+='<h4 style="color:#34d399;margin:14px 0 6px">▸ 이번주 계획 ('+twRange+')</h4>';
  h+='<table class="tbl" id="t1b"><tr><th>날짜</th><th>업로드 및 예정 아이템</th><th>스튜디오 녹화 일정</th><th>특이사항</th></tr>';
  var twD=daysIn(S.tws,S.twe);
  for(var di=0;di<twD.length;di++){
    var d=twD[di];var dateLabel=fmtShort(d)+'('+DK[d.getDay()]+')';
    var sch=S.thisSch.filter(function(r){return sameDay(r._date,d)});
    var upload='-',record='-',noteVal='-';
    if(sch.length){
      var uploads=[],records=[],notes=[];
      for(var si=0;si<sch.length;si++){
        if(sch[si].uploadItem) uploads.push(sch[si].uploadItem);
        if(sch[si].studioRecordClean) records.push(sch[si].studioRecordClean);
        if(sch[si].note) notes.push(sch[si].note);
      }
      upload=uploads.length?uploads.join(', '):'-';
      record=records.length?records.join(', '):'-';
      noteVal=notes.length?notes.join(', '):'-';
    }
    h+='<tr><td>'+dateLabel+'</td><td contenteditable="true">'+upload+'</td><td contenteditable="true">'+record+'</td><td contenteditable="true">'+noteVal+'</td></tr>';
  }
  h+='</table>';

  /* ===== 채널 현황 (이미지와 동일한 가로 8열) ===== */
  h+='<h3>■ 채널 현황 ('+lwRange+')</h3>';
  h+='<table class="tbl" id="t2"><tr><th></th><th>조회수</th><th>구독자</th><th>예상 수익</th><th>재생 기반 CPM</th><th>RPM</th><th>썸네일 클릭률</th><th>평균 시청 지속 시간</th></tr>';
  h+='<tr><td><b>'+lwRange+'</b></td><td contenteditable="true">'+(S.ch.views||'')+'</td><td contenteditable="true">'+(S.ch.subs||'')+'</td><td contenteditable="true">'+(S.ch.rev||'')+'</td><td contenteditable="true">'+(S.ch.cpm||'')+'</td><td contenteditable="true">'+(S.ch.rpm||'')+'</td><td contenteditable="true">'+(S.ch.ctr||'')+'</td><td contenteditable="true">'+(S.ch.avg||'')+'</td></tr>';
  /* 지지난주 날짜 범위 계산 */
  var ppws=new Date(S.lws);ppws.setDate(ppws.getDate()-7);
  var ppwe=new Date(S.lws);ppwe.setDate(ppwe.getDate()-1);
  var ppRange=fmtShort(ppws)+'~'+fmtShort(ppwe);
  h+='<tr><td><b>'+ppRange+'</b></td><td contenteditable="true">'+(S.ch2.views||'')+'</td><td contenteditable="true">'+(S.ch2.subs||'')+'</td><td contenteditable="true">'+(S.ch2.rev||'')+'</td><td contenteditable="true">'+(S.ch2.cpm||'')+'</td><td contenteditable="true">'+(S.ch2.rpm||'')+'</td><td contenteditable="true">'+(S.ch2.ctr||'')+'</td><td contenteditable="true">'+(S.ch2.avg||'')+'</td></tr>';
  h+='</table>';

  /* ===== 콘텐츠 유형별 (5열: 날짜, 구분, 유형, 조회수, 시청 시간) ===== */
  h+='<h3>■ 콘텐츠 유형별 ('+lwRange+')</h3>';
  h+='<table class="tbl" id="t3"><tr><th></th><th></th><th>조회수</th><th>시청 시간</th></tr>';
  h+='<tr><td><b>'+lwRange+'</b></td><td>동영상</td><td contenteditable="true">'+(S.ct.vv||'')+'</td><td contenteditable="true">'+(S.ct.vw||'')+'</td></tr>';
  h+='<tr><td></td><td>Shorts</td><td contenteditable="true">'+(S.ct.sv||'')+'</td><td contenteditable="true">'+(S.ct.sw||'')+'</td></tr>';
  h+='<tr><td><b>'+ppRange+'</b></td><td>동영상</td><td contenteditable="true">'+(S.ct2.vv||'')+'</td><td contenteditable="true">'+(S.ct2.vw||'')+'</td></tr>';
  h+='<tr><td></td><td>Shorts</td><td contenteditable="true">'+(S.ct2.sv||'')+'</td><td contenteditable="true">'+(S.ct2.sw||'')+'</td></tr>';
  h+='</table>';


  /* ===== 구독자 & 메모 ===== */
  h+='<h3>■ 구독자 현황</h3>';
  h+='<p id="pSubs" contenteditable="true">현재 구독자 수: <b>'+(S.subs||'')+'</b></p>';
  h+='<h3>■ 팀원별 특이사항</h3>';
  h+='<table class="tbl" id="t4"><tr><th>팀원</th><th>내용</th></tr>';
  h+='<tr><td>양영은</td><td contenteditable="true">'+(S.nY||'-')+'</td></tr>';
  h+='<tr><td>최건일</td><td contenteditable="true">'+(S.nC||'-')+'</td></tr>';
  h+='</table>';
  a.innerHTML=h;
}
