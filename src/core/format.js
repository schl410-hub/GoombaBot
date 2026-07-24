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
