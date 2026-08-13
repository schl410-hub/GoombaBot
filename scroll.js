
/**
 * commands/scroll.js
 * ---------------------
 * 생활 스크롤 정보 조회(!스크롤)를 담당한다. 기존 명령어/모듈은 전혀 건드리지
 * 않는 완전히 새로운 파일 - src/data/scroll-quests.json(엑셀 스크롤퀘스트_v5
 * 시트를 그대로 옮긴 데이터)을 읽어서 서비스(GoombaBot.provider.*)를 만들고,
 * 그 위에 !스크롤 명령어를 붙인다.
 *
 * ⚠️ 데이터 출처: 사용자가 준 "생활스크롤v5의 사본.xlsx"의 스크롤퀘스트_v5 시트.
 * 실제 수식을 열어서 확인한 확정 규칙:
 *   - 제작물 수 = 스크롤 개수 × 2 (PRODUCTS_PER_SCROLL 상수로 관리 - 하드코딩 금지)
 *   - expPerScroll은 "스크롤 1개 완료시 얻는 경험치"(스크롤 개수와 무관하게 고정값)
 *   - materials의 qty는 "그 레시피(원본 scrollCount개 배치) 전체에 드는 재료
 *     총량"으로 해석함(스크롤 1개당 아님) - 그래서 수량 계산시 비례식(qty÷scrollCount
 *     ×원하는개수)으로 계산하고, 정수로 딱 안 떨어지면 올림(ceil)해서 "최소 이만큼은
 *     있어야 한다" 기준으로 보여준다. ⚠️ 이 해석이 실제 게임 제작 방식과 맞는지는
 *     확인이 필요함(사용자에게 결과보고서에서 별도 확인 요청) - 배치 단위로만 제작
 *     가능한 시스템이라면 계산 방식 자체를 다시 설계해야 할 수 있다.
 *   - 경험치 보너스(수정주의 시트의 1.33배)는 의미가 아직 불확실해서 1차에서는
 *     전혀 사용하지 않는다(expPerScroll 그대로만 사용).
 */

var GoombaBot = require("../core/config.js").GoombaBot;
require("../core/format.js");
require("../core/router.js");

var SCROLL_QUESTS = require("../data/scroll-quests.json");

GoombaBot.provider = GoombaBot.provider || {};

