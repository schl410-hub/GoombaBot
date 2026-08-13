
/**
 * commands/officialnews.js
 * ---------------------------
 * 마비노기 모바일 "공식" 홈페이지(mabimobi.life와는 다른, Nexon 공식 운영 사이트)의
 * 공지/이벤트/업데이트를 주기적으로 확인해서 자동으로 카카오톡 방에 알려주는 기능.
 *
 * ⚠️ RSS/공개 API 확인 결과 - 없음. 대신 공지/이벤트/업데이트 목록 페이지 자체가
 * 서버에서 완성된 형태로 내려오는 걸 확인해서(JS 렌더링 아님), Worker가 그 페이지를
 * 대신 가져와 글목록(id/제목/링크)만 정규식으로 뽑아 깨끗한 JSON으로 돌려준다.
 * ⚠️ 이 파싱은 실제 raw HTML을 직접 보지 못한 채로 "링크 태그는 이렇게 생겼을
 * 것이다"라는 가장 안전한 가정만으로 짠 것 - 배포 후 !진단으로 실제 추출 결과를
 * 확인해서 다듬어야 할 수 있다(mabimobi.life 필드명 확인 때와 같은 방식).
 *
 * ⚠️ 핵심 발견 - 점검 공지는 "새 글"이 아니라 "같은 글의 제목을 나중에 수정"하는
 * 방식으로 운영됨(예: "7/16 정기점검 안내(06:00~13:00)" → 나중에 "(완료) 7/16
 * 정기점검 안내(06:00~13:00)"로 제목만 바뀜). 그래서 "새 글 감지"뿐 아니라 이미
 * 알림을 보낸 글의 제목이 나중에 바뀌었는지도 계속 대조해야 점검 종료/연장을 잡을
 * 수 있다.
 *
 * ⚠️ "패치노트 AI 자동요약"은 굼바봇 코드 자체가 정적 JS라 실행 중에 AI를 호출할
 * 방법이 없어서(별도 AI API 연동 필요, 미확정) 이번엔 넣지 않았다. 대신 !패치로
 * 최신 업데이트 글 목록(제목+링크)만 확실하게 보여준다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

GoombaBot.provider = GoombaBot.provider || {};

(function () {
  var E = GoombaBotConfig.endpoints;

  /**
   * ⚠️ Worker가 이제 응답을 base64로 감싸서 보낸다({b64: "..."} 형태) - 실기기에서
   * 응답이 매번 비슷한 지점에서 잘리고 콜론 같은 평범한 문자까지 사라지는 현상이
   * 반복 확인됐는데, 이 프로젝트에서 예전에 "jsoup이 순수 텍스트를 HTML로 취급해서
   * 오염시키는" 문제를 겪은 전례와 같은 부류로 보여서 같은 해법(base64로 감싸기)을
   * 적용했다. base64 문자열(영문/숫자/+/=)은 HTML 파서가 오해할 여지가 없다.
   * GoombaBot.http.base64Decode()는 loader.js와 동일한 UTF-8 안전 디코더라 그대로 재사용.
   */
  function decodeNewsResponse(json) {
    if (!json || typeof json.b64 !== "string") return { items: [] };
    var decoded = GoombaBot.http.base64Decode(json.b64);
    return JSON.parse(decoded);
  }

  function fetchNewsList(path, cacheKey) {
    // ⚠️ 빈 배열([])도 "캐시 있음"으로 취급되면, 예전에 파싱 실패로 0건이 캐시된
    // 경우 10분 동안 새로 고쳐진 결과를 가리게 되는 문제가 실기기에서 확인됨
    // (!공지 테스트가 방금 고친 뒤에도 "0건"이라고 계속 나왔음) - 빈 배열은 캐시로
    // 인정하지 않고 매번 새로 가져오도록 수정.
    var cached = GoombaBot.storage.read(cacheKey, GoombaBotConfig.cacheTtlMs.notice);
    if (cached && cached.length > 0) return cached;
    try {
      var raw = GoombaBot.http.getJson(path);
      var json = decodeNewsResponse(raw);
      var items = (json && json.items) ? json.items : [];
      if (items.length > 0) GoombaBot.storage.write(cacheKey, items);
      return items;
    } catch (e) {
      GoombaBot.log("공식 홈페이지 목록 조회 실패(" + path + "): " + e);
      return GoombaBot.storage.readStale(cacheKey) || [];
    }
  }

  // ⚠️ 모니터 전용 - 캐시를 타면 모니터 주기(5분)보다 캐시 TTL(10분)이 더 길어서
  // 두 번에 한 번은 예전 데이터를 보게 되어 새 글/제목변경 감지가 밀리거나 뒤섞이는
  // 문제가 있었다(mock 테스트로 실제 재현됨). 모니터는 항상 최신으로 직접 가져온다
  // (사용자가 수동으로 치는 !공지/!이벤트/!패치는 기존처럼 캐시된 fetchNewsList 사용).
  function fetchNewsListFresh(path, cacheKey) {
    try {
      var raw = GoombaBot.http.getJson(path);
      var json = decodeNewsResponse(raw);
      var items = (json && json.items) ? json.items : [];
      // ⚠️ 빈 배열이면 캐시를 덮어쓰지 않는다 - 일시적으로 0건이 나온 경우
      // 기존에 저장된 정상 캐시가 날아가지 않게 하기 위함(사용자용 !공지 등에 영향).
      if (items.length > 0) GoombaBot.storage.write(cacheKey, items);
      return items;
    } catch (e) {
      GoombaBot.log("공식 홈페이지 목록 조회 실패(모니터, " + path + "): " + e);
      return GoombaBot.storage.readStale(cacheKey) || [];
    }
  }

  function getOfficialNotices() { return fetchNewsList(E.officialNotice, "official_notice_list"); }
  function getOfficialEvents() { return fetchNewsList(E.officialEvents, "official_events_list"); }
  function getOfficialUpdates() { return fetchNewsList(E.officialUpdate, "official_update_list"); }

  function getOfficialNoticesFresh() { return fetchNewsListFresh(E.officialNotice, "official_notice_list"); }
  function getOfficialEventsFresh() { return fetchNewsListFresh(E.officialEvents, "official_events_list"); }
  function getOfficialUpdatesFresh() { return fetchNewsListFresh(E.officialUpdate, "official_update_list"); }

  GoombaBot.provider.getOfficialNotices = getOfficialNotices;
  GoombaBot.provider.getOfficialEvents = getOfficialEvents;
  GoombaBot.provider.getOfficialUpdates = getOfficialUpdates;
  GoombaBot.provider.getOfficialNoticesFresh = getOfficialNoticesFresh;
  GoombaBot.provider.getOfficialEventsFresh = getOfficialEventsFresh;
  GoombaBot.provider.getOfficialUpdatesFresh = getOfficialUpdatesFresh;
})();

