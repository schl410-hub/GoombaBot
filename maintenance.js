
/**
 * commands/maintenance.js
 * --------------------------
 * 공지/점검 상태 조회 서비스 + !공지/!점검 명령어 + 모니터 레지스트리(Event.TICK) +
 * 자동 점검 알림 모니터를 담당한다.
 * (요구사항 ⑩ - "점검중 -> 정상" 전환 시에만 1회 알림)
 *
 * ⚠️ 원본 main.js에서 이 파일 안에 모니터 레지스트리(GoombaBot.monitors/registerMonitor/
 * dispatchTick) 인프라 자체가 위치해 있었다 - 스타일을 그대로 유지하기 위해 여기서도
 * 옮기지 않고 그대로 둔다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

GoombaBot.provider = GoombaBot.provider || {};

(function () {
  var E = GoombaBotConfig.endpoints;
  var toArray = GoombaBot.http.toArray;
  var extractField = GoombaBot.http.extractField;

  // ---- 공지 ----
  function getNotices(limit) {
    limit = limit || 5;
    var cacheKey = "notices_" + limit;
    var cached = GoombaBot.storage.read(cacheKey, GoombaBotConfig.cacheTtlMs.notice);
    if (cached) return cached;
    try {
      var json = GoombaBot.http.getJson(E.notices + "?limit=" + limit + "&offset=0");
      var arr = toArray(json);
      GoombaBot.storage.write(cacheKey, arr);
      return arr;
    } catch (e) {
      GoombaBot.log("공지 조회 실패: " + e);
      return GoombaBot.storage.readStale(cacheKey) || [];
    }
  }

  // ---- 점검 상태 ----
  function getMaintenanceStatus() {
    // TODO: 실제 응답 필드 이름(예: isUnderMaintenance/maintenance/status)을 확인 후
    // candidateKeys를 다듬어주세요. 지금은 흔히 쓰는 이름 후보를 방어적으로 다 시도합니다.
    try {
      var json = GoombaBot.http.getJson(E.maintenanceStatus);
      var raw = extractField(json, ["isUnderMaintenance", "isMaintenance", "maintenance", "status"]);
      var isUnderMaintenance = raw === true || raw === "true" || raw === "maintenance" || raw === "UNDER_MAINTENANCE";
      return { ok: true, isUnderMaintenance: isUnderMaintenance, raw: json };
    } catch (e) {
      GoombaBot.log("점검 상태 조회 실패: " + e);
      return { ok: false, isUnderMaintenance: null, raw: null };
    }
  }

  GoombaBot.provider.getNotices = getNotices;
  GoombaBot.provider.getMaintenanceStatus = getMaintenanceStatus;
})();

(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;
  var extractField = GoombaBot.http.extractField;

  // ---- !공지 ----
  GoombaBot.registerCommand("공지", {
    category: "공지", summary: "최근 공지 5개 / 공식 공지·업데이트 자동알림 켜기·끄기", usage: ["!공지", "!공지 켜기", "!공지 끄기", "!공지 테스트"],
    detail: {
      title: F.emoji.notice + " 공지 조회", examples: ["!공지", "!공지 켜기", "!공지 테스트"],
      features: [
        "최근 공지 5개를 보여줍니다",
        "!공지 켜기/끄기로 이 방에서 마비노기 모바일 공식 공지·업데이트 자동알림을 받을지 정할 수 있습니다",
        "!공지 테스트로 실제 발송되는 형식을 미리 볼 수 있습니다(실제 알림은 아님, 나에게만 보임)"
      ]
    },
    execute: function (chat) {
      // ⚠️ 신규 - 공식 홈페이지 자동알림 켜기/끄기 및 테스트 미리보기(officialnews.js).
      // 해당 없으면 아래 기존 동작(최근 공지 5개 조회)을 그대로 수행한다.
      if (GoombaBot.officialNews && GoombaBot.officialNews.handleToggleSub(chat, "공지", "공지·업데이트")) return;
      if (GoombaBot.officialNews && GoombaBot.officialNews.handleTestSub(chat, "공지")) return;

      var notices = P.getNotices(5);
      if (notices.length === 0) { chat.reply(F.emoji.warn + " 공지사항을 가져오지 못했습니다."); return; }
      var lines = [];
      for (var i = 0; i < notices.length; i++) lines.push("▸ " + extractField(notices[i], ["title", "name"]));
      chat.reply(F.box(F.emoji.notice + " 최신 공지 " + notices.length + "개", lines));
    }
  });

  // ---- !점검 ----
  GoombaBot.registerCommand("점검", {
    category: "공지", summary: "점검 상태 확인 (🟢/🔴 아이콘) / 공식 점검 자동알림 켜기·끄기", usage: ["!점검", "!점검 켜기", "!점검 끄기", "!점검 테스트"],
    detail: {
      title: F.emoji.maintenance + " 점검 상태", examples: ["!점검", "!점검 켜기", "!점검 테스트"],
      features: [
        "🟢 정상운영 / 🔴 점검중을 한눈에 보여줍니다",
        "!점검 켜기/끄기로 이 방에서 공식 점검 시작·종료·연장 자동알림을 받을지 정할 수 있습니다",
        "!점검 테스트로 실제 발송되는 형식을 미리 볼 수 있습니다(실제 알림은 아님, 나에게만 보임)"
      ]
    },
    execute: function (chat) {
      // ⚠️ 신규 - 공식 홈페이지 점검 자동알림 켜기/끄기 및 테스트 미리보기(officialnews.js).
      // 해당 없으면 아래 기존 동작(점검 상태 조회)을 그대로 수행한다.
      if (GoombaBot.officialNews && GoombaBot.officialNews.handleToggleSub(chat, "점검", "점검")) return;
      if (GoombaBot.officialNews && GoombaBot.officialNews.handleTestSub(chat, "점검")) return;

      var status = P.getMaintenanceStatus();
      if (!status.ok) { chat.reply(F.emoji.warn + " 점검 상태를 가져오지 못했습니다."); return; }
      chat.reply(status.isUnderMaintenance ? F.emoji.red + " 현재 점검중입니다." : F.emoji.green + " 현재 정상 운영중입니다.");
    }
  });
})();

// ---- MONITORS (Event.TICK 리스너는 이 프로젝트 전체에서 여기 한 곳에서만 등록) ----
/**
 * Event.TICK(1초 주기)은 여기서 딱 한 번만 등록한다. 등록된 각 모니터는 자기 주기
 * (intervalMs)마다만 check()가 실행된다.
 */

