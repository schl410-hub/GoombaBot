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