(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;

  // ---- 제목 텍스트만으로 분류(별도 태그 필드에 의존하지 않음 - 요청: 오탐 최소화를
  // 위해 내용 분석 필요, 지금은 제목에 이미 종류/시간이 다 들어있어서 이걸로 충분함) ----
  function isMaintenanceTitle(title) { return /정기\s*점검|임시\s*점검|긴급\s*점검|점검\s*안내/.test(title); }
  function isEmergencyTitle(title) { return /긴급\s*점검|임시\s*점검/.test(title); }
  function isDoneTitle(title) { return /^\s*(\(완료\)|완료\s)/.test(title); }
  function extractTimeRange(title) {
    var m = title.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return m[1] + ":" + m[2] + " ~ " + m[3] + ":" + m[4];
  }
  /** 연장 감지는 전체 시간대 문자열이 아니라 "종료 시각"만 비교한다(요청 반영) -
   * 시작시각은 그대로고 종료시각만 늘어나는 게 "연장"의 정확한 의미이기 때문. */
  function extractEndTime(title) {
    var m = title.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return m[3] + ":" + m[4];
  }
  /** 공지 하나의 상태를 "일반"/"점검시작"/"점검종료" 중 하나로 판정한다(요청 반영 -
   * id+제목뿐 아니라 상태값 자체를 저장해서 비교에 쓴다). */
  function computeStatus(title) {
    if (!isMaintenanceTitle(title)) return "일반";
    return isDoneTitle(title) ? "점검종료" : "점검시작";
  }

  // ---- 방별 설정 저장 (기본값: 전부 꺼짐 - 기존 방에 갑자기 스팸처럼 안 오도록) ----
  var SETTINGS_KEY = "official_news_room_settings";
  function getAllRoomSettings() { return GoombaBot.storage.readStale(SETTINGS_KEY) || {}; }
  function getRoomSetting(room, key) {
    var all = getAllRoomSettings();
    return !!(all[room] && all[room][key]);
  }
  function setRoomSetting(room, key, value) {
    var all = getAllRoomSettings();
    if (!all[room]) all[room] = { 공지: false, 점검: false, 이벤트: false };
    all[room][key] = value;
    GoombaBot.storage.write(SETTINGS_KEY, all);
  }
  function roomsWanting(key) {
    var all = getAllRoomSettings();
    var rooms = [];
    for (var room in all) { if (all.hasOwnProperty(room) && all[room][key]) rooms.push(room); }
    return rooms;
  }

  GoombaBot.officialNews = {
    isMaintenanceTitle: isMaintenanceTitle, isEmergencyTitle: isEmergencyTitle,
    isDoneTitle: isDoneTitle, extractTimeRange: extractTimeRange, extractEndTime: extractEndTime,
    computeStatus: computeStatus,
    getRoomSetting: getRoomSetting, setRoomSetting: setRoomSetting, roomsWanting: roomsWanting
  };

  // ---- 토글은 기존 "!공지"/"!점검" 명령어의 서브커맨드로 추가한다(!이벤트는 신규라
  // 별도 명령어로 만든다) - 절대 같은 이름으로 새 명령어를 등록하지 않는다(기존 기능이
  // 덮어써져서 사라지는 걸 방지). commands/maintenance.js에서 이 함수들을 불러서 쓴다.
  GoombaBot.officialNews.handleToggleSub = function (chat, key, label) {
    var sub = String(chat.args[0] || "");
    if (sub === "켜기") { setRoomSetting(chat.room.name, key, true); chat.reply(F.emoji.ok + " 이 방에서 공식 " + label + " 자동알림을 켰습니다."); return true; }
    if (sub === "끄기") { setRoomSetting(chat.room.name, key, false); chat.reply(F.emoji.ok + " 이 방에서 공식 " + label + " 자동알림을 껐습니다."); return true; }
    return false; // 켜기/끄기가 아니면 처리 안 함 - 호출부(기존 명령어)가 원래 하던 동작을 마저 하면 됨
  };

  // ---- "!공지 테스트" / "!점검 테스트" - 실제 공지가 올라올 때까지 안 기다리고
  // 실제 발송 형식 그대로 미리 볼 수 있게 하는 미리보기(요청 반영). **실제 API에서
  // 가져온 최신 데이터를 그대로 사용한다**(예전엔 하드코딩된 문구였는데, 실제 데이터로
  // 확인하고 싶다는 요청을 받아서 수정함) - seenMap/저장된 상태는 안 건드리고, 그
  // 자리에서 chat.reply로만 보여준다(실제 방 브로드캐스트 아님).
  GoombaBot.officialNews.handleTestSub = function (chat, key) {
    if (String(chat.args[0]) !== "테스트") return false;

    var notices = GoombaBot.provider.getOfficialNotices();
    if (notices.length === 0) {
      chat.reply(F.emoji.warn + " 지금 공식 공지 데이터를 하나도 못 가져왔습니다(파싱 실패 또는 0건). !진단 11로 원인을 확인해주세요.");
      return true;
    }

    if (key === "공지") {
      var latest = notices[0];
      chat.reply([
        "\uD83D\uDEA8 새 공지사항 발견! (테스트 미리보기)", "",
        "\uD83D\uDCDD " + latest.title, "",
        "\uD83D\uDD17 " + latest.url
      ].join("\n"));
      return true;
    }
    if (key === "점검") {
      var maint = null;
      for (var i = 0; i < notices.length; i++) { if (isMaintenanceTitle(notices[i].title)) { maint = notices[i]; break; } }
      if (!maint) { chat.reply(F.emoji.warn + " 지금 목록에 점검 관련 공지가 없어서 테스트 미리보기를 만들 수 없습니다."); return true; }
      var range = extractTimeRange(maint.title);
      var lines = [
        (isEmergencyTitle(maint.title) ? "\uD83D\uDEA8 긴급 점검" : "\uD83D\uDEA8 서버 점검 시작") + " (테스트 미리보기)",
        "", maint.title
      ];
      if (range) lines.push("", "\uD83D\uDD52 시간", range);
      lines.push("", maint.url);
      chat.reply(lines.join("\n"));
      return true;
    }
    return false;
  };

  // ---- !이벤트 (신규 명령어) ----
  GoombaBot.registerCommand("이벤트", {
    category: "공지", summary: "공식 홈페이지 최근 이벤트 목록 / 자동알림 켜기·끄기", usage: ["!이벤트", "!이벤트 켜기", "!이벤트 끄기"],
    detail: {
      title: "\uD83C\uDF89 이벤트", examples: ["!이벤트", "!이벤트 켜기"],
      features: ["최근 이벤트 5개를 보여줍니다", "!이벤트 켜기/끄기로 이 방에서 새 이벤트 자동알림을 받을지 정할 수 있습니다"]
    },
    execute: function (chat) {
      if (GoombaBot.officialNews.handleToggleSub(chat, "이벤트", "이벤트")) return;

      var items = P.getOfficialEvents();
      if (items.length === 0) { chat.reply(F.emoji.warn + " 이벤트 목록을 가져오지 못했습니다."); return; }
      var lines = [];
      for (var i = 0; i < Math.min(items.length, 5); i++) lines.push("▸ " + items[i].title);
      chat.reply(F.box("\uD83C\uDF89 최근 이벤트", lines));
    }
  });

  // ---- !패치 (신규 명령어 - 최신 업데이트/패치노트 목록) ----
  GoombaBot.registerCommand("패치", {
    category: "공지", summary: "공식 홈페이지 최근 업데이트(패치노트) 목록", usage: ["!패치"],
    detail: {
      title: "\uD83D\uDCD6 패치노트", examples: ["!패치"],
      features: ["최근 업데이트(패치노트) 5개의 제목과 링크를 보여줍니다", "본문 자동 요약은 상세페이지 구조 확인 후 다음 업데이트에서 추가 예정입니다"]
    },
    execute: function (chat) {
      var items = P.getOfficialUpdates();
      if (items.length === 0) { chat.reply(F.emoji.warn + " 업데이트 목록을 가져오지 못했습니다."); return; }
      var lines = [];
      for (var i = 0; i < Math.min(items.length, 5); i++) {
        lines.push(items[i].title);
        lines.push(items[i].url);
        if (i < Math.min(items.length, 5) - 1) lines.push("");
      }
      chat.reply(F.box("\uD83D\uDCD6 최근 업데이트", lines));
    }
  });
})();

