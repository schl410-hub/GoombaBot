
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

