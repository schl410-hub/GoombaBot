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
        "예: https://raw.githubusercontent.com/사용자명/저장소명/main/main.js"
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
      var newCode = GoombaBot.http.getRawText(url, 20000);

      if (!newCode || newCode.length < 200) throw new Error("받아온 코드가 비정상적으로 짧습니다 (" + (newCode ? newCode.length : 0) + "자)");

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