// ---- MONITOR: 5분마다 공지/점검/이벤트/업데이트 새 글·제목변경 감지 ----
(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;
  var N = GoombaBot.officialNews;

  var SEEN_KEY = "official_notice_seen"; // { id: { title, isDone } } - 최대 MAX_SEEN개까지만 보관
  var MAX_SEEN = 150;

  function getSeenMap() { return GoombaBot.storage.readStale(SEEN_KEY) || {}; }
  function saveSeenMap(map) {
    // 너무 오래된 항목까지 무한정 쌓이지 않도록, id가 큰(최신) 순으로 MAX_SEEN개만 남긴다
    var ids = [];
    for (var id in map) { if (map.hasOwnProperty(id)) ids.push(id); }
    if (ids.length > MAX_SEEN) {
      ids.sort(function (a, b) { return Number(b) - Number(a); });
      var trimmed = {};
      for (var i = 0; i < MAX_SEEN; i++) trimmed[ids[i]] = map[ids[i]];
      map = trimmed;
    }
    GoombaBot.storage.write(SEEN_KEY, map);
  }

  function broadcast(rooms, message) {
    for (var i = 0; i < rooms.length; i++) {
      try { GoombaBot.bot.send(rooms[i], message); } catch (e) { GoombaBot.log("공식 소식 알림 전송 실패(" + rooms[i] + "): " + e); }
    }
  }

  /**
   * 공지 목록 처리 - 새 글/점검 시작·긴급점검/점검 종료/점검 연장을 전부 여기서 판단한다.
   * ⚠️ 요청 반영 - 각 글마다 {제목, 상태(일반/점검시작/점검종료), 종료시각, 마지막확인시각}을
   * 전부 저장해서 비교한다(이전엔 제목+완료여부만 저장했음). 이 저장 자체가 Database에
   * 영구 보관되므로, Worker나 봇이 재시작돼도 "이미 알린 상태"는 그대로 남아있어 같은
   * 알림이 중복 발송되지 않는다(요청 2번 - 중복 알림 방지).
   */
  function processNoticeList(items, seenMap, nowTs) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var prev = seenMap[item.id];
      var status = N.computeStatus(item.title);
      var endTime = N.extractEndTime(item.title);

      if (!prev) {
        // 신규 글
        if (status === "점검시작") {
          var timeRange = N.extractTimeRange(item.title);
          var isEmergency = N.isEmergencyTitle(item.title);
          var lines = [
            isEmergency ? "\uD83D\uDEA8 긴급 점검" : "\uD83D\uDEA8 서버 점검 시작",
            "",
            item.title
          ];
          if (timeRange) lines.push("", "\uD83D\uDD52 시간", timeRange);
          lines.push("", item.url);
          broadcast(N.roomsWanting("점검"), lines.join("\n"));
        } else if (status === "일반") {
          broadcast(N.roomsWanting("공지"), [
            "\uD83D\uDEA8 새 공지사항 발견!", "",
            "\uD83D\uDCDD " + item.title, "",
            "\uD83D\uDD17 " + item.url
          ].join("\n"));
        }
        // status === "점검종료"인 글이 "신규"로 잡히는 경우(예: 봇 다운 중에 시작→종료가
        // 한번에 지나간 경우)는 이미 지나간 점검이라 알림 없이 조용히 기록만 한다.
        seenMap[item.id] = { title: item.title, status: status, endTime: endTime, lastCheckedAt: nowTs };
        continue;
      }

      // 이미 본 글 - 제목이 그대로면 마지막 확인시각만 갱신하고 넘어간다(알림 없음)
      if (prev.title === item.title) { prev.lastCheckedAt = nowTs; continue; }

      // 제목이 바뀜 - 상태가 바뀐 경우와 종료시각만 바뀐 경우(연장)를 구분해서 딱 1번만 알린다
      if (prev.status !== "점검종료" && status === "점검종료") {
        broadcast(N.roomsWanting("점검"), [
          "\u2705 서버 점검 종료", "", "서버 접속 가능합니다.", "", "즐마하세요 \uD83C\uDF44"
        ].join("\n"));
      } else if (prev.endTime && endTime && prev.endTime !== endTime) {
        broadcast(N.roomsWanting("점검"), [
          "\u23F0 점검 연장", "", "기존", prev.endTime, "", "변경", endTime
        ].join("\n"));
      }
      // 그 외의 사소한 제목 수정(오타 정정 등)은 알림 스팸을 막기 위해 조용히 넘어간다
      seenMap[item.id] = { title: item.title, status: status, endTime: endTime, lastCheckedAt: nowTs };
    }
  }

  /** 이벤트/업데이트는 새 글만 있으면 그대로 알린다(제목 수정 추적 불필요) */
  function processSimpleList(items, seenMap, roomSettingKey, headerLine) {
    var nowTs = Date.now();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (seenMap[item.id]) { seenMap[item.id].lastCheckedAt = nowTs; continue; }
      broadcast(N.roomsWanting(roomSettingKey), [headerLine, "", item.title, "", item.url].join("\n"));
      seenMap[item.id] = { title: item.title, lastCheckedAt: nowTs };
    }
  }

  GoombaBot.registerMonitor("공식공지모니터", {
    intervalMs: 5 * 60 * 1000, // 요청하신 "5분" 주기
    check: function () {
      var nowTs = Date.now();
      var seenNotice = getSeenMap();
      // ⚠️ "seenNotice가 비어있으면 첫 실행"으로 판단했었는데, 공지 목록 조회가 우연히
      // 0건이거나 일시적으로 실패해도 seenNotice가 계속 비어서 매번 "첫 실행"으로
      // 오판되어 알림이 영원히 안 나가는 버그가 있었음(mock으로 재현됨) - 별도의
      // 명시적 초기화 플래그로 딱 한 번만 판단하도록 수정.
      var isFirstRun = GoombaBot.storage.readStale("official_news_initialized") !== true;

      var notices = P.getOfficialNoticesFresh();
      var events = P.getOfficialEventsFresh();
      var updates = P.getOfficialUpdatesFresh();

      if (isFirstRun) {
        // ⚠️ 봇을 처음 켠 순간 과거 글 전체를 "신규"로 착각해서 방마다 수십 개씩
        // 몰아서 보내면 안 되니, 첫 실행에서는 "본 것"으로만 기록하고 알림은 안 보낸다.
        for (var i = 0; i < notices.length; i++) {
          seenNotice[notices[i].id] = {
            title: notices[i].title, status: N.computeStatus(notices[i].title),
            endTime: N.extractEndTime(notices[i].title), lastCheckedAt: nowTs
          };
        }
        saveSeenMap(seenNotice);

        var seenEvents = {};
        for (var e = 0; e < events.length; e++) seenEvents[events[e].id] = { title: events[e].title, lastCheckedAt: nowTs };
        GoombaBot.storage.write("official_events_seen", seenEvents);

        var seenUpdates = {};
        for (var u = 0; u < updates.length; u++) seenUpdates[updates[u].id] = { title: updates[u].title, lastCheckedAt: nowTs };
        GoombaBot.storage.write("official_updates_seen", seenUpdates);
        GoombaBot.storage.write("official_news_initialized", true);
        return null;
      }

      processNoticeList(notices, seenNotice, nowTs);
      saveSeenMap(seenNotice);

      var seenEvents2 = GoombaBot.storage.readStale("official_events_seen") || {};
      processSimpleList(events, seenEvents2, "이벤트", "\uD83C\uDF89 마비노기 공식 이벤트");
      GoombaBot.storage.write("official_events_seen", seenEvents2);

      var seenUpdates2 = GoombaBot.storage.readStale("official_updates_seen") || {};
      processSimpleList(updates, seenUpdates2, "공지", "\uD83D\uDCD6 마비노기 공식 업데이트");
      GoombaBot.storage.write("official_updates_seen", seenUpdates2);

      return null; // 이 모니터는 broadcast()로 직접 send하므로 반환 메시지 없음
    },
    rooms: function () { return []; }
  });
})();

module.exports = { GoombaBot: GoombaBot };
