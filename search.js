
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




