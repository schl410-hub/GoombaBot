
/**
 * commands/homework.js
 * -----------------------
 * 검은 구멍/어비스 구멍/심층 구멍/숙제 - 조회 서비스 + 명령어를 담당한다.
 * (!검구, !어구, !심구, !숙제)
 *
 * ⚠️ 어구/심구/숙제는 API를 못 찾으셨다고 하셔서 지어내지 않고 TODO로 남깁니다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

GoombaBot.provider = GoombaBot.provider || {};

(function () {
  var E = GoombaBotConfig.endpoints;

  // ---- 검은 구멍 설정 ----
  function getDeepHoleConfig() {
    var cacheKey = "deep_hole_config";
    var cached = GoombaBot.storage.read(cacheKey, GoombaBotConfig.cacheTtlMs.default);
    if (cached) return cached;
    try {
      var json = GoombaBot.http.getJson(E.deepHoleConfig);
      GoombaBot.storage.write(cacheKey, json);
      return json;
    } catch (e) {
      GoombaBot.log("검은 구멍 설정 조회 실패: " + e);
      return GoombaBot.storage.readStale(cacheKey) || null;
    }
  }

  // ---- 어비스 구멍 / 심층 구멍 / 숙제 ----
  // ⚠️ 사용자가 API를 못 찾았다고 명시함 - 절대 지어내지 않고 TODO로 남긴다.
  function getAbyssHoleStatus() { return null; } // TODO: tracker API 또는 숨겨진 API 확인되면 구현
  function getDeepDungeonStatus() { return null; } // TODO: 위와 동일 (심층 구멍)
  function getHomeworkStatus() { return null; } // TODO: tracker API 확인되면 구현

  GoombaBot.provider.getDeepHoleConfig = getDeepHoleConfig;
  GoombaBot.provider.getAbyssHoleStatus = getAbyssHoleStatus;
  GoombaBot.provider.getDeepDungeonStatus = getDeepDungeonStatus;
  GoombaBot.provider.getHomeworkStatus = getHomeworkStatus;
})();

(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;
  var extractField = GoombaBot.http.extractField;


  // ---- !검구 (검은 구멍) ----
  // ⚠️ 추측 필드명(recommendedAreas 등)이 실제와 다르면 전부 "정보 없음"으로 보이던 문제가
  // 있었음 - 추측 대신 응답에 실제로 들어있는 필드를 F.renderDetail로 전부 자동 나열한다.
  // (필드명이 완전히 다르게 와도 정상 표시됨 - !진단 9번(검은구멍)으로 실제 필드명 확인 가능)
  GoombaBot.registerCommand("검구", {
    category: "던전", summary: "검은 구멍 추천/추적 지역", usage: ["!검구"],
    detail: { title: "\uD83D\uDD73 검은 구멍", examples: ["!검구"], features: ["응답에 실제로 들어있는 필드를 전부 자동으로 보여줍니다(필드명이 달라도 안전)"] },
    execute: function (chat) {
      var config = P.getDeepHoleConfig();
      if (!config) { chat.reply(F.emoji.warn + " 검은 구멍 정보를 가져오지 못했습니다. 운영진에게 !진단 9로 확인을 요청해주세요."); return; }

      var isArray = Object.prototype.toString.call(config) === "[object Array]";
      var out = [];
      if (isArray) {
        for (var i = 0; i < config.length; i++) {
          var entry = config[i];
          var entryName = extractField(entry, ["name", "area", "areaName", "title"]);
          var entryLines = F.renderDetailAll(entry, {});
          out.push((entryName ? "▸ " + entryName : "▸ " + (i + 1) + "번째 지역") + (entryLines.length ? "\n" + entryLines.join("\n") : ""));
        }
      } else {
        out = F.renderDetailAll(config, {});
      }
      if (out.length === 0) { chat.reply(F.emoji.warn + " 검은 구멍 응답에서 표시할 필드를 찾지 못했습니다. !진단 9로 실제 구조를 확인해주세요."); return; }
      chat.reply(F.box("\uD83D\uDD73 검은 구멍", out));
    }
  });

  // ---- 어비스 구멍(!어구) - API 없이 "기준시각 + 36시간15분 간격"으로 계산 ----
  // ⚠️ 심층 구멍/숙제는 여전히 API 미확인이라 TODO로 남긴다(어구만 계산식으로 구현).
  var ABYSS_INTERVAL_MS = 36 * 3600 * 1000 + 15 * 60 * 1000; // 36시간 15분

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function formatDateTime(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function formatTimeOnly(ms) {
    var d = new Date(ms);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function formatRemaining(ms) {
    if (ms < 0) ms = 0;
    var totalMin = Math.floor(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return h + "시간 " + m + "분";
  }
  function getAbyssBaseTime() { return GoombaBot.storage.readStale("abyss_base_time"); }
  function computeNextAbyssOccurrence(baseTime, now) {
    if (now <= baseTime) return baseTime;
    var n = Math.ceil((now - baseTime) / ABYSS_INTERVAL_MS);
    return baseTime + n * ABYSS_INTERVAL_MS;
  }

  /**
   * ⚠️ 알림 단계 정의 - 시간이 큰 순서대로. 각 단계의 ms는 "이 시간 이하로 남으면
   * 이 단계"라는 뜻(예: 30분=1800000ms 이하 남았을 때). 순서대로 하나씩만 보낸다.
   * 예전 코드는 "정확히 29~30분 남았을 때"처럼 폭이 좁은 시간창으로 체크해서,
   * 타이밍이 살짝만 어긋나도 알림을 통째로 놓칠 위험이 있었다 - 이번에는
   * "이 시간 이하로 남았고 + 아직 이 단계를 안 보냈으면" 방식으로 바꿔서 그런
   * 위험을 없앴다(모니터가 늦게 돌아도 다음 체크 때 확실히 잡힘).
   */
  var ABYSS_STAGES = [
    { key: "30min", ms: 30 * 60000, message: function (next) { return "\uD83E\uDE9D 어구까지 30분 남았습니다!\n\uD83D\uDD52 예정 시간 : " + formatTimeOnly(next); } },
    { key: "15min", ms: 15 * 60000, message: function (next) { return "\uD83E\uDE9D 어구까지 15분 남았습니다!\n\uD83D\uDD52 예정 시간 : " + formatTimeOnly(next); } },
    { key: "5min", ms: 5 * 60000, message: function (next) { return "\uD83E\uDE9D 어구까지 5분 남았습니다!\n\uD83D\uDD52 예정 시간 : " + formatTimeOnly(next); } },
    { key: "start", ms: 0, message: function () { return "\uD83C\uDFA3 어구 시간입니다!"; } }
  ];

  /** 지금 이 순간(now) 기준으로, next 발생시각까지 이미 지나버린 단계들은 "보낸 것"으로
   * 선반영해서 나중에 뒤늦게 쏟아지지 않게 한다(예: 8분 전에 등록하면 30/15분 단계는
   * 조용히 건너뛰고 5분/시작만 남긴다). */
  function buildAlreadyPassedStages(next, now) {
    var msUntil = next - now;
    var passed = [];
    for (var i = 0; i < ABYSS_STAGES.length; i++) {
      if (msUntil <= ABYSS_STAGES[i].ms) passed.push(ABYSS_STAGES[i].key);
    }
    return passed;
  }

  GoombaBot.registerMonitor("어구감시모니터", {
    intervalMs: 30000, // 30초마다 체크(1분 단위 시간창을 없앴으니 더 자주 봐도 안전)
    check: function () {
      if (GoombaBot.storage.readStale("abyss_monitor_enabled") !== true) return null;
      var baseTime = getAbyssBaseTime();
      if (!baseTime) return null;

      var now = Date.now();
      var record = GoombaBot.storage.readStale("abyss_alerted_stages");

      // ⚠️ 핵심 - "지금 이 순간 기준으로 다음 회차"를 매번 새로 계산하면, 정확한
      // 발생시각을 살짝이라도 지나는 순간 computeNextAbyssOccurrence가 36시간 15분
      // 뒤의 "그 다음 회차"로 넘어가버려서 "시작 시각" 알림을 사실상 절대 못 잡는다
      // (체크 주기가 그 찰나의 순간과 정확히 겹칠 확률이 거의 없기 때문). 그래서
      // "지금 추적 중인 회차"를 그대로 유지하다가, 그 회차의 4단계를 전부 보낸
      // 뒤에만 다음 회차로 넘어가도록 바꿨다.
      var target;
      if (!record || !record.forOccurrence) {
        target = computeNextAbyssOccurrence(baseTime, now);
        record = { forOccurrence: target, sentStages: [] };
      } else {
        target = record.forOccurrence;
        if (record.sentStages.length >= ABYSS_STAGES.length) {
          target = target + ABYSS_INTERVAL_MS;
          while (target < now - ABYSS_INTERVAL_MS) target += ABYSS_INTERVAL_MS; // 봇이 오래 꺼져있었을 때 대비 안전장치
          record = { forOccurrence: target, sentStages: buildAlreadyPassedStages(target, now) };
        }
      }

      var msUntil = target - now;
      for (var i = 0; i < ABYSS_STAGES.length; i++) {
        var stage = ABYSS_STAGES[i];
        if (msUntil <= stage.ms && record.sentStages.indexOf(stage.key) === -1) {
          record.sentStages.push(stage.key);
          GoombaBot.storage.write("abyss_alerted_stages", record);
          return stage.message(target);
        }
      }
      GoombaBot.storage.write("abyss_alerted_stages", record); // target/sentStages가 방금 갱신됐을 수 있으니 저장
      return null;
    },
    rooms: function () { return GoombaBotConfig.alertRooms || []; }
  });

  /** "30분뒤"/"30분전"/"30분" 어디에 있든 숫자만 뽑아낸다. 못 찾으면 null. */
  function parseMinutesArg(text) {
    var m = String(text).match(/(\d+)\s*분/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return isNaN(n) ? null : n;
  }

  GoombaBot.registerCommand("어구", {
    category: "던전", summary: "다음 어비스 구멍 시간/남은시간/이후 일정, 개인 알림 등록", usage: ["!어구", "!어구 알림 30분뒤"],
    detail: {
      title: "\uD83D\uDD73 어비스 구멍", examples: ["!어구", "!어구 알림 30분뒤"],
      features: [
        "기준 시각 + 36시간 15분 간격으로 계산합니다(실시간 API 아님)",
        "!어구 알림 [N]분뒤(또는 분전)로 다음 생성 N분 전에 이 방으로 알림을 한 번 받을 수 있습니다(누구나 사용 가능)",
        "관리자는 !어구기준으로 기준시각을 조정하고 !어구감시로 방 전체 자동알림을 켤 수 있습니다"
      ]
    },
    execute: function (chat) {
      // ⚠️ "!어구 알림 30분뒤" - 개인이 원하는 리드타임으로 일회성 알림을 등록한다.
      // 기존 "!어구감시"(관리자 전용, 방 전체, 30/15/5분+시작 고정 4단계)와는 별개의
      // 기능 - 이건 누구나 쓸 수 있고, 원하는 분 단위를 직접 지정할 수 있다.
      if (String(chat.args[0]) === "알림") {
        var minutes = parseMinutesArg(chat.args.slice(1).join(" "));
        if (minutes === null || minutes <= 0) {
          chat.reply(F.usageBlock(["!어구 알림 30분뒤", "!어구 알림 10분전"]));
          return;
        }

        var baseTimeForAlert = getAbyssBaseTime();
        if (!baseTimeForAlert) {
          chat.reply(F.emoji.warn + " 아직 기준 시각이 설정되지 않았습니다.\n운영진에게 !어구기준 설정을 요청해주세요.");
          return;
        }

        var nowForAlert = Date.now();
        var nextForAlert = computeNextAbyssOccurrence(baseTimeForAlert, nowForAlert);
        var alertAt = nextForAlert - minutes * 60000;

        if (alertAt <= nowForAlert) {
          chat.reply(F.emoji.warn + " 이미 그 시점이 지났습니다. 다음 생성까지 " + formatRemaining(nextForAlert - nowForAlert) + " 남았습니다.");
          return;
        }

        var pendingAlerts = GoombaBot.storage.readStale("abyss_custom_alerts") || [];
        pendingAlerts.push({
          room: chat.room.name,
          minutesBefore: minutes,
          forOccurrence: nextForAlert,
          alertAt: alertAt
        });
        GoombaBot.storage.write("abyss_custom_alerts", pendingAlerts);

        chat.reply(F.box("\uD83D\uDD14 알림 등록 완료", [
          F.field("기준", "생성 " + minutes + "분 전"),
          F.field("다음 생성", formatDateTime(nextForAlert)),
          F.field("알림 예정", formatDateTime(alertAt))
        ]));
        return;
      }

      var baseTime = getAbyssBaseTime();
      if (!baseTime) {
        chat.reply(F.emoji.warn + " 아직 기준 시각이 설정되지 않았습니다.\n운영진에게 !어구기준 설정을 요청해주세요.\n(예: !어구기준 2026-07-25 20:00)");
        return;
      }

      var now = Date.now();
      var next = computeNextAbyssOccurrence(baseTime, now);

      var lines = [
        F.field("다음 생성", formatDateTime(next)),
        F.field("남은 시간", formatRemaining(next - now)),
        "",
        "\uD83D\uDCC5 이후 일정"
      ];
      for (var i = 0; i < 5; i++) lines.push("• " + formatDateTime(next + i * ABYSS_INTERVAL_MS));

      chat.reply(F.box("\uD83D\uDD73 어비스 구멍", lines));
    }
  });

  // ⚠️ "!어구 알림"으로 등록된 개인 알림 - 각자 다른 방/다른 리드타임일 수 있어서
  // 기존 모니터 방식(메시지 하나를 rooms() 목록에 그대로 뿌리는 방식)으로는 표현이
  // 안 된다. 그래서 이 모니터는 return으로 메시지를 넘기는 대신, 알림마다 직접
  // GoombaBot.bot.send(그 방, 메시지)를 호출한다.
  GoombaBot.registerMonitor("어구커스텀알림모니터", {
    intervalMs: 30000,
    check: function () {
      var pending = GoombaBot.storage.readStale("abyss_custom_alerts") || [];
      if (!pending.length) return null;

      var now = Date.now();
      var remaining = [];
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i];
        if (now >= p.alertAt) {
          try {
            GoombaBot.bot.send(p.room, "\uD83E\uDE9D 어구 알림!\n요청하신 대로 다음 생성 " + p.minutesBefore + "분 전입니다.\n\uD83D\uDD52 예정 시간 : " + formatTimeOnly(p.forOccurrence));
          } catch (sendError) {
            GoombaBot.log("어구 커스텀 알림 전송 실패: " + sendError);
          }
        } else if (now < p.forOccurrence) {
          remaining.push(p); // 아직 시점이 안 된 것만 유지
        }
        // 이미 발송했거나(now>=alertAt) 회차 자체가 지나버린 건 자동으로 정리(remaining에서 빠짐)
      }
      GoombaBot.storage.write("abyss_custom_alerts", remaining);
      return null; // 직접 send했으니 반환 메시지 없음
    },
    rooms: function () { return []; }
  });

  /** 기준시각을 반영한다 - !어구기준과 대화형 입력 둘 다 재사용. 등록 시점에 이미
   * 지나버린 알림 단계는 조용히 건너뛰도록(뒤늦게 몰아서 오지 않도록) 미리 "보낸 것"으로
   * 기록해둔다(예: 8분 전에 등록하면 30분/15분 단계는 건너뛰고 5분/시작만 남음). */
  function applyAbyssBaseTime(ms) {
    GoombaBot.storage.write("abyss_base_time", ms);
    var now = Date.now();
    var next = computeNextAbyssOccurrence(ms, now);
    GoombaBot.storage.write("abyss_alerted_stages", { forOccurrence: next, sentStages: buildAlreadyPassedStages(next, now) });
  }

  /** "yyyy-mm-dd hh:mm" 형태를 파싱한다(공백 하나로 구분된 하나의 문자열). 실패하면 null. */
  /**
   * 붙여넣은 텍스트(쿠짱봇/모비라이프 복사 내용 등) 어디에 있든, 맨 처음 나오는
   * 날짜/시간을 찾아 기준시각으로 쓴다. 두 형태를 지원:
   *   1) "yyyy-mm-dd hh:mm" (기존 그대로, 연/월/일/시/분 전부 명시)
   *   2) "N일 H시 M분" (연/월 없음 - 지금 기준으로 가장 가까운 미래로 추정.
   *      이미 지난 날짜면 다음 달로 넘긴다)
   * 어느 쪽도 못 찾으면 null.
   */
  function parseAbyssDateTime(text) {
    var s = String(text);

    var full = s.match(/(\d{4})-(\d{2})-(\d{2})[^\d]+(\d{1,2}):(\d{2})/);
    if (full) {
      var d1 = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]), Number(full[4]), Number(full[5]), 0, 0);
      if (!isNaN(d1.getTime())) return d1.getTime();
    }

    var short = s.match(/(\d{1,2})\s*일\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분/);
    if (short) {
      var day = Number(short[1]), hour = Number(short[2]), minute = Number(short[3]);
      var now = new Date();
      var candidate = new Date(now.getFullYear(), now.getMonth(), day, hour, minute, 0, 0);
      // 계산한 날짜가 이미 24시간 넘게 지난 과거면, 이번 달이 아니라 다음 달 얘기라고 보고 넘긴다.
      if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) {
        candidate = new Date(now.getFullYear(), now.getMonth() + 1, day, hour, minute, 0, 0);
      }
      if (!isNaN(candidate.getTime())) return candidate.getTime();
    }

    return null;
  }

  GoombaBot.registerCommand("어구기준", {
    category: "던전", adminOnly: true, summary: "어비스 구멍 기준 시각 설정(점검 등으로 시간 변경 시)", usage: ["!어구기준 2026-07-25 20:00"],
    detail: { title: "\uD83D\uDD73 어구 기준시각 설정", examples: ["!어구기준 2026-07-25 20:00"], features: ["이 시각을 기준으로 이후 모든 일정이 36시간 15분 간격으로 다시 계산됩니다"] },
    execute: function (chat) {
      var dateStr = String(chat.args[0] || "");
      var timeStr = String(chat.args[1] || "");
      var ms = parseAbyssDateTime(dateStr + " " + timeStr);

      if (ms === null) {
        chat.reply(F.usageBlock(["!어구기준 2026-07-25 20:00"]));
        return;
      }

      applyAbyssBaseTime(ms);
      chat.reply(F.emoji.ok + " 어구 기준 시각을 " + formatDateTime(ms) + "(으)로 설정했습니다. 이후 일정이 이 시각 기준으로 다시 계산됩니다.");
    }
  });

  var ABYSS_AWAIT_TTL_MS = 10 * 60 * 1000; // 10분 안에 답을 안 주면 대기 취소

  GoombaBot.registerCommand("어구감시", {
    category: "던전", adminOnly: true, summary: "어비스 구멍 자동 알림 시작/켜기/끄기", usage: ["!어구감시 시작 2026-07-30 14:00", "!어구감시 켜기", "!어구감시 끄기"],
    detail: {
      title: "\uD83D\uDD73 어구 감시", examples: ["!어구감시 시작 2026-07-30 14:00", "!어구감시 켜기", "!어구감시 끄기"],
      features: [
        "시작: 날짜/시간을 바로 붙이면 즉시 설정+자동알림 시작(!어구감시 시작 2026-07-30 14:00). 날짜 없이 \"시작\"만 치면 물어봅니다(일부 환경에서 이 대화형 방식이 안 걸릴 수 있음 - 그때는 날짜를 바로 붙여서 쓰세요)",
        "켜기/끄기: 이미 기준시각이 설정된 상태에서 알림만 껐다 켰다 할 때"
      ]
    },
    execute: function (chat) {
      var sub = String(chat.args[0] || "");

      if (sub === "시작") {
        // ⚠️ 대화형(다음 메시지로 날짜 받기)이 일부 메신저봇R 환경에서 Event.MESSAGE가
        // 안 걸려서 동작 안 하는 게 실기기로 확인됨 - "!어구감시 시작 2026-07-30 14:00"
        // 처럼 날짜를 바로 붙여서 쓰면 대화형 단계 없이 즉시 설정+알림켜기까지 끝나도록
        // 만든다(기존 대화형 방식은 인자 없이 "시작"만 쳤을 때는 그대로 남겨둔다).
        var dateArg = String(chat.args[1] || "");
        var timeArg = String(chat.args[2] || "");
        if (dateArg) {
          var msStart = parseAbyssDateTime(dateArg + " " + timeArg);
          if (msStart === null) {
            chat.reply(F.usageBlock(["!어구감시 시작 2026-07-30 14:00", "!어구감시 시작 (날짜 없이 치면 물어봅니다)"]));
            return;
          }
          applyAbyssBaseTime(msStart);
          GoombaBot.storage.write("abyss_monitor_enabled", true);
          var nextStart = computeNextAbyssOccurrence(msStart, Date.now());
          chat.reply(F.emoji.ok + " 어구 기준 시각을 " + formatDateTime(msStart) + "(으)로 설정하고 자동 알림을 시작했습니다.\n다음 생성: " + formatDateTime(nextStart));
          return;
        }

        GoombaBot.storage.write("abyss_awaiting_input", { name: chat.author.name, room: chat.room.name, at: Date.now() });
        chat.reply(F.emoji.calc + " 다음 어구 시간을 입력해주세요.\n(예: 2026-07-25 20:00)\n(또는 !어구감시 시작 2026-07-25 20:00 처럼 바로 붙여 쓰셔도 됩니다)");
        return;
      }
      if (sub === "켜기") { GoombaBot.storage.write("abyss_monitor_enabled", true); chat.reply(F.emoji.ok + " 어구 자동 알림을 켰습니다."); return; }
      if (sub === "끄기") { GoombaBot.storage.write("abyss_monitor_enabled", false); chat.reply(F.emoji.ok + " 어구 자동 알림을 껐습니다."); return; }
      chat.reply(F.usageBlock(["!어구감시 시작 2026-07-30 14:00", "!어구감시 켜기", "!어구감시 끄기"]));
    }
  });

  // ⚠️ "!어구감시 시작"으로 물어본 직후, "!"로 시작하지 않는 일반 메시지로 시간이
  // 오면 그 값을 기준시각으로 잡고 알림도 자동으로 켠다. 대기 상태가 아니거나,
  // 다른 사람이 보낸 메시지거나, 10분이 지났으면 완전히 무시한다(평소 잡담과 안 섞임).
  GoombaBot.registerMessageHandler(function (chat) {
    var awaiting = GoombaBot.storage.readStale("abyss_awaiting_input");
    if (!awaiting) return false;
    if (Date.now() - awaiting.at > ABYSS_AWAIT_TTL_MS) { GoombaBot.storage.write("abyss_awaiting_input", null); return false; }
    if (String(chat.author.name) !== String(awaiting.name) || String(chat.room.name) !== String(awaiting.room)) return false;

    var raw = null;
    try { raw = chat.message; } catch (e1) {}
    if (raw === null || raw === undefined) { try { raw = chat.content; } catch (e2) {} }
    if (raw === null || raw === undefined) { try { raw = chat.msg; } catch (e3) {} }
    if (raw === null || raw === undefined) { try { raw = chat.text; } catch (e4) {} }
    if (raw === null || raw === undefined) return false;
    if (String(raw).indexOf(String(GoombaBotConfig.commandPrefix)) === 0) return false; // "!"명령어는 이 핸들러 몫이 아님

    var ms = parseAbyssDateTime(raw);
    if (ms === null) {
      chat.reply(F.emoji.warn + " 형식을 확인할 수 없습니다. 예) 2026-07-25 20:00");
      return true; // 형식오류여도 이 메시지는 "어구시간 입력 시도"로 처리(잡담과 안 섞이게)
    }

    GoombaBot.storage.write("abyss_awaiting_input", null);
    applyAbyssBaseTime(ms);
    GoombaBot.storage.write("abyss_monitor_enabled", true);

    var next = computeNextAbyssOccurrence(ms, Date.now());
    chat.reply(F.emoji.ok + " 어구 기준 시각을 " + formatDateTime(ms) + "(으)로 설정하고 자동 알림을 시작했습니다.\n다음 생성: " + formatDateTime(next));
    return true;
  });

  // ---- !심구 / !숙제 (API 미확인 - TODO) ----
  function makeTodoCommand(name, label) {
    GoombaBot.registerCommand(name, {
      category: "던전", summary: label + " (API 확인 전)", usage: ["!" + name],
      detail: { title: F.emoji.warn + " " + label, examples: ["!" + name], features: ["API가 아직 확인되지 않아 추측으로 정보를 만들지 않습니다"] },
      execute: function (chat) {
        chat.reply(F.box(F.emoji.warn + " " + label, [
          "아직 실제 데이터를 연동하지 못했습니다.",
          "tracker API 또는 별도 API가 확인되는 대로 채워 넣을 예정입니다.",
          "(추측으로 정보를 만들지 않습니다.)"
        ]));
      }
    });
  }
  makeTodoCommand("심구", "심층 구멍");
  makeTodoCommand("숙제", "오늘의 숙제");
})();

module.exports = { GoombaBot: GoombaBot };

