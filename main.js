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
        { label: "검은구멍", path: GoombaBotConfig.endpoints.deepHoleConfig }
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
})();

module.exports = { GoombaBot: GoombaBot };

},{"../core/api.js":8,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],2:[function(require,module,exports){
/**
 * commands/botcontrol.js
 * ------------------------
 * 관리자 전용 봇 제어 명령어(!굼바봇 상태/켜기/끄기/재시작/업데이트)를 담당한다.
 * 마리오 굼바 세계관 테마 적용: 👑 대왕굼바(신수아) / 🍄 굼바봇(길드 지원병) /
 * ❄️ 빙결굼바(굼바굼바_빙결). 관리자에게는 "관리자님"이 아니라 "대왕굼바님"으로 응답한다.
 *
 * ⚠️ "!굼바봇 업데이트"는 GitHub의 최신 코드를 실시간으로 반영하지 못한다 (자세한 이유는
 * update() 함수 안 주석 참고 - Browserify 번들 + eval의 스코프 규칙 때문에 근본적으로
 * 불가능함을 확인했다). 그래서 "새 버전이 있는지 확인해서 알려주는" 역할까지만 한다.
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
    if (!GoombaBotConfig.githubMainJsRawUrl) {
      chat.reply([
        "\u26A0\uFE0F githubMainJsRawUrl이 아직 설정되지 않았습니다.",
        "config.js에 실제 GitHub raw main.js 주소를 넣어주셔야 합니다.",
        "예: https://raw.githubusercontent.com/사용자명/저장소명/main/main.js.b64"
      ].join("\n"));
      return;
    }

    var hasLoader = (typeof GoombaBotRuntime !== "undefined");
    if (!hasLoader) {
      chat.reply([
        "\u26A0\uFE0F 지금은 로더(loader.js) 없이 main.js를 직접 붙여넣은 방식으로 실행 중입니다.",
        "이 경우 최신 코드를 실시간으로 반영할 수 없습니다 (직접 eval은 이 함수 안에서만",
        "적용되고 끝나버립니다 - JavaScript 자체의 스코프 규칙).",
        "",
        "실시간 반영을 원하시면 메신저봇R에 loader.js를 대신 붙여넣어 주세요",
        "(README.md의 \"로더 전환 방법\" 참고). 그 전까지는 GitHub → 빌드 → 메신저봇R에",
        "직접 붙여넣기로 갱신해주세요."
      ].join("\n"));
      return;
    }

    try {
      var url = String(GoombaBotConfig.githubMainJsRawUrl);
      var b64Text = GoombaBot.http.getRawText(url, 20000);

      if (!b64Text || b64Text.length < 100) throw new Error("받아온 코드가 비정상적으로 짧습니다 (" + (b64Text ? b64Text.length : 0) + "자)");

      // ⚠️ GitHub에는 main.js가 아니라 main.js.b64(base64)를 올려둔다 - Http.requestSync가
      // 반환하는 jsoup Document가 응답을 HTML로 취급해서, 순수 JS 코드를 그대로 받으면
      // <, >, & 등이 손상되어 eval 시 SyntaxError가 나는 것이 실기기에서 확인됐다.
      // base64는 그런 문자가 전혀 없어서 안전하다.
      var newCode = GoombaBot.http.base64Decode(b64Text);
      if (!newCode || newCode.length < 200) throw new Error("디코딩된 코드가 비정상적으로 짧습니다 (" + (newCode ? newCode.length : 0) + "자)");

      // ⚠️ 반드시 간접 eval을 써야 한다 (직접 eval을 쓰면 이 함수 지역 스코프에만 반영되고
      // 함수가 끝나는 순간 사라진다 - ECMAScript 명세, Node.js로 재현/검증함).
      // eval을 변수에 담아서 호출하면 "간접 호출"이 되어 전역 스코프에서 실행된다.
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
        "업데이트는 GitHub 최신 버전 확인까지만 하고, 실제 반영은 직접 해주셔야 합니다"
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

},{"../core/api.js":8,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],3:[function(require,module,exports){
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
    "누가 공주일까....공구일까 뚠일까... 뚠일까 공구일까... 그것이 문제로다....(둘이 알아서 정해서 알려주면 수정 예정 ^^)",
    "개미는 뚠뚠 오늘도 뚠뚠~",
    "3메다72 (계속 자라는 중)"
  ],
  "공구": [
    "누가 공주일까....공구일까 뚠일까... 뚠일까 공구일까... 그것이 문제로다....(둘이 알아서 정해서 알려주면 수정 예정 ^^)",
    "신육공",
    "신씨 실세"
  ],
  "몽": [
    "검술을 했다~",
    "석궁을 했다~",
    "추억이 됐다~",
    "다시 직변했다.",
    "내 사랑은 검술이었지만 다시 석궁.",
    "비틱으로는 세계 최강."
  ],
  "자몽": [
    "검술을 했다~",
    "석궁을 했다~",
    "추억이 됐다~",
    "다시 직변했다.",
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

},{"../core/cache.js":9,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],4:[function(require,module,exports){
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
          out.push((entryName ? "\u25B8 " + entryName : "\u25B8 " + (i + 1) + "\uBC88\uC9F8 \uC9C0\uC5ED") + (entryLines.length ? "\n" + entryLines.join("\n") : ""));
        }
      } else {
        out = F.renderDetailAll(config, {});
      }
      if (out.length === 0) { chat.reply(F.emoji.warn + " 검은 구멍 응답에서 표시할 필드를 찾지 못했습니다. !진단 9로 실제 구조를 확인해주세요."); return; }
      chat.reply(F.box("\uD83D\uDD73 검은 구멍", out));
    }
  });

  // ---- !어구 / !심구 / !숙제 (API 미확인 - TODO) ----
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
  makeTodoCommand("어구", "어비스 구멍");
  makeTodoCommand("심구", "심층 구멍");
  makeTodoCommand("숙제", "오늘의 숙제");
})();

module.exports = { GoombaBot: GoombaBot };

},{"../core/api.js":8,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],5:[function(require,module,exports){
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
    category: "공지", summary: "최근 공지 5개", usage: ["!공지"],
    detail: { title: F.emoji.notice + " 공지 조회", examples: ["!공지"], features: ["최근 공지 5개를 보여줍니다"] },
    execute: function (chat) {
      var notices = P.getNotices(5);
      if (notices.length === 0) { chat.reply(F.emoji.warn + " 공지사항을 가져오지 못했습니다."); return; }
      var lines = [];
      for (var i = 0; i < notices.length; i++) lines.push("\u25B8 " + extractField(notices[i], ["title", "name"]));
      chat.reply(F.box(F.emoji.notice + " 최신 공지 " + notices.length + "개", lines));
    }
  });

  // ---- !점검 ----
  GoombaBot.registerCommand("점검", {
    category: "공지", summary: "점검 상태 확인 (🟢/🔴 아이콘)", usage: ["!점검"],
    detail: { title: F.emoji.maintenance + " 점검 상태", examples: ["!점검"], features: ["🟢 정상운영 / 🔴 점검중을 한눈에 보여줍니다"] },
    execute: function (chat) {
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

},{"../core/api.js":8,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],6:[function(require,module,exports){
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
  function fetchAllMarketPrices() {
    var all = [], pageSize = 200;
    for (var page = 0; page < 20; page++) {
      var json = GoombaBot.http.getJson(E.marketPrices + "?sort=pct_change_24h_desc&limit=" + pageSize + "&offset=" + (page * pageSize));
      var items = toArray(json);
      all = all.concat(items);
      if (items.length < pageSize) break;
    }
    return all;
  }
  function getMarketCatalog() {
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
  }
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

  function formatBlock(item) {
    var name = String(extractField(item, ["name", "title"]));
    var price = GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0));
    var count = extractField(item, ["total_count", "totalCount"]);
    var lines = [name, price + " \uB370\uCE74"];
    if (count !== null) lines.push(count + "\uAC1C");
    return lines.join("\n");
  }

  // ---- !시세 ----
  GoombaBot.registerCommand("시세", {
    category: "거래소", summary: "거래소 시세 조회 (카테고리/세트 검색 지원)", usage: ["!시세 아이템명", "!시세 마력석"],
    detail: {
      title: F.emoji.market + " 거래소 시세", examples: ["!시세 켈틱류트", "!시세 마력석"],
      features: ["검색어가 여러 아이템에 걸치면(예: 마력석/영혼석 세트) 전부 한 번에, 이름순으로 정렬해서 보여줍니다", "가격/등록개수/갱신시간이 항상 같이 표시됩니다"]
    },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!시세 아이템명", "!시세 마력석"])); return; }
      var results = P.searchMarket(keyword);
      if (results.length === 0) {
        var allNames = [];
        var catalog = P.getMarketCatalog();
        for (var ni = 0; ni < catalog.length; ni++) allNames.push(String(extractField(catalog[ni], ["name", "title"])));
        var suggestions = GoombaBot.search.suggest(allNames, keyword, 3);
        var failLines = [F.emoji.error + ' "' + keyword + '" 시세 정보를 찾지 못했습니다.'];
        if (suggestions.length) {
          failLines.push("", "혹시 아래를 찾으셨나요?");
          for (var si = 0; si < suggestions.length; si++) failLines.push(F.emoji.search + " " + suggestions[si]);
        }
        chat.reply(failLines.join("\n"));
        return;
      }

      if (results.length === 1) {
        var item = results[0];
        var name = String(extractField(item, ["name", "title"]));
        chat.reply(F.box(F.emoji.market + " " + name + " 시세", [
          F.field("최저가", GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0)) + " 데카"),
          F.field("등록 개수", extractField(item, ["total_count", "totalCount"])),
          F.field("1시간 변동", F.changeArrow(Number(extractField(item, ["pct_change_1h", "pctChange1h"]) || 0))),
          F.field("24시간 변동", F.changeArrow(Number(extractField(item, ["pct_change_24h", "pctChange24h"]) || 0))),
          F.field("7일 변동", F.changeArrow(Number(extractField(item, ["pct_change_7d", "pctChange7d"]) || 0))),
          "", F.emoji.clock + " 갱신 : " + formatSyncedAt()
        ]));
        return;
      }

      // 여러 개 일치 - 카테고리/세트 검색으로 보고, 이름순 정렬해서 항목 단위로 자동분할
      var sorted = results.slice().sort(function (a, b) {
        var an = String(extractField(a, ["name", "title"]));
        var bn = String(extractField(b, ["name", "title"]));
        return an < bn ? -1 : (an > bn ? 1 : 0);
      });
      var blocks = [];
      for (var i = 0; i < sorted.length; i++) blocks.push(formatBlock(sorted[i]));
      var chunks = F.chunkBlocks(blocks, 1200);
      for (var c = 0; c < chunks.length; c++) {
        var header = [F.field("총", sorted.length + "개")];
        if (chunks.length > 1) header.push(F.field("묶음", (c + 1) + " / " + chunks.length));
        header.push("");
        chat.reply(F.box(F.emoji.market + ' "' + keyword + '" 시세', header.concat([chunks[c].join("\n\n"), "", F.emoji.clock + " 갱신 : " + formatSyncedAt()])));
      }
    }
  });

})();

module.exports = { GoombaBot: GoombaBot };

},{"../core/api.js":8,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],7:[function(require,module,exports){
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
  function getRunes() { return fetchCached("runes", GoombaBotConfig.cacheTtlMs.default, E.runes, null, { timeout: 20000 }); }
  function searchRunes(keyword) { return GoombaBot.search.fuzzyFilter(getRunes(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  function getRuneUsage() {
    // TODO: usage-batch 응답의 정확한 형태(룬 이름별 사용률 매핑인지, 배열인지)를 실제로
    // 확인 후 이 함수를 다듬어주세요. 지금은 배열/객체 둘 다 최대한 방어적으로 처리합니다.
    var cacheKey = "rune_usage";
    var cached = GoombaBot.storage.read(cacheKey, GoombaBotConfig.cacheTtlMs.default);
    if (cached) return cached;
    try {
      var json = GoombaBot.http.getJson(E.runeUsage);
      GoombaBot.storage.write(cacheKey, json);
      return json;
    } catch (e) {
      GoombaBot.log("룬 사용률 조회 실패: " + e);
      return GoombaBot.storage.readStale(cacheKey) || null;
    }
  }

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
  function getRuneWords() { return fetchCached("rune_words_v2", GoombaBotConfig.cacheTtlMs.default, E.runeWords, "words"); }
  function searchRuneWords(keyword) { return GoombaBot.search.fuzzyFilter(getRuneWords(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  // ---- 인챈트 ----
  function getEnchants() { return fetchCached("enchants", GoombaBotConfig.cacheTtlMs.default, E.enchants); }
  function searchEnchants(keyword) { return GoombaBot.search.fuzzyFilter(getEnchants(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  // ---- 아티팩트 ----
  function getArtifacts() { return fetchCached("artifacts", GoombaBotConfig.cacheTtlMs.default, E.artifacts); }
  function searchArtifacts(keyword) { return GoombaBot.search.fuzzyFilter(getArtifacts(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  // ---- 칭호 ----
  function getTitles() { return fetchCached("titles", GoombaBotConfig.cacheTtlMs.default, E.titles); }

  // ---- 아이템 ----
  function getItems() { return fetchCached("items", GoombaBotConfig.cacheTtlMs.default, E.items); }
  function searchItems(keyword) { return GoombaBot.search.fuzzyFilter(getItems(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  GoombaBot.provider.getRunes = getRunes;
  GoombaBot.provider.searchRunes = searchRunes;
  GoombaBot.provider.findUsageFor = findUsageFor;
  GoombaBot.provider.getRuneWords = getRuneWords;
  GoombaBot.provider.searchRuneWords = searchRuneWords;
  GoombaBot.provider.getEnchants = getEnchants;
  GoombaBot.provider.searchEnchants = searchEnchants;
  GoombaBot.provider.getArtifacts = getArtifacts;
  GoombaBot.provider.searchArtifacts = searchArtifacts;
  GoombaBot.provider.getTitles = getTitles;
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

  var SUB_LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";

  /** 배열을 ①②③ 번호목록으로 렌더링 (필요 룬 등) - 요소가 객체면 name만 추출 */
  function formatNumberedList(items) {
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var label = (it && typeof it === "object") ? String(extractField(it, ["name", "title"]) || F.objectSummary(it)) : String(it);
      lines.push(F.circled(i + 1) + " " + label);
    }
    return lines.join("\n");
  }

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
   * 상세 출력 - "🔮 이름 / [등급 · 분류] / 설명 본문(그대로) / ━━━ / 나머지 필드"
   * order에 명시된 필드만 보여준다(허용목록) - API 내부 필드(scroll_type 등)가 몰라도
   * 자동으로 안 보임. 등급/분류/본문으로 이미 쓰인 필드는 order에 있어도 중복 제거된다.
   */
  function formatDetailCard(emojiChar, obj, detailOptions) {
    detailOptions = detailOptions || {};
    var name = nameOf(obj);
    var gradeM = extractFieldWithKey(obj, ["grade", "rarity", "tier"]);
    var categoryM = extractFieldWithKey(obj, ["category", "part", "type", "artifact_type", "scroll_type"]);
    var tag = [gradeM.value, categoryM.value].filter(function (v) { return !!v; }).join(" \u00B7 ");

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

    var usedKeys = { };
    if (gradeM.key) usedKeys[gradeM.key] = true;
    if (categoryM.key) usedKeys[categoryM.key] = true;
    if (bodyKey) usedKeys[bodyKey] = true;
    var order = (detailOptions.order || []).filter(function (k) { return !usedKeys[k]; });

    var fieldLines = F.renderDetail(obj, { order: order });

    var out = [emojiChar + " " + name];
    if (tag) out.push("[" + tag + "]");
    if (bodyText) { out.push(""); out.push(bodyText); }
    if (fieldLines.length) { out.push(""); out.push(SUB_LINE); out.push(""); out.push(fieldLines.join("\n")); }
    return out.join("\n");
  }

  var CHOSUNG_ORDER = ["\u3131", "\u3134", "\u3137", "\u3139", "\u3141", "\u3142", "\u3145", "\u3147", "\u3148", "\u314A", "\u314B", "\u314C", "\u314D", "\u314E"];

  function sortKo(arr) {
    return arr.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
  }

  /** 도감(전체 목록) - 초성별로 그룹화("ㄱ\n\n이름1\n이름2...")해서 가독성 개선, 전체를 자동 분할 전송 */
  function runCatalogCommand(chat, getAllFn, catLabel, emojiChar) {
    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    var groups = {};
    var etcNames = [];
    for (var i = 0; i < all.length; i++) {
      var nm = nameOf(all[i]);
      var initial = GoombaBot.search.extractChosung(nm.charAt(0));
      if (CHOSUNG_ORDER.indexOf(initial) !== -1) {
        if (!groups[initial]) groups[initial] = [];
        groups[initial].push(nm);
      } else {
        etcNames.push(nm);
      }
    }

    var blocks = [];
    for (var c = 0; c < CHOSUNG_ORDER.length; c++) {
      var g = groups[CHOSUNG_ORDER[c]];
      if (!g || g.length === 0) continue;
      blocks.push(CHOSUNG_ORDER[c] + " (" + g.length + "\uAC1C)\n\n" + sortKo(g).join("\n"));
    }
    if (etcNames.length) blocks.push("\uAE30\uD0C0 (" + etcNames.length + "\uAC1C)\n\n" + sortKo(etcNames).join("\n"));

    var chunks = F.chunkBlocks(blocks, 1200);
    for (var k = 0; k < chunks.length; k++) {
      var header = [F.field("총", all.length + "개")];
      if (chunks.length > 1) header.push(F.field("묶음", (k + 1) + " / " + chunks.length));
      chat.reply(F.box(emojiChar + " " + catLabel + " 도감", header.concat([""], [chunks[k].join("\n\n")])));
    }
  }

  /** 검색형 명령어 공통 실행기: 결과 1개=상세, 여러개=첫결과 상세+비슷한결과, 0개=비슷한 이름 추천 */
  function runSearchCommand(chat, keyword, getAllFn, searchFn, catLabel, emojiChar, detailOptions, usageExamples) {
    if (!keyword) { chat.reply(F.usageBlock(usageExamples)); return; }

    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    var results = searchFn(keyword);
    if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }

    var detailText = formatDetailCard(emojiChar, results[0], detailOptions);
    if (results.length === 1) { chat.reply(detailText); return; }

    var otherNames = [];
    for (var i = 1; i < results.length && otherNames.length < 7; i++) otherNames.push(nameOf(results[i]));
    chat.reply(detailText + F.similarBlock(otherNames));
  }

  // ---- !룬 ----
  GoombaBot.registerCommand("룬", {
    category: "정보", summary: "룬 검색 (설명/등급/추천직업/사용률 전체 표시)", usage: ["!룬 화염", "!룬 도감"],
    detail: { title: F.emoji.rune + " 룬 검색", examples: ["!룬 화염", "!룬 도감"], features: ["실제 API 설명(description)을 그대로 보여줍니다", "!룬 도감으로 전체 목록을 한 번에 (많으면 자동으로 나눠 보냅니다)"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getRunes, "룬", F.emoji.rune, args[1]); return; }

      var keyword = args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!룬 화염", "!룬 도감"])); return; }
      var all = P.getRunes();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 룬 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }
      var results = P.searchRunes(keyword);
      if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }

      var first = results[0];
      var usage = P.findUsageFor(nameOf(first));
      if (usage !== null) first.usageRate = usage + "%"; // 별도 API에서 온 값을 합성 필드로 주입

      var detailText = formatDetailCard(F.emoji.rune, first, {
        bodyField: "description",
        order: ["part", "klass", "tier", "stars_value", "season", "drop_location", "effect", "recommendedJobs", "jobs", "job", "usageRate"]
      });

      // 이 룬을 필요로 하는 룬워드 역참조("사용되는 룬워드") - 룬↔룬워드 연동
      var runeName = nameOf(first);
      var runeWords = P.getRuneWords();
      var usedInWords = [];
      for (var w = 0; w < runeWords.length; w++) {
        var req = extractField(runeWords[w], ["requiredRunes", "required_runes"]);
        if (req && arrayContainsName(req, runeName)) usedInWords.push(nameOf(runeWords[w]));
      }
      if (usedInWords.length) {
        detailText += "\n\n" + SUB_LINE + "\n\n사용되는 룬워드\n\n" + F.bulletList(usedInWords);
      }

      if (results.length === 1) { chat.reply(detailText); return; }
      var otherNames = [];
      for (var i = 1; i < results.length && otherNames.length < 7; i++) otherNames.push(nameOf(results[i]));
      chat.reply(detailText + F.similarBlock(otherNames));
    }
  });

  // ---- !ㄹ (룬 간단검색 - 결과 여러개면 이름만 빠르게 나열) ----
  GoombaBot.registerCommand("ㄹ", {
    category: "정보", summary: "룬 빠른 검색 (이름/등급/분류만, 설명 없이)", usage: ["!ㄹ 화염"],
    detail: { title: F.emoji.rune + " 룬 간단 검색", examples: ["!ㄹ 화염", "!ㄹ 칼"], features: ["설명 없이 이름/등급/분류만 빠르게 보여줍니다", "여러 개면 번호를 매겨서 한눈에 보여줍니다"] },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!ㄹ 화염"])); return; }
      var all = P.getRunes();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 룬 데이터를 가져오지 못했습니다."); return; }
      var results = P.searchRunes(keyword);
      if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }

      // ⚠️ !ㄹ은 빠른 검색 전용 - 설명은 출력하지 않고 이름/등급/분류만 빠르게 보여준다
      function tagOf(obj) {
        var g = extractField(obj, ["grade", "rarity"]);
        var c = extractField(obj, ["category", "part", "type"]);
        return [g, c].filter(function (v) { return !!v; }).join(" \u00B7 ");
      }

      if (results.length === 1) {
        var tag = tagOf(results[0]);
        chat.reply(F.emoji.search + " " + nameOf(results[0]) + (tag ? "\n[" + tag + "]" : ""));
        return;
      }

      var blocks = [];
      for (var i = 0; i < results.length; i++) {
        var t = tagOf(results[i]);
        blocks.push(F.circled(i + 1) + " " + nameOf(results[i]) + (t ? "\n[" + t + "]" : ""));
      }
      var chunks = F.chunkBlocks(blocks, 1200);
      for (var c = 0; c < chunks.length; c++) {
        var headerText = F.emoji.search + " 검색 결과 (" + results.length + ")" + (chunks.length > 1 ? " " + (c + 1) + "/" + chunks.length : "");
        chat.reply(headerText + "\n\n" + chunks[c].join("\n\n"));
      }
    }
  });

  // ---- !룬워드 ----
  GoombaBot.registerCommand("룬워드", {
    category: "정보", summary: "룬워드 검색 (설명/효과/시즌/필요룬/추천직업)", usage: ["!룬워드 맹공", "!룬워드 맹공 룬", "!룬워드 도감"],
    detail: {
      title: F.emoji.runeword + " 룬워드 검색", examples: ["!룬워드 맹공", "!룬워드 맹공 룬", "!룬워드 맹공 효과", "!룬워드 도감"],
      features: ["!룬워드 도감으로 전체 목록", "!룬워드 [이름] 룬/효과/설명/직업 으로 원하는 정보만 따로 조회"]
    },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getRuneWords, "룬워드", F.emoji.runeword); return; }
      if (args.length === 0) { chat.reply(F.usageBlock(["!룬워드 맹공", "!룬워드 도감"])); return; }

      // "!룬워드 이름 룬/효과/설명/직업" - 세부 검색
      var SUBFIELD = { "룬": "requiredRunes", "효과": "effects", "설명": "description", "직업": "recommendedJobs" };
      var lastArg = String(args[args.length - 1]);
      var subKind = SUBFIELD.hasOwnProperty(lastArg) ? lastArg : null;
      var keyword = (subKind ? args.slice(0, -1) : args).join(" ").trim();

      if (!keyword) { chat.reply(F.usageBlock(["!룬워드 맹공", "!룬워드 도감"])); return; }
      var all = P.getRuneWords();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 룬워드 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }
      var results = P.searchRuneWords(keyword);
      if (results.length === 0) { notFoundReply(chat, keyword, allNamesOf(all)); return; }
      var first = results[0];

      if (subKind) {
        var fieldKey = SUBFIELD[subKind];
        if (fieldKey === "requiredRunes") {
          var reqRunes = extractField(first, ["requiredRunes", "required_runes"]);
          if (!reqRunes || !reqRunes.length) { chat.reply(F.emoji.warn + " " + nameOf(first) + "의 필요 룬 정보가 없습니다."); return; }
          chat.reply(F.box(F.emoji.runeword + " " + nameOf(first) + " - 필요 룬", [formatNumberedList(reqRunes)]));
          return;
        }
        var candidateKeys = fieldKey === "effects" ? ["effects", "effect"] : [fieldKey];
        var val = extractField(first, candidateKeys);
        chat.reply(F.box(F.emoji.runeword + " " + nameOf(first) + " - " + subKind, [toListText(val) || "정보 없음"]));
        return;
      }

      // 일반 상세 - "필요 룬"은 번호목록으로 별도 표시(일반 상세 필드와 다른 스타일)
      var detailText = formatDetailCard(F.emoji.runeword, first, {
        bodyField: "effects", bodyFallback: ["description", "effect"],
        order: ["season", "recommendedJobs"]
      });
      var reqRunesMain = extractField(first, ["requiredRunes", "required_runes"]);
      if (reqRunesMain && reqRunesMain.length) {
        detailText += "\n\n" + SUB_LINE + "\n\n필요 룬\n\n" + formatNumberedList(reqRunesMain);
      }

      if (results.length === 1) { chat.reply(detailText); return; }
      var otherNames = [];
      for (var i = 1; i < results.length && otherNames.length < 7; i++) otherNames.push(nameOf(results[i]));
      chat.reply(detailText + F.similarBlock(otherNames));
    }
  });

  // ---- !인챈트 ----
  GoombaBot.registerCommand("인챈트", {
    category: "인챈트", summary: "인챈트 검색 (효과/등급)", usage: ["!인챈트 강력한", "!인챈트 도감"],
    detail: { title: F.emoji.enchant + " 인챈트 검색", examples: ["!인챈트 강력한", "!인챈트 도감"], features: ["!인챈트 도감으로 전체 목록을 한 번에 (많으면 자동으로 나눠 보냅니다)"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getEnchants, "인챈트", F.emoji.enchant, args[1]); return; }

      var keyword = args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getEnchants, P.searchEnchants, "인챈트", F.emoji.enchant, {
        bodyField: "description", bodyFallback: ["flavor_text", "effect", "effects", "desc"],
        order: ["effect", "part", "options_data", "avg_rating", "review_count"]
      }, ["!인챈트 강력한", "!인챈트 도감"]);
    }
  });

  // ---- !아티팩트 ----
  GoombaBot.registerCommand("아티팩트", {
    category: "아티팩트", summary: "아티팩트 검색 (설명/등급/옵션)", usage: ["!아티팩트 이름", "!아티팩트 도감"],
    detail: { title: F.emoji.artifact + " 아티팩트 검색", examples: ["!아티팩트 이름", "!아티팩트 도감"], features: ["!아티팩트 도감으로 전체 목록"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getArtifacts, "아티팩트", F.emoji.artifact, args[1]); return; }

      var keyword = args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getArtifacts, P.searchArtifacts, "아티팩트", F.emoji.artifact, {
        bodyField: "flavor_text", bodyFallback: ["description", "effect", "effects"],
        order: ["options_data", "avg_rating", "review_count"]
      }, ["!아티팩트 이름", "!아티팩트 도감"]);
    }
  });

  // ---- !칭호 ----
  GoombaBot.registerCommand("칭호", {
    category: "정보", summary: "칭호 도감 (이름/효과)", usage: ["!칭호"],
    detail: { title: F.emoji.title + " 칭호 도감", examples: ["!칭호"], features: ["전체 칭호 목록을 한 번에 (많으면 자동으로 나눠 보냅니다)"] },
    execute: function (chat) {
      runCatalogCommand(chat, P.getTitles, "칭호", F.emoji.title);
    }
  });

  // ---- !아이템 ----
  GoombaBot.registerCommand("아이템", {
    category: "정보", summary: "아이템 검색 (분류/설명/기타정보)", usage: ["!아이템 아이템명"],
    detail: { title: F.emoji.item + " 아이템 검색", examples: ["!아이템 켈틱류트"], features: ["실제 API 설명(description)을 그대로 보여줍니다", "검색 결과가 없으면 비슷한 이름을 추천합니다"] },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getItems, P.searchItems, "아이템", F.emoji.item, {
        bodyField: "description", order: ["category", "grade"]
      }, ["!아이템 아이템명"]);
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };

},{"../core/api.js":8,"../core/config.js":10,"../core/format.js":11,"../core/router.js":12}],8:[function(require,module,exports){
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

  /**
   * jsoup을 완전히 우회하는 1순위 방법 - Java의 URLConnection/InputStream을 LiveConnect로
   * 직접 사용한다 (loader.js의 goombaFetchViaJavaUrlConnection과 완전히 동일한 구현 -
   * !굼바봇 업데이트도 로더와 똑같은 방식을 쓰기 위함). 실패하면 예외를 던진다.
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
   * JSON이 아니라 순수 텍스트(예: GitHub의 main.js.b64 base64 원문)를 그대로 받아온다.
   * ⚠️ 1순위로 Java URLConnection(jsoup 완전 우회)을 시도하고, 실패하면 2순위로
   * Http.requestSync(jsoup을 거치지만 base64 텍스트라 안전)로 넘어간다 - loader.js와
   * 완전히 동일한 순서/방식이다 (실기기에서 body().text()가 줄바꿈을 전부 없애버려서
   * "//" 주석이 파일 끝까지 코드를 삼켜버리는 문제가 확인됐음 - 그 대응책).
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
   * 순수 JavaScript(ES5)로 직접 구현한 base64 디코더 - loader.js와 완전히 동일한 구현.
   * !굼바봇 업데이트(botcontrol.js)가 GitHub의 main.js.b64를 받아서 디코딩할 때 쓴다.
   * (Http.requestSync가 반환하는 jsoup Document가 응답을 HTML로 취급해서, 순수 JS
   * 코드를 그대로 받으면 <, >, & 등이 손상될 수 있음이 실기기에서 확인됨 - base64는
   * 그런 문자가 전혀 없어서 안전하다)
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

  return { getJson: getJson, getJsonFromUrl: getJsonFromUrl, getRawText: getRawText, inspect: inspect, base64Decode: base64Decode };
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

module.exports = { GoombaBot: GoombaBot };

},{"./cache.js":9,"./config.js":10}],9:[function(require,module,exports){
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

},{"./config.js":10}],10:[function(require,module,exports){
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
    worldChatRecent: "/world-chat/recent"
  },

  cacheTtlMs: {
    default: 30 * 60 * 1000, // 30분 - 대부분의 도감류 데이터
    notice: 10 * 60 * 1000, // 10분
    market: 30 * 60 * 1000 // 30분
  },

  // ⚠️ 메신저봇R(API2)은 고유 ID가 아니라 표시 닉네임 문자열로만 사람을 구분합니다.
  adminNames: ["신수아", "굼바굼바_빙결"],

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

  // ⚠️ !굼바봇 업데이트가 GitHub의 최신 main.js를 실제로 받아와서 반영할 때 쓰는 raw 주소.
  // 로더(loader.js)를 통해 실행 중일 때만 실제로 "즉시 반영"이 되고, 로더 없이 main.js를
  // 통째로 붙여넣은 예전 방식이면 이 명령어는 반영 확인만 해주고 실제로는 안 바뀐다
  // (자세한 원리는 loader.js와 commands/botcontrol.js 주석 참고).
  // 예: "https://raw.githubusercontent.com/사용자명/저장소명/main/main.js"
  // ⚠️ main.js가 아니라 main.js.b64(base64 인코딩본)를 가리켜야 한다 - jsoup이 응답을
  // HTML로 취급해서 순수 JS 코드가 손상되는 문제가 실기기에서 확인됐다 (자세한 설명은
  // loader.js 상단 주석 참고).
  // 예: "https://raw.githubusercontent.com/사용자명/저장소명/main/main.js.b64"
  githubMainJsRawUrl: "https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/main.js.b64"
};

module.exports = {
  GoombaBot: GoombaBot,
  GoombaBotConfig: GoombaBotConfig
};

},{}],11:[function(require,module,exports){
/**
 * core/format.js
 * ---------------
 * 출력 포맷(GoombaBot.format), 검색(GoombaBot.search, 초성/오타허용/유사도),
 * 관리자 판별(GoombaBot.isAdmin)을 담당한다. (원본 main.js의 "util.js" 섹션 그대로)
 */

var GoombaBot = require("./config.js").GoombaBot;
var GoombaBotConfig = require("./config.js").GoombaBotConfig;

GoombaBot.format = (function () {
  var LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";

  function box(title, lines) { return [LINE, title, LINE].concat(lines).concat([LINE]).join("\n"); }
  function field(label, value) {
    var v = value === null || value === undefined || value === "" ? "정보 없음" : value;
    return "\u25B8 " + label + " : " + v;
  }
  function bulletList(items) {
    if (!items || items.length === 0) return "  (없음)";
    var lines = [];
    for (var i = 0; i < items.length; i++) lines.push("  \u2022 " + items[i]);
    return lines.join("\n");
  }
  function changeArrow(pct) {
    if (pct > 0) return "\u25B2" + pct.toFixed(1) + "%";
    if (pct < 0) return "\u25BC" + Math.abs(pct).toFixed(1) + "%";
    return "\uFF0D0.0%";
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
    tier: "티어", season: "시즌", avg_rating: "평점", review_count: "리뷰수",
    drop_location: "획득처", skill_no: "스킬번호", option: "옵션", options: "옵션", options_data: "옵션",
    effect: "효과", extraEffect: "추가효과", extra_effect: "추가효과", part: "부위",
    requiredRunes: "필요 룬", required_runes: "필요 룬", recommendedJobs: "추천 직업",
    recommended_jobs: "추천 직업", type: "종류", rarity: "희귀도",
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
    notice: "\uD83D\uDCE2", maintenance: "\uD83D\uDD27", ok: "\u2705", warn: "\u26A0\uFE0F", error: "\u274C",
    green: "\uD83D\uDFE2", red: "\uD83D\uDD34", party: "\uD83C\uDF89", clock: "\uD83D\uDD52", admin: "\u2699\uFE0F"
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

  var CIRCLED_NUMBERS = ["\u2460", "\u2461", "\u2462", "\u2463", "\u2464", "\u2465", "\u2466", "\u2467", "\u2468", "\u2469", "\u246A", "\u246B", "\u246C", "\u246D", "\u246E", "\u246F", "\u2470", "\u2471", "\u2472", "\u2473"];
  /** 1부터 시작하는 원문자 번호(①②③...). 20 넘어가면 "21." 형태로 대체. */
  function circled(n) {
    if (n >= 1 && n <= CIRCLED_NUMBERS.length) return CIRCLED_NUMBERS[n - 1];
    return n + ".";
  }

  return {
    box: box, field: field, bulletList: bulletList, changeArrow: changeArrow, number: number,
    usageBlock: usageBlock, similarBlock: similarBlock, renderDetail: renderDetail, renderDetailAll: renderDetailAll,
    chunkLines: chunkLines, chunkBlocks: chunkBlocks, circled: circled, objectSummary: objectSummary, emoji: emoji
  };
})();

GoombaBot.search = (function () {
  var CHOSUNG_LIST = ["\u3131","\u3132","\u3134","\u3137","\u3138","\u3139","\u3141","\u3142","\u3143","\u3145","\u3146","\u3147","\u3148","\u3149","\u314A","\u314B","\u314C","\u314D","\u314E"];
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

GoombaBot.isAdmin = function (senderName) {
  for (var i = 0; i < GoombaBotConfig.adminNames.length; i++) { if (GoombaBotConfig.adminNames[i] === String(senderName)) return true; }
  return false;
};

module.exports = { GoombaBot: GoombaBot };

},{"./config.js":10}],12:[function(require,module,exports){
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

GoombaBot.dispatchCommand = function (chat) {
  var handler = GoombaBot.commands[chat.command];
  if (!handler) {
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
    try { chat.reply(GoombaBot.format.emoji.warn + " 명령어 처리 중 오류가 발생했습니다."); } catch (replyError) {}
  }
};

// ---- !도움 / !명령어 (별칭) - 기능설명+사용법+예시를 전부 보여줌 (hidden 명령어는 제외) ----
(function () {
  var F = GoombaBot.format;
  var CATEGORY_EMOJI = {
    "기본": "\u2b50", "정보": F.emoji.rune, "인챈트": F.emoji.enchant, "아티팩트": F.emoji.artifact,
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
      var lines = [(CATEGORY_EMOJI[cat] || "\u25B8") + " " + cat, ""];
      var list = grouped[cat];
      for (var i = 0; i < list.length; i++) {
        lines.push("!" + list[i].name);
        if (list[i].summary) lines.push(list[i].summary);
        lines.push("", "\uC608)");
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
        lines.push("", "\uC9C0\uC6D0 \uAE30\uB2A5");
        for (var f = 0; f < d.features.length; f++) lines.push("\u2022 " + d.features[f]);
      }
      chat.reply(lines.join("\n"));
      return;
    }

    var blocks = buildHelpBlocks(admin);
    var chunks = F.chunkBlocks(blocks, 1500);
    for (var c = 0; c < chunks.length; c++) {
      var title = "\uD83D\uDCD6 굼바봇 사용 가능한 명령어" + (chunks.length > 1 ? " (" + (c + 1) + "/" + chunks.length + ")" : "");
      chat.reply(title + "\n\n" + chunks[c].join("\n\n"));
    }
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

},{"./cache.js":9,"./config.js":10,"./format.js":11}],13:[function(require,module,exports){
/**
 * index.js
 * ---------
 * 빌드 엔트리 포인트. `npm run build`가 이 파일부터 시작해서 require 그래프를
 * 전부 따라가며 main.js 하나로 합친다. 가장 마지막에 봇을 초기화한다
 * (원본 main.js의 INITIALIZATION 섹션).
 */

var GoombaBot = require("./core/config.js").GoombaBot;
var GoombaBotConfig = require("./core/config.js").GoombaBotConfig;

require("./commands/search.js");
require("./commands/market.js");
require("./commands/maintenance.js");
require("./commands/homework.js");
require("./commands/fun.js");
require("./commands/admin.js");
require("./commands/botcontrol.js");

// ===== INITIALIZATION ================================================
// 가장 마지막에 실행되어야 한다.
//
// ⚠️ 두 가지 실행 방식을 모두 지원한다:
//   1) 로더(loader.js) 없이 이 파일(main.js) 전체를 메신저봇R에 직접 붙여넣은 경우
//      -> 예전 방식 그대로: 여기서 직접 BotManager/addListener를 호출한다.
//   2) 로더를 붙여넣고, 로더가 GitHub에서 이 main.js를 받아와 실행한 경우
//      -> 로더가 이미 리스너를 등록해뒀으므로, 여기서는 GoombaBotRuntime에
//         최신 dispatchCommand/dispatchTick만 연결해준다 (중복 등록 방지).
if (typeof GoombaBotRuntime !== "undefined") {
  GoombaBotRuntime.dispatchCommand = GoombaBot.dispatchCommand;
  GoombaBotRuntime.dispatchTick = GoombaBot.dispatchTick;
  GoombaBotRuntime.GoombaBot = GoombaBot; // !굼바봇 업데이트 등에서 참조할 수 있도록
  GoombaBot.log(
    "GoombaBot(로더 모드) 갱신 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개"
  );
} else {
  GoombaBot.bot = BotManager.getCurrentBot();
  GoombaBot.bot.setCommandPrefix(GoombaBotConfig.commandPrefix);
  GoombaBot.bot.addListener(Event.COMMAND, GoombaBot.dispatchCommand);
  GoombaBot.bot.addListener(Event.TICK, GoombaBot.dispatchTick);

  GoombaBot.log(
    "GoombaBot 초기화 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개 등록됨 (prefix: " + GoombaBotConfig.commandPrefix + ")"
  );
}

},{"./commands/admin.js":1,"./commands/botcontrol.js":2,"./commands/fun.js":3,"./commands/homework.js":4,"./commands/maintenance.js":5,"./commands/market.js":6,"./commands/search.js":7,"./core/config.js":10}]},{},[13]);