GoombaBot.monitors = [];

GoombaBot.registerMonitor = function (name, handler) {
  if (!handler || typeof handler.check !== "function") { GoombaBot.log("잘못된 모니터 등록 시도: " + name); return; }
  handler._name = name;
  handler._lastRunAt = 0;
  GoombaBot.monitors.push(handler);
};

GoombaBot.dispatchTick = function () {
  var now = Date.now();
  for (var i = 0; i < GoombaBot.monitors.length; i++) {
    var monitor = GoombaBot.monitors[i];
    var interval = monitor.intervalMs || 60000;
    if (now - monitor._lastRunAt < interval) continue;
    monitor._lastRunAt = now;
    try {
      var message = monitor.check();
      if (!message) continue;
      var rooms = typeof monitor.rooms === "function" ? monitor.rooms() : [];
      for (var r = 0; r < rooms.length; r++) GoombaBot.bot.send(rooms[r], message);
    } catch (e) {
      GoombaBot.log("모니터 실행 중 오류 (" + monitor._name + "): " + e);
    }
  }
};

/**
 * ⚠️ 데이터 예열(prefetch) 모니터 - 실기기에서 !룬(1756건) 같은 무거운 데이터의
 * "첫 조회"가 느리거나(심하면 네트워크 요청 자체가 실패) 하는 게 확인됐다. 사용자가
 * 직접 검색하기 전에, 봇이 시작된 직후 백그라운드에서 미리 하나씩 받아둬서, 실제
 * 사용자가 처음 검색할 때는 이미 캐시가 채워져 있게 만든다. 한 번에 다 받으면 그
 * 자체로 오래 걸리니, 1초(TICK)마다 하나씩만 순서대로 받는다.
 */
(function () {
  var warmupQueue = [
    function () { GoombaBot.provider.getRunes(); },
    function () { GoombaBot.provider.getRuneWords(); },
    function () { if (GoombaBot.provider.getRuneWordIndex) GoombaBot.provider.getRuneWordIndex(); }, // 룬↔룬워드 Map 인덱스 - 검색 시점이 아니라 여기서 미리 만들어둔다
    function () { if (GoombaBot.provider.findUsageFor) GoombaBot.provider.findUsageFor(""); }, // 룬 사용률 데이터도 미리 받아둠(검색마다 새로 안 받게)
    function () { GoombaBot.provider.getEnchants(); },
    function () { GoombaBot.provider.getArtifacts(); },
    function () { GoombaBot.provider.getItems(); },
    function () { GoombaBot.provider.getTitles(); },
    function () { if (GoombaBot.provider.getMarketCatalog) GoombaBot.provider.getMarketCatalog(); }
  ];
  var warmupIndex = 0;

  GoombaBot.registerMonitor("데이터예열모니터", {
    intervalMs: 1000,
    check: function () {
      if (warmupIndex >= warmupQueue.length) return null;
      try { warmupQueue[warmupIndex](); } catch (e) { GoombaBot.log("데이터 예열 실패(" + warmupIndex + "번): " + e); }
      warmupIndex++;
      return null; // 사용자에게 아무 메시지도 안 보냄 - 조용히 캐시만 채운다
    },
    rooms: function () { return []; }
  });
})();

/**
 * 자동 점검 알림 (요구사항 ⑩) - "점검중 -> 정상"으로 바뀔 때만 1회 알림.
 * 이전 상태를 Database에 저장해두고, 이번에 조회한 상태와 비교한다.
 */
GoombaBot.registerMonitor("점검알림모니터", {
  intervalMs: GoombaBotConfig.maintenanceCheckIntervalMs,
  check: function () {
    var status = GoombaBot.provider.getMaintenanceStatus();
    if (!status.ok) return null; // 조회 자체가 실패하면 조용히 넘어감 (다음 주기에 재시도)

    var previous = GoombaBot.storage.readStale("maintenance_last_state"); // true=점검중, false=정상, null=최초
    GoombaBot.storage.write("maintenance_last_state", status.isUnderMaintenance);

    if (previous === null) return null; // 최초 실행 - 기준점만 저장, 알림 없음
    if (previous === true && status.isUnderMaintenance === false) {
      return GoombaBot.format.emoji.party + " 마비노기 모바일 점검이 종료되었습니다!\n현재 접속 가능합니다.";
    }
    return null;
  },
  rooms: function () { return GoombaBotConfig.alertRooms; }
});

module.exports = { GoombaBot: GoombaBot };