(function () {
  // ⚠️ 스크롤 1개당 제작물 개수 - 지금까지 확인된 데이터(12건) 전부 "스크롤수×2"라서
  // 상수로 뺐다. 나중에 게임 업데이트로 배율이 바뀌면 이 숫자 하나만 고치면 된다.
  var PRODUCTS_PER_SCROLL = 2;

  // ---- 스킬 목록(데이터에 실제로 등장하는 스킬만, 등장 순서 그대로) ----
  // 스킬이 늘어나도 이 배열이 아니라 scroll-quests.json에 항목만 추가하면 자동 반영된다.
  var SKILL_ORDER = [];
  (function collectSkills() {
    var seen = {};
    for (var i = 0; i < SCROLL_QUESTS.length; i++) {
      var skill = SCROLL_QUESTS[i].skill;
      if (!seen[skill]) { seen[skill] = true; SKILL_ORDER.push(skill); }
    }
  })();

  // ---- 재료 목록(유니크, 등장 순서 그대로) - 재료 역검색/오검색 방지용 ----
  var MATERIAL_NAMES = [];
  (function collectMaterials() {
    var seen = {};
    for (var i = 0; i < SCROLL_QUESTS.length; i++) {
      var mats = SCROLL_QUESTS[i].materials;
      for (var j = 0; j < mats.length; j++) {
        if (!seen[mats[j].name]) { seen[mats[j].name] = true; MATERIAL_NAMES.push(mats[j].name); }
      }
    }
  })();

  function getSkills() { return SKILL_ORDER.slice(); }

  function isKnownSkill(name) {
    for (var i = 0; i < SKILL_ORDER.length; i++) { if (SKILL_ORDER[i] === name) return true; }
    return false;
  }

  function getItemsBySkill(skill) {
    var result = [];
    for (var i = 0; i < SCROLL_QUESTS.length; i++) {
      if (SCROLL_QUESTS[i].skill === skill) result.push(SCROLL_QUESTS[i]);
    }
    return result;
  }

  /** 아이템 이름 검색 - 기존 !룬 등과 동일한 fuzzyFilter(정확일치→부분일치→초성→오타허용)를
   * 그대로 재사용한다(대소문자/공백 등은 fuzzyFilter 내부의 normalize가 처리). 스킬을
   * 지정했으면 그 스킬 안에서만, 안 하면 전체 12개 중에서 찾는다("스킬명 생략 단축"용). */
  function searchItems(keyword, withinSkill) {
    var pool = withinSkill ? getItemsBySkill(withinSkill) : SCROLL_QUESTS;
    return GoombaBot.search.fuzzyFilter(pool, keyword, function (q) { return q.item; });
  }

  /**
   * 재료 역검색 - "가죽"으로 검색해도 "가죽+"와 "상급 가죽"을 서로 다른 재료로 정확히
   * 구분해서 보여줘야 한다(요청 반영). 그래서 문자열 포함 여부로 스크롤을 직접 뒤지는
   * 대신, 먼저 "실제로 존재하는 재료명 목록"에서 fuzzyFilter로 몇 개나 매칭되는지부터
   * 찾고, 매칭된 각각의 "정확한 재료명"별로 결과를 나눠서 돌려준다 - 결과에 항상
   * 실제 매칭된 재료명이 명시되므로 사용자가 뭐가 검색됐는지 헷갈릴 일이 없다.
   */
  function findScrollsByMaterialKeyword(keyword) {
    var matchedNames = GoombaBot.search.fuzzyFilter(MATERIAL_NAMES, keyword, function (n) { return n; });
    var groups = [];
    for (var i = 0; i < matchedNames.length; i++) {
      var materialName = matchedNames[i];
      var scrolls = [];
      for (var j = 0; j < SCROLL_QUESTS.length; j++) {
        var quest = SCROLL_QUESTS[j];
        for (var k = 0; k < quest.materials.length; k++) {
          if (quest.materials[k].name === materialName) {
            scrolls.push({ quest: quest, qty: quest.materials[k].qty });
            break;
          }
        }
      }
      groups.push({ materialName: materialName, scrolls: scrolls });
    }
    return groups;
  }

  /** 스크롤 count개를 만들 때의 제작물/경험치/재료를 계산한다. 재료는 원본 레시피가
   * "scrollCount개 배치당 qty개"라는 비율로 보고 비례식으로 계산 후 올림한다. */
  function calcForCount(quest, count) {
    var products = count * PRODUCTS_PER_SCROLL;
    var exp = count * quest.expPerScroll;
    var materials = [];
    for (var i = 0; i < quest.materials.length; i++) {
      var m = quest.materials[i];
      var exact = (m.qty / quest.scrollCount) * count;
      materials.push({ name: m.name, qty: Math.ceil(exact), exact: exact });
    }
    return { products: products, exp: exp, materials: materials };
  }

  GoombaBot.provider.getScrollSkills = getSkills;
  GoombaBot.provider.isKnownScrollSkill = isKnownSkill;
  GoombaBot.provider.getScrollItemsBySkill = getItemsBySkill;
  GoombaBot.provider.searchScrollItems = searchItems;
  GoombaBot.provider.findScrollsByMaterialKeyword = findScrollsByMaterialKeyword;
  GoombaBot.provider.calcScrollForCount = calcForCount;
  GoombaBot.provider.SCROLL_PRODUCTS_PER_SCROLL = PRODUCTS_PER_SCROLL;
})();

