/**
 * [GAS 수정 안내] 영상마다 "속한 재생목록 이름(playlists)"을 응답에 추가합니다.
 *
 * ── 적용 방법 ──
 * 1) Apps Script 편집기 왼쪽 "서비스(+)" → "YouTube Data API v3" 추가 (식별자: YouTube)
 * 2) 아래 함수 2개를 GAS 프로젝트에 그대로 붙여넣기
 * 3) 기존에 유튜브 영상 목록(videos)을 만드는 코드에서, 응답으로 내보내기 직전에 한 줄 추가:
 *
 *      var plMap = getPlaylistMap_();
 *      videos.forEach(function (v) { v.playlists = plMap[v.videoId] || []; });
 *
 *    (변수명 videos 는 기존 코드의 영상 배열 이름에 맞게 바꿔주세요)
 * 4) 배포 → "배포 관리" → 연필 아이콘 → 버전: "새 버전" → 배포 (URL은 그대로 유지됨)
 *    처음 한 번은 YouTube 권한 승인 창이 뜹니다. 채널 소유 계정으로 승인해야 합니다.
 *
 * 화면(js/gas.js)은 재생목록 이름에 아래 단어가 들어있는지로 분류합니다 (띄어쓰기/대소문자 무시).
 *   "라디올라"            → 라디올라_beta 쇼츠
 *   "머니올라" + "shorts" → 머니올라_shorts 쇼츠
 *   "경제유튭" + "10분컷" → 못본경제유튭 10분컷
 *   "증시리포트" + "10분컷" → 못본증시리포트 10분컷
 */

// 보고서에 쓰는 재생목록 이름 (YouTube 스튜디오의 재생목록 제목과 같아야 함)
var REPORT_PLAYLIST_TITLES_ = ['라디올라_beta', '머니올라_shorts', '못본경제유튭 10분컷', '못본증시리포트 10분컷'];

/** @return {Object} { videoId: ['재생목록 이름', ...], ... } */
function getPlaylistMap_() {
  var map = {};
  var wanted = REPORT_PLAYLIST_TITLES_.map(function (t) { return t.replace(/\s+/g, '').toLowerCase(); });

  // 내 채널의 재생목록 전체 조회 (mine: true → 채널 소유 계정으로 실행되어야 함)
  var playlists = [], token;
  do {
    var res = YouTube.Playlists.list('snippet', { mine: true, maxResults: 50, pageToken: token });
    playlists = playlists.concat(res.items || []);
    token = res.nextPageToken;
  } while (token);

  playlists.forEach(function (pl) {
    var title = pl.snippet.title;
    if (wanted.indexOf(title.replace(/\s+/g, '').toLowerCase()) === -1) return; // 보고서 대상만

    var t2;
    do {
      var items = YouTube.PlaylistItems.list('contentDetails', { playlistId: pl.id, maxResults: 50, pageToken: t2 });
      (items.items || []).forEach(function (it) {
        var id = it.contentDetails.videoId;
        (map[id] = map[id] || []).push(title);
      });
      t2 = items.nextPageToken;
    } while (t2);
  });
  return map;
}
