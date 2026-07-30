(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

/**
 * commands/admin.js
 * --------------------
 * 운영진 전용 진단 명령어(!진단)를 담당한다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

(function () {
  var F = GoombaBot.format;

  GoombaBot.registerCommand("진단", {
    category: "관리자", adminOnly: true, summary: "API 연결 상태 확인 (🟢/🔴)", usage: ["!진단", "!진단 [1~9]"],
    detail: { title: F.emoji.admin + " API 진단", examples: ["!진단", "!진단 1"], features: ["요약: 각 API의 🟢성공/🔴실패를 한눈에", "!진단 [번호]: 최상위 형태/키, 배열 추출 개수, 첫 항목의 실제 필드명까지 노출"] },
    execute: function (chat) {
      var targets = [
        { label: "룬", path: GoombaBotConfig.endpoints.runes, timeout: 20000 },
        { label: "룬워드", path: GoombaBotConfig.endpoints.runeWords },
        { label: "인챈트", path: GoombaBotConfig.endpoints.enchants },
        { label: "아티팩트", path: GoombaBotConfig.endpoints.artifacts },
        { label: "칭호", path: GoombaBotConfig.endpoints.titles },
        { label: "아이템", path: GoombaBotConfig.endpoints.items },
        { label: "공지", path: GoombaBotConfig.endpoints.notices },
        { label: "점검상태", path: GoombaBotConfig.endpoints.maintenanceStatus },
        { label: "검은구멍", path: GoombaBotConfig.endpoints.deepHoleConfig },
        { label: "시세", path: GoombaBotConfig.endpoints.marketPrices + "?sort=pct_change_24h_desc&limit=100&offset=0" },
        { label: "공식공지", path: GoombaBotConfig.endpoints.officialNotice },
        { label: "공식이벤트", path: GoombaBotConfig.endpoints.officialEvents },
        { label: "공식업데이트", path: GoombaBotConfig.endpoints.officialUpdate }
      ];

      var indexArg = parseInt(chat.args[0], 10);
      var singleIndex = !isNaN(indexArg) && indexArg >= 1 && indexArg <= targets.length ? indexArg - 1 : -1;

      if (singleIndex !== -1) {
        var t = targets[singleIndex];
        var r2 = GoombaBot.http.inspect(t.path, t.timeout);
        var lines = [F.field("URL", r2.url)];
        if (!r2.ok) {
          lines.push(F.field("상태", F.emoji.red + " 실패 (" + r2.stage + ")"));
          if (r2.statusCode !== undefined && r2.statusCode !== null) lines.push(F.field("HTTP 상태코드", r2.statusCode));
          if (r2.error) lines.push(F.field("에러", r2.error));
          if (r2.bodyLength !== undefined) lines.push(F.field("응답 전체 길이", r2.bodyLength + "자"));
          if (r2.bodyHead) lines.push("", F.field("응답 앞부분", r2.bodyHead));
          if (r2.bodyTail) lines.push("", F.field("응답 끝부분", r2.bodyTail));
        } else {
          lines.push(F.field("상태", F.emoji.green + " 성공"));
          lines.push(F.field("최상위 형태", r2.topType));
          if (r2.topKeys) lines.push(F.field("최상위 키", r2.topKeys.join(", ")));
          lines.push(F.field("배열 추출 개수", r2.arrayCount + "건"));
          if (r2.firstItemKeys) lines.push(F.field("첫 항목 실제 필드명", r2.firstItemKeys.join(", ")));
        }
        chat.reply(F.box(F.emoji.admin + " API 진단 - " + t.label, lines));
        return;
      }

      var out = [F.emoji.admin + " API 진단 (요약 - 상세: !진단 1~" + targets.length + ")", ""];
      for (var i = 0; i < targets.length; i++) {
        var rr = GoombaBot.http.inspect(targets[i].path, targets[i].timeout);
        var icon = rr.ok ? F.emoji.green : F.emoji.red;
        var extra = rr.ok ? ("(" + rr.arrayCount + "건)") : ("(" + rr.stage + (rr.statusCode ? " " + rr.statusCode : "") + ")");
        out.push("[" + (i + 1) + "] " + icon + " " + targets[i].label + " " + extra);
      }
      chat.reply(out.join("\n"));
    }
  });

  /**
   * ⚠️ 성능 분석 전용 - 기존 검색 명령어(!룬 등)는 전혀 건드리지 않는다. 룬 데이터를
   * 기준으로 "API 호출 → 배열 추출 → 메모리 캐시 적중 → 정확일치 검색"의 각 단계가
   * 실제 기기에서 몇 ms인지 그대로 보여준다. 결과를 보고 어디가 병목인지 판단하는 용도.
   */
  GoombaBot.registerCommand("속도진단", {
    category: "관리자", adminOnly: true, summary: "검색 성능(API호출/배열추출/캐시적중/검색) 단계별 소요시간 측정", usage: ["!속도진단"],
    detail: {
      title: F.emoji.admin + " 속도 진단", examples: ["!속도진단"],
      features: ["룬 데이터를 기준으로 API호출/배열추출/캐시적중/검색 각 단계 소요시간(ms)을 그대로 보여줍니다", "실제 병목이 어디인지 판단하는 용도(코드 수정 없음)"]
    },
    execute: function (chat) {
      var lines = [F.emoji.admin + " 속도 진단 (룬 기준)", ""];

      // ⚠️ 지금까지(봇이 켜진 뒤부터) 각 API가 실제로 몇 번 호출됐는지 - 이 숫자는
      // !속도진단을 실행하기 전부터 누적된 값이다. 이 명령어를 여러 번 실행해도
      // "이전 실행 전"과 "이후" 값을 비교하면 몇 번 늘었는지 알 수 있다.
      var before = {
        runes: GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0,
        runeWords: GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runeWords] || 0,
        items: GoombaBot.http.callCounts[GoombaBotConfig.endpoints.items] || 0
      };
      lines.push("\uD83D\uDCCA 지금까지 누적 API 호출 횟수 (이 명령어 실행 전 기준)");
      lines.push("• 룬 API: " + before.runes + "회");
      lines.push("• 룬워드 API: " + before.runeWords + "회");
      lines.push("• 아이템 API: " + before.items + "회");
      lines.push("");

      // ① API 호출 - 캐시를 거치지 않고 getJson()을 직접 호출해서 "지금 이 순간" 실제
      // 네트워크(+JSON파싱)가 얼마나 걸리는지 그대로 잰다.
      // ⚠️ 이 단계는 측정 목적으로 캐시를 일부러 건너뛰는 강제 호출이라, 아래 호출
      // 횟수에 +1이 무조건 반영된다(실제 검색에서는 발생하지 않는 추가 호출).
      var t0 = Date.now();
      var coldJson = null, coldError = null;
      try {
        coldJson = GoombaBot.http.getJson(GoombaBotConfig.endpoints.runes, { timeout: 20000 });
      } catch (e) { coldError = e; }
      var t1 = Date.now();
      lines.push("① API 호출(캐시 안 거침, 지금 직접 요청 - 측정용 강제 호출): " + (t1 - t0) + "ms" + (coldError ? " (실패: " + coldError + ")" : ""));

      // ② 배열 추출 - toArray()가 JSON 구조에서 배열을 뽑아내는 시간(파싱 자체는 이미
      // ①에 포함되어 있어 완전히 분리는 안 되지만, 추가 처리 비용은 이걸로 확인 가능).
      var t2a = Date.now();
      var arr = coldJson ? GoombaBot.http.toArray(coldJson) : [];
      var t2 = Date.now();
      lines.push("② 배열 추출: " + (t2 - t2a) + "ms (" + arr.length + "건)");

      // ③④ 실제 사용 중인 getRunes()(memoize 적용됨)를 연달아 두 번 호출 - 1차는 이번
      // 요청에서 처음이라 디스크캐시나 네트워크를 탈 수 있고, 2차는 메모리캐시 적중을
      // 기대한다. 두 값의 차이가 "메모리 캐시가 실제로 효과가 있는지"를 그대로 보여준다.
      var t3a = Date.now();
      var runes1 = GoombaBot.provider.getRunes();
      var t3b = Date.now();
      var runes2 = GoombaBot.provider.getRunes();
      var t3c = Date.now();
      var runesCallsDuringThis = (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0) - before.runes - 1; // -1은 위 ①의 강제호출분 제외
      lines.push("③ getRunes() 1차 호출(디스크캐시/네트워크 예상): " + (t3b - t3a) + "ms (" + runes1.length + "건)");
      lines.push("④ getRunes() 2차 호출(메모리캐시 적중 예상): " + (t3c - t3b) + "ms");
      lines.push("  → ③④ 두 번 호출하는 동안 룬 API가 실제로 늘어난 횟수: " + runesCallsDuringThis + "회 " + (runesCallsDuringThis <= 1 ? "(정상 - 0이면 이미 캐시돼있던 것, 1이면 ③에서 최초 1회 부르고 ④는 캐시 사용)" : "(⚠️ 2회 이상 - ④도 다시 API를 부르고 있어 캐시가 안 먹힘)"));

      // ⑤ 정확일치 검색 - 실제 !룬이 쓰는 것과 동일한 방식(전체 순회 후 이름 직접비교)의
      // 소요시간. 1756건 같은 큰 배열을 순회하는 게 실제로 느린지 여기서 확인 가능.
      var sampleKeyword = runes1.length ? String(GoombaBot.http.extractField(runes1[0], ["name", "title"])) : "";
      var t4a = Date.now();
      var exactCount = 0;
      for (var i = 0; i < runes1.length; i++) {
        if (String(GoombaBot.http.extractField(runes1[i], ["name", "title"])).replace(/\s+/g, "") === sampleKeyword.replace(/\s+/g, "")) exactCount++;
      }
      var t4b = Date.now();
      lines.push("⑤ 정확일치 검색(전체 " + runes1.length + "건 순회): " + (t4b - t4a) + "ms");

      // ⑥⑦ !룬 검색 시 룬워드도 매번 API를 다시 부르는지 확인 - getRuneWords()를
      // 연달아 두 번 호출해서 룬과 똑같은 방식으로 검증한다.
      var t5a = Date.now();
      var words1 = GoombaBot.provider.getRuneWords();
      var t5b = Date.now();
      var words2 = GoombaBot.provider.getRuneWords();
      var t5c = Date.now();
      var wordsCallsDuringThis = (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runeWords] || 0) - before.runeWords;
      lines.push("⑥ getRuneWords() 1차 호출: " + (t5b - t5a) + "ms (" + words1.length + "건)");
      lines.push("⑦ getRuneWords() 2차 호출(메모리캐시 적중 예상): " + (t5c - t5b) + "ms");
      lines.push("  → ⑥⑦ 두 번 호출하는 동안 룬워드 API가 실제로 늘어난 횟수: " + wordsCallsDuringThis + "회 " + (wordsCallsDuringThis <= 1 ? "(정상 - 최초 1회만 호출되고 그 다음은 메모리)" : "(⚠️ 매번 다시 호출되고 있음)"));

      lines.push("", "콜드 fetch~검색까지 총: " + (t4b - t0) + "ms");
      lines.push("④+⑤ 캐시 적중 상태일 때(2번째 검색부터) 체감 총합: " + ((t3c - t3b) + (t4b - t4a)) + "ms");

      lines.push("", "📊 이 명령어 실행 후 누적 API 호출 횟수");
      lines.push("• 룬 API: " + (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0) + "회 (이번 실행에서 +" + ((GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0) - before.runes) + ", 그 중 1회는 ①의 측정용 강제호출)");
      lines.push("• 룬워드 API: " + (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runeWords] || 0) + "회 (이번 실행에서 +" + wordsCallsDuringThis + ")");
      lines.push("• 아이템 API: " + (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.items] || 0) + "회 (이번 실행에서 +" + ((GoombaBot.http.callCounts[GoombaBotConfig.endpoints.items] || 0) - before.items) + ")");

      chat.reply(lines.join("\n"));
    }
  });

  /**
   * ⚠️ !속도진단은 별도 명령어라 "정말 !룬이 같은 코드를 타는지" 의심이 남을 수 있다.
   * 이 토글을 켜면 !룬 등 실제 검색 명령어 뒤에 "이번 이 호출 자체의" 타이밍이
   * 별도 메시지로 덧붙는다(평소엔 안 보임 - 껐을 때는 기존 출력과 완전히 동일).
   */
  GoombaBot.isDebugTimingEnabled = function () {
    return GoombaBot.storage.readStale("debug_timing_enabled") === true;
  };

  GoombaBot.registerCommand("디버그모드", {
    category: "관리자", adminOnly: true, summary: "!룬 등 실제 검색 명령어에 타이밍 로그를 붙였다 뗐다 함", usage: ["!디버그모드 켜기", "!디버그모드 끄기"],
    detail: {
      title: F.emoji.admin + " 디버그 모드", examples: ["!디버그모드 켜기", "!디버그모드 끄기"],
      features: ["켜면 !룬 검색 결과 뒤에 실제 이번 호출의 데이터로딩/검색 소요시간이 별도 메시지로 따라붙습니다", "!속도진단이 아니라 실제 명령어 자체를 실측하기 위한 용도"]
    },
    execute: function (chat) {
      var sub = String(chat.args[0] || "");
      if (sub === "켜기") { GoombaBot.storage.write("debug_timing_enabled", true); chat.reply(F.emoji.admin + " 디버그 모드 켜짐 - 이제 !룬 검색 뒤에 타이밍이 따라붙습니다."); return; }
      if (sub === "끄기") { GoombaBot.storage.write("debug_timing_enabled", false); chat.reply(F.emoji.admin + " 디버그 모드 꺼짐."); return; }
      chat.reply(F.usageBlock(["!디버그모드 켜기", "!디버그모드 끄기"]));
    }
  });
  GoombaBot.registerCommand("버전", {
    category: "기본", summary: "지금 실행 중인 코드 버전 확인", usage: ["!버전"],
    detail: { title: F.emoji.admin + " 버전", examples: ["!버전"], features: ["GitHub에 올린 코드가 실제로 반영됐는지 확인할 때 사용"] },
    execute: function (chat) {
      chat.reply(F.emoji.admin + " 코드 버전: " + GoombaBotConfig.buildVersion);
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };


},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],2:[function(require,module,exports){

/**
 * commands/botcontrol.js
 * ------------------------
 * 관리자 전용 봇 제어 명령어(!굼바봇 상태/켜기/끄기/재시작/업데이트)를 담당한다.
 * 마리오 굼바 세계관 테마 적용: 👑 대왕굼바(신수아) / 🍄 굼바봇(길드 지원병) /
 * ❄️ 빙결굼바(굼바굼바_빙결). 관리자에게는 "관리자님"이 아니라 "대왕굼바님"으로 응답한다.
 *
 * ⚠️ "!굼바봇 업데이트"는 GitHub 자동 반영을 하지 않는다 - 개발 지식(로더/base64/eval)
 * 없이도 누구나 따라할 수 있도록, "새 main.js를 받아서 메신저봇R에 직접 붙여넣기"
 * 방식으로 갱신하는 게 최종 방침이다. 이 명령어는 그 안내만 해준다.
 */

var configModule = require("../core/config.js");
var GoombaBot = configModule.GoombaBot;
var GoombaBotConfig = configModule.GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

(function () {
  var F = GoombaBot.format;

  // !굼바봇 재시작 때 비울 캐시 키 목록 (search.js/market.js/maintenance.js/homework.js가
  // 실제로 쓰는 캐시 키와 반드시 맞춰서 유지보수해야 한다)
  var KNOWN_CACHE_KEYS = [
    "runes", "rune_usage", "rune_words_v2", "enchants", "artifacts", "titles", "items",
    "market_catalog", "notices_5", "deep_hole_config"
  ];

  function statusReport(chat) {
    var enabled = GoombaBot.isBotEnabled();
    chat.reply([
      "\uD83C\uDF44 굼바봇 상태 보고",
      "",
      "\uD83D\uDC51 대왕굼바님 확인 완료!",
      "현재 상태 : " + (enabled ? "\uD83D\uDFE2 정상 활동 중" : "\uD83D\uDD34 휴식 중"),
      "버섯 왕국 통신 : " + (enabled ? "정상" : "휴식중"),
      "룬 탐색 시스템 : " + (enabled ? "정상" : "휴식중"),
      "",
      "오늘도 대왕굼바님의 명령을 기다리고 있습니다 \uD83D\uDEB6"
    ].join("\n"));
  }

  function turnOn(chat) {
    GoombaBot.storage.write("bot_enabled", true);
    chat.reply([
      "\uD83C\uDF44 굼바봇 부활 완료!",
      "",
      "\uD83D\uDC51 대왕굼바님의 호출을 확인했습니다.",
      "버섯 왕국 출근 완료 \uD83C\uDF44",
      "",
      "현재 상태 : \uD83D\uDFE2 ONLINE"
    ].join("\n"));
  }

  function turnOff(chat) {
    GoombaBot.storage.write("bot_enabled", false);
    chat.reply([
      "\uD83C\uDF44 굼바봇 휴식 모드 진입...",
      "",
      "\uD83D\uDC51 대왕굼바님의 명령 확인!",
      "잠시 버섯 왕국으로 돌아갑니다 \uD83D\uDCA4"
    ].join("\n"));
  }

  function restart(chat) {
    // ⚠️ "설정을 다시 읽는다"는 게, GoombaBotConfig 자체는 코드에 값이 박혀있어 런타임에
    // 다시 읽을 대상이 없다 (정직하게 밝힘). 대신 캐시된 API 응답을 전부 비워서, 다음
    // 명령어부터는 무조건 새로 API를 호출하게 만든다 - 사실상 "새로고침"에 가장 가까운
    // 실질적 효과를 낸다.
    for (var i = 0; i < KNOWN_CACHE_KEYS.length; i++) GoombaBot.storage.remove(KNOWN_CACHE_KEYS[i]);
    chat.reply([
      "\uD83C\uDF44 굼바봇 재탄생 중...",
      "",
      "\uD83D\uDD27 설정 확인",
      "\uD83D\uDCE6 데이터 확인",
      "\u2728 굼바봇 재배치 완료",
      "",
      "현재 상태 : \uD83D\uDFE2 ONLINE"
    ].join("\n"));
  }

  function update(chat) {
    var hasLoader = (typeof GoombaBotRuntime !== "undefined");
    if (!hasLoader) {
      chat.reply([
        "\u26A0\uFE0F 자동 업데이트를 쓰려면 loader.js(설정 파일)를 메신저봇R에 붙여넣어야 합니다.",
        "지금은 이전 방식(코드 전체 붙여넣기)으로 실행 중입니다."
      ].join("\n"));
      return;
    }

    try {
      var url = String(GoombaBotConfig.githubMainJsRawUrl);
      var b64Text = GoombaBot.http.getRawText(url, 20000);
      if (!b64Text || b64Text.length < 100) throw new Error("코드를 받아오지 못했습니다");

      var newCode = GoombaBot.http.base64Decode(b64Text);
      if (!newCode || newCode.length < 200) throw new Error("받아온 코드가 정상이 아닙니다");

      var indirectEval = eval;
      indirectEval(newCode);

      chat.reply([
        "\uD83C\uDF44 굼바봇 진화 완료!",
        "",
        "\uD83D\uDC51 대왕굼바님께서 내려주신 새로운 힘을 받았습니다.",
        "",
        "\uD83D\uDCE6 최신 코드 확인",
        "\uD83D\uDD27 능력치 업데이트",
        "\u2728 신규 기능 확인",
        "",
        "완료!",
        "굼바봇 Lv.UP \uD83C\uDF89"
      ].join("\n"));
    } catch (e) {
      chat.reply(F.emoji.warn + " 업데이트 실패: " + e + "\n(기존 코드는 그대로 유지되니 안심하세요.)");
    }
  }

  GoombaBot.registerCommand("굼바봇", {
    category: "관리자", adminOnly: true,
    summary: "굼바봇 상태 확인/제어 (대왕굼바 전용)",
    usage: ["!굼바봇 상태", "!굼바봇 켜기", "!굼바봇 끄기", "!굼바봇 재시작", "!굼바봇 업데이트"],
    detail: {
      title: "\uD83C\uDF44 굼바봇 제어",
      examples: ["!굼바봇 상태", "!굼바봇 켜기", "!굼바봇 끄기", "!굼바봇 재시작", "!굼바봇 업데이트"],
      features: [
        "끄기 상태에서는 이 명령어 말고는 전부 무시됩니다 (다시 켜기 전까지)",
        "업데이트는 새 main.js를 받아서 메신저봇R에 직접 붙여넣는 방법을 안내합니다"
      ]
    },
    execute: function (chat) {
      var sub = String(chat.args[0] || "");
      if (sub === "상태") { statusReport(chat); return; }
      if (sub === "켜기") { turnOn(chat); return; }
      if (sub === "끄기") { turnOff(chat); return; }
      if (sub === "재시작") { restart(chat); return; }
      if (sub === "업데이트") { update(chat); return; }
      chat.reply(F.usageBlock(["!굼바봇 상태", "!굼바봇 켜기", "!굼바봇 끄기", "!굼바봇 재시작", "!굼바봇 업데이트"]));
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };


},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],3:[function(require,module,exports){

/**
 * commands/fun.js
 * ------------------
 * 검색 기능과 완전히 독립적인 "숨겨진" 재미 명령어들을 담당한다.
 * 대사를 배열로 관리해서 나중에 자유롭게 추가/삭제할 수 있다.
 * !도움/!명령어 목록에 안 나오도록 handler에 hidden:true를 붙인다.
 *
 * !굼은 v1(길드용 굼바봇)에 있던 대표 명령어로, 숨김이 아니라 !도움에 보인다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
require("../core/cache.js");
require("../core/format.js");
require("../core/router.js");

var funCommands = {
  "뚠": [
    "본인은 공주라고 우기는중",
    "개미는 뚠뚠 오늘도 뚠뚠~",
    "3메다72 (계속 자라는 중)"
  ],
  "공구": [
    "진짜 공주",
    "신육공",
    "신씨 실세"
  ],
  "진배": [
    "재수탱이"
  ],
  "몽": [
    "검술을 했다~ 석궁을 했다~ 추억이 됐다~ 다시 직변했다.",
    "내 사랑은 검술이었지만 다시 석궁.",
    "비틱으로는 세계 최강."
  ],
  "자몽": [
    "검술을 했다~ 석궁을 했다~ 추억이 됐다~ 다시 직변했다.",
    "내 사랑은 검술이었지만 다시 석궁.",
    "비틱으로는 세계 최강."
  ],
  "라마다": [
    "반포자이 자가에 롤스로이스 타는 부잣집 도련님"
  ],
  "버거": [
    "어이 숨씨"
  ],
  "찌": [
    "신씨",
    "바보",
    "멍충이",
    "딸깍좌"
  ],
  "찌릿": [
    "신씨",
    "바보",
    "멍충이",
    "딸깍좌"
  ],
  "오오": [
    "바보",
    "멍충이"
  ],
  "레오": [
    "바보",
    "멍충이"
  ],
  "하늘": [
    "오늘이라구!? 인계동이야!?"
  ],
  "랑님": [
    "내칭구"
  ],
  "이랑": [
    "내칭구"
  ],
  "쌀": [
    "전격의 왕"
  ],
  "둥누": [
    "월드클래스 비주얼 스타"
  ],
  "존": [
    "교슷님"
  ],
  "존광": [
    "교슷님"
  ],
  "루이": [
    "루버지 짐덩이들 어비스 버스 태우다 바지적삼 다 적시셨네..."
  ],
  "굼바": [
    "충성 ^^7"
  ],
  "호두": [
    "(제가 보이시나요?)"
  ]
};

(function () {
  function makeFunCommand(name, lines) {
    GoombaBot.registerCommand(name, {
      hidden: true, // !도움/!명령어에 표시 안 함
      execute: function (chat) {
        var pick = lines[Math.floor(Math.random() * lines.length)];
        chat.reply(pick);
      }
    });
  }

  for (var name in funCommands) {
    if (funCommands.hasOwnProperty(name)) makeFunCommand(name, funCommands[name]);
  }
})();

// ---- !굼 (v1에서 이관 - 숨김 아님, 도움말에 보임) ----
/**
 * v1(길드용 굼바봇)에 있던 대표 명령어. 랜덤 응답(기본/희귀/전설)에 더해,
 * 사용자별 누적 호출 횟수를 Database에 저장해뒀다가 100/500/1000회 달성 시
 * 업적 문구를 함께 보여준다.
 *
 * ⚠️ 메신저봇R(API2)은 아직 고유 ID가 아니라 표시 닉네임으로만 사람을 구분하므로,
 * 닉네임이 같은 사람이 있으면 카운트가 섞일 수 있다 (플랫폼 자체의 한계, v1과 동일).
 */
(function () {
  var NORMAL_RESPONSES = [
    "바! \uD83D\uDE0E", "바! \uD83D\uDC4B", "바! 오늘도 출근 완료!", "바! 룬 찾으러 갑니다!",
    "바! 굼바봇 대기 중!", "바! 길드원 호출 확인! \uD83E\uDEE1", "바! 오늘도 행운의 룬을 기원합니다! \uD83C\uDF40"
  ];
  var RARE_RESPONSE = "\u2728 전설 응답 등장!\n\n바!!!!!!!!!!";
  var LEGENDARY_RESPONSE = "\uD83D\uDC51 운영자도 보기 힘든 전설의 굼바입니다.";
  var RARE_RATE = 2, LEGENDARY_RATE = 0.1;
  var ACHIEVEMENTS = [
    { threshold: 1000, label: "\uD83D\uDC51 굼바의 화신" },
    { threshold: 500, label: "\uD83C\uDFC5 굼바 마스터" },
    { threshold: 100, label: "\uD83C\uDFC6 굼바 중독자" }
  ];

  function pickBaseText() {
    var roll = Math.random() * 100;
    if (roll < LEGENDARY_RATE) return LEGENDARY_RESPONSE;
    if (roll < LEGENDARY_RATE + RARE_RATE) return RARE_RESPONSE;
    return NORMAL_RESPONSES[Math.floor(Math.random() * NORMAL_RESPONSES.length)];
  }
  function findNewAchievement(prev, next) {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      if (prev < ACHIEVEMENTS[i].threshold && next >= ACHIEVEMENTS[i].threshold) return ACHIEVEMENTS[i].label;
    }
    return null;
  }

  GoombaBot.registerCommand("굼", {
    category: "기본", summary: "굼바봇을 호출합니다.", usage: ["!굼"],
    execute: function (chat) {
      var key = "user_stats_" + chat.author.name;
      var stats = GoombaBot.storage.readStale(key) || { goomCallCount: 0 };
      var prev = stats.goomCallCount || 0, next = prev + 1;
      stats.goomCallCount = next; stats.lastUsedAt = Date.now();
      GoombaBot.storage.write(key, stats);

      var baseText = pickBaseText();
      var newAchievement = findNewAchievement(prev, next);
      chat.reply(newAchievement ? baseText + "\n\n\uD83C\uDF89 업적 달성! " + newAchievement + " (누적 " + next + "회)" : baseText);
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };


},{"../core/cache.js":12,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],4:[function(require,module,exports){

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


},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],5:[function(require,module,exports){

/**
 * commands/jobguide.js
 * --------------------
 * 직업별 룬 티어 / 스킬 개조 / 세공작 조회. 전부 JSON(src/data/*.json) 기반이라
 * 시즌이 바뀌거나 직업/데이터가 추가돼도 이 파일 코드는 안 건드리고 JSON만
 * 고치면 된다. 스탯/장신구/펫/가이드 이미지는 다음 단계에서 같은 구조에
 * 필드만 추가하면 되도록 만들어뒀다(지금은 미구현 - "추후" 표시).
 *
 * ⚠️ 룬 티어 데이터는 사용자가 올려준 이미지에서 사람이 옮겨적은 것이라, 오탈자가
 * 있을 수 있다 - 발견되면 rune-tier.json만 고치면 된다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

var RUNE_TIER = require("../data/rune-tier.json");
var SKILL_REMODEL = require("../data/skill-remodel.json");
var ENGRAVING = require("../data/engraving.json");
var JOB_ALIASES = require("../data/job-aliases.json");

// 스탯/펫/사이클 - 13개 직업 인포그래픽에서 확인된 내용만 옮겨둔 것.
// 데이터 없는 직업은 자동으로 해당 섹션이 안 보인다(허용목록 방식과 동일한 원리).
var JOB_STATS = require("../data/job-stats.json");
var JOB_PETS = require("../data/job-pets.json");
var JOB_CYCLES = require("../data/job-cycles.json");

(function () {
  var F = GoombaBot.format;
  var JOB_NAMES = Object.keys(RUNE_TIER); // 정식 직업명 목록(데이터 기준 - 직업 추가되면 자동 반영)

  /** 직업 아이콘 - 목록/헤더 표시용. 새 직업이 추가되면 여기에 한 줄만 추가하면 됨. */
  var JOB_ICONS = {
    "전사": "⚔", "대검전사": "⚔", "검술사": "\uD83D\uDDE1", "기사": "\uD83D\uDEE1",
    "궁수": "\uD83C\uDFF9", "석궁사수": "\uD83C\uDFAF", "장궁병": "\uD83C\uDFF9",
    "마법사": "\uD83D\uDD2E", "화염술사": "\uD83D\uDD25", "빙결술사": "❄",
    "전격술사": "⚡", "힐러": "\uD83D\uDC9A", "사제": "✝", "수도사": "\uD83D\uDE4F",
    "암흑술사": "\uD83C\uDF11", "음유시인": "\uD83C\uDFB5", "댄서": "\uD83D\uDC83", "악사": "\uD83C\uDFB6",
    "도적": "\uD83D\uDDE1", "격투가": "\uD83E\uDD4A", "듀얼블레이드": "⚔"
  };
  function jobIcon(jobName) { return JOB_ICONS[jobName] || "⚔"; }

  function resolveJobName(input) {
    var s = String(input).trim();
    if (RUNE_TIER.hasOwnProperty(s)) return s;
    if (JOB_ALIASES.hasOwnProperty(s)) return JOB_ALIASES[s];
    return null;
  }

  // ---- 직업 -> 개조번호 리스트 (skill-remodel.json은 번호->직업이라 반대로 뒤집는다) ----
  var JOB_TO_CODES = {};
  (function buildJobToCodes() {
    for (var code in SKILL_REMODEL) {
      if (!SKILL_REMODEL.hasOwnProperty(code)) continue;
      var entries = SKILL_REMODEL[code];
      for (var i = 0; i < entries.length; i++) {
        var job = entries[i].job;
        if (!JOB_TO_CODES[job]) JOB_TO_CODES[job] = [];
        JOB_TO_CODES[job].push({ code: code, note: entries[i].note });
      }
    }
  })();

  /** 태그 문자열(예: "강타/보조 쿨") 안에 검색어가 포함되는지로 대충 판단 - "강타"/"보조"/"이동" 등 짧은 키워드는 이걸로 충분히 잡힌다. */
  function findJobsByEngravingTag(tag) {
    var results = [];
    for (var job in ENGRAVING) {
      if (!ENGRAVING.hasOwnProperty(job)) continue;
      var tags = ENGRAVING[job];
      for (var i = 0; i < tags.length; i++) {
        if (tags[i].indexOf(tag) !== -1) { results.push(job); break; }
      }
    }
    return results;
  }

  /** 룬 이름(공백 무시 비교)으로 어떤 직업의 어떤 부위(무기/엠블럼/장신구/방어구)에 몇 순위로 있는지 전부 찾는다. */
  function findRuneUsage(runeName) {
    var norm = String(runeName).replace(/\s+/g, "");
    var results = [];
    for (var job in RUNE_TIER) {
      if (!RUNE_TIER.hasOwnProperty(job)) continue;
      var categories = RUNE_TIER[job];
      for (var cat in categories) {
        if (!categories.hasOwnProperty(cat)) continue;
        var list = categories[cat];
        for (var i = 0; i < list.length; i++) {
          if (list[i].replace(/\s+/g, "") === norm) {
            results.push({ job: job, category: cat, rank: i + 1, name: list[i] });
          }
        }
      }
    }
    return results;
  }

  var CIRCLED_FOR_LIST = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  function circledMark(index) { return CIRCLED_FOR_LIST[index] || (index + 1) + "."; }

  /** 개조 목록 - "① 135\nnote" 처럼 번호+코드, 그 아래 줄에 노트(있으면) */
  function formatRemodelList(codes) {
    var lines = [];
    for (var i = 0; i < codes.length; i++) {
      lines.push(circledMark(i) + " " + codes[i].code);
      if (codes[i].note) lines.push(codes[i].note);
    }
    return lines;
  }

  /** 세공 목록 - "원소 · 강타 · 연타"처럼 한 줄로 이어붙임(요청: #태그 나열보다 이게 더 보기 좋음) */
  function formatEngravingLine(tags) {
    return tags.join(" \u00B7 ");
  }

  var SECTION_LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";

  /**
   * 직업 종합 가이드 - "이것 하나만 보면 세팅 끝" 목표(요청 반영)로 개조/세공/룬티어
   * (4개 부위 전부)/스탯/펫/사이클을 섹션 구분선으로 나눠서 한 번에 보여준다.
   * 데이터 없는 섹션은 자동으로 안 보인다(스탯/펫/사이클은 아직 전 직업 데이터가
   * 없어서 있는 직업만 표시 - 허용목록 방식과 동일한 원리).
   */
  function buildJobOverview(jobName) {
    var lines = [jobIcon(jobName) + " " + jobName, "", SECTION_LINE];

    lines.push("", "\uD83D\uDD27 추천 개조", "");
    var codes = JOB_TO_CODES[jobName];
    if (codes && codes.length) {
      lines.push.apply(lines, formatRemodelList(codes));
    } else {
      lines.push("준비중입니다.");
    }
    lines.push("", SECTION_LINE);

    lines.push("", "\uD83D\uDC8E 추천 세공", "");
    var tags = ENGRAVING[jobName];
    lines.push(tags && tags.length ? formatEngravingLine(tags) : "준비중입니다.");
    lines.push("", SECTION_LINE);

    var runeLines = buildRuneTierLines(jobName);
    if (runeLines.length) {
      lines.push("", "\uD83E\uDDFF 추천 룬", "");
      lines.push.apply(lines, runeLines);
      lines.push("", SECTION_LINE);
    }

    if (JOB_STATS[jobName]) {
      lines.push("", "\uD83D\uDCCA 추천 스탯", "");
      lines.push.apply(lines, JOB_STATS[jobName]);
      lines.push("", SECTION_LINE);
    }

    if (JOB_PETS[jobName]) {
      lines.push("", "\uD83D\uDC36 추천 펫", "");
      lines.push.apply(lines, JOB_PETS[jobName]);
      lines.push("", SECTION_LINE);
    }

    if (JOB_CYCLES[jobName] && JOB_CYCLES[jobName].length) {
      lines.push("", "\uD83D\uDD04 추천 사이클", "");
      var cycleList = JOB_CYCLES[jobName];
      for (var cy = 0; cy < cycleList.length; cy++) {
        if (cy > 0) lines.push("");
        lines.push(cycleList[cy]);
      }
      lines.push("", SECTION_LINE);
    }

    lines.push("", "\uD83D\uDCD6 상세 명령어", "",
      "!" + jobName + " 룬티어", "!" + jobName + " 개조", "!" + jobName + " 세공", "!" + jobName + " 사이클");
    return lines.join("\n");
  }

  var CATEGORY_ICONS = { "무기": "⚔️", "방어구": "\uD83D\uDEE1\uFE0F", "장신구": "\uD83D\uDC8D", "엠블럼": "\uD83D\uDD37" };
  var CATEGORY_ORDER = ["무기", "방어구", "장신구", "엠블럼"];
  var CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

  /**
   * 룬티어 - 카테고리별로 헤더를 붙여 구분, 전 카테고리 원문자(①②③)로 통일(요청 반영).
   * 방어구는 룬 슬롯이 5개라 5개까지, 나머지(무기/장신구/엠블럼)는 3개까지 보여준다.
   * ⚠️ 방어구 데이터는 이미지의 "종합 추천 순위" 하나뿐이라, 실제 슬롯별(투구/상의/
   * 하의/장갑/신발 등) 구분은 아직 없다 - 나중에 슬롯별 데이터를 받으면 확장하면 된다.
   * 제목 없이 본문 라인 배열만 돌려준다(overview/상세 양쪽에서 재사용하기 위함).
   */
  function buildRuneTierLines(jobName) {
    var data = RUNE_TIER[jobName];
    if (!data) return [];
    var lines = [];
    for (var c = 0; c < CATEGORY_ORDER.length; c++) {
      var cat = CATEGORY_ORDER[c];
      var list = data[cat];
      if (!list || !list.length) continue;
      var showCount = (cat === "방어구") ? 5 : 3;
      if (lines.length) lines.push("");
      lines.push((CATEGORY_ICONS[cat] || "") + " " + cat);
      for (var i = 0; i < Math.min(list.length, showCount); i++) {
        lines.push((CIRCLED[i] || (i + 1) + ".") + " " + list[i]);
      }
    }
    return lines;
  }

  function buildRuneTierDetail(jobName) {
    var lines = buildRuneTierLines(jobName);
    if (!lines.length) return null;
    return [jobIcon(jobName) + " " + jobName + " 룬티어", ""].concat(lines).join("\n");
  }

  // ---- !룬티어 (전체 직업 목록) ----
  GoombaBot.registerCommand("룬티어", {
    category: "정보", summary: "직업별 룬 티어 조회", usage: ["!룬티어", "!기사 룬티어"],
    detail: { title: "⚔️ 룬티어", examples: ["!룬티어", "!기사 룬티어"], features: ["!룬티어로 전체 직업 목록, !직업명 룬티어로 그 직업 상세"] },
    execute: function (chat) {
      var lines = ["\uD83D\uDCD6 직업 선택", ""];
      var sorted = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
      for (var i = 0; i < sorted.length; i++) lines.push(jobIcon(sorted[i]) + " " + sorted[i]);
      lines.push("", "사용법", "!기사 룬티어");
      chat.reply(lines.join("\n"));
    }
  });

  // ⚠️ 확장 포인트 - 나중에 데이터(stat.json, pet.json, cycle.json 등)가 생기면
  // 이 맵에 렌더 함수만 추가하면 "!직업명 스탯" 같은 서브명령어가 자동으로 살아난다.
  // 지금은 전부 데이터가 없어서 "준비중입니다."만 보여준다.
  var SUBCOMMANDS = {
    "룬티어": function (jobName) { return buildRuneTierDetail(jobName) || (F.emoji.warn + " " + jobName + "의 룬티어 데이터가 없습니다."); },
    "개조": function (jobName) {
      var codes = JOB_TO_CODES[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 개조", ""];
      if (codes && codes.length) {
        lines.push.apply(lines, formatRemodelList(codes));
      } else {
        lines.push("준비중입니다.");
      }
      return lines.join("\n");
    },
    "세공": function (jobName) {
      var tags = ENGRAVING[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 세공", ""];
      if (tags && tags.length) {
        lines.push(formatEngravingLine(tags));
      } else {
        lines.push("준비중입니다.");
      }
      return lines.join("\n");
    },
    "스탯": function (jobName) {
      var list = JOB_STATS[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 스탯", ""];
      lines.push.apply(lines, (list && list.length) ? list : ["준비중입니다."]);
      return lines.join("\n");
    },
    "펫": function (jobName) {
      var list = JOB_PETS[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 펫", ""];
      lines.push.apply(lines, (list && list.length) ? list : ["준비중입니다."]);
      return lines.join("\n");
    },
    "사이클": function (jobName) {
      var list = JOB_CYCLES[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 사이클", ""];
      if (list && list.length) {
        for (var cy = 0; cy < list.length; cy++) {
          if (cy > 0) lines.push("");
          lines.push(list[cy]);
        }
      } else {
        lines.push("준비중입니다.");
      }
      return lines.join("\n");
    },
    "장신구": function (jobName) { return jobIcon(jobName) + " " + jobName + " 장신구\n\n준비중입니다."; },
    "가이드": function (jobName) { return jobIcon(jobName) + " " + jobName + " 가이드\n\n준비중입니다."; }
  };

  /** 직업 하나의 명령어를 등록한다(정식명+별칭 전부 이 함수로) - "!직업명"과 "!직업명 [서브명령어]" 둘 다 처리. */
  function registerJobCommand(commandName, canonicalName) {
    GoombaBot.registerCommand(commandName, {
      category: "직업", summary: canonicalName + " 정보(개조/세공/룬티어)", usage: ["!" + commandName, "!" + commandName + " 룬티어"],
      detail: { title: canonicalName, examples: ["!" + commandName, "!" + commandName + " 룬티어"], features: ["!" + commandName + "만 치면 개조/세공, !" + commandName + " 룬티어는 룬 티어"] },
      execute: function (chat) {
        var sub = String(chat.args[0] || "");
        if (SUBCOMMANDS.hasOwnProperty(sub)) {
          chat.reply(SUBCOMMANDS[sub](canonicalName));
          return;
        }
        chat.reply(buildJobOverview(canonicalName));
      }
    });
  }

  for (var j = 0; j < JOB_NAMES.length; j++) registerJobCommand(JOB_NAMES[j], JOB_NAMES[j]);
  for (var alias in JOB_ALIASES) {
    if (JOB_ALIASES.hasOwnProperty(alias)) registerJobCommand(alias, JOB_ALIASES[alias]);
  }

  // ---- !개조 [번호] ----
  GoombaBot.registerCommand("개조", {
    category: "정보", summary: "개조 목록/번호로 사용 직업 검색", usage: ["!개조", "!개조 135"],
    detail: { title: "\uD83D\uDD2E 개조 검색", examples: ["!개조", "!개조 135"], features: ["!개조만 치면 전 직업 추천 개조 목록, !개조 135처럼 번호를 입력하면 그 개조를 쓰는 직업들을 보여줍니다"] },
    execute: function (chat) {
      var code = String(chat.args[0] || "").trim();

      if (!code) {
        var lines0 = ["\uD83D\uDD2E 개조 목록", ""];
        var sortedJobs = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
        for (var j = 0; j < sortedJobs.length; j++) {
          var jobCodes = JOB_TO_CODES[sortedJobs[j]];
          if (!jobCodes || !jobCodes.length) continue;
          lines0.push(sortedJobs[j]);
          lines0.push.apply(lines0, formatRemodelList(jobCodes));
          lines0.push("");
        }
        chat.reply(lines0.join("\n").replace(/\n+$/, ""));
        return;
      }

      if (!SKILL_REMODEL.hasOwnProperty(code)) { chat.reply(F.emoji.warn + " '" + code + "' 개조 데이터가 없습니다."); return; }
      var entries = SKILL_REMODEL[code];
      var lines = ["\uD83D\uDD2E 개조 " + code, "", "사용 직업"];
      for (var i = 0; i < entries.length; i++) lines.push("• " + entries[i].job + (entries[i].note ? " (" + entries[i].note + ")" : ""));
      chat.reply(lines.join("\n"));
    }
  });

  // ---- !세공 [태그] ----
  GoombaBot.registerCommand("세공", {
    category: "정보", summary: "세공 목록/태그로 사용 직업 검색", usage: ["!세공", "!세공 강타"],
    detail: { title: "\uD83D\uDC8E 세공 검색", examples: ["!세공", "!세공 강타"], features: ["!세공만 치면 전 직업 추천 세공 목록, !세공 강타처럼 태그를 입력하면 그 태그를 추천하는 직업들을 보여줍니다"] },
    execute: function (chat) {
      var tag = String(chat.args[0] || "").trim();

      if (!tag) {
        var lines0 = ["\uD83D\uDC8E 세공 목록", ""];
        var sortedJobs = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
        for (var j = 0; j < sortedJobs.length; j++) {
          var jobTags = ENGRAVING[sortedJobs[j]];
          if (!jobTags || !jobTags.length) continue;
          lines0.push(sortedJobs[j]);
          lines0.push(formatEngravingLine(jobTags));
          lines0.push("");
        }
        chat.reply(lines0.join("\n").replace(/\n+$/, ""));
        return;
      }

      var jobs = findJobsByEngravingTag(tag);
      var lines = ["\uD83D\uDC8E " + tag + " 태그 사용 직업", ""];
      if (jobs.length === 0) { lines.push("해당 태그를 추천하는 직업이 없습니다."); } else {
        for (var i = 0; i < jobs.length; i++) lines.push("• " + jobs[i]);
      }
      chat.reply(lines.join("\n"));
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };


},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15,"../data/engraving.json":16,"../data/job-aliases.json":17,"../data/job-cycles.json":18,"../data/job-pets.json":19,"../data/job-stats.json":20,"../data/rune-tier.json":21,"../data/skill-remodel.json":22}],6:[function(require,module,exports){

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
    category: "공지", summary: "최근 공지 5개 / 공식 공지·업데이트 자동알림 켜기·끄기", usage: ["!공지", "!공지 켜기", "!공지 끄기"],
    detail: {
      title: F.emoji.notice + " 공지 조회", examples: ["!공지", "!공지 켜기"],
      features: ["최근 공지 5개를 보여줍니다", "!공지 켜기/끄기로 이 방에서 마비노기 모바일 공식 공지·업데이트 자동알림을 받을지 정할 수 있습니다"]
    },
    execute: function (chat) {
      // ⚠️ 신규 - 공식 홈페이지 자동알림 켜기/끄기(officialnews.js). 켜기/끄기가
      // 아니면 아래 기존 동작(최근 공지 5개 조회)을 그대로 수행한다.
      if (GoombaBot.officialNews && GoombaBot.officialNews.handleToggleSub(chat, "공지", "공지·업데이트")) return;

      var notices = P.getNotices(5);
      if (notices.length === 0) { chat.reply(F.emoji.warn + " 공지사항을 가져오지 못했습니다."); return; }
      var lines = [];
      for (var i = 0; i < notices.length; i++) lines.push("▸ " + extractField(notices[i], ["title", "name"]));
      chat.reply(F.box(F.emoji.notice + " 최신 공지 " + notices.length + "개", lines));
    }
  });

  // ---- !점검 ----
  GoombaBot.registerCommand("점검", {
    category: "공지", summary: "점검 상태 확인 (🟢/🔴 아이콘) / 공식 점검 자동알림 켜기·끄기", usage: ["!점검", "!점검 켜기", "!점검 끄기"],
    detail: {
      title: F.emoji.maintenance + " 점검 상태", examples: ["!점검", "!점검 켜기"],
      features: ["🟢 정상운영 / 🔴 점검중을 한눈에 보여줍니다", "!점검 켜기/끄기로 이 방에서 공식 점검 시작·종료·연장 자동알림을 받을지 정할 수 있습니다"]
    },
    execute: function (chat) {
      // ⚠️ 신규 - 공식 홈페이지 점검 자동알림 켜기/끄기(officialnews.js). 켜기/끄기가
      // 아니면 아래 기존 동작(점검 상태 조회)을 그대로 수행한다.
      if (GoombaBot.officialNews && GoombaBot.officialNews.handleToggleSub(chat, "점검", "점검")) return;

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


},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],7:[function(require,module,exports){

/**
 * commands/market.js
 * ---------------------
 * 거래소 시세 조회 서비스 + !시세 명령어를 담당한다.
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

  // ---- 시세 (이전 프로젝트에서 실제로 확인된 페이지네이션 방식 재사용) ----
  // ⚠️ 실기기에서 "이상한 고양이의 특별 무기 선택 상자" 같은 아이템이 안 잡히는 문제
  // 발견 - 원인은 여기 있던 "page < 20"(200개×20페이지=최대 4000개) 하드코딩 상한이었음.
  // 24시간 변동률 내림차순 정렬이라, 가격이 잘 안 움직이는 비인기/희귀 아이템은 4000위
  // 밖으로 밀려서 아예 캐시에 못 들어오고 있었다. API가 스스로 "더 없다"고 할 때까지
  // (items.length < pageSize) 계속 가져오도록 바꾸고, 무한루프 방지용 안전상한만 훨씬
  // 넉넉하게(200페이지=4만개) 올려둔다.
  function fetchAllMarketPrices() {
    var all = [], pageSize = 200;
    for (var page = 0; page < 200; page++) {
      var json = GoombaBot.http.getJson(E.marketPrices + "?sort=pct_change_24h_desc&limit=" + pageSize + "&offset=" + (page * pageSize));
      var items = toArray(json);
      all = all.concat(items);
      if (items.length < pageSize) break;
    }
    return all;
  }
  var getMarketCatalog = GoombaBot.http.memoize(function () {
    var cacheKey = "market_catalog";
    var cached = GoombaBot.storage.read(cacheKey, GoombaBotConfig.cacheTtlMs.market);
    if (cached) return cached;
    try {
      var fresh = fetchAllMarketPrices();
      GoombaBot.storage.write(cacheKey, fresh);
      return fresh;
    } catch (e) {
      GoombaBot.log("시세 조회 실패: " + e);
      return GoombaBot.storage.readStale(cacheKey) || [];
    }
  }, GoombaBotConfig.cacheTtlMs.market);
  function searchMarket(keyword) { return GoombaBot.search.fuzzyFilter(getMarketCatalog(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  GoombaBot.provider.getMarketCatalog = getMarketCatalog;
  GoombaBot.provider.searchMarket = searchMarket;
})();

(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;
  var extractField = GoombaBot.http.extractField;

  function formatSyncedAt() {
    var syncedAt = GoombaBot.storage.getSyncedAt ? GoombaBot.storage.getSyncedAt("market_catalog") : null;
    if (!syncedAt) return "정보 없음";
    var d = new Date(syncedAt);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  var SEARCH_LIST_LIMIT = 10;
  function normalizeForExact(s) { return String(s).replace(/\s+/g, ""); }

  // ---- !시세 ----
  GoombaBot.registerCommand("시세", {
    category: "거래소", summary: "거래소 시세 조회", usage: ["!시세 아이템명", "!시세 마력석"],
    detail: {
      title: F.emoji.market + " 거래소 시세", examples: ["!시세 켈틱류트", "!시세 마력석"],
      features: ["이름이 정확히 일치하면 바로 시세를 보여줍니다", "최저가/평균가/최고가를 보여줍니다"]
    },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!시세 아이템명", "!시세 마력석"])); return; }

      var catalog = P.getMarketCatalog();
      if (catalog.length === 0) { chat.reply(F.emoji.warn + " 시세 데이터를 가져오지 못했습니다."); return; }

      var normKeyword = normalizeForExact(keyword);
      // 1) 정확 일치를 먼저 빠르게 찾는다(유사검색보다 훨씬 빠름) - "분류: 이름"처럼
      // 콜론 뒤에 실제 이름이 오는 경우도 인식한다.
      var exactMatches = [];
      for (var i = 0; i < catalog.length; i++) {
        var itemName = String(extractField(catalog[i], ["name", "title"]));
        if (normalizeForExact(itemName) === normKeyword) { exactMatches.push(catalog[i]); continue; }
        var colonIdx = itemName.search(/[:：]/);
        if (colonIdx !== -1 && normalizeForExact(itemName.substring(colonIdx + 1)) === normKeyword) exactMatches.push(catalog[i]);
      }

      var item = null;
      if (exactMatches.length > 0) {
        item = exactMatches[0];
      } else {
        // 2) 정확 일치가 없으면 부분일치(포함) 검색 - fuzzyFilter 결과에는 부분일치가
        // 이미 포함되어 있다. ⚠️ 이전엔 여기서 바로 "비슷한 이름 추천(suggest)"으로
        // 넘어가서, "마력석"처럼 이름의 일부만 친 경우도 결과가 있는데 없다고 나오는
        // 버그가 있었다 - 부분일치 결과를 실제로 사용하도록 고쳤다.
        var results = P.searchMarket(keyword);
        if (results.length === 0) {
          chat.reply(F.emoji.error + " 검색 결과가 없습니다.");
          return;
        }
        if (results.length === 1) {
          item = results[0];
        } else {
          var lines = [F.emoji.search + " '" + keyword + "' 검색 결과 (" + results.length + "개)", ""];
          for (var ri = 0; ri < Math.min(results.length, SEARCH_LIST_LIMIT); ri++) {
            var ritem = results[ri];
            var riName = String(extractField(ritem, ["name", "title"]));
            var riPrice = GoombaBot.format.number(Number(extractField(ritem, ["min_price", "minPrice"]) || 0));
            lines.push("• " + riName + " " + riPrice + "데카");
          }
          if (results.length > SEARCH_LIST_LIMIT) lines.push("", "... 외 " + (results.length - SEARCH_LIST_LIMIT) + "개 더 (검색어를 더 구체적으로 입력해보세요)");
          chat.reply(lines.join("\n"));
          return;
        }
      }

      var name = String(extractField(item, ["name", "title"]));
      // ⚠️ "평균가"/"최고가"는 실제 API에 확인된 필드가 아닐 수 있어서, 있으면 보여주고
      // 없으면 "정보 없음"으로 정직하게 표시한다(지어내지 않음).
      chat.reply([
        F.emoji.market + " " + name + " 시세",
        "",
        F.field("최저가", GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0)) + " 데카"),
        F.field("평균가", extractField(item, ["avg_price", "avgPrice", "average_price"]) !== null ? GoombaBot.format.number(Number(extractField(item, ["avg_price", "avgPrice", "average_price"]))) + " 데카" : null),
        F.field("최고가", extractField(item, ["max_price", "maxPrice"]) !== null ? GoombaBot.format.number(Number(extractField(item, ["max_price", "maxPrice"]))) + " 데카" : null),
        "",
        F.emoji.clock + " 최근 갱신 : " + formatSyncedAt()
      ].join("\n"));
    }
  });

})();

module.exports = { GoombaBot: GoombaBot };


},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],8:[function(require,module,exports){

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

  function fetchNewsList(path, cacheKey) {
    var cached = GoombaBot.storage.read(cacheKey, GoombaBotConfig.cacheTtlMs.notice);
    if (cached) return cached;
    try {
      var json = GoombaBot.http.getJson(path);
      var items = (json && json.items) ? json.items : [];
      GoombaBot.storage.write(cacheKey, items);
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
      var json = GoombaBot.http.getJson(path);
      var items = (json && json.items) ? json.items : [];
      GoombaBot.storage.write(cacheKey, items); // 사용자용 캐시도 최신으로 같이 갱신해준다
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
  function isDoneTitle(title) { return /^\s*\(완료\)/.test(title); }
  function extractTimeRange(title) {
    var m = title.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return m[1] + ":" + m[2] + " ~ " + m[3] + ":" + m[4];
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
    isDoneTitle: isDoneTitle, extractTimeRange: extractTimeRange,
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

  /** 공지 목록 처리 - 새 글/점검 시작·긴급점검/점검 종료/점검 연장을 전부 여기서 판단한다 */
  function processNoticeList(items, seenMap) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var prev = seenMap[item.id];

      if (!prev) {
        // 신규 글
        if (N.isMaintenanceTitle(item.title)) {
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
        } else {
          broadcast(N.roomsWanting("공지"), [
            "\uD83D\uDCE2 마비노기 공식 공지", "", item.title, "", item.url
          ].join("\n"));
        }
        seenMap[item.id] = { title: item.title, isDone: N.isDoneTitle(item.title) };
        continue;
      }

      // 이미 본 글 - 제목이 바뀌었는지 확인(점검 종료/연장은 새 글이 아니라 제목 수정으로 옴)
      if (prev.title === item.title) continue;

      var wasDone = !!prev.isDone;
      var nowDone = N.isDoneTitle(item.title);
      if (!wasDone && nowDone) {
        broadcast(N.roomsWanting("점검"), [
          "\u2705 서버 점검 종료", "", "서버 접속 가능합니다.", "", "즐마하세요 \uD83C\uDF44"
        ].join("\n"));
      } else {
        var oldRange = N.extractTimeRange(prev.title);
        var newRange = N.extractTimeRange(item.title);
        if (oldRange && newRange && oldRange !== newRange) {
          broadcast(N.roomsWanting("점검"), [
            "\u23F0 점검 연장", "", "기존", oldRange, "", "변경", newRange
          ].join("\n"));
        }
        // 그 외의 사소한 제목 수정(오타 정정 등)은 알림 스팸을 막기 위해 조용히 넘어간다
      }
      seenMap[item.id] = { title: item.title, isDone: nowDone };
    }
  }

  /** 이벤트/업데이트는 새 글만 있으면 그대로 알린다(제목 수정 추적 불필요) */
  function processSimpleList(items, seenMap, roomSettingKey, headerLine) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (seenMap[item.id]) continue;
      broadcast(N.roomsWanting(roomSettingKey), [headerLine, "", item.title, "", item.url].join("\n"));
      seenMap[item.id] = { title: item.title, isDone: false };
    }
  }

  GoombaBot.registerMonitor("공식공지모니터", {
    intervalMs: 5 * 60 * 1000, // 요청하신 "5분" 주기
    check: function () {
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
        for (var i = 0; i < notices.length; i++) seenNotice[notices[i].id] = { title: notices[i].title, isDone: GoombaBot.officialNews.isDoneTitle(notices[i].title) };
        saveSeenMap(seenNotice);

        var seenEvents = {};
        for (var e = 0; e < events.length; e++) seenEvents[events[e].id] = { title: events[e].title, isDone: false };
        GoombaBot.storage.write("official_events_seen", seenEvents);

        var seenUpdates = {};
        for (var u = 0; u < updates.length; u++) seenUpdates[updates[u].id] = { title: updates[u].title, isDone: false };
        GoombaBot.storage.write("official_updates_seen", seenUpdates);
        GoombaBot.storage.write("official_news_initialized", true);
        return null;
      }

      processNoticeList(notices, seenNotice);
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

},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],9:[function(require,module,exports){

/**
 * commands/resistance.js
 * -------------------------
 * 마도 저항 계산기(!마도저항, !마저) - 과거 세션에서 실제로 구현했던 기능을
 * 트랜스크립트에서 찾아 그대로 복원한 것. 새로 만든 공식이 아니다.
 *
 * ⚠️ 공식 출처: 나무위키 "마비노기 모바일/능력치" 문서에 문서화된 공식
 * (Nexon 공식 발표 자료가 아니라 커뮤니티 문서) - 참고용으로만 사용.
 *   공격 최종대미지: 저항<압력 → 0.5^((압력-저항)/1000) | 저항=압력 → 100%
 *                    | 저항>압력 → 1.4-0.4*0.5^((저항-압력)/10000)
 *   피격 최종대미지: 저항<압력 → 1+(((압력-저항)/1000)^0.75) | 저항>=압력 → 100%
 * 두 값(내 마도 저항, 콘텐츠의 마도 압력)이 둘 다 있어야 계산할 수 있다 -
 * 값 하나만으로는 계산이 안 되는 공식이라 인자 2개가 필수다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
require("../core/format.js");
require("../core/router.js");

(function () {
  var F = GoombaBot.format;

  function calcAttackFinalDamagePct(resistance, pressure) {
    if (resistance < pressure) return Math.pow(0.5, (pressure - resistance) / 1000) * 100;
    if (resistance === pressure) return 100;
    return (1.4 - 0.4 * Math.pow(0.5, (resistance - pressure) / 10000)) * 100;
  }
  function calcHitFinalDamagePct(resistance, pressure) {
    if (resistance < pressure) return (1 + Math.pow((pressure - resistance) / 1000, 0.75)) * 100;
    return 100;
  }

  // ⚠️ 길드원 대부분이 "룬다 지옥1" 기준으로 계산한다는 요청으로 기본 압력값을 둔다.
  // 계산 공식 자체는 전혀 안 바뀌었고, 압력을 안 넣었을 때만 이 값을 대신 쓴다.
  var DEFAULT_PRESSURE = 4400; // 룬다 지옥1 마도 압력
  var DEFAULT_PRESSURE_LABEL = "룬다 지옥1";

  // ⚠️ 실기기 스크린샷(ErinnData 사이트 A=4,400/B=7,200 두 지점)으로 역산해서 확정한
  // 콘텐츠별 내부 압력표. 오차 전부 ±0.1%p 이내로 검증됨(공격 최종대미지 공식 기준).
  // "지옥2~4"/"카브락 어려움"은 ErinnData 사이트에도 "(예상)"으로 표기된 미공개 추정치.
  var CONTENT_PRESSURES = [
    { key: "abyss_intro", label: "어비스 입문", pressure: 1000 },
    { key: "abyss_hard", label: "어비스 어려움", pressure: 1600 },
    { key: "abyss_veryhard", label: "어비스 매우 어려움", pressure: 2700 },
    { key: "abyss_veryhard2", label: "어비스 매우 어려움 2", pressure: 3000 },
    { key: "abyss_hell1", label: "어비스 지옥1", pressure: 4400 },
    { key: "abyss_hell2", label: "어비스 지옥2", pressure: 7200, estimated: true },
    { key: "abyss_hell3", label: "어비스 지옥3", pressure: 8600, estimated: true },
    { key: "abyss_hell4", label: "어비스 지옥4", pressure: 10000, estimated: true },
    { key: "kabrak_intro", label: "카브락 입문", pressure: 2500 },
    { key: "kabrak_hard", label: "카브락 어려움", pressure: 3700, estimated: true }
  ];
  var ERINNDATA_NOTE = "\uD83D\uDCCC 공격 최종대미지(주는 피해)는 ErinnData 계산기 스크린샷으로 검증됨. 피격 최종대미지(받는 피해)는 나무위키 출처라 ErinnData와 대조 확인 전임";

  // ⚠️ "쿠짱봇 스타일" 단일 메시지 출력용 - 지옥2~4처럼 "(예상)" 표기가 붙는 미공개
  // 콘텐츠는 제외하고, 확정된 7개 콘텐츠만 보여준다(사용자 확정). 카브락 어려움은
  // 예상치이지만 사용자 예시에 포함되어 있어서 포함하되 "(예상)" 표기는 유지한다.
  var MAIN_DISPLAY_KEYS = ["abyss_intro", "abyss_hard", "abyss_veryhard", "abyss_veryhard2", "abyss_hell1", "kabrak_intro", "kabrak_hard"];
  var MAIN_DISPLAY_CONTENTS = [];
  for (var mi = 0; mi < CONTENT_PRESSURES.length; mi++) {
    if (MAIN_DISPLAY_KEYS.indexOf(CONTENT_PRESSURES[mi].key) !== -1) MAIN_DISPLAY_CONTENTS.push(CONTENT_PRESSURES[mi]);
  }

  // ⚠️ ErinnData 계산기의 프리셋 버튼 값과 동일(+잔영최대/해연최소·7200,
  // +해연최저·드레케인·8600, +해연최대·10000) - "목표 마저" 구간에서 재사용.
  var GOAL_TARGETS = [7200, 8600, 10000];
  // ⚠️ "8→10성 룬 N개" - 룬 하나당 +300(사용자 확정), 최대 4개까지 시뮬레이션.
  var RUNE_STEPS = [1, 2, 3, 4];

  var SECTION_LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";

  function formatContentLineOnly(resistance, content) {
    var pct = calcAttackFinalDamagePct(resistance, content.pressure) - 100;
    var sign = pct >= 0 ? "+" : "";
    return content.label + (content.estimated ? " (예상)" : "") + " : " + sign + pct.toFixed(1) + "%";
  }

  /** 룬 교체 섹션 전용 - 현재값 대비 증가량(▲)까지 한 줄에 같이 보여준다 */
  function formatContentLineWithDelta(newResistance, baseResistance, content) {
    var newPct = calcAttackFinalDamagePct(newResistance, content.pressure) - 100;
    var basePct = calcAttackFinalDamagePct(baseResistance, content.pressure) - 100;
    var deltaPct = newPct - basePct;
    var sign = newPct >= 0 ? "+" : "";
    return content.label + (content.estimated ? " (예상)" : "") + " : " + sign + newPct.toFixed(1) + "% (\u25B2" + deltaPct.toFixed(1) + "%)";
  }

  /**
   * "쿠짱봇 스타일" 출력 - !마저 [저항](압력 생략, 목표/전체/비교 아님) 전용.
   * 계산식은 calcAttackFinalDamagePct 그대로 재사용 - 새 공식 없음, 출력 형태만 다름.
   * 분할 전송 없이 한 메시지로 전부 보낸다(사용자 확정). 콘텐츠/목표는 한 줄 표시,
   * 룬 교체 섹션은 현재 대비 증가량(▲)까지 같이 보여준다(사용자 확정).
   */
  function buildKuzzangStyleReply(resistance) {
    var out = [SECTION_LINE, "\uD83D\uDCCA 마도저항 정보", "\u2694 현재 마도저항", String(resistance), SECTION_LINE];

    out.push("\uD83D\uDCC8 최종 대미지");
    for (var i = 0; i < MAIN_DISPLAY_CONTENTS.length; i++) {
      out.push(formatContentLineOnly(resistance, MAIN_DISPLAY_CONTENTS[i]));
    }
    out.push(SECTION_LINE);

    out.push("\uD83C\uDFAF 목표 마저");
    for (var g = 0; g < GOAL_TARGETS.length; g++) {
      var target = GOAL_TARGETS[g];
      var gap = target - resistance;
      out.push(String(target) + " \u2192 " + (gap > 0 ? gap + " 부족" : "달성"));
    }
    out.push(SECTION_LINE);

    out.push("\uD83D\uDCC9 룬 교체 예상");
    for (var r = 0; r < RUNE_STEPS.length; r++) {
      var count = RUNE_STEPS[r];
      var delta = count * 300;
      var newResistance = resistance + delta;
      out.push("\uD83D\uDD04 8\u219210성 룬 " + count + "개 (+" + delta + ")");
      for (var j = 0; j < MAIN_DISPLAY_CONTENTS.length; j++) {
        out.push(formatContentLineWithDelta(newResistance, resistance, MAIN_DISPLAY_CONTENTS[j]));
      }
    }
    out.push(SECTION_LINE);

    out.push("\uD83D\uDCCC 참고");
    out.push("• 계산식은 기존과 동일");
    out.push("• 출력 UX만 개선");
    out.push("• 기존 명령어는 모두 유지");
    out.push("• !마저 목표");
    out.push("• !마저 전체");
    out.push("• !마저 비교");
    out.push("• !마저 [저항] 만 출력 형식 변경");

    return out.join("\n");
  }


  function formatContentLine(c, resistance) {
    var pct = calcAttackFinalDamagePct(resistance, c.pressure);
    var sign = pct >= 100 ? "+" : "";
    var pctText = sign + (pct - 100).toFixed(1) + "%";
    return c.label + (c.estimated ? " (예상)" : "") + " : " + pctText;
  }

  function resistanceExecute(chat) {
    var args = chat.args;

    // ⚠️ "!마저 전체 [저항]" - ErinnData 계산기의 콘텐츠별 그리드와 동일하게, 확정된
    // 콘텐츠 압력표 전체에 대해 한 번에 계산해서 보여준다(공격 최종대미지 기준).
    if (String(args[0]) === "전체") {
      var resistanceAll = Number(args[1]);
      if (isNaN(resistanceAll)) {
        chat.reply(F.usageBlock(["!마저 전체 [내 저항]", "예) !마저 전체 4400"]));
        return;
      }
      var allLines = [F.field("내 마도 저항", resistanceAll), ""];
      for (var ai = 0; ai < CONTENT_PRESSURES.length; ai++) {
        allLines.push(formatContentLine(CONTENT_PRESSURES[ai], resistanceAll));
      }
      allLines.push("", ERINNDATA_NOTE);
      chat.reply(F.box(F.emoji.calc + " 마도 저항 - 콘텐츠별 대미지 배율", allLines));
      return;
    }

    // ⚠️ "!마저 비교 [A] [B]" - ErinnData 계산기의 A/B 프리셋 비교 그리드와 동일한
    // 형태. 콘텐츠 압력표 전체에 대해 A/B 두 저항값을 나란히 비교한다.
    if (String(args[0]) === "비교") {
      var valA = Number(args[1]);
      var valB = Number(args[2]);
      if (isNaN(valA) || isNaN(valB)) {
        chat.reply(F.usageBlock(["!마저 비교 [A] [B]", "예) !마저 비교 4400 7200"]));
        return;
      }
      var cmpLines = [F.field("A", valA), F.field("B", valB), ""];
      for (var ci = 0; ci < CONTENT_PRESSURES.length; ci++) {
        var c = CONTENT_PRESSURES[ci];
        var pctA = calcAttackFinalDamagePct(valA, c.pressure) - 100;
        var pctB = calcAttackFinalDamagePct(valB, c.pressure) - 100;
        cmpLines.push(c.label + (c.estimated ? " (예상)" : ""));
        cmpLines.push("  A " + (pctA >= 0 ? "+" : "") + pctA.toFixed(1) + "%   B " + (pctB >= 0 ? "+" : "") + pctB.toFixed(1) + "%");
      }
      cmpLines.push("", ERINNDATA_NOTE);
      chat.reply(F.box(F.emoji.calc + " 마도 저항 - A/B 비교", cmpLines));
      return;
    }

    // ⚠️ "!마저 목표 [현재] [목표저항]" - 현재/목표 두 저항값을 나란히 비교해서
    // "필요한 수치"까지 한눈에 보여주는 모드(기존 계산 공식/기본압력은 그대로 재사용,
    // 기존 "!마저 [저항] [압력]" 방식은 전혀 안 건드림).
    if (String(args[0]) === "목표") {
      var current = Number(args[1]);
      var goal = Number(args[2]);
      var pressureArg = Number(args[3]);
      var pressure2 = isNaN(pressureArg) ? DEFAULT_PRESSURE : pressureArg;

      if (isNaN(current) || isNaN(goal)) {
        chat.reply(F.usageBlock(["!마저 목표 [현재 저항] [목표 저항]", "예) !마저 목표 4100 4700"]));
        return;
      }

      var curAttack = calcAttackFinalDamagePct(current, pressure2);
      var curHit = calcHitFinalDamagePct(current, pressure2);
      var goalAttack = calcAttackFinalDamagePct(goal, pressure2);
      var goalHit = calcHitFinalDamagePct(goal, pressure2);
      var need = goal - current;

      var goalLines = [
        F.field("콘텐츠 마도 압력", pressure2 + (isNaN(pressureArg) ? " (" + DEFAULT_PRESSURE_LABEL + " 기준)" : "")),
        "",
        F.field("\uD83D\uDCCD 현재 마도저항", current),
        F.field("  ⚔️ 공격 최종대미지", curAttack.toFixed(1) + "%"),
        F.field("  \uD83D\uDEE1\uFE0F 피격 최종대미지", curHit.toFixed(1) + "%"),
        "",
        F.field("\uD83C\uDFAF 목표 마도저항", goal),
        F.field("  ⚔️ 공격 최종대미지", goalAttack.toFixed(1) + "%"),
        F.field("  \uD83D\uDEE1\uFE0F 피격 최종대미지", goalHit.toFixed(1) + "%"),
        "",
        F.field("\uD83D\uDCCA 필요한 수치", (need > 0 ? "저항 " + need + " 더 필요" : (need < 0 ? "이미 목표 초과(+" + (-need) + ")" : "이미 목표 도달"))),
        "",
        F.emoji.warn + " 공식 출처: 나무위키(커뮤니티 문서, 공식 자료 아님) - 참고용으로만 사용하세요."
      ];
      chat.reply(F.box(F.emoji.calc + " 마도 저항 목표 비교", goalLines));
      return;
    }

    var resistance = Number(args[0]);

    if (args.length === 0 || isNaN(resistance)) {
      chat.reply(F.usageBlock([
        "!마도저항 [내 저항]", "!마도저항 [내 저항] [콘텐츠 압력]", "!마도저항 목표 [현재] [목표]",
        "!마도저항 전체 [내 저항]", "!마도저항 비교 [A] [B]",
        "예) !마도저항 4100", "예) !마도저항 4100 4700", "예) !마도저항 목표 4100 4700",
        "예) !마도저항 전체 4400", "예) !마도저항 비교 4400 7200"
      ]));
      return;
    }

    var usingDefault = args.length < 2 || isNaN(Number(args[1]));

    // ⚠️ "!마저 [저항]" (압력 생략) 형태일 때만 새 쿠짱봇 스타일 출력 사용.
    // "!마저 [저항] [압력]"으로 압력을 직접 지정한 경우는 기존 출력 방식 그대로 유지
    // (사용자 확정: "!마저 [저항] 만 출력 형식 변경").
    if (usingDefault) {
      chat.reply(buildKuzzangStyleReply(resistance));
      return;
    }

    var pressure = Number(args[1]);

    var attackPct = calcAttackFinalDamagePct(resistance, pressure);
    var hitPct = calcHitFinalDamagePct(resistance, pressure);

    var lines = [
      F.field("내 마도 저항", resistance),
      F.field("콘텐츠 마도 압력", pressure),
      "",
      F.field("⚔️ 공격 최종대미지", attackPct.toFixed(1) + "%"),
      F.field("\uD83D\uDEE1\uFE0F 피격 최종대미지", hitPct.toFixed(1) + "%")
    ];

    if (resistance < pressure) {
      var needed = pressure - resistance;
      lines.push("", F.emoji.target + " 압력과 같아지려면 저항 " + needed + " 더 필요");
    }

    lines.push("", F.emoji.warn + " 공식 출처: 나무위키(커뮤니티 문서, 공식 자료 아님) - 참고용으로만 사용하세요.");

    chat.reply(F.box(F.emoji.calc + " 마도 저항 계산", lines));
  }

  GoombaBot.registerCommand("마도저항", {
    category: "정보", summary: "마도 저항 계산 (압력 생략 시 룬다 지옥1 기준)", usage: ["!마도저항 4100", "!마도저항 4100 4700", "!마도저항 목표 4100 4700", "!마도저항 전체 4400", "!마도저항 비교 4400 7200"],
    detail: {
      title: F.emoji.calc + " 마도 저항 계산기", examples: ["!마도저항 4100", "!마도저항 4100 4700", "!마도저항 목표 4100 4700", "!마도저항 전체 4400", "!마도저항 비교 4400 7200"],
      features: [
        "!마도저항 [저항]만 넣으면 어비스/카브락 7개 콘텐츠 + 목표(7200/8600/10000) + 8→10성 룬 1~4개 시뮬레이션까지 한 메시지로 전부 보여줍니다",
        "!마도저항 [저항] [압력]으로 압력을 직접 지정하면 그 콘텐츠 하나만 계산하는 기존 방식 그대로입니다",
        "!마도저항 목표 [현재] [목표]로 현재/목표 저항을 나란히 비교하고 필요한 수치까지 확인할 수 있습니다",
        "!마도저항 전체 [저항]으로 어비스/카브락 전체 콘텐츠(미공개 예상치 포함) 대미지 배율을 확인합니다",
        "!마도저항 비교 [A] [B]로 두 저항값을 전체 콘텐츠에 대해 나란히 비교합니다",
        "공격 최종대미지 공식과 콘텐츠 압력표는 ErinnData 계산기로 검증됨. 피격 최종대미지는 나무위키 출처(대조 확인 전)"
      ]
    },
    execute: resistanceExecute
  });

  // !마저 - !마도저항의 단축 명령어(완전히 동일한 함수를 그대로 사용)
  GoombaBot.registerCommand("마저", {
    category: "정보", summary: "마도 저항 계산 (!마도저항과 완전히 동일)", usage: ["!마저 4100", "!마저 4100 4700", "!마저 목표 4100 4700", "!마저 전체 4400", "!마저 비교 4400 7200"],
    detail: { title: F.emoji.calc + " 마도 저항 계산기", examples: ["!마저 4100", "!마저 4100 4700", "!마저 목표 4100 4700", "!마저 전체 4400", "!마저 비교 4400 7200"], features: ["!마도저항과 완전히 동일하게 동작합니다"] },
    execute: resistanceExecute
  });
})();

module.exports = { GoombaBot: GoombaBot };


},{"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],10:[function(require,module,exports){

/**
 * commands/search.js
 * --------------------
 * 룬/룬워드/인챈트/아티팩트/칭호/아이템 - 조회 서비스 + 검색형 명령어를 담당한다.
 * (!룬, !ㄹ, !룬워드, !인챈트, !아티팩트, !칭호, !아이템)
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

GoombaBot.provider = GoombaBot.provider || {};

// ---- 서비스 (API 조회 - 각 함수를 GoombaBot.provider에 붙인다) ----
(function () {
  var E = GoombaBotConfig.endpoints;
  var toArray = GoombaBot.http.toArray;
  var extractField = GoombaBot.http.extractField;
  var fetchCached = GoombaBot.http.fetchCached;

  // ---- 룬 ----
  // ⚠️ 실기기 !진단 1에서 /runes가 timeout으로 실패 확인됨(JSON 파싱 문제 아님) - 데이터가
  // 많아서 응답이 오래 걸리는 것으로 보고 처음부터 넉넉한 타임아웃을 준다.
  //
  // ⚠️ 응답속도 개선 - 모든 도감 데이터에 memoize(메모리 TTL 캐시)를 적용한다. 봇이
  // 켜져있는 동안(같은 실행 세션)에는 디스크 캐시조차 다시 안 읽고 그 자리에서 바로
  // 반환한다 - 검색이 몇 번이든 실질적으로 최초 1회만 로딩한다.
  var memoize = GoombaBot.http.memoize;
  var TTL = GoombaBotConfig.cacheTtlMs.default;

  var getRunes = memoize(function () {
    return fetchCached("runes", TTL, E.runes, null, { timeout: 20000 });
  }, TTL);
  function searchRunes(keyword) { return GoombaBot.search.fuzzyFilter(getRunes(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  var getRuneUsage = memoize(function () {
    // TODO: usage-batch 응답의 정확한 형태(룬 이름별 사용률 매핑인지, 배열인지)를 실제로
    // 확인 후 이 함수를 다듬어주세요. 지금은 배열/객체 둘 다 최대한 방어적으로 처리합니다.
    var cacheKey = "rune_usage";
    var cached = GoombaBot.storage.read(cacheKey, TTL);
    if (cached) return cached;
    try {
      var json = GoombaBot.http.getJson(E.runeUsage);
      GoombaBot.storage.write(cacheKey, json);
      return json;
    } catch (e) {
      GoombaBot.log("룬 사용률 조회 실패: " + e);
      return GoombaBot.storage.readStale(cacheKey) || null;
    }
  }, TTL);

  function findUsageFor(runeName) {
    var usage = getRuneUsage();
    if (!usage) return null;
    // 흔한 형태 후보: { "화염": 12.3 } 같은 맵, 또는 [{name, usageRate}] 배열
    if (usage[runeName] !== undefined) return usage[runeName];
    var arr = toArray(usage);
    for (var i = 0; i < arr.length; i++) {
      if (String(extractField(arr[i], ["name", "runeName"])) === runeName) {
        return extractField(arr[i], ["usageRate", "usage", "rate", "percentage"]);
      }
    }
    return null;
  }

  // ---- 룬워드 ----
  // ⚠️ 실기기 !진단 2 결과 확인됨: 응답 최상위가 {version, seasons, words, total}인데
  // seasons가 배열이라 먼저 잡혀서 룬워드 도감이 "총 2개 / null / null"로 나오던 원인.
  // words를 명시적으로 우선 사용하도록 고침. 캐시키도 rune_words_v2로 바꿔서, 기존에
  // seasons로 잘못 캐싱된 값이 TTL 남아있어도 이번 배포 후 무조건 새로 받아오게 한다.
  var getRuneWords = memoize(function () {
    return fetchCached("rune_words_v2", TTL, E.runeWords, "words");
  }, TTL);
  function searchRuneWords(keyword) { return GoombaBot.search.fuzzyFilter(getRuneWords(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  /**
   * ⚠️ 성능개선 - "이 룬을 쓰는 룬워드"를 찾을 때 매번 룬워드 전체(198건 등)를
   * 순회하던 것을, "룬 이름 -> 룬워드 목록" Map을 한 번만 만들어서 캐시해두고
   * 검색 시엔 인덱스[룬이름]로 O(1)에 바로 찾도록 바꾼다. getRuneWords()와 같은
   * TTL로 memoize해서, 룬워드 데이터가 갱신될 때만 다시 만든다.
   */
  var getRuneWordIndex = memoize(function () {
    var words = getRuneWords();
    var index = {};
    for (var w = 0; w < words.length; w++) {
      var req = extractField(words[w], ["requiredRunes", "required_runes"]);
      if (!req || !req.length) continue;
      for (var r = 0; r < req.length; r++) {
        var it = req[r];
        var runeName = (it && typeof it === "object") ? String(extractField(it, ["name", "title"])) : String(it);
        if (!index[runeName]) index[runeName] = [];
        index[runeName].push(words[w]);
      }
    }
    return index;
  }, TTL);

  // ---- 인챈트 ----
  var getEnchants = memoize(function () { return fetchCached("enchants", TTL, E.enchants); }, TTL);
  function searchEnchants(keyword) { return GoombaBot.search.fuzzyFilter(getEnchants(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  // ---- 아티팩트 ----
  var getArtifacts = memoize(function () { return fetchCached("artifacts", TTL, E.artifacts); }, TTL);
  function searchArtifacts(keyword) { return GoombaBot.search.fuzzyFilter(getArtifacts(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  // ---- 칭호 ----
  var getTitles = memoize(function () { return fetchCached("titles", TTL, E.titles); }, TTL);
  function searchTitles(keyword) { return GoombaBot.search.fuzzyFilter(getTitles(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  // ---- 아이템 ----
  var getItems = memoize(function () { return fetchCached("items", TTL, E.items); }, TTL);
  function searchItems(keyword) { return GoombaBot.search.fuzzyFilter(getItems(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  GoombaBot.provider.getRunes = getRunes;
  GoombaBot.provider.searchRunes = searchRunes;
  GoombaBot.provider.findUsageFor = findUsageFor;
  GoombaBot.provider.getRuneWords = getRuneWords;
  GoombaBot.provider.getRuneWordIndex = getRuneWordIndex;
  GoombaBot.provider.searchRuneWords = searchRuneWords;
  GoombaBot.provider.getEnchants = getEnchants;
  GoombaBot.provider.searchEnchants = searchEnchants;
  GoombaBot.provider.getArtifacts = getArtifacts;
  GoombaBot.provider.searchArtifacts = searchArtifacts;
  GoombaBot.provider.getTitles = getTitles;
  GoombaBot.provider.searchTitles = searchTitles;
  GoombaBot.provider.getItems = getItems;
  GoombaBot.provider.searchItems = searchItems;
})();

// ---- 명령어 (!룬 / !ㄹ / !룬워드 / !인챈트 / !아티팩트 / !칭호 / !아이템) ----
(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;
  var extractField = GoombaBot.http.extractField;
  var extractFieldWithKey = GoombaBot.http.extractFieldWithKey;

  function nameOf(obj) { return String(extractField(obj, ["name", "title"])); }
  function allNamesOf(list) {
    var names = [];
    for (var i = 0; i < list.length; i++) names.push(nameOf(list[i]));
    return names;
  }
  /** 검색 결과 0건일 때 - 그냥 실패 대신 비슷한 이름을 추천한다 */
  function notFoundReply(chat, keyword, allNames) {
    var suggestions = GoombaBot.search.suggest(allNames, keyword, 3);
    var lines = [F.emoji.error + ' "' + keyword + '" 검색 결과가 없습니다.'];
    if (suggestions.length) {
      lines.push("", "혹시 아래를 찾으셨나요?");
      for (var i = 0; i < suggestions.length; i++) lines.push(F.emoji.search + " " + suggestions[i]);
    }
    chat.reply(lines.join("\n"));
  }
  function toListText(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === "object") return F.objectSummary(val);
    return String(val);
  }

  var SEARCH_ICON = "\uD83D\uDD0E"; // 쿠짱봇 스타일 검색 아이콘(F.emoji.search=🔍와 다름 - 검색결과 헤더 전용)
  var DIVIDER = "----------------";

  /** 배열 요소가 문자열이든 {name,...} 객체든 상관없이 이름으로 특정 값을 포함하는지 확인 */
  function arrayContainsName(arr, name) {
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var itName = (it && typeof it === "object") ? String(extractField(it, ["name", "title"])) : String(it);
      if (itName === name) return true;
    }
    return false;
  }

  /**
   * 상세 출력 - "{등급이모지} 이름 [등급] [시즌2]" 한 줄(있는 것만) + 설명 본문(그대로) +
   * 나머지 필드 + (있으면) 관련 정보 섹션들. order에 명시된 필드만 보여준다
   * (허용목록) - API 내부 필드(scroll_type 등)가 몰라도 자동으로 안 보임.
   * ⚠️ grade/tier 같은 필드를 무조건 보여주진 않는다 - 실제 API의 grade가 "0801" 같은
   * 내부 코드값일 수 있어서, 보여주려면 아래처럼 명시적으로 지정해야 한다.
   *   detailOptions.namePrefix: 이름 앞에 붙일 이모지(예: 등급 색깔 이모지 "🟨 ").
   *   detailOptions.gradeTag: 이름 옆에 "[전설]"처럼 표시할 등급 텍스트.
   *   detailOptions.seasonTag: "시즌2" 같은 문자열 - 있으면 이름 옆에 "[시즌2]"로 표시.
   *   detailOptions.infoLine: 이름 줄 다음에 별도로 한 줄 더 보여줄 내용(예: 아티팩트 색상).
   *   detailOptions.sections: [{ title: "🧩 룬 워드", lines: [...] }, ...] - 데이터가
   *   있는 섹션만(lines가 비어있으면 그 섹션 자체를 생략) 순서대로 붙는다.
   */
  function formatDetailCard(emojiChar, obj, detailOptions) {
    detailOptions = detailOptions || {};
    var name = detailOptions.displayName || nameOf(obj);

    var bodyCandidates = [detailOptions.bodyField].concat(detailOptions.bodyFallback || ["description", "effect", "effects", "flavor_text", "desc"]);
    var bodyKey = null, bodyText = null;
    for (var i = 0; i < bodyCandidates.length; i++) {
      var k = bodyCandidates[i];
      if (!k || bodyKey) continue;
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
        bodyKey = k;
        bodyText = typeof obj[k] === "object" ? F.objectSummary(obj[k], "\n", true) : String(obj[k]);
      }
    }

    var usedKeys = {};
    if (bodyKey) usedKeys[bodyKey] = true;
    var order = (detailOptions.order || []).filter(function (k) { return !usedKeys[k]; });

    var fieldLines = F.renderDetail(obj, { order: order });

    var sections = detailOptions.sections || [];
    var hasSectionContent = false;
    for (var s = 0; s < sections.length; s++) {
      if (sections[s] && sections[s].lines && sections[s].lines.length > 0) { hasSectionContent = true; break; }
    }

    // ⚠️ 안전장치 - 본문/필드/섹션이 전부 비어서 카드가 사실상 "이름만" 나오는
    // 상태가 되면, 어떤 필드가 실제로 있는지 몰라서 놓친 것일 수 있으니 renderDetailAll로
    // 실제 데이터에 있는 값들을 대신 보여준다(내부 ID류 몇 개는 renderDetailAll이
    // 알아서 스킵함) - 완전히 빈 응답보다는 뭐라도 보여주는 게 낫다.
    if (!bodyText && fieldLines.length === 0 && !hasSectionContent) {
      var fallbackLines = F.renderDetailAll(obj, {});
      if (fallbackLines.length) fieldLines = fallbackLines;
    }

    var headerLine = (detailOptions.namePrefix ? detailOptions.namePrefix + " " : "") + name;
    if (detailOptions.gradeTag) headerLine += " [" + detailOptions.gradeTag + "]";
    if (detailOptions.seasonTag) headerLine += " [" + detailOptions.seasonTag + "]";

    var out = [headerLine];
    if (detailOptions.infoLine) out.push(detailOptions.infoLine);
    if (bodyText) out.push(bodyText);
    if (fieldLines.length) out.push(fieldLines.join("\n"));

    for (var s2 = 0; s2 < sections.length; s2++) {
      var sec = sections[s2];
      if (!sec || !sec.lines || sec.lines.length === 0) continue;
      out.push(sec.title);
      out.push(sec.lines.join("\n"));
    }

    return out.join("\n");
  }

  function sortKo(arr) {
    return arr.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
  }

  /** 공백만 무시하고 완전히 같은 이름인지 비교할 때 쓴다(한글은 대소문자가 없어 소문자화는 불필요). */
  function normalizeForExact(s) { return String(s).replace(/\s+/g, ""); }

  /** "아티팩트: 분쇄"처럼 분류명이 콜론과 함께 앞에 붙어있으면 그 부분을 떼어내고
   * 실제 이름만 남긴다(표시용). 콜론이 없으면 원본 그대로. */
  function stripCategoryPrefix(name) {
    var s = String(name);
    var colonIdx = s.search(/[:：]/);
    if (colonIdx === -1) return s;
    return s.substring(colonIdx + 1).replace(/^\s+/, "");
  }

  /**
   * ⚠️ 속도 최적화의 핵심 - 정확히 일치하는 항목을 "이름 직접 비교"만으로 빠르게 찾는다
   * (레벤슈타인 거리 계산 등이 들어간 fuzzyFilter를 아예 안 돌린다). 대부분의 검색은
   * 사용자가 정확한 이름을 아는 경우라, 이 빠른 경로만으로 끝나는 경우가 훨씬 많다.
   * fuzzyFilter(유사검색)는 이 빠른 경로에서 못 찾았을 때만(=진짜 필요할 때만) 돌린다.
   *
   * ⚠️ "아티팩트: 분쇄"처럼 실제 name 필드에 분류가 콜론과 함께 앞에 붙어있는 경우도
   * 있어서, 콜론(:/：) 뒤쪽만 떼어서도 비교한다 - 사용자는 "분쇄"라고만 쳐도 찾아지게.
   */
  function findExactMatchesFast(all, keyword) {
    var normKeyword = normalizeForExact(keyword);
    var matches = [];
    for (var i = 0; i < all.length; i++) {
      var itemName = nameOf(all[i]);
      var normName = normalizeForExact(itemName);
      if (normName === normKeyword) { matches.push(all[i]); continue; }

      var colonIdx = itemName.search(/[:：]/);
      if (colonIdx !== -1) {
        var afterColon = normalizeForExact(itemName.substring(colonIdx + 1));
        if (afterColon === normKeyword) matches.push(all[i]);
      }
    }
    return matches;
  }

  /**
   * 도감(전체 목록) - 시즌별로 구분한다. 시즌 인자가 없으면 시즌 목록(선택 안내)을,
   * 있으면 그 시즌의 이름 목록을 보여준다. 시즌 정보는 실제 데이터에 있는 값을
   * 그대로 쓴다(임의로 지어내지 않음) - season 필드가 없는 항목은 "미분류"로 묶인다.
   */
  function runCatalogCommand(chat, getAllFn, catLabel, emojiChar, seasonArg) {
    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    var grouped = F.groupBySeasons(all, extractField);

    if (!seasonArg) {
      var lines = ["\uD83D\uDCD8 " + catLabel + " 도감", "", "시즌 선택:"];
      for (var i = 0; i < grouped.order.length; i++) {
        lines.push(F.circled(i + 1) + " " + F.formatSeasonLabel(grouped.order[i]) + " (" + grouped.groups[grouped.order[i]].length + "개)");
      }
      lines.push("", "예) !" + catLabel + " 도감 시즌" + (F.seasonNumber(grouped.order[0]) !== null ? F.seasonNumber(grouped.order[0]) : grouped.order[0]));
      chat.reply(lines.join("\n"));
      return;
    }

    var matchedSeason = F.matchSeasonArg(grouped.order, seasonArg);
    if (!matchedSeason) {
      chat.reply(F.emoji.warn + ' "' + seasonArg + '" 시즌을 찾지 못했습니다.\n시즌 목록: ' + grouped.order.map(F.formatSeasonLabel).join(", "));
      return;
    }

    var items = grouped.groups[matchedSeason];
    var names = sortKo(items.map ? items.map(nameOf) : (function () { var r = []; for (var j = 0; j < items.length; j++) r.push(nameOf(items[j])); return r; })());
    var blocks = names.map ? names.map(function (n) { return "• " + n; }) : (function () { var r = []; for (var k = 0; k < names.length; k++) r.push("• " + names[k]); return r; })();

    var chunks = F.chunkLines(blocks, 1200);
    for (var c = 0; c < chunks.length; c++) {
      var header = "\uD83D\uDCD8 " + F.formatSeasonLabel(matchedSeason) + " " + catLabel + " 도감 (" + items.length + "개)" + (chunks.length > 1 ? " " + (c + 1) + "/" + chunks.length : "");
      chat.reply(header + "\n\n" + chunks[c].join("\n"));
    }
  }

  /**
   * 정확 일치 검색 결과를 화면에 그린다 - 현재시즌 데이터가 있으면(또는 내용이 겹쳐서
   * 하나로 합쳐지면) 카드 1개만, 시즌별로 내용이 서로 다르게 남으면 구분선으로 나눠서
   * 전부 보여준다. buildCardFn(item, seasonLabel)은 그 항목 1건의 카드 텍스트(이름줄
   * 제외한 본문)를 만들어주는 콜백.
   */
  function renderSeasonalResult(chat, keyword, resolved, buildCardFn) {
    var header = SEARCH_ICON + " " + keyword;
    var blocks = [];
    for (var i = 0; i < resolved.entries.length; i++) {
      var entry = resolved.entries[i];
      var seasonLabel = F.formatMergedSeasonLabel(entry.seasons);
      blocks.push(buildCardFn(entry.item, seasonLabel));
    }
    chat.reply(header + "\n\n" + blocks.join("\n\n" + DIVIDER + "\n\n"));
  }

  /**
   * 검색형 명령어 공통 실행기 - "정확 일치 우선" 방식:
   *   1) 이름이 정확히 일치하는 항목이 있으면, 현재 시즌(있으면) 데이터만 바로
   *      보여준다. 다른 유사 검색 결과는 전혀 보여주지 않는다.
   *   2) 정확히 일치하는 게 없을 때만 "비슷한 OO" 이름 목록을 보여준다(효과 없이
   *      이름만).
   *   3) 검색 결과 자체가 0건이면 완전히 없다는 안내.
   */
  var SEARCH_LIST_LIMIT = 10;
  function runSearchCommand(chat, keyword, getAllFn, searchFn, catLabel, emojiChar, detailOptions, usageExamples) {
    if (!keyword) { chat.reply(F.usageBlock(usageExamples)); return; }

    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    var exactMatches = findExactMatchesFast(all, keyword);

    if (exactMatches.length === 0) {
      var results = searchFn(keyword); // 유사검색은 정확일치가 없을 때만 실행(속도)
      if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
      var deduped = F.dedupeBySeasonalContent(results, extractField, nameOf);
      if (deduped.length !== 1) {
        showSimilarNamesOnly(chat, keyword, results, catLabel);
        return;
      }
      exactMatches = results; // 부분일치였지만 결국 1개로 좁혀졌으니 정확일치처럼 그대로 처리
    }

    var resolved = F.resolveSeasonalDisplay(exactMatches, extractField, nameOf, GoombaBotConfig.currentSeason);
    renderSeasonalResult(chat, keyword, resolved, function (item, seasonLabel) {
      var opts = {};
      for (var k in (detailOptions || {})) { if (detailOptions.hasOwnProperty(k)) opts[k] = detailOptions[k]; }
      opts.seasonTag = seasonLabel;
      if (opts.gradeCandidateKeys) {
        var rawGrade = extractField(item, opts.gradeCandidateKeys);
        if (rawGrade) { opts.namePrefix = F.gradeEmoji(rawGrade); opts.gradeTag = rawGrade; }
        delete opts.gradeCandidateKeys;
      }
      return formatDetailCard(emojiChar, item, opts);
    });
  }

  /** 정확 일치가 없을 때 - 비슷한 이름만(효과 내용 없이) 보여준다 */
  function showSimilarNamesOnly(chat, keyword, results, catLabel) {
    var entries = F.dedupeBySeasonalContent(results, extractField, nameOf);
    var uniqueNames = [];
    for (var i = 0; i < entries.length; i++) { if (uniqueNames.indexOf(entries[i].name) === -1) uniqueNames.push(entries[i].name); }
    var lines = [F.emoji.search + " '" + keyword + "' 검색 결과 (" + uniqueNames.length + "개)", ""];
    for (var j = 0; j < Math.min(uniqueNames.length, SEARCH_LIST_LIMIT); j++) lines.push((j + 1) + ". " + uniqueNames[j]);
    lines.push("", "원하는 " + catLabel + "을(를) 다시 입력해주세요.");
    chat.reply(lines.join("\n"));
  }

  /**
   * ⚠️ !디버그모드가 켜져있을 때만 각 단계 소요시간을 모은다. 공용(모듈스코프) 변수에
   * 담으면 "!룬"과 "!ㄹ"이 거의 동시에 들어와 겹쳐 실행될 때 서로의 기록을 덮어써서
   * 단계가 중복 출력되는 버그가 있었다 - 그래서 이 호출 하나만의 chat 객체에 직접
   * 붙여서(chat._debugStages) 서로 절대 안 섞이게 한다.
   */
  function markStage(chat, label, elapsedMs) {
    if (chat && chat._debugStages) chat._debugStages.push(label + ": " + elapsedMs + "ms");
  }

  function buildRuneCard(chat, item, seasonLabel) {
    var tUsage0 = Date.now();
    var usage = P.findUsageFor(nameOf(item));
    if (usage !== null) item.usageRate = usage + "%"; // 별도 API에서 온 값을 합성 필드로 주입
    markStage(chat, "사용률 조회", Date.now() - tUsage0);

    // 이 룬을 필요로 하는 룬워드 역참조("사용되는 룬워드") - Map 인덱스로 O(1) 조회
    // (예전에는 룬워드 전체(198건 등)를 매번 순회했음 - getRuneWordIndex()로 개선)
    var tIndex0 = Date.now();
    var runeName = nameOf(item);
    var index = P.getRuneWordIndex();
    markStage(chat, "룬워드 인덱스 준비(getRuneWords+Map 생성, 캐시되면 즉시)", Date.now() - tIndex0);

    var tMatch0 = Date.now();
    var matchedWords = index[runeName] || [];
    var usedInWordsLines = [];
    for (var w = 0; w < matchedWords.length; w++) {
      usedInWordsLines.push(nameOf(matchedWords[w]));
      var effects = extractField(matchedWords[w], ["effects", "effect"]);
      if (effects) {
        var effLines = F.objectSummary(effects, "\n").split("\n");
        for (var el = 0; el < effLines.length; el++) usedInWordsLines.push("• " + effLines[el]);
      }
    }
    markStage(chat, "룬워드 매칭(Map 조회)", Date.now() - tMatch0);

    // ⚠️ 룬은 실제로 전설/신화 등급만 검색되므로, 이 두 등급일 때만 태그를 보여준다
    // (그 외 등급값은 내부코드일 수 있어 지어내지 않고 그냥 생략). 등급+시즌을
    // "[전설 시즌2]" 한 태그로 합쳐서 보여준다(등급/시즌 태그를 따로 안 나눔).
    var rawGrade = extractField(item, ["grade", "rarity", "tier"]);
    var showGrade = (rawGrade === "전설" || rawGrade === "신화") ? rawGrade : null;
    var gradeIcon = showGrade ? F.gradeEmoji(showGrade) : null;
    var combinedTag = [showGrade, seasonLabel].filter(function (v) { return !!v; }).join(" ");

    var tCard0 = Date.now();
    var card = formatDetailCard(F.emoji.rune, item, {
      bodyField: "description",
      order: ["part", "drop_location", "effect", "usageRate"],
      sections: [{ title: "\uD83E\uDDE9 룬 워드", lines: usedInWordsLines }],
      namePrefix: gradeIcon,
      gradeTag: combinedTag || null
    });
    markStage(chat, "카드 조립(formatDetailCard)", Date.now() - tCard0);
    return card;
  }

  function runeSearchExecuteInner(chat) {
    var args = chat.args;
    if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getRunes, "룬", F.emoji.rune, args[1]); return; }

    var keyword = args.join(" ").trim();
    if (!keyword) { chat.reply(F.usageBlock(["!룬 화염", "!룬 도감"])); return; }

    var tGetRunes0 = Date.now();
    var allSeasons = P.getRunes();
    markStage(chat, "getRunes()", Date.now() - tGetRunes0);
    if (allSeasons.length === 0) { chat.reply(F.emoji.warn + " 룬 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    // ⚠️ 검색은 시즌2만 대상으로 한다(시즌0/1은 코드에 남아있지만 기본 검색에서
    // 제외 - 사용자 요청). 도감(!룬 도감)은 이 필터의 영향을 안 받고 여전히 전체
    // 시즌을 다 보여준다(그건 원래 시즌 골라보는 기능이라 그대로 둔다).
    var all = [];
    for (var ai = 0; ai < allSeasons.length; ai++) {
      if (F.seasonNumber(extractField(allSeasons[ai], ["season"])) === GoombaBotConfig.currentSeason) all.push(allSeasons[ai]);
    }
    if (all.length === 0) all = allSeasons; // 혹시 시즌2 데이터가 하나도 없으면 안전하게 전체로 폴백

    var tExact0 = Date.now();
    var exactMatches = findExactMatchesFast(all, keyword);
    markStage(chat, "룬 검색(정확일치, 전체순회)", Date.now() - tExact0);

    if (exactMatches.length === 0) {
      var results = GoombaBot.search.fuzzyFilter(all, keyword, nameOf); // 유사검색도 시즌2 데이터에서만(P.searchRunes는 전체시즌이라 안 씀)
      if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
      var deduped = F.dedupeBySeasonalContent(results, extractField, nameOf);
      if (deduped.length !== 1) {
        showSimilarNamesOnly(chat, keyword, results, "룬");
        return;
      }
      exactMatches = results; // 부분일치였지만 결국 1개로 좁혀졌으니 정확일치처럼 그대로 처리
    }

    var tResolve0 = Date.now();
    var resolved = F.resolveSeasonalDisplay(exactMatches, extractField, nameOf, GoombaBotConfig.currentSeason);
    markStage(chat, "시즌 병합/분리 처리", Date.now() - tResolve0);

    var tRender0 = Date.now();
    renderSeasonalResult(chat, keyword, resolved, function (item, seasonLabel) { return buildRuneCard(chat, item, seasonLabel); });
    markStage(chat, "메시지 생성+reply(카드조립 포함)", Date.now() - tRender0);
  }

  /**
   * ⚠️ !속도진단(별도 명령어)이 아니라 "실제 !룬 호출 그 자체"의 소요시간을 재는 용도.
   * !디버그모드 켜기가 켜져있을 때만, 기존 응답 뒤에 타이밍을 별도 메시지로 덧붙인다
   * (꺼져있으면 기존 출력과 완전히 동일 - UX 변화 없음).
   */
  function runeSearchExecute(chat) {
    // ⚠️ 디버그 타이밍은 관리자에게만 - 일반 사용자는 !디버그모드가 켜져있어도
    // 평소와 똑같은 결과만 보인다(길드원들에게 내부 로그가 노출되지 않게).
    var debugOn = GoombaBot.isDebugTimingEnabled && GoombaBot.isDebugTimingEnabled() && GoombaBot.isAdmin(chat.author.name);
    if (!debugOn) {
      runeSearchExecuteInner(chat);
      return;
    }
    chat._debugStages = [];
    var debugT0 = Date.now();
    runeSearchExecuteInner(chat);
    var debugT1 = Date.now();
    var report = ["⏱️ [디버그] 단계별 소요시간"];
    for (var i = 0; i < chat._debugStages.length; i++) report.push("• " + chat._debugStages[i]);
    report.push("", "총 소요시간: " + (debugT1 - debugT0) + "ms");
    chat.reply(report.join("\n"));
    chat._debugStages = null;
  }

  // ---- !룬 ----
  GoombaBot.registerCommand("룬", {
    category: "정보", summary: "룬 검색 (설명/추천직업/사용률/관련 룬워드 전체 표시)", usage: ["!룬 화염", "!룬 도감"],
    detail: { title: F.emoji.rune + " 룬 검색", examples: ["!룬 화염", "!룬 도감", "!룬 도감 시즌1"], features: ["이름이 정확히 일치하면 바로 상세를 보여줍니다(현재 시즌 우선)", "이 룬을 쓰는 룬워드까지 한 번에 보여줍니다", "!룬 도감으로 시즌별 전체 목록"] },
    execute: runeSearchExecute
  });

  // ---- !ㄹ (!룬과 완전히 동일한 함수 - alias 아니라 진짜 같은 함수) ----
  // ---- !룬워드 ----
  GoombaBot.registerCommand("룬워드", {
    category: "정보", summary: "룬워드 검색 (효과/필요 룬/시즌)", usage: ["!룬워드 맹공", "!룬워드 도감"],
    detail: {
      title: F.emoji.runeword + " 룬워드 검색", examples: ["!룬워드 왕관을 받친 두 손", "!룬워드 도감", "!룬워드 도감 시즌2"],
      features: ["이름이 정확히 일치하면 바로 상세를 보여줍니다(현재 시즌 우선)", "!룬워드 도감으로 시즌별 전체 목록"]
    },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getRuneWords, "룬워드", F.emoji.runeword, args[1]); return; }
      if (args.length === 0) { chat.reply(F.usageBlock(["!룬워드 왕관을 받친 두 손", "!룬워드 도감"])); return; }

      var keyword = args.join(" ").trim();
      var all = P.getRuneWords();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 룬워드 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

      var exactMatches = findExactMatchesFast(all, keyword);

      if (exactMatches.length === 0) {
        var results = P.searchRuneWords(keyword);
        if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
        var deduped = F.dedupeBySeasonalContent(results, extractField, nameOf);
        if (deduped.length !== 1) {
          showSimilarNamesOnly(chat, keyword, results, "룬워드");
          return;
        }
        exactMatches = results; // 부분일치였지만 결국 1개로 좁혀졌으니 정확일치처럼 그대로 처리
      }

      var resolved = F.resolveSeasonalDisplay(exactMatches, extractField, nameOf, GoombaBotConfig.currentSeason);
      renderSeasonalResult(chat, keyword, resolved, function (item, seasonLabel) {
        var reqRunes = extractField(item, ["requiredRunes", "required_runes"]);
        var reqLines = [];
        if (reqRunes && reqRunes.length) {
          for (var r = 0; r < reqRunes.length; r++) {
            var it = reqRunes[r];
            reqLines.push("• " + ((it && typeof it === "object") ? String(extractField(it, ["name", "title"]) || F.objectSummary(it)) : String(it)));
          }
        }
        return formatDetailCard(F.emoji.runeword, item, {
          bodyField: "effects", bodyFallback: ["description", "effect"],
          order: [],
          sections: [{ title: "\uD83D\uDCCC 필요 룬", lines: reqLines }],
          seasonTag: seasonLabel
        });
      });
    }
  });

  /**
   * 시즌이 아니라 임의의 필드(등급/색상/종류 등) 기준으로 도감을 보여준다.
   * candidateKeys: 그 필드를 찾을 후보 키 목록. presetOrder: 정해진 순서(색상 등, 없으면
   * 가나다순). "기타"는 항상 맨 뒤. labelFn(선택): 원본 코드값을 사람이 읽기 좋은
   * 한글로 바꿔서 보여줄 때 쓴다(예: "Ingredient" -> "재료") - 매칭도 번역된 이름
   * 기준으로 된다(사용자가 원본 영문 코드를 몰라도 됨).
   */
  function runFieldCatalogCommand(chat, getAllFn, catLabel, emojiChar, fieldArg, candidateKeys, presetOrder, labelFn) {
    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    var grouped = F.groupByField(all, extractField, candidateKeys, presetOrder);
    var displayOrder = grouped.order.map(function (raw) { return labelFn ? labelFn(raw) : raw; });

    if (!fieldArg) {
      var lines = ["\uD83D\uDCD8 " + catLabel + " 도감", "", "분류 선택:"];
      for (var i = 0; i < grouped.order.length; i++) {
        lines.push(F.circled(i + 1) + " " + displayOrder[i] + " (" + grouped.groups[grouped.order[i]].length + "개)");
      }
      lines.push("", "예) !" + catLabel + " 도감 " + displayOrder[0]);
      chat.reply(lines.join("\n"));
      return;
    }

    // 번역된 이름으로 먼저 찾고, 안 되면(사용자가 혹시 원본 코드를 알고 있었다면) 원본으로도 찾는다.
    var matchedDisplay = F.matchFieldArg(displayOrder, fieldArg);
    var matchedRaw = matchedDisplay ? grouped.order[displayOrder.indexOf(matchedDisplay)] : F.matchFieldArg(grouped.order, fieldArg);

    if (!matchedRaw) {
      chat.reply(F.emoji.warn + ' "' + fieldArg + '" 분류를 찾지 못했습니다.\n분류 목록: ' + displayOrder.join(", "));
      return;
    }

    var matchedDisplayLabel = labelFn ? labelFn(matchedRaw) : matchedRaw;
    var items = grouped.groups[matchedRaw];
    var names = sortKo(items.map ? items.map(nameOf) : (function () { var r = []; for (var j = 0; j < items.length; j++) r.push(nameOf(items[j])); return r; })());
    var blocks = names.map ? names.map(function (n) { return "• " + n; }) : (function () { var r = []; for (var k = 0; k < names.length; k++) r.push("• " + names[k]); return r; })();

    var chunks = F.chunkLines(blocks, 1200);
    for (var c = 0; c < chunks.length; c++) {
      var header = "\uD83D\uDCD8 " + matchedDisplayLabel + " " + catLabel + " 도감 (" + items.length + "개)" + (chunks.length > 1 ? " " + (c + 1) + "/" + chunks.length : "");
      chat.reply(header + "\n\n" + chunks[c].join("\n"));
    }
  }

  // ---- !인챈트 (도감은 등급 기준 - 시즌 개념 없음) ----
  GoombaBot.registerCommand("인챈트", {
    category: "인챈트", summary: "인챈트 검색 (등급/효과)", usage: ["!인챈트 강력한", "!인챈트 도감"],
    detail: { title: F.emoji.enchant + " 인챈트 검색", examples: ["!인챈트 강력한", "!인챈트 도감", "!인챈트 도감 희귀"], features: ["!인챈트 도감으로 등급별 전체 목록(시즌 구분 없음)"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runFieldCatalogCommand(chat, P.getEnchants, "인챈트", F.emoji.enchant, args[1], ["grade", "rarity", "tier"], null); return; }

      var keyword = args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!인챈트 강력한", "!인챈트 도감"])); return; }

      var all = P.getEnchants();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 인챈트 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

      var exactMatches = findExactMatchesFast(all, keyword);

      if (exactMatches.length === 0) {
        var results = P.searchEnchants(keyword);
        if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
        var uniqueNamesEnchant = [];
        for (var ue = 0; ue < results.length; ue++) { var ne = nameOf(results[ue]); if (uniqueNamesEnchant.indexOf(ne) === -1) uniqueNamesEnchant.push(ne); }
        if (uniqueNamesEnchant.length !== 1) {
          showSimilarNamesOnly(chat, keyword, results, "인챈트");
          return;
        }
        exactMatches = results;
      }

      // ⚠️ 인챈트는 시즌 개념을 안 쓰므로, 시즌 병합/분리 없이 첫 번째 정확일치 항목만 보여준다.
      var item = exactMatches[0];
      var rawGrade = extractField(item, ["grade", "rarity", "tier"]);
      var gradeIcon = rawGrade ? F.gradeEmoji(rawGrade) : null;

      // ⚠️ 실기기에서 실제로 확인된 인챈트 필드명(scroll_type/effects_html) 기준으로
      // 정리. 사용자 요청으로 "장착 부위"+"효과" 딱 2가지만 보여준다(랜덤옵션/필요
      // 재화/기타 내부정보는 표시 안 함 - 필요하면 !진단으로 원본 필드 확인 가능).
      var partRaw = extractField(item, ["scroll_type", "part", "type"]);
      var partLabel = { "Accessory": "액세서리", "Weapon": "무기", "Armor": "방어구" }[partRaw] || partRaw;

      var effectRaw = extractField(item, ["effects_html", "effect", "effects", "description", "desc"]);
      var effectLines = [];
      if (effectRaw) {
        var effParts = String(effectRaw).replace(/\n/g, ",").split(",");
        for (var ei = 0; ei < effParts.length; ei++) {
          var ep = effParts[ei].trim();
          if (ep) effectLines.push("• " + ep);
        }
      }

      var lines = [(gradeIcon ? gradeIcon + " " : "") + nameOf(item) + (rawGrade ? " [" + rawGrade + "]" : "")];
      if (partLabel) lines.push("", "장착 부위", partLabel);
      if (effectLines.length) lines.push("", "효과", effectLines.join("\n"));
      chat.reply(SEARCH_ICON + " " + keyword + "\n\n" + lines.join("\n"));
    }
  });

  // ---- !아티팩트 (도감은 색상 기준 - 시즌 개념 없음) ----
  var ARTIFACT_COLOR_ORDER = ["적색", "청색", "녹색", "무색", "황금색"]; // 적색,청색,녹색,무색,황금색
  GoombaBot.registerCommand("아티팩트", {
    category: "아티팩트", summary: "아티팩트 검색 (색상/효과/필요 아티팩트)", usage: ["!아티팩트 이름", "!아티팩트 도감"],
    detail: { title: F.emoji.artifact + " 아티팩트 검색", examples: ["!아티팩트 이름", "!아티팩트 도감", "!아티팩트 도감 적색"], features: ["!아티팩트 도감으로 색상별 전체 목록(시즌 구분 없음)", "색상 정보가 있으면 🟥🟦🟩⬜🟨로 표시합니다"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runFieldCatalogCommand(chat, P.getArtifacts, "아티팩트", F.emoji.artifact, args[1], ["color", "색상"], ARTIFACT_COLOR_ORDER); return; }

      var keyword = args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!아티팩트 이름", "!아티팩트 도감"])); return; }

      var all = P.getArtifacts();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 아티팩트 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

      var exactMatches = findExactMatchesFast(all, keyword);

      if (exactMatches.length === 0) {
        var results = P.searchArtifacts(keyword);
        if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
        var uniqueNamesArt = [];
        for (var ua = 0; ua < results.length; ua++) { var na = nameOf(results[ua]); if (uniqueNamesArt.indexOf(na) === -1) uniqueNamesArt.push(na); }
        if (uniqueNamesArt.length !== 1) {
          showSimilarNamesOnly(chat, keyword, results, "아티팩트");
          return;
        }
        exactMatches = results;
      }

      // ⚠️ 아티팩트도 시즌 개념을 안 쓴다 - 첫 번째 정확일치 항목만 보여준다.
      var item = exactMatches[0];
      var colorVal = extractField(item, ["color", "색상"]);
      var uniqueVal = extractField(item, ["unique", "is_unique", "유일"]);
      var requiredArtifacts = extractField(item, ["required_artifacts", "requiredArtifacts"]);

      var colorTag = colorVal ? F.colorTag(colorVal) : null;
      var uniqueMark = (uniqueVal === true || uniqueVal === "true" || uniqueVal === "유일") ? " (‼️유일)" : "";
      var infoLine = colorTag ? (colorTag + uniqueMark) : (uniqueMark ? uniqueMark.trim() : null);

      var reqLines = [];
      if (requiredArtifacts) reqLines.push(F.objectSummary(requiredArtifacts, "\n"));

      var text = formatDetailCard(F.emoji.artifact, item, {
        bodyField: "flavor_text", bodyFallback: ["description", "effect", "effects"],
        order: [],
        displayName: stripCategoryPrefix(nameOf(item)),
        infoLine: infoLine,
        sections: [{ title: "\uD83D\uDCCC 필요 아티팩트", lines: reqLines }]
      });
      chat.reply(SEARCH_ICON + " " + keyword + "\n\n" + text);
    }
  });

  // ---- !칭호 ----
  GoombaBot.registerCommand("칭호", {
    category: "정보", summary: "칭호 검색 (보유효과/획득방법/설명)", usage: ["!칭호 이름", "!칭호 도감"],
    detail: { title: F.emoji.title + " 칭호 검색", examples: ["!칭호 폭력", "!칭호 도감", "!칭호 도감 시즌1"], features: ["이름이 정확히 일치하면 바로 상세를 보여줍니다", "!칭호 도감으로 시즌별 전체 목록"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getTitles, "칭호", F.emoji.title, args[1]); return; }

      var keyword = args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!칭호 이름", "!칭호 도감"])); return; }

      var all = P.getTitles();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 칭호 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

      var exactMatches = findExactMatchesFast(all, keyword);

      if (exactMatches.length === 0) {
        var results = P.searchTitles(keyword);
        if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
        var uniqueNames = [];
        for (var u = 0; u < results.length; u++) { var n = nameOf(results[u]); if (uniqueNames.indexOf(n) === -1) uniqueNames.push(n); }
        if (uniqueNames.length !== 1) {
          showSimilarNamesOnly(chat, keyword, results, "칭호");
          return;
        }
        exactMatches = results; // 부분일치였지만 결국 이름 1개로 좁혀졌으니 정확일치처럼 그대로 처리
      }

      // ⚠️ 칭호는 시즌 개념을 안 쓴다 - 첫 번째 정확일치 항목만 보여준다.
      var item = exactMatches[0];
      var text = formatDetailCard(F.emoji.title, item, {
        bodyField: "description", bodyFallback: ["desc", "defaultHint"],
        order: ["achieveEffects", "equipEffects", "condition", "how_to_get", "acquisition"]
      });
      chat.reply(SEARCH_ICON + " " + keyword + "\n\n" + text);
    }
  });

  // ---- !아이템 (도감은 아이템 종류 기준) ----
  GoombaBot.registerCommand("아이템", {
    category: "정보", summary: "아이템 검색 (종류/설명/사용처/획득처)", usage: ["!아이템 아이템명", "!아이템 도감"],
    detail: { title: F.emoji.item + " 아이템 검색", examples: ["!아이템 켈틱류트", "!아이템 도감", "!아이템 도감 무기"], features: ["이름이 정확히 일치하면 바로 상세를 보여줍니다", "!아이템 도감으로 종류별 전체 목록"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runFieldCatalogCommand(chat, P.getItems, "아이템", F.emoji.item, args[1], ["category", "type", "item_type"], null, F.itemCategoryLabel); return; }

      var keyword = args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!아이템 아이템명", "!아이템 도감"])); return; }

      var all = P.getItems();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 아이템 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

      var exactMatches = findExactMatchesFast(all, keyword);

      if (exactMatches.length === 0) {
        var results = P.searchItems(keyword);
        if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
        showSimilarNamesOnly(chat, keyword, results, "아이템");
        return;
      }

      var item = exactMatches[0];
      var rawCategory = extractField(item, ["category", "type", "item_type"]);
      // ⚠️ 종류(category)는 내부 영문 코드(예: "Ingredient")일 수 있어서, 표시할 땐
      // 한글로 번역한 값을 별도 필드에 담아서 그 필드가 보이게 한다(원본 코드는 안 보여줌).
      if (rawCategory) item._categoryLabel = F.itemCategoryLabel(rawCategory);

      var rawGrade = extractField(item, ["grade", "rarity", "tier"]);
      var gradeIcon = rawGrade ? F.gradeEmoji(rawGrade) : null;

      var text = formatDetailCard(F.emoji.item, item, {
        bodyField: "description", bodyFallback: ["desc", "flavor_text", "effect", "effects"],
        order: ["_categoryLabel", "drop_location", "usage", "how_to_use", "used_for"],
        namePrefix: gradeIcon,
        gradeTag: rawGrade
      });
      chat.reply(SEARCH_ICON + " " + keyword + "\n\n" + text);
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };





},{"../core/api.js":11,"../core/config.js":13,"../core/format.js":14,"../core/router.js":15}],11:[function(require,module,exports){

/**
 * core/api.js
 * ------------
 * Http.requestSync() 공통 래퍼(GoombaBot.http) + API 응답 파싱 공통 헬퍼
 * (toArray/extractField/fetchCached)를 담당한다.
 *
 * 실전에서 실제로 겪었던 Rhino 버그 2종을 미리 방어한다:
 *   1) ConsString 문제: Rhino에서 문자열을 "+"로 이어붙이면 java.lang.String이 아니라
 *      org.mozilla.javascript.ConsString이 되는데, 이걸 그대로 Http.requestSync에
 *      넘기면 ClassCastException이 납니다 -> url/method/header 값을 전부 String()으로
 *      강제 변환합니다.
 *   2) JavaException 래퍼 문제: Rhino가 자바 예외를 자기 것으로 한 번 더 감싸서 던지는데,
 *      감싸인 안쪽의 진짜 예외(예: HttpStatusException)에만 getStatusCode() 등이 있어서
 *      겉 포장에 대고 호출하면 못 찾습니다 -> getWrappedException()으로 벗겨서 검사합니다.
 */

var GoombaBot = require("./config.js").GoombaBot;
var GoombaBotConfig = require("./config.js").GoombaBotConfig;
require("./cache.js"); // GoombaBot.storage가 붙도록 로드만 시켜둠

GoombaBot.log = function (message) {
  try { Log.i("GoombaBot", message); } catch (e) {}
};

GoombaBot.http = (function () {
  var DEFAULT_TIMEOUT_MS = 9000;
  // ⚠️ 실기기 !진단 1에서 /runes가 timeout(JSON 파싱 문제가 아니라 요청 자체가 시간 안에
  // 안 끝남)로 확인됨 - 데이터양이 많은 룬처럼 무거운 응답을 위해 더 긴 타임아웃을 쓴다.
  var HEAVY_TIMEOUT_MS = 20000;

  function mergeHeaders(overrides) {
    var merged = {}, key;
    for (key in GoombaBotConfig.httpHeaders) {
      if (GoombaBotConfig.httpHeaders.hasOwnProperty(key)) merged[key] = String(GoombaBotConfig.httpHeaders[key]);
    }
    if (overrides) {
      for (key in overrides) { if (overrides.hasOwnProperty(key)) merged[key] = String(overrides[key]); }
    }
    return merged;
  }

  function extractBodyText(doc) {
    var attempts = [];
    try {
      var t1 = doc.body().text();
      attempts.push({ method: "doc.body().text()", value: t1 });
      if (t1 && (t1.charAt(0) === "{" || t1.charAt(0) === "[")) return { text: t1, method: "doc.body().text()" };
    } catch (e1) {}
    try {
      var t2 = doc.text();
      attempts.push({ method: "doc.text()", value: t2 });
      if (t2 && (t2.charAt(0) === "{" || t2.charAt(0) === "[")) return { text: t2, method: "doc.text()" };
    } catch (e2) {}
    try {
      var t3 = String(doc);
      attempts.push({ method: "String(doc)", value: t3 });
      if (t3 && (t3.indexOf("{") !== -1 || t3.indexOf("[") !== -1)) return { text: t3, method: "String(doc)" };
    } catch (e3) {}
    return { text: attempts.length > 0 ? attempts[0].value : "", method: attempts.length > 0 ? attempts[0].method : "(모두 실패)", attempts: attempts };
  }

  function unwrapJavaException(err) {
    try {
      if (err && typeof err.getWrappedException === "function") {
        var inner = err.getWrappedException();
        if (inner) return inner;
      }
    } catch (ignore1) {}
    try {
      if (err && err.javaException) return err.javaException;
    } catch (ignore2) {}
    return err;
  }

  function describeError(err) {
    var real = unwrapJavaException(err);
    try {
      if (real && typeof real.getMessage === "function") return String(real.getMessage());
    } catch (ignore) {}
    return String(err);
  }

  function extractStatusCode(err) {
    var real = unwrapJavaException(err);
    try {
      if (real && typeof real.getStatusCode === "function") return real.getStatusCode();
    } catch (ignore1) {}
    try {
      var msg = describeError(err);
      var m = msg.match(/status[^\d]{0,10}(\d{3})/i);
      if (m) return parseInt(m[1], 10);
    } catch (ignore2) {}
    return null;
  }

  function isTimeoutError(err) {
    return /timeout|timed out/i.test(describeError(err));
  }

  /** apiBase를 붙이지 않고, 넘겨준 url을 그대로 요청한다 (GitHub 등 외부 URL 확인용) */
  /**
   * ⚠️ 실제로 Http.requestSync가 몇 번 호출됐는지 경로별로 누적 집계한다(재시도 포함).
   * 봇이 켜져있는 동안 계속 누적되며, !속도진단에서 "정말 캐시가 걸려서 API를 다시
   * 안 부르는지"를 실측으로 보여주는 데 쓴다.
   */
  var callCounts = {};
  function recordCall(url) {
    var key = String(url).replace(String(GoombaBotConfig.apiBase), "").split("?")[0];
    callCounts[key] = (callCounts[key] || 0) + 1;
  }

  function getJsonFromUrl(url, options) {
    options = options || {};
    url = String(url);
    var timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
    var requestOption = {
      url: String(url),
      method: String(options.method || "GET"),
      timeout: timeoutMs,
      headers: mergeHeaders(options.headers)
    };

    var doc;
    try {
      recordCall(url);
      doc = Http.requestSync(requestOption);
    } catch (requestError) {
      // timeout이면 - 원인이 파싱이 아니라 요청 자체가 늦게 끝나는 것이므로, 더 긴
      // 타임아웃으로 한 번만 더 시도한다 (일시적 네트워크/업스트림 지연 대응).
      if (!options._retried && isTimeoutError(requestError)) {
        GoombaBot.log("[GoombaBot] timeout - 더 긴 대기시간으로 재시도: " + url);
        return getJsonFromUrl(url, {
          method: options.method, headers: options.headers,
          timeout: Math.max(timeoutMs * 2, HEAVY_TIMEOUT_MS),
          _retried: true
        });
      }
      var statusCode = extractStatusCode(requestError);
      throw new Error(
        "[GoombaBot] HTTP 요청 실패" + (statusCode !== null ? " (HTTP " + statusCode + ")" : "") + ": " + url + " - " + describeError(requestError)
      );
    }

    var extracted = extractBodyText(doc);
    try {
      return JSON.parse(extracted.text);
    } catch (parseError) {
      var preview = extracted.text ? String(extracted.text).substring(0, 200) : "(빈 응답)";
      throw new Error("[GoombaBot] JSON 파싱 실패 (" + extracted.method + "): " + url + " - 응답 미리보기: " + preview);
    }
  }

  /** apiBase(중계 서버) 뒤에 path를 붙여서 요청한다 - 대부분의 기존 코드가 쓰는 방식 */
  function getJson(path, options) {
    return getJsonFromUrl(String(GoombaBotConfig.apiBase) + String(path), options);
  }

  /**
   * !진단 전용 - 추측이 아니라 실제 응답 구조를 그대로 보여준다.
   * (최상위가 배열인지 객체인지, 객체라면 어떤 키들이 있는지, toArray()가 몇 건을
   * 뽑아냈는지, 첫 항목의 진짜 필드명이 무엇인지까지 전부 노출한다)
   */
  function inspect(path, timeoutMs) {
    var url = String(GoombaBotConfig.apiBase) + String(path);
    var requestOption = { url: String(url), method: "GET", timeout: timeoutMs || DEFAULT_TIMEOUT_MS, headers: mergeHeaders(null) };

    var doc;
    try {
      recordCall(url);
      doc = Http.requestSync(requestOption);
    } catch (requestError) {
      return { ok: false, stage: "request", url: url, statusCode: extractStatusCode(requestError), error: describeError(requestError) };
    }

    var extracted;
    try {
      extracted = extractBodyText(doc);
    } catch (extractError) {
      return { ok: false, stage: "extract", url: url, error: describeError(extractError) };
    }

    var parsed;
    try {
      parsed = JSON.parse(extracted.text);
    } catch (parseError) {
      var fullText = extracted.text ? String(extracted.text) : "";
      var head = fullText.substring(0, 200);
      var tail = fullText.length > 200 ? fullText.substring(Math.max(0, fullText.length - 200)) : "";
      return {
        ok: false, stage: "parse", url: url, error: describeError(parseError),
        bodyLength: fullText.length,
        bodyHead: fullText ? head : "(빈 응답)",
        // ⚠️ 끝부분을 같이 보여주는 이유: "Unterminated string literal"은 응답이 중간에
        // 잘렸을 때(truncation) 전형적으로 나는 에러라, 끝이 정상적으로 "}"나 "]"로
        // 안 끝나고 문자열 중간에서 뚝 끊겨있는지 여기서 바로 확인 가능하다.
        bodyTail: tail
      };
    }

    var topType = Object.prototype.toString.call(parsed) === "[object Array]" ? "array" : (typeof parsed === "object" ? "object" : typeof parsed);
    var topKeys = topType === "object" ? Object.keys(parsed) : null;
    var arr = GoombaBot.http.toArray(parsed);
    var firstItemKeys = (arr.length > 0 && arr[0] && typeof arr[0] === "object") ? Object.keys(arr[0]) : null;

    return { ok: true, stage: "done", url: url, topType: topType, topKeys: topKeys, arrayCount: arr.length, firstItemKeys: firstItemKeys };
  }

  /**
   * jsoup을 완전히 우회하는 1순위 방법 - Java의 URLConnection/InputStream을 LiveConnect로
   * 직접 사용한다. 실패하면 예외를 던진다(호출부에서 2순위로 넘어감).
   */
  function fetchViaJavaUrlConnection(url) {
    var javaUrl = new Packages.java.net.URL(String(url));
    var conn = javaUrl.openConnection();
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(15000);
    conn.setRequestProperty(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );

    var inputStream = conn.getInputStream();
    var reader = new Packages.java.io.BufferedReader(new Packages.java.io.InputStreamReader(inputStream, "UTF-8"));
    var sb = new Packages.java.lang.StringBuilder();
    var line = reader.readLine();
    var isFirst = true;
    while (line !== null) {
      if (!isFirst) sb.append("\n");
      sb.append(line);
      isFirst = false;
      line = reader.readLine();
    }
    reader.close();
    return String(sb.toString());
  }

  /**
   * JSON이 아니라 순수 텍스트(예: GitHub의 코드 파일 원문)를 그대로 받아온다.
   * 1순위로 Java URLConnection(jsoup 완전 우회)을 시도하고, 실패하면 2순위로
   * Http.requestSync로 넘어간다.
   */
  function getRawText(url, timeoutMs) {
    try {
      return fetchViaJavaUrlConnection(url);
    } catch (javaError) {
      var requestOption = { url: String(url), method: "GET", timeout: timeoutMs || DEFAULT_TIMEOUT_MS, headers: mergeHeaders(null) };
      var doc = Http.requestSync(requestOption);
      try { return String(doc.body().text()); } catch (e1) {}
      try { return String(doc.text()); } catch (e2) {}
      return String(doc);
    }
  }

  /**
   * 순수 JavaScript(ES5)로 직접 구현한 base64 디코더 - loader.js와 완전히 동일한 구현.
   * !굼바봇 업데이트(botcontrol.js)가 GitHub의 코드 파일을 받아서 디코딩할 때 쓴다.
   */
  function base64Decode(b64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(b64).replace(/[^A-Za-z0-9\+\/\=]/g, "");
    var output = [];
    var enc1, enc2, enc3, enc4;
    var i = 0;

    while (i < str.length) {
      enc1 = chars.indexOf(str.charAt(i++));
      enc2 = chars.indexOf(str.charAt(i++));
      enc3 = chars.indexOf(str.charAt(i++));
      enc4 = chars.indexOf(str.charAt(i++));

      var chr1 = (enc1 << 2) | (enc2 >> 4);
      var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      var chr3 = ((enc3 & 3) << 6) | enc4;

      output.push(String.fromCharCode(chr1));
      if (enc3 !== 64) output.push(String.fromCharCode(chr2));
      if (enc4 !== 64) output.push(String.fromCharCode(chr3));
    }

    var byteStr = output.join("");
    var result = "";
    var j = 0;
    while (j < byteStr.length) {
      var c1 = byteStr.charCodeAt(j);
      if (c1 < 0x80) {
        result += String.fromCharCode(c1);
        j++;
      } else if (c1 >= 0xC0 && c1 < 0xE0) {
        var c2 = byteStr.charCodeAt(j + 1);
        result += String.fromCharCode(((c1 & 0x1F) << 6) | (c2 & 0x3F));
        j += 2;
      } else if (c1 >= 0xE0 && c1 < 0xF0) {
        var c2b = byteStr.charCodeAt(j + 1);
        var c3b = byteStr.charCodeAt(j + 2);
        result += String.fromCharCode(((c1 & 0x0F) << 12) | ((c2b & 0x3F) << 6) | (c3b & 0x3F));
        j += 3;
      } else {
        var c2c = byteStr.charCodeAt(j + 1);
        var c3c = byteStr.charCodeAt(j + 2);
        var c4c = byteStr.charCodeAt(j + 3);
        var codepoint = ((c1 & 0x07) << 18) | ((c2c & 0x3F) << 12) | ((c3c & 0x3F) << 6) | (c4c & 0x3F);
        codepoint -= 0x10000;
        result += String.fromCharCode(0xD800 + (codepoint >> 10), 0xDC00 + (codepoint & 0x3FF));
        j += 4;
      }
    }
    return result;
  }

  return { getJson: getJson, getJsonFromUrl: getJsonFromUrl, getRawText: getRawText, inspect: inspect, base64Decode: base64Decode, callCounts: callCounts };
})();

// ---- API 응답 파싱 공통 헬퍼 (commands/*.js가 공용으로 씀) ----
GoombaBot.http.toArray = function (json, preferredKey) {
  if (!json) return [];
  if (Object.prototype.toString.call(json) === "[object Array]") return json;
  if (typeof json !== "object") return [];

  // 0순위: 호출부가 실제로 확인한 필드명을 명시했다면 그걸 최우선으로 쓴다
  // (예: 룬워드 응답이 {version, seasons, words, total}인데 seasons가 배열이라 먼저
  // 잡혀버리는 문제 - !진단으로 실제 필드명을 확인한 뒤 words를 명시적으로 지정해서 해결)
  if (preferredKey && json[preferredKey] && Object.prototype.toString.call(json[preferredKey]) === "[object Array]") {
    return json[preferredKey];
  }

  // 1순위: 흔히 쓰이는 후보 키 이름들
  var candidateKeys = ["items", "data", "list", "results", "records", "rows", "content", "words"];
  for (var i = 0; i < candidateKeys.length; i++) {
    var v = json[candidateKeys[i]];
    if (v && Object.prototype.toString.call(v) === "[object Array]") return v;
  }
  // 2순위: 후보 키에 없으면 객체 안에서 배열형 값을 자동으로 찾는다
  // (실제 API 필드명이 예상과 다를 때도 도감/검색이 죽지 않도록)
  for (var key in json) {
    if (!json.hasOwnProperty(key)) continue;
    if (Object.prototype.toString.call(json[key]) === "[object Array]") return json[key];
  }
  return [];
};

GoombaBot.http.extractField = function (obj, candidateKeys) {
  for (var i = 0; i < candidateKeys.length; i++) {
    if (obj && obj[candidateKeys[i]] !== undefined && obj[candidateKeys[i]] !== null && obj[candidateKeys[i]] !== "") return obj[candidateKeys[i]];
  }
  return null;
};

/** extractField와 같지만, 실제로 매칭된 키 이름도 같이 돌려준다 (중복 표시 방지용) */
GoombaBot.http.extractFieldWithKey = function (obj, candidateKeys) {
  for (var i = 0; i < candidateKeys.length; i++) {
    if (obj && obj[candidateKeys[i]] !== undefined && obj[candidateKeys[i]] !== null && obj[candidateKeys[i]] !== "") {
      return { key: candidateKeys[i], value: obj[candidateKeys[i]] };
    }
  }
  return { key: null, value: null };
};

/**
 * @param cacheKey 캐시 파일 키
 * @param ttlMs 캐시 유효시간
 * @param path API 경로
 * @param preferredKey (선택) 응답의 최상위 키 중 이 이름을 최우선으로 배열로 사용
 *   (예: 룬워드 응답이 {version, seasons, words, total} 형태인데, 후보키 추측(seasons가
 *   먼저 배열로 잡힘) 대신 실제 데이터가 들어있는 "words"를 확실하게 쓰기 위함)
 * @param fetchOptions (선택) { timeout } - 응답이 무거운 API(룬 등)를 위한 타임아웃 지정
 */
GoombaBot.http.fetchCached = function (cacheKey, ttlMs, path, preferredKey, fetchOptions) {
  var cached = GoombaBot.storage.read(cacheKey, ttlMs);
  if (cached) return cached;
  try {
    var json = GoombaBot.http.getJson(path, fetchOptions || {});
    var arr = GoombaBot.http.toArray(json, preferredKey);
    GoombaBot.storage.write(cacheKey, arr);
    return arr;
  } catch (e) {
    GoombaBot.log("조회 실패 (" + path + "): " + e);
    return GoombaBot.storage.readStale(cacheKey) || [];
  }
};

/**
 * 어떤 zero-arg 조회 함수든 메모리 TTL 캐시로 감싼다. 같은 실행 세션 안에서는
 * TTL이 지나기 전까지 fn()을 다시 호출하지 않고 그 자리에서 바로 반환한다
 * (디스크 캐시보다 한 단계 더 빠름 - Database 읽기/JSON 파싱조차 생략).
 */
GoombaBot.http.memoize = function (fn, ttlMs) {
  var cache = null;
  var cachedAt = 0;
  return function () {
    var now = Date.now();
    if (cache !== null && (now - cachedAt) < ttlMs) return cache;
    cache = fn();
    cachedAt = now;
    return cache;
  };
};

module.exports = { GoombaBot: GoombaBot };


},{"./cache.js":12,"./config.js":13}],12:[function(require,module,exports){

/**
 * core/cache.js
 * --------------
 * Database API(메신저봇R API2) 기반 캐시 저장소(GoombaBot.storage)를 담당한다.
 */

var GoombaBot = require("./config.js").GoombaBot;
var GoombaBotConfig = require("./config.js").GoombaBotConfig;

GoombaBot.storage = (function () {
  function toFileName(key) {
    return GoombaBotConfig.cacheFilePrefix + String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  function read(key, ttlMs) {
    var fileName = toFileName(key);
    if (!Database.exists(fileName)) return null;
    var envelope;
    try { envelope = Database.readObject(fileName); } catch (e) { return null; }
    if (!envelope || typeof envelope.syncedAt !== "number") return null;
    if (Date.now() - envelope.syncedAt > ttlMs) return null;
    return envelope.data;
  }
  function readStale(key) {
    var fileName = toFileName(key);
    if (!Database.exists(fileName)) return null;
    try {
      var envelope = Database.readObject(fileName);
      return envelope ? envelope.data : null;
    } catch (e) { return null; }
  }
  function write(key, data) {
    Database.writeObject(toFileName(key), { syncedAt: Date.now(), data: data });
  }
  function getSyncedAt(key) {
    var fileName = toFileName(key);
    if (!Database.exists(fileName)) return null;
    try {
      var envelope = Database.readObject(fileName);
      return envelope && envelope.syncedAt ? envelope.syncedAt : null;
    } catch (e) { return null; }
  }
  /** !굼바봇 재시작 등에서 캐시를 강제로 비울 때 쓴다. Database.remove가 없는 환경일 수도
   * 있어 방어적으로 try/catch 한다 (실패해도 조용히 넘어감 - 다음 TTL 만료 때 갱신됨). */
  function remove(key) {
    try { Database.remove(toFileName(key)); return true; } catch (e) { return false; }
  }
  return { read: read, readStale: readStale, write: write, getSyncedAt: getSyncedAt, remove: remove };
})();

module.exports = { GoombaBot: GoombaBot };


},{"./config.js":13}],13:[function(require,module,exports){

/**
 * core/config.js
 * ---------------
 * 프로젝트의 설정값(GoombaBotConfig)을 담당한다.
 *
 * ⚠️ 이 파일이 GoombaBot 공유 객체의 "유일한 원본"이다. 다른 모든 모듈은
 * require("../core/config.js").GoombaBot 으로 이 객체를 가져다 써야 하며,
 * 자기 나름대로 "var GoombaBot = GoombaBot || {}"로 새로 만들면 안 된다
 * (CommonJS에서 var는 모듈마다 독립된 스코프라서, 그러면 서로 다른 객체가 되어
 * 공유가 깨진다 - 실전에서 겪었던 문제).
 */

var GoombaBot = {};

var GoombaBotConfig = {
  commandPrefix: "!",

  // ⚠️ 매 빌드마다 Claude가 이 값을 새로 바꾼다 - "!버전"으로 확인해서, 실제
  // GitHub에 올라간 코드가 지금 이야기 중인 최신 코드가 맞는지 확실히 구분하기 위함.
  buildVersion: "2026-07-27-15",

  // ⚠️ 사용자가 확인한 API들이 전부 "/d/api/v1/..." 형태라, 이전 프로젝트에서 확인된
  // mabimobi.life와 같은 사이트로 보고 이 베이스 URL을 사용합니다. 다르다면 이 값만 고치면
  // 전체 API 호출이 전부 맞게 바뀝니다.
  // ⚠️ 중계 서버(Cloudflare Worker)로 전환됨 - mabimobi.life가 메신저봇R 요청을
  // 사이트 전체에서 403으로 막고 있어서, 실제 요청은 이 Worker가 대신 보낸다.
  // Worker가 받은 경로(예: /runes)를 그대로 https://mabimobi.life/d/api/v1 뒤에 붙여서
  // 전달해주므로, 아래 endpoints 값들은 전혀 안 바꿔도 된다.
  apiBase: "https://goombabot-relay.schl410.workers.dev",

  endpoints: {
    runes: "/runes",
    runeUsage: "/runes/usage-batch",
    runeWords: "/rune-words/catalog",
    enchants: "/enchants",
    artifacts: "/artifacts",
    titles: "/titles/catalog",
    items: "/items",
    marketPrices: "/market/prices", // 이전 프로젝트에서 실제 확인된 시세 엔드포인트 재사용
    notices: "/notices",
    maintenanceStatus: "/maintenance-status",
    mainArticles: "/main/articles",
    popularRankings: "/rankings/popular",
    deepHoleConfig: "/deep-hole-config",
    worldChatRecent: "/world-chat/recent",
    // ⚠️ 신규 - mabimobi.life가 아니라 마비노기 모바일 "공식" 홈페이지(Nexon 운영)를
    // Worker가 대신 파싱해서 돌려주는 경로. 이 3개만 다른 사이트로 간다.
    officialNotice: "/mabimobile-notice",
    officialEvents: "/mabimobile-events",
    officialUpdate: "/mabimobile-update"
  },

  cacheTtlMs: {
    default: 30 * 60 * 1000, // 30분 - 대부분의 도감류 데이터
    notice: 10 * 60 * 1000, // 10분
    market: 30 * 60 * 1000 // 30분
  },

  // ⚠️ 메신저봇R(API2)은 고유 ID가 아니라 표시 닉네임 문자열로만 사람을 구분합니다.
  // ⚠️ 검색 시 이 시즌 데이터를 최우선으로 보여준다. 새 시즌이 나오면 이 값만
  // 바꾸면 된다 - 다른 코드는 손댈 필요 없음.
  // ⚠️ 숫자로 관리한다 - 실제 API의 season 필드가 "시즌2"가 아니라 그냥 2(숫자)로만
  // 올 수도 있어서, 문자열로 비교하면 매칭이 실패할 수 있다. 새 시즌이 나오면 이 숫자만
  // 바꾸면 된다.
  currentSeason: 2,

  adminNames: ["신수아", "굼바굼바_빙결", "굼바굼바"],

  httpHeaders: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://mabimobi.life/",
    Origin: "https://mabimobi.life"
  },

  cacheFilePrefix: "goombabot2_cache_",
  pageSize: 10,

  // 자동 점검 알림 - 몇 초마다 maintenance-status를 확인할지
  maintenanceCheckIntervalMs: 60 * 1000, // 1분

  // 자동 알림을 보낼 방 목록
  alertRooms: ["라쿤 모비노기 길드방"],

  // ⚠️ !굼바봇 업데이트가 GitHub의 최신 코드를 받아올 때 쓰는 주소. 사용자가 직접
  // 관리할 필요 없음 - 이 값 하나만 정해두면 끝이고, 앞으로 절대 안 바뀐다.
  githubMainJsRawUrl: "https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/main.js.b64"
};

module.exports = {
  GoombaBot: GoombaBot,
  GoombaBotConfig: GoombaBotConfig
};


},{}],14:[function(require,module,exports){

/**
 * core/format.js
 * ---------------
 * 출력 포맷(GoombaBot.format), 검색(GoombaBot.search, 초성/오타허용/유사도),
 * 관리자 판별(GoombaBot.isAdmin)을 담당한다. (원본 main.js의 "util.js" 섹션 그대로)
 */

var GoombaBot = require("./config.js").GoombaBot;
var GoombaBotConfig = require("./config.js").GoombaBotConfig;

GoombaBot.format = (function () {
  var LINE = "━━━━━━━━━━━━━━";

  function box(title, lines) { return [LINE, title, LINE].concat(lines).concat([LINE]).join("\n"); }
  function field(label, value) {
    var v = value === null || value === undefined || value === "" ? "정보 없음" : value;
    return "▸ " + label + " : " + v;
  }
  function bulletList(items) {
    if (!items || items.length === 0) return "  (없음)";
    var lines = [];
    for (var i = 0; i < items.length; i++) lines.push("  • " + items[i]);
    return lines.join("\n");
  }
  function changeArrow(pct) {
    if (pct > 0) return "▲" + pct.toFixed(1) + "%";
    if (pct < 0) return "▼" + Math.abs(pct).toFixed(1) + "%";
    return "－0.0%";
  }
  function number(n) {
    var isNegative = n < 0;
    var s = String(Math.floor(Math.abs(n)));
    var result = "";
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) result += ",";
      result += s.charAt(i);
    }
    return (isNegative ? "-" : "") + result;
  }
  function usageBlock(examples) { return [emoji.error + " 사용법", ""].concat(examples).join("\n"); }
  function similarBlock(names) {
    if (!names || names.length === 0) return "";
    return "\n\n" + emoji.search + " 비슷한 결과\n" + bulletList(names);
  }

  var FIELD_LABELS = {
    category: "분류", grade: "등급", stars: "별", stars_value: "별점수", klass: "직업",
    _categoryLabel: "분류", _partLabel: "장착 부위", _currencyLabel: "필요 재화",
    tier: "티어", season: "시즌", avg_rating: "평점", review_count: "리뷰수",
    drop_location: "획득처", skill_no: "스킬번호", option: "옵션", options: "옵션", options_data: "옵션",
    effect: "효과", extraEffect: "추가효과", extra_effect: "추가효과", part: "부위",
    requiredRunes: "필요 룬", required_runes: "필요 룬", recommendedJobs: "추천 직업",
    recommended_jobs: "추천 직업", type: "종류", rarity: "희귀도",
    condition: "획득 조건", how_to_get: "획득 방법", acquisition: "획득 방법",
    // ⚠️ !진단 5(칭호)로 실제 필드명 확인됨(2026-07-27): achieveEffects(보유 효과,
    // 그냥 얻기만 해도 적용) / equipEffects(장착 효과, 실제로 장착해야 적용). 칭호에
    // 따라 둘 중 하나만 있거나 둘 다 있을 수 있음 - 기존 추측성 후보명들은 실제와
    // 안 맞았어서 정리하고 이 두 개로 정확히 교체.
    achieveEffects: "보유 효과", equipEffects: "장착 효과",
    usage: "사용처", how_to_use: "사용처", used_for: "사용처",
    recommendedAreas: "추천 지역", recommended_areas: "추천 지역", recommendRegion: "추천 지역",
    recommendedRegions: "추천 지역", trackedAreas: "추적 지역", tracked_areas: "추적 지역",
    trackRegion: "추적 지역", trackedRegions: "추적 지역", updatedAt: "갱신 시각", updated_at: "갱신 시각",
    usageRate: "사용률"
  };
  // (renderDetailAll이 자기 자신의 skip 목록을 직접 관리하므로 여기선 별도 상수 불필요)

  /**
   * 값이 배열/객체일 때 사람이 읽을 수 있는 텍스트로 요약한다.
   * ⚠️ 실기기에서 확인된 버그: effects/requiredRunes 등이 문자열 배열이 아니라 객체 배열
   * ("[object Object],[object Object]"로 출력되던 원인) - 각 객체에서 name/description
   * 등 읽을만한 후보 필드를 찾아서 꺼내고, 못 찾으면 "키: 값" 형태로 최소한 사람이
   * 읽을 수 있게 요약한다. joiner 기본값은 ", "(옵션 등 짧은 값), 문단형 텍스트에는
   * "\n"을 넘겨서 쓴다.
   */
  function objectSummary(val, joiner, preferDescription) {
    joiner = joiner || ", ";
    if (val === null || val === undefined) return "";
    if (Object.prototype.toString.call(val) === "[object Array]") {
      var parts = [];
      for (var i = 0; i < val.length; i++) {
        var s = objectSummary(val[i], joiner, preferDescription);
        if (s) parts.push(s);
      }
      return parts.join(joiner);
    }
    if (typeof val === "object") {
      // 흔한 "옵션" 형태(예: {name:"체력", value:"+50"})는 "체력 +50"처럼 합쳐서 보여준다
      if (val.name !== undefined && val.name !== null && typeof val.name !== "object" &&
        val.value !== undefined && val.value !== null && typeof val.value !== "object") {
        return String(val.name) + " " + String(val.value);
      }
      var nameCandidates = preferDescription
        ? ["description", "text", "effect", "name", "value", "label"]
        : ["name", "description", "text", "effect", "value", "label"];
      for (var c = 0; c < nameCandidates.length; c++) {
        var v = val[nameCandidates[c]];
        if (v !== undefined && v !== null && v !== "" && typeof v !== "object") return String(v);
      }
      var kv = [];
      for (var k in val) {
        if (!val.hasOwnProperty(k)) continue;
        if (typeof val[k] === "object") continue;
        kv.push(k + ": " + val[k]);
      }
      return kv.join(", ");
    }
    return String(val);
  }

  /**
   * obj의 필드 중 "order에 명시된 것만" 보여준다 (허용목록 방식).
   * 이전엔 "알려진 필드만 숨기고 나머지는 다 보여주는" 방식이라 scroll_type/block/label/
   * effects_html/artifact_type/slot_icon_path 같은 API 내부 필드가 그대로 새어나왔음 -
   * 이제는 order에 없는 필드는 이름을 몰라도 자동으로 걸러진다(게임 유저 친화적 카드).
   *   options.bodyField - 이 필드는 "▸ 라벨 : 값"이 아니라 그냥 문단(설명글)으로 맨 위에
   *   options.order - 이 목록에 있는 필드만, 이 순서대로 보여준다
   */
  function renderDetail(obj, options) {
    options = options || {};
    var bodyField = options.bodyField;
    var order = options.order || [];
    var shown = {};
    var lines = [];

    if (bodyField && obj[bodyField] !== undefined && obj[bodyField] !== null && obj[bodyField] !== "") {
      var bodyVal = obj[bodyField];
      lines.push(typeof bodyVal === "object" ? objectSummary(bodyVal, "\n", true) : String(bodyVal));
      lines.push("");
      shown[bodyField] = true;
    }

    function pushField(key) {
      if (shown[key]) return;
      var val = obj[key];
      if (val === undefined || val === null || val === "") return;
      if (typeof val === "object") {
        if (Object.prototype.toString.call(val) === "[object Array]" && val.length === 0) return;
        var text = objectSummary(val);
        if (!text) return;
        lines.push(field(FIELD_LABELS[key] || key, text));
        shown[key] = true;
        return;
      }
      lines.push(field(FIELD_LABELS[key] || key, val));
      shown[key] = true;
    }

    for (var i = 0; i < order.length; i++) pushField(order[i]);
    return lines;
  }

  /**
   * renderDetail의 이전(전체노출) 방식 - API 구조를 아직 모르는 엔드포인트(!검구 등)에서만
   * 쓴다. id/name/html/아이콘류만 뺀 나머지 필드를 전부 보여준다(추측 대신 실제 구조 확인용).
   */
  function renderDetailAll(obj, options) {
    options = options || {};
    var skip = ["id", "name", "description_html", "image", "icon", "iconUrl", "icon_url", "thumbnail"].concat(options.skip || []);
    var lines = [];
    var shown = {};
    function pushField(key) {
      if (shown[key] || skip.indexOf(key) !== -1) return;
      var val = obj[key];
      if (val === undefined || val === null || val === "") return;
      if (typeof val === "object") {
        if (Object.prototype.toString.call(val) === "[object Array]" && val.length === 0) return;
        var text = objectSummary(val);
        if (!text) return;
        lines.push(field(FIELD_LABELS[key] || key, text));
        shown[key] = true;
        return;
      }
      lines.push(field(FIELD_LABELS[key] || key, val));
      shown[key] = true;
    }
    for (var key2 in obj) { if (obj.hasOwnProperty(key2)) pushField(key2); }
    return lines;
  }

  var emoji = {
    search: "\uD83D\uDD0D", market: "\uD83D\uDCB0", enchant: "\uD83D\uDCDC", runeword: "\uD83E\uDDE9",
    artifact: "\uD83E\uDDE9", title: "\uD83C\uDFF7\uFE0F", item: "\uD83D\uDCE6", rune: "\uD83D\uDD2E",
    notice: "\uD83D\uDCE2", maintenance: "\uD83D\uDD27", ok: "✅", warn: "⚠️", error: "❌",
    green: "\uD83D\uDFE2", red: "\uD83D\uDD34", party: "\uD83C\uDF89", clock: "\uD83D\uDD52", admin: "⚙️",
    calc: "\uD83E\uDDEE", target: "\uD83C\uDFAF"
  };

  /**
   * 카카오톡 등 메신저의 1건당 길이 제한에 대응 - 라인 배열을 limitChars 이내로
   * 여러 묶음(메시지 여러 통)으로 자동 분할한다. 한 줄이 limitChars보다 길면
   * 어쩔 수 없이 그 줄 하나만으로 묶음을 만든다(강제로 자르지 않음 - 내용 손실 방지).
   */
  function chunkLines(lines, limitChars) {
    limitChars = limitChars || 1200;
    var chunks = [];
    var current = [];
    var currentLen = 0;
    for (var i = 0; i < lines.length; i++) {
      var lineLen = lines[i].length + 1;
      if (current.length > 0 && currentLen + lineLen > limitChars) {
        chunks.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(lines[i]);
      currentLen += lineLen;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  /**
   * chunkLines와 비슷하지만 "블록" 단위(도감/검색결과의 항목 하나, 여러 줄을 담은 문자열)로
   * 나눈다 - 항목 중간이 다른 메시지로 잘리지 않게 하기 위함. 화면에는 blocks.join("\n\n")로
   * 항목 사이에 빈 줄을 넣어 표시한다.
   */
  function chunkBlocks(blocks, limitChars) {
    limitChars = limitChars || 1200;
    var chunks = [];
    var current = [];
    var currentLen = 0;
    for (var i = 0; i < blocks.length; i++) {
      var blockLen = blocks[i].length + 2;
      if (current.length > 0 && currentLen + blockLen > limitChars) {
        chunks.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(blocks[i]);
      currentLen += blockLen;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  var CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  /** 1부터 시작하는 원문자 번호(①②③...). 20 넘어가면 "21." 형태로 대체. */
  function circled(n) {
    if (n >= 1 && n <= CIRCLED_NUMBERS.length) return CIRCLED_NUMBERS[n - 1];
    return n + ".";
  }

  /**
   * items를 "season"류 필드값으로 묶는다. season 필드가 없는 항목은 "기타"로 모은다.
   * ⚠️ 시즌 이름/번호는 실제 API 응답에 있는 값을 그대로 쓴다 - 임의로 지어내지 않는다.
   * 반환값: { order: [시즌라벨...] (정렬됨, 기타는 맨 뒤), groups: {시즌라벨: [items]} }
   */
  function groupBySeasons(items, extractField) {
    var groups = {};
    var order = [];
    var UNSPECIFIED = "기타"; // "기타"

    for (var i = 0; i < items.length; i++) {
      var raw = extractField(items[i], ["season", "시즌"]);
      var label = (raw === null || raw === undefined || raw === "") ? UNSPECIFIED : String(raw);
      if (!groups[label]) { groups[label] = []; order.push(label); }
      groups[label].push(items[i]);
    }

    order.sort(function (a, b) {
      if (a === UNSPECIFIED) return 1;
      if (b === UNSPECIFIED) return -1;
      return a < b ? -1 : (a > b ? 1 : 0);
    });

    return { order: order, groups: groups };
  }

  /**
   * items를 임의의 필드값(등급/색상/종류 등, season이 아닌 것)으로 묶는다.
   * 값이 없는 항목은 "기타"로 모은다. presetOrder를 주면 그 순서를 우선하고(그 안에
   * 없는 값은 뒤에 가나다순으로), 안 주면 그냥 가나다순 - "기타"는 항상 맨 뒤.
   * 반환값: { order: [값라벨...], groups: {값라벨: [items]} }
   */
  function groupByField(items, extractField, candidateKeys, presetOrder) {
    var groups = {};
    var order = [];
    var UNSPECIFIED = "기타"; // "기타"

    for (var i = 0; i < items.length; i++) {
      var raw = extractField(items[i], candidateKeys);
      var label = (raw === null || raw === undefined || raw === "") ? UNSPECIFIED : String(raw);
      if (!groups[label]) { groups[label] = []; order.push(label); }
      groups[label].push(items[i]);
    }

    order.sort(function (a, b) {
      if (a === UNSPECIFIED) return 1;
      if (b === UNSPECIFIED) return -1;
      if (presetOrder) {
        var ia = presetOrder.indexOf(a), ib = presetOrder.indexOf(b);
        if (ia !== -1 || ib !== -1) {
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        }
      }
      return a < b ? -1 : (a > b ? 1 : 0);
    });

    return { order: order, groups: groups };
  }

  /** 등급/색상/종류 같은 필드 라벨을 번호 또는 이름 일부로 찾는다(시즌 전용 아님). */
  function matchFieldArg(order, arg) {
    var argStr = String(arg).trim();
    var asIndex = parseInt(argStr, 10);
    if (!isNaN(asIndex) && String(asIndex) === argStr && asIndex >= 1 && asIndex <= order.length) {
      return order[asIndex - 1];
    }
    var normalized = argStr.replace(/\s+/g, "").toLowerCase();
    for (var j = 0; j < order.length; j++) {
      if (String(order[j]).replace(/\s+/g, "").toLowerCase().indexOf(normalized) !== -1) return order[j];
    }
    return null;
  }

  /**
   * 시즌 지정 인자(번호 또는 시즌명 일부)로 실제 시즌 라벨을 찾는다.
   * "1"처럼 순번으로 넘기면 order의 1번째(1-based)를, 문자열이면 부분일치로 찾는다.
   */
  function matchSeasonArg(order, arg) {
    var argStr = String(arg).trim();

    // "시즌"이 포함된 인자면 시즌 번호로 매칭한다(실제 데이터의 season 필드가
    // 숫자만(예: 2) 있어도, 문자열로 "시즌2"가 있어도 둘 다 매칭됨).
    if (argStr.indexOf("시즌") !== -1) {
      var num = seasonNumber(argStr);
      if (num !== null) {
        for (var i = 0; i < order.length; i++) {
          if (seasonNumber(order[i]) === num) return order[i];
        }
      }
    }

    // 순수 숫자만 입력하면 "목록에서 몇 번째(1-based)"로 취급한다.
    var asIndex = parseInt(argStr, 10);
    if (!isNaN(asIndex) && String(asIndex) === argStr && asIndex >= 1 && asIndex <= order.length) {
      return order[asIndex - 1];
    }

    var normalized = argStr.replace(/\s+/g, "").toLowerCase();
    for (var j = 0; j < order.length; j++) {
      if (String(order[j]).replace(/\s+/g, "").toLowerCase().indexOf(normalized) !== -1) return order[j];
    }
    return null;
  }

  /** 등급/색상류 값을 색깔 이모지로. 모르는 값이면 원래 텍스트를 그대로 보여준다(지어내지 않음). */
  var COLOR_EMOJI_MAP = {
    "적색": "\uD83D\uDFE5", "red": "\uD83D\uDFE5",
    "청색": "\uD83D\uDFE6", "blue": "\uD83D\uDFE6",
    "녹색": "\uD83D\uDFE9", "green": "\uD83D\uDFE9",
    "무색": "⬜", "colorless": "⬜", "none": "⬜",
    "황금색": "\uD83D\uDFE8", "gold": "\uD83D\uDFE8", "golden": "\uD83D\uDFE8"
  };
  function colorEmoji(value) {
    if (value === null || value === undefined || value === "") return null;
    var key = String(value).replace(/\s+/g, "").toLowerCase();
    return COLOR_EMOJI_MAP[key] || null;
  }
  function colorTag(value) {
    var emoji2 = colorEmoji(value);
    return emoji2 ? emoji2 + " " + String(value) : String(value);
  }

  /** 등급값을 색깔 이모지로. 인식 못하는 값이면 null(표시 안 함 - 지어내지 않음). */
  var GRADE_EMOJI_MAP = {
    "일반": "⬜", "고급": "\uD83D\uDFE9", "희귀": "\uD83D\uDFE6",
    "영웅": "\uD83D\uDFEA", "전설": "\uD83D\uDFE8", "신화": "\uD83D\uDFE7"
  };
  function gradeEmoji(value) {
    if (value === null || value === undefined || value === "") return null;
    var key = String(value).replace(/\s+/g, "");
    return GRADE_EMOJI_MAP[key] || null;
  }

  /** 아이템 종류(category) 내부코드를 사람이 읽기 좋은 한글로. 모르는 값은 원본 그대로(지어내지 않음). */
  var ITEM_CATEGORY_LABELS = {
    "Consumable_Etc": "소모품", "Consumable": "소모품",
    "Ingredient": "재료", "QuickSlot": "퀵슬롯", "tool": "도구", "Tool": "도구",
    "Weapon": "무기", "Armor": "방어구", "Accessory": "장신구",
    "Food": "음식", "Etc": "기타"
  };
  function itemCategoryLabel(value) {
    if (value === null || value === undefined || value === "") return value;
    return ITEM_CATEGORY_LABELS[String(value)] || String(value);
  }

  /**
   * 검색 결과에 "이름이 같은 여러 항목"이 있을 때(대개 시즌별로 따로 등록된 경우),
   * 아래처럼 정리한다:
   *   - 이름이 같고 내용(설명/효과 등, season 필드는 제외)도 완전히 같으면
   *     하나로 묶어서 시즌만 합쳐 보여준다 (예: 화음 [시즌1/시즌2])
   *   - 이름은 같은데 내용이 다르면 시즌별로 각각 분리해서 보여준다
   *     (예: 화음 [시즌1] / 화음 [시즌2] - 서로 다른 항목 취급)
   * 반환값: [{ item: 대표항목, name: 이름, seasons: [시즌라벨...] }, ...] - 원래
   * results 배열의 등장 순서를 최대한 유지한다.
   */
  function dedupeBySeasonalContent(items, extractField, nameOf) {
    function contentSignature(obj) {
      // ⚠️ 사용자에게 실제로 보여주는 정보(효과/설명)만 비교한다 - 등급/티어처럼
      // 화면에 이제 안 보여주는 필드가 시즌마다 살짝 달라도, 효과 자체가 같으면
      // "같은 내용"으로 취급해 병합한다.
      var candidateKeys = ["description", "effect", "effects", "flavor_text", "desc", "requiredRunes", "required_runes"];
      var parts = [];
      for (var i = 0; i < candidateKeys.length; i++) {
        var v = obj[candidateKeys[i]];
        if (v !== undefined) parts.push(candidateKeys[i] + ":" + JSON.stringify(v));
      }
      return parts.join("|");
    }
    function seasonLabelOf(obj) {
      var raw = extractField(obj, ["season", "시즌"]);
      return (raw === null || raw === undefined || raw === "") ? null : String(raw);
    }

    var groups = []; // { name, sig, item, seasons: [] }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var name = nameOf(item);
      var sig = contentSignature(item);
      var season = seasonLabelOf(item);

      var found = null;
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].name === name && groups[g].sig === sig) { found = groups[g]; break; }
      }
      if (found) {
        if (season && found.seasons.indexOf(season) === -1) found.seasons.push(season);
      } else {
        groups.push({ name: name, sig: sig, item: item, seasons: season ? [season] : [] });
      }
    }
    return groups;
  }

  /** dedupeBySeasonalContent 결과 한 건을 "이름 [시즌1/시즌2]" 형태 태그로 만든다. 시즌 정보가 없으면 이름만. */
  function seasonalNameTag(entry) {
    var labels = entry.seasons.map ? entry.seasons.map(formatSeasonLabel) : entry.seasons;
    return entry.name + (labels.length ? " [" + labels.join("/") + "]" : "");
  }

  /** 시즌 값(숫자든 "시즌2"같은 문자열이든)에서 숫자만 뽑는다. 숫자가 없으면 null. */
  function seasonNumber(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    var m = String(raw).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  /** 시즌 값을 "시즌2" 같은 사람이 읽기 좋은 형태로 통일한다. 숫자만 와도(예: 2) "시즌2"로,
   * 이미 "시즌2"처럼 와도 그대로, 숫자를 못 찾으면 원본 그대로(지어내지 않음). */
  function formatSeasonLabel(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    var n = seasonNumber(raw);
    return n !== null ? ("시즌" + n) : String(raw);
  }

  /** "시즌2" 같은 라벨에서 숫자만 뽑는다 - 시즌 최신순 정렬용. 숫자가 없으면 가장 낮은 우선순위. */
  function seasonRank(label) {
    var n = seasonNumber(label);
    return n === null ? -1 : n;
  }

  /**
   * 이름이 완전히 일치하는 항목들(같은 이름의 여러 시즌 항목일 수 있음)을 어떻게
   * 보여줄지 결정한다:
   *   - 현재 활성 시즌(currentSeasonNumber) 데이터가 있으면, 그 항목만 보여준다(내용이
   *     같은 다른 시즌이 있으면 자동으로 같이 묶여서 시즌 라벨만 합쳐짐 - 병합).
   *   - 현재 시즌 데이터가 없으면:
   *       내용이 겹치는 게 하나로만 묶이면(=사실상 시즌마다 내용이 같음) 그 하나만.
   *       내용이 서로 다른 게 여러 개로 남으면 전부 나눠서 보여준다(분리).
   * 반환값: { mode: "single" | "multiple", entries: [{ item, name, seasons: [원본라벨...] }, ...] }
   */
  function resolveSeasonalDisplay(exactMatches, extractField, nameOf, currentSeasonNumber) {
    var groups = dedupeBySeasonalContent(exactMatches, extractField, nameOf);

    var currentGroup = null;
    for (var i = 0; i < groups.length; i++) {
      for (var j = 0; j < groups[i].seasons.length; j++) {
        if (seasonNumber(groups[i].seasons[j]) === currentSeasonNumber) { currentGroup = groups[i]; break; }
      }
      if (currentGroup) break;
    }

    if (currentGroup) return { mode: "single", entries: [currentGroup] };
    if (groups.length <= 1) return { mode: "single", entries: groups };
    return { mode: "multiple", entries: groups };
  }

  /**
   * 시즌 라벨 여러 개를 하나로 합쳐서 보여준다 - "시즌0 / 시즌1"이 아니라
   * "시즌0·1"처럼 "시즌" 접두어는 한 번만 붙이고 숫자만 가운뎃점(·)으로 잇는다.
   * 1개면 그냥 formatSeasonLabel과 동일. 숫자로 못 뽑는 값이 섞여있으면
   * 안전하게 기존 방식("/")으로 폴백한다.
   */
  function formatMergedSeasonLabel(seasons) {
    if (!seasons || !seasons.length) return null;
    if (seasons.length === 1) return formatSeasonLabel(seasons[0]);
    var nums = [];
    for (var i = 0; i < seasons.length; i++) {
      var n = seasonNumber(seasons[i]);
      if (n === null) {
        var labels = [];
        for (var j = 0; j < seasons.length; j++) labels.push(formatSeasonLabel(seasons[j]));
        return labels.join("/");
      }
      nums.push(n);
    }
    return "시즌" + nums.join("·");
  }

  return {
    box: box, field: field, bulletList: bulletList, changeArrow: changeArrow, number: number,
    usageBlock: usageBlock, similarBlock: similarBlock, renderDetail: renderDetail, renderDetailAll: renderDetailAll,
    chunkLines: chunkLines, chunkBlocks: chunkBlocks, circled: circled, objectSummary: objectSummary, emoji: emoji,
    groupBySeasons: groupBySeasons, matchSeasonArg: matchSeasonArg, colorEmoji: colorEmoji, colorTag: colorTag, gradeEmoji: gradeEmoji, itemCategoryLabel: itemCategoryLabel,
    formatMergedSeasonLabel: formatMergedSeasonLabel,
    groupByField: groupByField, matchFieldArg: matchFieldArg,
    dedupeBySeasonalContent: dedupeBySeasonalContent, seasonalNameTag: seasonalNameTag,
    seasonNumber: seasonNumber, formatSeasonLabel: formatSeasonLabel, resolveSeasonalDisplay: resolveSeasonalDisplay
  };
})();

GoombaBot.search = (function () {
  var CHOSUNG_LIST = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  var HANGUL_BASE = 0xac00, HANGUL_LAST = 0xd7a3, CHOSUNG_UNIT = 21 * 28;

  function extractChosung(str) {
    var result = "";
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      result += (code >= HANGUL_BASE && code <= HANGUL_LAST) ? CHOSUNG_LIST[Math.floor((code - HANGUL_BASE) / CHOSUNG_UNIT)] : str.charAt(i);
    }
    return result;
  }
  function isChosungOnly(str) {
    if (str.length === 0) return false;
    for (var i = 0; i < str.length; i++) { if (CHOSUNG_LIST.indexOf(str.charAt(i)) === -1) return false; }
    return true;
  }
  function normalize(str) { return String(str).replace(/\s+/g, "").toLowerCase(); }

  function levenshtein(a, b) {
    var dp = [];
    for (var i = 0; i <= a.length; i++) { dp.push([]); dp[i][0] = i; }
    for (var j = 0; j <= b.length; j++) dp[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[a.length][b.length];
  }

  function fuzzyFilter(items, keyword, nameOf) {
    var rawKeyword = String(keyword).trim();
    if (!rawKeyword) return [];
    var normalizedKeyword = normalize(rawKeyword);
    var chosungMode = isChosungOnly(rawKeyword);
    var exact = [], partial = [], chosungMatch = [], typoTolerant = [];

    for (var i = 0; i < items.length; i++) {
      var normalizedName = normalize(nameOf(items[i]));
      if (normalizedName === normalizedKeyword) { exact.push(items[i]); continue; }
      if (normalizedName.indexOf(normalizedKeyword) !== -1) { partial.push(items[i]); continue; }
      if (chosungMode && extractChosung(normalizedName).indexOf(rawKeyword) !== -1) { chosungMatch.push(items[i]); continue; }
      if (!chosungMode && levenshtein(normalizedName, normalizedKeyword) <= 1) typoTolerant.push(items[i]);
    }
    return exact.concat(partial).concat(chosungMatch).concat(typoTolerant);
  }

  function suggest(candidates, keyword, limit) {
    limit = limit || 3;
    var normalizedKeyword = normalize(keyword);
    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
      var normalizedCandidate = normalize(candidates[i]);
      var score = (normalizedCandidate.indexOf(normalizedKeyword) !== -1 || normalizedKeyword.indexOf(normalizedCandidate) !== -1)
        ? 0 : levenshtein(normalizedCandidate, normalizedKeyword);
      scored.push({ name: candidates[i], score: score });
    }
    scored.sort(function (a, b) { return a.score - b.score; });
    var result = [];
    for (var j = 0; j < scored.length && result.length < limit; j++) { if (scored[j].score <= 1) result.push(scored[j].name); }
    return result;
  }

  return { fuzzyFilter: fuzzyFilter, suggest: suggest, extractChosung: extractChosung };
})();

/**
 * 이름을 비교하기 좋게 정규화한다 - 눈으로는 안 보이는 차이(앞뒤 공백, 전각/반각
 * 밑줄 등 비슷하게 생긴 문자 차이)까지 흡수해서, 오픈채팅방/일반채팅방마다 미묘하게
 * 다르게 들어오는 닉네임도 최대한 같은 사람으로 인식되게 한다.
 */
function goombaNormalizeName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "") // 공백류 전부 제거
    .replace(/[_\-\/\\\.＿‐-―−／・·]/g, ""); // 밑줄/대시/슬래시/역슬래시/점/가운뎃점 등 구분 문자 전부 제거
}

GoombaBot.normalizeName = goombaNormalizeName;

/**
 * 정규화한 이름이 관리자 이름으로 "시작하는지"(prefix 일치)로 판단한다.
 * 예: 관리자 목록에 "굼바굼바"만 있어도, "굼바굼바 / 빙결" 같은 표시 이름이면
 * 정규화 후 "굼바굼바빙결"이 "굼바굼바"로 시작하므로 관리자로 인식된다.
 */
GoombaBot.isAdmin = function (senderName) {
  var normalizedSender = goombaNormalizeName(senderName);
  for (var i = 0; i < GoombaBotConfig.adminNames.length; i++) {
    var normalizedAdmin = goombaNormalizeName(GoombaBotConfig.adminNames[i]);
    if (normalizedAdmin && normalizedSender.indexOf(normalizedAdmin) === 0) return true;
  }
  return false;
};

module.exports = { GoombaBot: GoombaBot };


},{"./config.js":13}],15:[function(require,module,exports){

/**
 * core/router.js
 * ---------------
 * Event.COMMAND 리스너(라우터) 인프라 + !도움/!명령어 명령어를 담당한다.
 * commands/*.js가 전부 이 파일의 GoombaBot.registerCommand()로 자기 명령어를 등록한다.
 */

var GoombaBot = require("./config.js").GoombaBot;
var GoombaBotConfig = require("./config.js").GoombaBotConfig;
require("./cache.js"); // GoombaBot.storage (ON/OFF 상태 저장용)
require("./format.js"); // GoombaBot.format/search/isAdmin이 붙도록 로드만 시켜둠

GoombaBot.commands = GoombaBot.commands || {}; // require()가 여러 번 실행돼도 등록된 명령어가 안 지워지도록 방어

/** 기본은 항상 ON. !굼바봇 끄기로 저장된 값이 명시적으로 false일 때만 꺼진 상태. */
GoombaBot.isBotEnabled = function () {
  return GoombaBot.storage.readStale("bot_enabled") !== false;
};

/** hidden:true인 명령어는 !도움/!명령어 목록에 안 나온다 (재미 기능용) */
GoombaBot.registerCommand = function (name, handler) {
  if (!handler || typeof handler.execute !== "function") {
    GoombaBot.log("잘못된 명령어 등록 시도 (execute 함수 없음): " + name);
    return;
  }
  GoombaBot.commands[name] = handler;
};

/**
 * ⚠️ "!"로 시작하지 않는 일반 메시지를 처리해야 하는 기능(예: !어구감시 시작 후
 * "다음 시간을 입력해주세요" 대화 흐름)을 위한 레지스트리. 각 핸들러는
 * function(chat): boolean 형태 - 자기가 처리했으면 true를 반환해서 뒤 핸들러를
 * 건너뛴다. 대기 상태가 디스크(Database)에 저장되어 있어야 핸들러가 반응하므로,
 * 평소 잡담에는 절대 반응하지 않는다(관리자가 명시적으로 "!어구감시 시작"을 친
 * 직후에만 짧게 대기).
 */
GoombaBot._messageHandlers = GoombaBot._messageHandlers || [];
GoombaBot.registerMessageHandler = function (fn) { GoombaBot._messageHandlers.push(fn); };
GoombaBot.dispatchMessage = function (chat) {
  for (var i = 0; i < GoombaBot._messageHandlers.length; i++) {
    try {
      if (GoombaBot._messageHandlers[i](chat)) return;
    } catch (e) {
      GoombaBot.log("메시지 핸들러 처리 중 오류: " + e);
    }
  }
};

/**
 * ⚠️ chat.command가 등록된 명령어와 정확히 일치하지 않을 때, 유사도 추천을 보여주기
 * 전에 시도해볼 폴백 핸들러들. 예: "!135"(개조번호), "!강타"(세공태그), "!바위칼날"
 * (룬이름)처럼 미리 다 등록해두기 힘든(너무 많거나 동적인) 검색어를 위한 것.
 * function(chat): boolean - 자기가 처리했으면 true.
 */
GoombaBot._fallbackHandlers = GoombaBot._fallbackHandlers || [];
GoombaBot.registerFallbackHandler = function (fn) { GoombaBot._fallbackHandlers.push(fn); };

GoombaBot.dispatchCommand = function (chat) {
  var handler = GoombaBot.commands[chat.command];
  if (!handler) {
    for (var f = 0; f < GoombaBot._fallbackHandlers.length; f++) {
      try {
        if (GoombaBot._fallbackHandlers[f](chat)) return;
      } catch (fallbackError) {
        GoombaBot.log("폴백 핸들러 처리 중 오류: " + fallbackError);
      }
    }
    var suggestions = GoombaBot.search.suggest(Object.keys(GoombaBot.commands), chat.command, 3);
    if (suggestions.length === 0) return;
    var lines = [GoombaBot.format.emoji.error + " 존재하지 않는 명령어입니다.", "", "혹시 아래 명령어를 찾으셨나요?"];
    for (var i = 0; i < suggestions.length; i++) lines.push("!" + suggestions[i]);
    chat.reply(lines.join("\n"));
    return;
  }

  // ⚠️ 굼바봇이 꺼진 상태(!굼바봇 끄기)면, "!굼바봇"(상태/켜기 등 제어용) 명령어를
  // 제외한 나머지는 전부 조용히 무시한다 - 그래야 다시 켤 방법이 막히지 않는다.
  if (chat.command !== "굼바봇" && !GoombaBot.isBotEnabled()) return;

  if (handler.adminOnly && !GoombaBot.isAdmin(chat.author.name)) {
    chat.reply("\uD83C\uDF44 굼바봇 경고!\n이 기능은 굼바 관리자만 사용할 수 있습니다.");
    return;
  }

  try {
    handler.execute(chat);
  } catch (executeError) {
    GoombaBot.log("명령어 실행 중 오류 (" + chat.command + "): " + executeError);
    try {
      if (GoombaBot.isAdmin(chat.author.name)) {
        var detail = (executeError && executeError.stack) ? String(executeError.stack) : String(executeError && executeError.message ? executeError.message : executeError);
        chat.reply(GoombaBot.format.emoji.warn + " 명령어 처리 중 오류가 발생했습니다.\n\n[관리자에게만 보임]\n" + detail);
      } else {
        chat.reply(GoombaBot.format.emoji.warn + " 명령어 처리 중 오류가 발생했습니다.");
      }
    } catch (replyError) {}
  }
};

// ---- !도움 / !명령어 (별칭) - 기능설명+사용법+예시를 전부 보여줌 (hidden 명령어는 제외) ----
(function () {
  var F = GoombaBot.format;
  var CATEGORY_EMOJI = {
    "기본": "⭐", "정보": F.emoji.rune, "인챈트": F.emoji.enchant, "아티팩트": F.emoji.artifact,
    "거래소": F.emoji.market, "던전": "\uD83D\uDD73", "공지": F.emoji.notice, "관리자": F.emoji.admin
  };
  var CATEGORY_ORDER = ["기본", "정보", "인챈트", "아티팩트", "거래소", "던전", "공지", "관리자"];

  function buildHelpBlocks(admin) {
    var grouped = {};
    for (var name in GoombaBot.commands) {
      if (!GoombaBot.commands.hasOwnProperty(name)) continue;
      var cmd = GoombaBot.commands[name];
      if (cmd.hidden) continue; // 재미 기능은 도움말에서 제외
      if (cmd.adminOnly && !admin) continue;
      var cat = cmd.category || "기타";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ name: name, summary: cmd.summary || "", usage: (cmd.usage && cmd.usage.length ? cmd.usage : ["!" + name]) });
    }

    var blocks = [];
    var seen = {};

    function renderCategory(cat) {
      if (!grouped[cat] || seen[cat]) return;
      seen[cat] = true;
      var lines = [(CATEGORY_EMOJI[cat] || "▸") + " " + cat, ""];
      var list = grouped[cat];
      for (var i = 0; i < list.length; i++) {
        lines.push("!" + list[i].name);
        if (list[i].summary) lines.push(list[i].summary);
        lines.push("", "예)");
        for (var j = 0; j < list[i].usage.length; j++) lines.push(list[i].usage[j]);
        if (i < list.length - 1) lines.push("");
      }
      blocks.push(lines.join("\n"));
    }

    for (var c = 0; c < CATEGORY_ORDER.length; c++) renderCategory(CATEGORY_ORDER[c]);
    for (var cat2 in grouped) renderCategory(cat2); // 목록에 없는 카테고리도 누락 없이

    return blocks;
  }

  function helpHandler(chat) {
    var admin = GoombaBot.isAdmin(chat.author.name);
    var target = chat.args[0];

    if (target) {
      var targetHandler = GoombaBot.commands[String(target).replace(/^!/, "")];
      if (!targetHandler || !targetHandler.detail) {
        chat.reply(F.emoji.warn + ' "' + target + '"에 대한 상세 도움말이 없습니다. !도움으로 전체 목록을 확인해보세요.');
        return;
      }
      var d = targetHandler.detail;
      var lines = [d.title, ""];
      for (var i = 0; i < d.examples.length; i++) lines.push(d.examples[i]);
      if (d.features && d.features.length) {
        lines.push("", "지원 기능");
        for (var f = 0; f < d.features.length; f++) lines.push("• " + d.features[f]);
      }
      chat.reply(lines.join("\n"));
      return;
    }

    var lines = [
      "\uD83D\uDCD6 굼바봇 명령어", "",
      "\uD83D\uDCDA 정보",
      "!룬 (이름)", "예) !룬 태초", "",
      "!룬 도감", "",
      "!룬워드 (이름)", "예) !룬워드 무지개의 끝", "",
      "!룬워드 도감", "!룬워드 도감 시즌2", "",
      "!칭호 (이름)", "예) !칭호 백기사", "",
      "!칭호 도감", "",
      "!아이템 (이름)", "예) !아이템 철광석", "",
      "!아이템 도감", "",
      "!인챈트 (이름)", "예) !인챈트 해연", "",
      "⚔️ 직업 정보",
      "!직업명", "예) !기사", "",
      "!직업명 룬티어", "예) !기사 룬티어", "",
      "!직업명 개조", "예) !기사 개조", "",
      "!직업명 세공", "예) !기사 세공", "",
      "!직업명 스탯", "!직업명 펫", "!직업명 사이클", "(데이터 추가 시 자동 지원)", "",
      "\uD83D\uDD0E 검색",
      "!개조 (번호)", "예) !개조 135", "",
      "!세공 (태그)", "예) !세공 강타", "",
      "\uD83D\uDCD6 기타",
      "!도움"
    ];
    chat.reply(lines.join("\n"));
  }

  GoombaBot.registerCommand("도움", {
    category: "기본", summary: "명령어 목록 (기능설명/사용법/예시 전부 표시)", usage: ["!도움", "!도움 룬"],
    execute: helpHandler
  });

  // !명령어는 !도움과 완전히 동일하게 동작하는 별칭
  GoombaBot.registerCommand("명령어", {
    category: "기본", summary: "!도움과 동일", usage: ["!명령어"],
    execute: helpHandler
  });
})();

module.exports = { GoombaBot: GoombaBot };


},{"./cache.js":12,"./config.js":13,"./format.js":14}],16:[function(require,module,exports){
module.exports={
  "기사": [
    "강타",
    "보조",
    "연타"
  ],
  "대검전사": [
    "강타",
    "보조",
    "강타/보조 쿨"
  ],
  "검술사": [
    "강타",
    "연타",
    "이동"
  ],
  "격투가": [
    "강타",
    "이동",
    "강타쿨/이동쿨",
    "방해/보조"
  ],
  "화염술사": [
    "원소",
    "연타",
    "강타"
  ],
  "마법사": [
    "원소",
    "방해",
    "연타/강타/소환"
  ],
  "전격술사": [
    "원소",
    "강타",
    "보조",
    "방해",
    "보조쿨"
  ],
  "빙결술사": [
    "원소",
    "소환",
    "생존",
    "강타"
  ],
  "석궁사수": [
    "원소",
    "강타",
    "연타"
  ],
  "도적": [
    "방해",
    "연타",
    "소환/이동/강타"
  ],
  "음유시인": [
    "방해",
    "연타",
    "보조",
    "강타"
  ],
  "악사": [
    "방해",
    "강타",
    "연타",
    "보조"
  ],
  "장궁병": [
    "방해",
    "강타",
    "연타"
  ],
  "힐러": [
    "보조",
    "보조쿨",
    "연타",
    "강타",
    "소환"
  ],
  "사제": [
    "보조",
    "강타",
    "보조쿨",
    "방해"
  ],
  "수도사": [
    "보조",
    "연타",
    "보조쿨",
    "이동",
    "방해"
  ],
  "듀얼블레이드": [
    "연타",
    "이동",
    "강타",
    "보조"
  ],
  "궁수": [
    "연타",
    "방해",
    "강타"
  ],
  "전사": [
    "방해",
    "강타",
    "이동"
  ],
  "암흑술사": [
    "소환",
    "방해",
    "연타",
    "보조"
  ],
  "댄서": [
    "연타",
    "이동",
    "강타",
    "보조"
  ]
}
},{}],17:[function(require,module,exports){
module.exports={
  "화법": "화염술사",
  "불법": "화염술사",
  "빙결": "빙결술사",
  "빙술": "빙결술사",
  "전격": "전격술사",
  "장궁": "장궁병",
  "대검": "대검전사",
  "듀블": "듀얼블레이드",
  "석궁": "석궁사수",
  "음유": "음유시인",
  "암흑": "암흑술사",
  "법사": "마법사",
  "검술": "검술사"
}
},{}],18:[function(require,module,exports){
module.exports={
  "화염술사": [
    "A: 421 31115 / 3단계 진입 시 113 15 123 5113 13 / 1415 125 1115",
    "B: 113 15 123 5113 13 / 3단계 진입 시 사이클",
    "C: 1415 125 115",
    "D: 6 313 24 31 113 15 평 13",
    "평상시 ABCBC~ 식 반복, 궁 사용 시 DCBC~ 식 반복"
  ],
  "힐러": [
    "기본: 51433 433 (반복)",
    "5스, 4스는 콜 돌아올 때마다 3스 쓰기 전에 사용"
  ],
  "악사": [
    "기본(조순매 기준): 331435 → 1425 (반복)",
    "무드 많이 찼을 때: 435 → 1425",
    "상황에 따라: 335 → 1425"
  ],
  "대검전사": [
    "기본: 1435",
    "콜감 세공 부족 시: 3145",
    "3소 콜일 경우: 1345 또는 1435",
    "그래도 콜이 부족하면: 1425"
  ]
}
},{}],19:[function(require,module,exports){
module.exports={
  "화염술사": [
    "치강/치연/치추중 자유영역(엠블 위대함=치강펫, 해방=치연펫, 영원한밤=치추중 자유영역이 더 좋음)"
  ],
  "사제": [
    "치명타+추가타 (연갈색 시추)",
    "치명타+강타 (프릴 노르웨이 숲 고양이)",
    "치명타+브레이크+스킬추가타 (살구색 아기 돼지, 어비스 기록갱신용)"
  ],
  "음유시인": [
    "치명/연타/스킬공략 팻 추천"
  ],
  "악사": [
    "치명/치스공 팻 추천(조순매 세팅 기준)"
  ],
  "암흑술사": [
    "방해빙 노데그 (기동성 100%)",
    "에빠래사판다 (고유스킬 밸류가 좋음, 신속신데그20초 또는 신속태그30초)",
    "진돼지 (고유스킬% 최대 초진용, 기갱용)"
  ]
}
},{}],20:[function(require,module,exports){
module.exports={
  "화염술사": [
    "스킬위력 4천 후반대",
    "연타강타합 5천대",
    "치명타 9천대 이상",
    "추가타 2천~3천대"
  ],
  "힐러": [
    "스킬위력 5000(음식+파티효과 포함)",
    "치명타 8000 내외",
    "추가타(소생 40스택 유지)",
    "연타(나머지 값)"
  ],
  "음유시인": [
    "치명타 8000 이상",
    "연타 5000~6000",
    "강타(남는 스탯 투자)"
  ],
  "악사": [
    "치명타 8000 이상",
    "스킬위력 5000 이상",
    "연강합 5000~6000",
    "추가타 4000~5000"
  ],
  "암흑술사": [
    "치명타 9000",
    "추가타 5000+",
    "연타 5000+"
  ],
  "빙결술사": [
    "연타 또는 강타 한쪽 6000 이상",
    "스킬위력 5000",
    "치명타 8000~10000",
    "추가타(남는 스탯)"
  ],
  "검술사": [
    "치명타 8500",
    "연타 몰빵",
    "추가타 2500~3000",
    "강타 최소화"
  ],
  "기사": [
    "치명타 8000 이상",
    "빠른스킬 4800~5000",
    "추가타 3000 전후"
  ],
  "수도사": [
    "치명타 8000~",
    "추가타 3000~4000",
    "연강합 6000~",
    "빠른스킬 5000"
  ],
  "대검전사": [
    "치명타 1순위",
    "강타 2순위",
    "추가타 3순위"
  ]
}
},{}],21:[function(require,module,exports){
module.exports={
  "전사": {
    "무기": [
      "바위 칼날",
      "죽음",
      "타오르는 영광",
      "오랜 광기",
      "대군주+",
      "광채+",
      "거대한 분노",
      "창백한 기수",
      "계시+",
      "두 갈래 뿔"
    ],
    "엠블럼": [
      "빛바랜 별",
      "영원한 밤",
      "위대함",
      "초월",
      "침묵",
      "태초",
      "고결함",
      "해방",
      "백금 천칭"
    ],
    "장신구": [
      "붕괴+",
      "돌격+",
      "극점+",
      "검투사+",
      "맹공+",
      "패기+",
      "참격+",
      "돌진+",
      "포효+"
    ],
    "방어구": [
      "기본기+",
      "서광",
      "칼바람",
      "위엄",
      "등대지기",
      "녹슨 방패",
      "용 사냥꾼",
      "사슬로 묶은 법전",
      "기사단장",
      "별바라기"
    ]
  },
  "대검전사": {
    "무기": [
      "거대한 분노",
      "오랜 광기",
      "광채+",
      "암운+",
      "죽음",
      "창백한 기수",
      "추적자",
      "불꽃으로 새긴 문장",
      "억눌린 충동",
      "햇살+"
    ],
    "엠블럼": [
      "위대함",
      "빛바랜 별",
      "영원한 밤",
      "초월",
      "고결함",
      "해방",
      "백금 천칭",
      "침묵",
      "태초"
    ],
    "장신구": [
      "탄력+",
      "광전사+",
      "봉쇄+",
      "반격+",
      "분노+",
      "절단+",
      "무자비+",
      "회심+",
      "회전+"
    ],
    "방어구": [
      "기본기+",
      "흐릿한 형상",
      "녹슨 방패",
      "금 간 봉인",
      "무너진 경계",
      "봉인술사",
      "끓는 피",
      "등대지기",
      "승전"
    ]
  },
  "검술사": {
    "무기": [
      "바위 칼날",
      "눈부신 잔영",
      "거대한 분노",
      "타오르는 영광",
      "대군주+",
      "죽음",
      "계시+",
      "햇살+",
      "창백한 기수",
      "광채+"
    ],
    "엠블럼": [
      "해방",
      "위대함",
      "영원한 밤",
      "빛바랜 별",
      "초월",
      "태초",
      "고결함",
      "백금 천칭",
      "침묵"
    ],
    "장신구": [
      "관통+",
      "평정+",
      "일섬+",
      "낙화+",
      "중검+",
      "무희+",
      "맹렬+",
      "압박+",
      "피바람+"
    ],
    "방어구": [
      "승전",
      "교차하는 사슬",
      "별바라기",
      "아귀",
      "잠들지 않는 불",
      "금 간 봉인",
      "숲 길잡이",
      "녹슨 방패",
      "사슬로 묶은 법전",
      "잠든 땅"
    ]
  },
  "기사": {
    "무기": [
      "눈부신 잔영",
      "두 갈래 뿔",
      "죽음",
      "부패+",
      "타오르는 영광",
      "억눌린 충동",
      "거대한 분노",
      "바위 칼날",
      "광채+",
      "창백한 기수"
    ],
    "엠블럼": [
      "백금 천칭",
      "영원한 밤",
      "초월",
      "빛바랜 별",
      "위대함",
      "고결함",
      "태초",
      "침묵",
      "해방"
    ],
    "장신구": [
      "지진+",
      "돌파+",
      "용기+",
      "명예+",
      "격돌+",
      "맹약+",
      "고갈+",
      "결의+"
    ],
    "방어구": [
      "열의+",
      "첫 번째 서약",
      "승전",
      "서광",
      "금 간 봉인",
      "숲 길잡이",
      "뼈 인장",
      "사슬로 묶은 법전",
      "위엄"
    ]
  },
  "궁수": {
    "무기": [
      "바위 칼날",
      "두 갈래 뿔",
      "타오르는 영광",
      "죽음",
      "창백한 기수",
      "거대한 분노",
      "대군주+",
      "불꽃으로 새긴 문장",
      "광채+",
      "눈부신 잔영"
    ],
    "엠블럼": [
      "영원한 밤",
      "해방",
      "초월",
      "고결함",
      "위대함",
      "빛바랜 별",
      "백금 천칭",
      "침묵",
      "태초"
    ],
    "장신구": [
      "닻+",
      "매+",
      "날렵함+",
      "나선+",
      "치명적인+",
      "몰아침+",
      "재빠른+",
      "추적+",
      "탈출+"
    ],
    "방어구": [
      "숲 길잡이",
      "교차하는 사슬",
      "별바라기",
      "금 간 봉인",
      "무너진 경계",
      "승전",
      "기본기+",
      "첫 번째 서약",
      "잿빛 장막"
    ]
  },
  "석궁사수": {
    "무기": [
      "바위 칼날",
      "타오르는 영광",
      "불꽃으로 새긴 문장",
      "죽음",
      "창백한 기수",
      "억눌린 충동",
      "추적자",
      "오랜 광기",
      "광채+"
    ],
    "엠블럼": [
      "영원한 밤",
      "해방",
      "위대함",
      "빛바랜 별",
      "초월",
      "백금 천칭",
      "고결함",
      "침묵",
      "태초"
    ],
    "장신구": [
      "꿰뚫음+",
      "반전+",
      "균열+",
      "산탄+",
      "화약+",
      "연쇄+",
      "감전+",
      "방해+",
      "전류+"
    ],
    "방어구": [
      "기본기+",
      "별바라기",
      "무너진 경계",
      "첫 번째 서약",
      "무한한 탐욕",
      "교차하는 사슬",
      "칼바람",
      "수호자",
      "계승자"
    ]
  },
  "장궁병": {
    "무기": [
      "타오르는 영광",
      "바위 칼날",
      "억눌린 충동",
      "죽음",
      "광채+",
      "대군주+",
      "눈부신 잔영",
      "오랜 광기",
      "거대한 분노",
      "햇살+"
    ],
    "엠블럼": [
      "영원한 밤",
      "위대함",
      "빛바랜 별",
      "해방",
      "초월",
      "고결함",
      "침묵",
      "태초",
      "백금 천칭"
    ],
    "장신구": [
      "호응+",
      "초음파+",
      "돌개+",
      "끈질김+",
      "파쇄+",
      "내상+",
      "비연+",
      "무너짐+",
      "집중+"
    ],
    "방어구": [
      "기본기+",
      "흐릿한 형상",
      "뼈 인장",
      "칼바람",
      "잠든 땅",
      "가라앉은 왕국",
      "아귀",
      "끓는 피",
      "첫 번째 서약"
    ]
  },
  "마법사": {
    "무기": [
      "계시+",
      "타오르는 영광",
      "바위 칼날",
      "광채+",
      "죽음",
      "억눌린 충동",
      "거대한 분노",
      "대군주+",
      "햇살+",
      "추적자"
    ],
    "엠블럼": [
      "빛바랜 별",
      "고결함",
      "영원한 밤",
      "위대함",
      "해방",
      "초월",
      "침묵",
      "백금 천칭",
      "태초"
    ],
    "장신구": [
      "운석+",
      "우레+",
      "서리가시+",
      "빙창+",
      "낙뢰+",
      "산사태+",
      "아귀",
      "암석+",
      "증폭+"
    ],
    "방어구": [
      "봉인술사",
      "별바라기",
      "계승자",
      "금 간 봉인",
      "승전",
      "무한한 탐욕",
      "첫 번째 서약",
      "흐릿한 형상",
      "녹슨 방패",
      "번개 숨결"
    ]
  },
  "화염술사": {
    "무기": [
      "바위 칼날",
      "광채+",
      "타오르는 영광",
      "창백한 기수",
      "죽음",
      "계시+",
      "억눌린 충동",
      "불꽃으로 새긴 문장",
      "햇살+",
      "거대한 분노"
    ],
    "엠블럼": [
      "영원한 밤",
      "위대함",
      "해방",
      "빛바랜 별",
      "초월",
      "고결함",
      "태초",
      "침묵",
      "백금 천칭"
    ],
    "장신구": [
      "폭격+",
      "분출+",
      "청염+",
      "불기둥+",
      "잿더미+",
      "발화+",
      "화력+",
      "열풍+",
      "불씨+"
    ],
    "방어구": [
      "별바라기",
      "뼈 인장",
      "첫 번째 서약",
      "무너진 경계",
      "금 간 봉인",
      "잠들지 않는 불",
      "얼음 발톱",
      "수정+",
      "기본기+",
      "녹슨 방패"
    ]
  },
  "빙결술사": {
    "무기": [
      "바위 칼날",
      "광채+",
      "대군주+",
      "계시+",
      "죽음",
      "타오르는 영광",
      "거대한 분노",
      "햇살+",
      "추적자",
      "창백한 기수"
    ],
    "엠블럼": [
      "해방",
      "빛바랜 별",
      "초월",
      "영원한 밤",
      "위대함",
      "태초",
      "침묵",
      "고결함",
      "백금 천칭"
    ],
    "장신구": [
      "설원+",
      "빙하+",
      "북풍+",
      "빙검+",
      "오로라+",
      "수정+",
      "파편+",
      "고드름+"
    ],
    "방어구": [
      "서광",
      "위엄",
      "금 간 봉인",
      "칼바람",
      "잿빛 장막",
      "녹슨 방패",
      "잠들지 않는 불",
      "숲 길잡이",
      "승전"
    ]
  },
  "전격술사": {
    "무기": [
      "계시+",
      "광채+",
      "타오르는 영광",
      "죽음",
      "억눌린 충동",
      "바위 칼날",
      "거대한 분노",
      "암운+",
      "오랜 광기",
      "창백한 기수"
    ],
    "엠블럼": [
      "위대함",
      "초월",
      "태초",
      "영원한 밤",
      "빛바랜 별",
      "고결함",
      "해방",
      "침묵",
      "백금 천칭"
    ],
    "장신구": [
      "섬광+",
      "폭풍우+",
      "도관+",
      "천둥+",
      "방전+",
      "환기+",
      "장막+",
      "벼락+",
      "역장+"
    ],
    "방어구": [
      "기본기+",
      "봉인술사",
      "금 간 봉인",
      "첫 번째 서약",
      "별바라기",
      "흐릿한 형상",
      "녹슨 방패",
      "날 선 적의",
      "번개 숨결"
    ]
  },
  "힐러": {
    "무기": [
      "바위 칼날",
      "계시+",
      "햇살+",
      "타오르는 영광",
      "대군주+",
      "죽음",
      "불꽃으로 새긴 문장",
      "거대한 분노",
      "억눌린 충동",
      "추적자"
    ],
    "엠블럼": [
      "해방",
      "영원한 밤",
      "초월",
      "고결함",
      "태초",
      "백금 천칭",
      "빛바랜 별",
      "위대함",
      "침묵"
    ],
    "장신구": [
      "가호+",
      "광륜+",
      "물결+",
      "개화+",
      "억압+",
      "서약+",
      "고동침+",
      "빛무리+",
      "감쌈+"
    ],
    "방어구": [
      "긍지",
      "교차하는 사슬",
      "금 간 봉인",
      "비늘 덮인 현자",
      "승전",
      "별바라기",
      "잿빛 장막",
      "뼈 인장",
      "무너진 경계"
    ]
  },
  "사제": {
    "무기": [
      "계시+",
      "광채+",
      "바위 칼날",
      "죽음",
      "타오르는 영광",
      "오랜 광기",
      "거대한 분노",
      "부패+",
      "억눌린 충동",
      "대군주+"
    ],
    "엠블럼": [
      "위대함",
      "영원한 밤",
      "초월",
      "빛바랜 별",
      "고결함",
      "해방",
      "침묵",
      "백금 천칭"
    ],
    "장신구": [
      "집행+",
      "심판+",
      "성전+",
      "결속+",
      "날개+",
      "수레바퀴+",
      "빛줄기+",
      "축복+",
      "희생+"
    ],
    "방어구": [
      "뼈 인장",
      "별바라기",
      "승전",
      "긍지",
      "무너진 경계",
      "숲 길잡이",
      "빛줄기+",
      "축성+",
      "사슬로 묶은 법전",
      "대군주+"
    ]
  },
  "수도사": {
    "무기": [
      "바위 칼날",
      "두 갈래 뿔",
      "오랜 광기",
      "눈부신 잔영",
      "죽음",
      "광채+",
      "거대한 분노",
      "부패+",
      "억눌린 충동",
      "암운+"
    ],
    "엠블럼": [
      "영원한 밤",
      "고결함",
      "해방",
      "백금 천칭",
      "위대함",
      "초월",
      "빛바랜 별",
      "태초",
      "침묵"
    ],
    "장신구": [
      "등불+",
      "뇌정+",
      "인과+",
      "해일+",
      "업화+",
      "광휘+",
      "응보+",
      "축성+"
    ],
    "방어구": [
      "긍지",
      "열의+",
      "금 간 봉인",
      "비늘 덮인 현자",
      "잠든 땅",
      "칼바람",
      "숲 길잡이",
      "끓는 피",
      "잠들지 않는 불"
    ]
  },
  "암흑술사": {
    "무기": [
      "바위 칼날",
      "죽음",
      "광채+",
      "억눌린 충동",
      "계시+",
      "눈부신 잔영",
      "창백한 기수",
      "햇살+",
      "두 갈래 뿔",
      "타오르는 영광"
    ],
    "엠블럼": [
      "영원한 밤",
      "해방",
      "빛바랜 별",
      "초월",
      "백금 천칭",
      "고결함",
      "위대함",
      "태초",
      "침묵"
    ],
    "장신구": [
      "구속+",
      "광기+",
      "나락+",
      "타락+",
      "절제+",
      "속박+",
      "제사장+",
      "심연+",
      "착취+"
    ],
    "방어구": [
      "바다뱀+",
      "봉인술사",
      "첫 번째 서약",
      "용 사냥꾼",
      "무형",
      "기본기+",
      "끓는 피",
      "비늘 덮인 현자",
      "교차하는 사슬",
      "잠든 땅"
    ]
  },
  "음유시인": {
    "무기": [
      "대군주+",
      "타오르는 영광",
      "죽음",
      "두 갈래 뿔",
      "암운+",
      "바위 칼날",
      "억눌린 충동",
      "창백한 기수",
      "오랜 광기",
      "광채+"
    ],
    "엠블럼": [
      "침묵",
      "백금 천칭",
      "영원한 밤",
      "해방",
      "초월",
      "고결함",
      "위대함",
      "태초"
    ],
    "장신구": [
      "합주+",
      "무아+",
      "화음+",
      "조롱+",
      "변주+",
      "급습+",
      "재치+",
      "기만+",
      "즉흥+"
    ],
    "방어구": [
      "긍지",
      "무너진 경계",
      "잿빛 장막",
      "기본기+",
      "비늘 덮인 현자",
      "사슬로 묶은 법전",
      "용 사냥꾼",
      "바다뱀+",
      "칼바람",
      "가라앉은 왕국"
    ]
  },
  "댄서": {
    "무기": [
      "바위 칼날",
      "광채+",
      "햇살+",
      "거대한 분노",
      "억눌린 충동",
      "불꽃으로 새긴 문장",
      "타오르는 영광",
      "죽음",
      "부패+",
      "대군주+"
    ],
    "엠블럼": [
      "초월",
      "해방",
      "영원한 밤",
      "위대함",
      "고결함",
      "빛바랜 별",
      "침묵",
      "백금 천칭",
      "태초"
    ],
    "장신구": [
      "발걸음+",
      "환호+",
      "전환+",
      "갈채+",
      "나비+",
      "정열+",
      "간결함+",
      "다가옴+",
      "산뜻함+"
    ],
    "방어구": [
      "계승자",
      "녹슨 방패",
      "공허",
      "뼈 인장",
      "잠든 땅",
      "기본기+",
      "끓는 피",
      "열의+",
      "긍지",
      "교차하는 사슬"
    ]
  },
  "악사": {
    "무기": [
      "바위 칼날",
      "광채+",
      "억눌린 충동",
      "계시+",
      "타오르는 영광",
      "대군주+",
      "햇살+",
      "고결함",
      "거대한 분노",
      "죽음"
    ],
    "엠블럼": [
      "해방",
      "영원한 밤",
      "초월",
      "빛바랜 별",
      "위대함",
      "고결함",
      "태초",
      "침묵",
      "백금 천칭"
    ],
    "장신구": [
      "조율+",
      "순환+",
      "속주+",
      "종장+",
      "매혹+",
      "흥성+",
      "공명+",
      "박애+",
      "이중주+"
    ],
    "방어구": [
      "뼈 인장",
      "칼바람",
      "바다뱀+",
      "무형",
      "빛살+",
      "여신",
      "잠든 땅",
      "기본기+",
      "이중주+",
      "무너진 경계"
    ]
  },
  "도적": {
    "무기": [
      "부패+",
      "바위 칼날",
      "두 갈래 뿔",
      "죽음",
      "햇살+",
      "억눌린 충동",
      "추적자",
      "오랜 광기",
      "암운+",
      "타오르는 영광"
    ],
    "엠블럼": [
      "영원한 밤",
      "백금 천칭",
      "초월",
      "해방",
      "태초",
      "위대함",
      "빛바랜 별",
      "침묵",
      "고결함"
    ],
    "장신구": [
      "폭발+",
      "덫+",
      "땅거미+",
      "독무+",
      "투척+",
      "교활함+",
      "독성+",
      "치밀함+",
      "주입+"
    ],
    "방어구": [
      "기본기+",
      "열의+",
      "금 간 봉인",
      "무너진 경계",
      "뼈 인장",
      "빛줄기+",
      "축복+",
      "날 선 적의",
      "용 사냥꾼",
      "여신"
    ]
  },
  "격투가": {
    "무기": [
      "타오르는 영광",
      "죽음",
      "억눌린 충동",
      "바위 칼날",
      "햇살+",
      "계시+",
      "암운+",
      "광채+",
      "부패+",
      "거대한 분노"
    ],
    "엠블럼": [
      "영원한 밤",
      "위대함",
      "초월",
      "고결함",
      "해방",
      "빛바랜 별",
      "태초",
      "침묵",
      "백금 천칭"
    ],
    "장신구": [
      "승천+",
      "강격+",
      "전진+",
      "약점+",
      "열혈+",
      "격파+",
      "순발력+",
      "충돌+",
      "도약+"
    ],
    "방어구": [
      "녹슨 방패",
      "용 사냥꾼",
      "날 선 적의",
      "무형",
      "기본기+",
      "가라앉은 왕국",
      "은빛 찬가",
      "잠든 땅",
      "별바라기",
      "교차하는 사슬"
    ]
  },
  "듀얼블레이드": {
    "무기": [
      "바위 칼날",
      "죽음",
      "억눌린 충동",
      "두 갈래 뿔",
      "암운+",
      "불꽃으로 새긴 문장",
      "추적자",
      "오랜 광기",
      "타오르는 영광",
      "창백한 기수"
    ],
    "엠블럼": [
      "해방",
      "영원한 밤",
      "초월",
      "백금 천칭",
      "침묵",
      "고결함",
      "위대함",
      "태초",
      "빛바랜 별"
    ],
    "장신구": [
      "교차+",
      "천칭+",
      "질주+",
      "강화+",
      "속행+",
      "보름달+",
      "열상+",
      "회오리+",
      "기본+"
    ],
    "방어구": [
      "교차하는 사슬",
      "숲 길잡이",
      "금 간 봉인",
      "무한한 탐욕",
      "잠들지 않는 불",
      "수호자",
      "용 사냥꾼",
      "사슬로 묶은 법전",
      "잠든 땅"
    ]
  }
}
},{}],22:[function(require,module,exports){
module.exports={
  "123": [
    {
      "job": "마법사",
      "note": "운석/우레/서리가시, 원소방해강타"
    },
    {
      "job": "수도사",
      "note": "뇌해정, 등불/인과/뇌정, 연타보조이동방해"
    }
  ],
  "124": [
    {
      "job": "검방",
      "note": "맹돌"
    }
  ],
  "125": [
    {
      "job": "전격술사",
      "note": "천도섬"
    },
    {
      "job": "대검전사",
      "note": "마이너빌드-회반광"
    }
  ],
  "134": [
    {
      "job": "도적",
      "note": "독딜위주"
    },
    {
      "job": "힐러",
      "note": "물광서"
    },
    {
      "job": "마법사",
      "note": "단일딜"
    },
    {
      "job": "음유시인",
      "note": "무아/합주/변주, 방해보조연타강타, 변주-급습"
    }
  ],
  "135": [
    {
      "job": "화염술사",
      "note": "청"
    },
    {
      "job": "궁수"
    },
    {
      "job": "사제",
      "note": "딜, 서먼링커 사용"
    },
    {
      "job": "댄서"
    },
    {
      "job": "기사",
      "note": "돌맹용, 용기/돌파/지진, 강타보조생존연타소환"
    }
  ],
  "136": [
    {
      "job": "장궁병",
      "note": "시즌0빌드"
    },
    {
      "job": "화염술사",
      "note": "분출/청염/폭격, 원소강타연타방해"
    }
  ],
  "145": [
    {
      "job": "기사",
      "note": "돌격명, 용기/돌파/격돌, 강타보조연타"
    }
  ],
  "146": [
    {
      "job": "빙결술사"
    }
  ],
  "156": [
    {
      "job": "화염술사",
      "note": "잿더미, 분출/잿더미/불기둥, 원소강타연타"
    },
    {
      "job": "격투가",
      "note": "약점"
    },
    {
      "job": "전격술사"
    },
    {
      "job": "듀얼블레이드"
    },
    {
      "job": "궁수",
      "note": "닻/매/날렵함, 강타언타방해, 오토 광역"
    },
    {
      "job": "대검전사",
      "note": "마이너빌드-회광봉"
    },
    {
      "job": "기사",
      "note": "용기/돌파/? 잔영세팅"
    }
  ],
  "234": [
    {
      "job": "석궁사수"
    },
    {
      "job": "검방",
      "note": "붕극"
    },
    {
      "job": "음유시인"
    },
    {
      "job": "도적",
      "note": "스킬 딜위주, 덫/폭발/땅거미, 방해강타연타"
    }
  ],
  "235": [
    {
      "job": "사제",
      "note": "날개사용"
    },
    {
      "job": "악사",
      "note": "흉매종, 조율/순환/매혹, 방해연타보조"
    }
  ],
  "245": [
    {
      "job": "암흑술사",
      "note": "구속/광기/절제, 소환방해연타보조"
    },
    {
      "job": "전격술사",
      "note": "섬광/도관/폭풍우, 원소강타보조방해보조쿨"
    }
  ],
  "246": [
    {
      "job": "전사",
      "note": "붕괴/극점/맹공, 강타방해이동보조생존, 궁극기"
    }
  ],
  "256": [
    {
      "job": "전격술사",
      "note": "섬광/도관/천둥"
    }
  ],
  "345": [
    {
      "job": "검술사",
      "note": "3스 자주쓸때"
    },
    {
      "job": "악사",
      "note": "조속종, 조율/속주/종장, 방해강타연타"
    },
    {
      "job": "힐러",
      "note": "물결or고동/광륜 개화, 광륜/가호/물결, 보조연타보조쿨소환"
    }
  ],
  "346": [
    {
      "job": "장궁병",
      "note": "초내돌"
    }
  ],
  "356": [
    {
      "job": "댄서",
      "note": "연구중빌드-최고점 딜 연구중, 전환/발걸음/환호, 연타이동강타보조"
    }
  ],
  "456": [
    {
      "job": "대검전사",
      "note": "회탄광, 탄력/광전사/반격, 강타보조강타쿨보조쿨"
    },
    {
      "job": "격투가",
      "note": "격파, 전진/강격/승천, 강타이동보조"
    },
    {
      "job": "검술사",
      "note": "3스 안쓸때, 관통/평정/일섬, 강타연타이동보조"
    },
    {
      "job": "빙결술사",
      "note": "빙하/북풍/설원, 원소소환생존강타"
    },
    {
      "job": "듀얼블레이드",
      "note": "천침/교차/강화, 연타이동강타보조"
    }
  ]
}
},{}],23:[function(require,module,exports){

/**
 * index.js
 * ---------
 * 빌드 엔트리 포인트.
 */

var GoombaBot = require("./core/config.js").GoombaBot;
var GoombaBotConfig = require("./core/config.js").GoombaBotConfig;

require("./commands/search.js");
require("./commands/market.js");
require("./commands/resistance.js");
require("./commands/jobguide.js");
require("./commands/maintenance.js");
require("./commands/homework.js");
require("./commands/officialnews.js");
require("./commands/fun.js");
require("./commands/admin.js");
require("./commands/botcontrol.js");

// ===== INITIALIZATION ================================================
if (typeof GoombaBotRuntime !== "undefined") {
  GoombaBotRuntime.dispatchCommand = GoombaBot.dispatchCommand;
  GoombaBotRuntime.dispatchTick = GoombaBot.dispatchTick;
  GoombaBotRuntime.dispatchMessage = GoombaBot.dispatchMessage;
  GoombaBotRuntime.GoombaBot = GoombaBot;
  GoombaBot.log(
    "GoombaBot(로더 모드) 갱신 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개"
  );
} else {
  GoombaBot.bot = BotManager.getCurrentBot();
  GoombaBot.bot.setCommandPrefix(GoombaBotConfig.commandPrefix);
  GoombaBot.bot.addListener(Event.COMMAND, GoombaBot.dispatchCommand);
  GoombaBot.bot.addListener(Event.TICK, GoombaBot.dispatchTick);

  // ⚠️ !어구감시 시작의 "다음 시간을 입력해주세요" 대화 흐름을 위해 일반 메시지도
  // 받아야 한다. 이 메신저봇R 버전에 Event.MESSAGE가 없거나 다르면 여기서 조용히
  // 실패하고, 나머지 기능(!명령어들)은 전혀 영향 없이 정상 동작한다.
  try {
    GoombaBot.bot.addListener(Event.MESSAGE, GoombaBot.dispatchMessage);
  } catch (messageListenerError) {
    GoombaBot.log("Event.MESSAGE 등록 실패(어구감시 대화형 입력 비활성) - 원인: " + messageListenerError);
  }

  GoombaBot.log(
    "GoombaBot 초기화 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개 등록됨 (prefix: " + GoombaBotConfig.commandPrefix + ")"
  );
}


},{"./commands/admin.js":1,"./commands/botcontrol.js":2,"./commands/fun.js":3,"./commands/homework.js":4,"./commands/jobguide.js":5,"./commands/maintenance.js":6,"./commands/market.js":7,"./commands/officialnews.js":8,"./commands/resistance.js":9,"./commands/search.js":10,"./core/config.js":13}]},{},[23]);
