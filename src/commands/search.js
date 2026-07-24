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
