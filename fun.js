
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