(function () {
  var F = GoombaBot.format;
  var P = GoombaBot.provider;

  var SKILL_ICON = { "대장": "\u2692", "목공": "\uD83D\uDD28", "매직": "\uD83D\uDD2E", "중갑": "\uD83D\uDEE1", "경갑": "\uD83D\uDC55", "천옷": "\uD83E\uDDF5" };
  function skillIcon(skill) { return SKILL_ICON[skill] || "\uD83D\uDCDC"; }

  function formatMaterialsInline(materials) {
    var parts = [];
    for (var i = 0; i < materials.length; i++) parts.push(materials[i].name + " \u00D7 " + materials[i].qty);
    return parts.join(", ");
  }

  // ---- 화면 1: 메뉴 ----
  function replyMenu(chat) {
    var skills = P.getScrollSkills();
    var lines = [];
    for (var i = 0; i < skills.length; i++) lines.push(skillIcon(skills[i]) + " " + skills[i]);
    lines.push("");
    lines.push("사용법");
    lines.push("!스크롤 대장");
    lines.push("!스크롤 대장 크레센트 10");
    lines.push("!스크롤 재료 가죽");
    chat.reply(F.box("\uD83D\uDCDC 생활 스크롤", lines));
  }

  // ---- 화면 2: 스킬별 아이템 목록 ----
  function replySkillList(chat, skill) {
    var items = P.getScrollItemsBySkill(skill);
    var lines = [];
    for (var i = 0; i < items.length; i++) lines.push(F.circled(i + 1) + " " + items[i].item + " \u00B7 " + items[i].shop);
    lines.push("");
    lines.push("!\uC2A4\uD06C\uB864 " + skill + " [\uC544\uC774\uD15C\uBA85]\uC73C\uB85C \uC0C1\uC138 \uD655\uC778");
    chat.reply(F.box(skillIcon(skill) + " " + skill + " \uC0DD\uD65C \uC2A4\uD06C\uB864", lines));
  }

  // ---- 화면 3: 아이템 상세(수량 미지정) ----
  function replyItemDetail(chat, quest) {
    var lines = [
      "\uD83D\uDCCD " + quest.shop,
      "",
      F.field("\uC2A4\uD06C\uB864", quest.scrollCount + "\uAC1C"),
      F.field("\uC81C\uC791\uBB3C", (quest.scrollCount * P.SCROLL_PRODUCTS_PER_SCROLL) + "\uAC1C"),
      F.field("\uACBD\uD5D8\uCE58(\uC2A4\uD06C\uB864 1\uAC1C)", String(quest.expPerScroll)),
      F.field("\uC7AC\uB8CC(" + quest.scrollCount + "\uAC1C \uAE30\uC900)", formatMaterialsInline(quest.materials)),
      "",
      "!\uC2A4\uD06C\uB864 " + quest.skill + " " + quest.item + " [\uC218\uB7C9]\uC73C\uB85C \uACC4\uC0B0 \uAC00\uB2A5"
    ];
    chat.reply(F.box(skillIcon(quest.skill) + " " + quest.item, lines));
  }

  // ---- 화면 4: 수량 계산 ----
  function replyItemCalc(chat, quest, count) {
    var calc = P.calcScrollForCount(quest, count);
    var lines = ["\uD83D\uDCCD " + quest.shop, ""];
    lines.push(F.field("\uC81C\uC791\uBB3C", calc.products + "\uAC1C"));
    lines.push(F.field("\uACBD\uD5D8\uCE58", GoombaBot.format.number(calc.exp)));
    lines.push("");
    lines.push("\uC7AC\uB8CC");
    for (var i = 0; i < calc.materials.length; i++) lines.push("\u2022 " + calc.materials[i].name + " \u00D7 " + calc.materials[i].qty);
    lines.push("");
    lines.push("\u26A0\uFE0F \uC6D0\uBCF8 \uB808\uC2DC\uD53C(\uC2A4\uD06C\uB864 " + quest.scrollCount + "\uAC1C \uAE30\uC900) \uBE44\uC728\uB85C \uACC4\uC0B0\uD574 \uC62C\uB9BC\uD55C \uAC12\uC785\uB2C8\uB2E4");
    chat.reply(F.box(skillIcon(quest.skill) + " " + quest.item + " (" + count + "\uAC1C \uAE30\uC900)", lines));
  }

  // ---- 화면 5: 아이템 검색 결과가 여러 개일 때(선택 목록) ----
  function replyItemChoices(chat, results, skillContext) {
    var lines = [];
    for (var i = 0; i < results.length; i++) {
      lines.push(F.circled(i + 1) + " " + results[i].item + " \u00B7 " + results[i].shop + " (" + results[i].skill + ")");
    }
    lines.push("");
    lines.push("\uC544\uC774\uD15C\uBA85\uC744 \uB354 \uAD6C\uCCB4\uC801\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694");
    chat.reply(F.box("\uD83D\uDD0E \uAC80\uC0C9 \uACB0\uACFC (" + results.length + "\uAC1C)", lines));
  }

  // ---- 화면 6: 재료 역검색 ----
  function replyMaterialSearch(chat, groups) {
    if (groups.length === 0) { chat.reply(F.emoji.error + " \uD574\uB2F9 \uC7AC\uB8CC\uB97C \uC4F0\uB294 \uC0DD\uD65C \uC2A4\uD06C\uB864\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."); return; }
    var lines = [];
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (g > 0) lines.push("");
      lines.push("\uD83D\uDD29 " + group.materialName);
      for (var i = 0; i < group.scrolls.length; i++) {
        var s = group.scrolls[i];
        lines.push(skillIcon(s.quest.skill) + " " + s.quest.item + "(" + s.quest.shop + ") \u00B7 " + s.qty + "\uAC1C");
      }
    }
    lines.push("");
    lines.push("\uC6D0\uBCF8 \uB808\uC2DC\uD53C \uAE30\uC900 \uD544\uC694\uB7C9\uC785\uB2C8\uB2E4");
    chat.reply(F.box("\uD83D\uDD0D \uC7AC\uB8CC \uAC80\uC0C9", lines));
  }

  // ---- !스크롤 ----
  GoombaBot.registerCommand("스크롤", {
    category: "정보", summary: "생활 스크롤 정보 조회(구매처/재료/수량 계산)", usage: ["!스크롤", "!스크롤 대장", "!스크롤 대장 크레센트 10", "!스크롤 재료 가죽"],
    detail: {
      title: "\uD83D\uDCDC \uC0DD\uD65C \uC2A4\uD06C\uB864", examples: ["!스크롤 대장", "!스크롤 대장 크레센트 10", "!스크롤 재료 가죽"],
      features: [
        "!스크롤만 치면 스킬 목록이 나옵니다(대장/목공/매직/중갑/경갑/천옷)",
        "!스크롤 대장처럼 스킬명을 넣으면 그 스킬의 스크롤 아이템 목록이 나옵니다",
        "!스크롤 대장 크레센트처럼 아이템명(부분검색 가능)을 더하면 상세 정보가 나옵니다. 스킬명은 !스크롤 크레센트처럼 생략해도 됩니다",
        "!스크롤 대장 크레센트 10처럼 수량을 더하면 그 수량 기준 제작물/경험치/재료를 계산합니다",
        "!스크롤 재료 가죽처럼 재료명(부분검색 가능)을 검색하면 그 재료를 쓰는 스크롤을 전부 보여줍니다"
      ]
    },
    execute: function (chat) {
      var args = chat.args;

      // 인자 없음 -> 메뉴
      if (args.length === 0) { replyMenu(chat); return; }

      // "!스크롤 재료 [키워드]" - 예약어라 스킬/아이템명보다 먼저 확인
      if (String(args[0]) === "\uC7AC\uB8CC") {
        var materialKeyword = args.slice(1).join(" ").trim();
        if (!materialKeyword) { chat.reply(F.usageBlock(["!스크롤 재료 가죽"])); return; }
        replyMaterialSearch(chat, P.findScrollsByMaterialKeyword(materialKeyword));
        return;
      }

      // 마지막 토큰이 순수 숫자면 수량으로 뗀다(나머지는 스킬/아이템 검색어)
      var tokens = [];
      for (var t = 0; t < args.length; t++) tokens.push(String(args[t]));
      var count = null;
      if (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1])) {
        count = parseInt(tokens.pop(), 10);
        if (count <= 0) count = null;
      }

      // 남은 토큰 중 첫 번째가 "알려진 스킬명"과 정확히 일치하면 스킬 지정으로 본다
      var skillContext = null;
      var searchTokens = tokens;
      if (tokens.length > 0 && P.isKnownScrollSkill(tokens[0])) {
        skillContext = tokens[0];
        searchTokens = tokens.slice(1);
      }

      // 스킬만 있고 아이템명이 없으면 -> 그 스킬의 아이템 목록
      if (skillContext && searchTokens.length === 0) {
        if (count !== null) {
          // "!스크롤 대장 10"처럼 아이템명 없이 수량만 온 경우 - 1차에서 지원 안 하는
          // 형태(요청 반영) - 에러 대신 목록을 다시 보여주면서 자연스럽게 안내한다.
          chat.reply(F.emoji.warn + " \uC5B4\uB5A4 \uC544\uC774\uD15C\uC778\uC9C0 \uBA3C\uC800 \uACE8\uB77C\uC8FC\uC138\uC694.\n\n" + skillIcon(skillContext) + " " + skillContext + " \uC544\uC774\uD15C \uBAA9\uB85D");
          replySkillList(chat, skillContext);
          return;
        }
        replySkillList(chat, skillContext);
        return;
      }

      // 아이템명 검색어가 있으면(스킬 지정 여부 무관) 검색
      var keyword = searchTokens.join(" ").trim();
      if (!keyword) {
        // 스킬명도 아니고 아이템 검색어도 없음(예: 순수 숫자만 입력) - 메뉴로 안내
        chat.reply(F.emoji.warn + " \uC0AC\uC6A9\uBC95\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        replyMenu(chat);
        return;
      }

      var results = P.searchScrollItems(keyword, skillContext);
      if (results.length === 0) {
        chat.reply(F.emoji.error + " '" + keyword + "' \uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
        return;
      }
      if (results.length > 1) {
        // ⚠️ 요청 반영 - 여러 개 매칭되면 임의로 하나 고르지 않고 번호 목록을 보여주고
        // 사용자가 다시 구체적으로 입력하게 한다(지금 12개 데이터에선 거의 안 나오지만,
        // 나중에 이름이 비슷한 아이템이 추가돼도 안전하게 동작하도록).
        replyItemChoices(chat, results, skillContext);
        return;
      }

      var quest = results[0];
      if (count !== null) { replyItemCalc(chat, quest, count); } else { replyItemDetail(chat, quest); }
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };
