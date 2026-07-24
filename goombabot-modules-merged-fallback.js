/**
 * ===================================================================
 * 굼바봇 - 단일 파일 (main.js)
 * ===================================================================
 * Cloudflare Worker 중계 서버를 거쳐 mabimobi.life API를 사용합니다.
 */

var GoombaBot = GoombaBot || {};


/**
 * data.js
 * --------
 * 프로젝트의 설정값(GoombaBotConfig)과 캐시 저장소(GoombaBot.storage)를 담당한다.
 * 다른 모든 모듈이 이 파일에 의존한다 (require 순서상 가장 먼저 로드되어야 함).
 *
 * ⚠️ require()/module.exports가 메신저봇R에서 실제로 어떻게 동작하는지(경로 해석 방식 등)
 * 확인되지 않은 상태로 작성했습니다. 문제가 생기면 즉시 단일 파일(굼바봇.js)로 합칩니다.
 */

// ⚠️ 여기서 만드는 GoombaBot 객체가 "진짜 원본"이다. 다른 모든 모듈은 이 객체를
// require("./data.js").GoombaBot 으로 가져다 써야 하며, 자기 나름대로
// "var GoombaBot = GoombaBot || {}"로 새로 만들면 안 된다 (그러면 서로 다른 객체가
// 되어 공유가 깨진다 - CommonJS에서 var는 모듈마다 독립된 스코프이기 때문).
var GoombaBot = {};

// ===== CONFIG ========================================================
// ===================================================================
/** (분리한다면: config/config.js) */

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
    market: 30 * 60 * 1000, // 30분
  },

  // ⚠️ 메신저봇R(API2)은 고유 ID가 아니라 표시 닉네임 문자열로만 사람을 구분합니다.
  adminNames: ["신수아"], // TODO: 다른 운영진도 있으면 쉼표로 추가

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
  alertRooms: ["길드방"], // TODO: 실제 방 이름으로 교체
};


// ===================================================================


// ===== CACHE =========================================================
// ===================================================================
/** (분리한다면: utils/cache.js) Database API(메신저봇R API2) 기반 캐시 */

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
  return { read: read, readStale: readStale, write: write, getSyncedAt: getSyncedAt };
})();


// ===================================================================



/**
 * api.js
 * -------
 * Http.requestSync() 공통 래퍼(GoombaBot.http) + API 응답 파싱 공통 헬퍼
 * (toArray/extractField/fetchCached)를 담당한다.
 *
 * 실전에서 실제로 겪었던 Rhino 버그 2종을 미리 방어한다:
 *   1) ConsString 문제 (문자열 연결로 만든 값을 Http.requestSync에 그대로 넘기면 오류)
 *   2) JavaException 래퍼 문제 (자바 예외가 한 번 더 감싸여서 옴)
 * 자세한 설명은 코드 내 주석 참고.
 */



// ===================================================================
/**
 * (분리한다면: api/client.js)
 * Http.requestSync() 공통 래퍼. 이 프로젝트 실전에서 실제로 겪었던 두 가지 문제를
 * 미리 방어해뒀습니다:
 *   1) ConsString 문제: Rhino에서 문자열을 "+"로 이어붙이면 java.lang.String이 아니라
 *      org.mozilla.javascript.ConsString이 되는데, 이걸 그대로 Http.requestSync에
 *      넘기면 ClassCastException이 납니다 -> url/method/header 값을 전부 String()으로
 *      강제 변환합니다.
 *   2) JavaException 래퍼 문제: Rhino가 자바 예외를 자기 것으로 한 번 더 감싸서 던지는데,
 *      감싸인 안쪽의 진짜 예외(예: HttpStatusException)에만 getStatusCode() 등이 있어서
 *      겉 포장에 대고 호출하면 못 찾습니다 -> getWrappedException()으로 벗겨서 검사합니다.
 */

GoombaBot.log = function (message) {
  try { Log.i("GoombaBot", message); } catch (e) {}
};

GoombaBot.http = (function () {
  var DEFAULT_TIMEOUT_MS = 5000;

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

  function getJson(path, options) {
    options = options || {};
    var url = String(GoombaBotConfig.apiBase) + String(path);
    var requestOption = {
      url: String(url),
      method: String(options.method || "GET"),
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
      headers: mergeHeaders(options.headers)
    };

    var doc;
    try {
      doc = Http.requestSync(requestOption);
    } catch (requestError) {
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

  /** !진단류 명령어 전용 - 절대 throw하지 않고 있는 그대로 보고한다 */
  function describeStructure(parsed) {
    if (parsed === null || parsed === undefined) return { rootType: "null", rootKeys: [], extractedCount: 0, firstItemKeys: [] };

    var isArray = Object.prototype.toString.call(parsed) === "[object Array]";
    var rootType = isArray ? "array(" + parsed.length + ")" : typeof parsed;
    var rootKeys = isArray ? [] : Object.keys(parsed);

    // 실제 명령어가 쓰는 것과 동일한 toArray()로 추출해봐서, "진짜로 봇이 뭘 가져오는지" 보여준다
    var extracted = GoombaBot.http.toArray(parsed);
    var firstItemKeys = extracted.length > 0 && extracted[0] && typeof extracted[0] === "object" ? Object.keys(extracted[0]) : [];

    return { rootType: rootType, rootKeys: rootKeys, extractedCount: extracted.length, firstItemKeys: firstItemKeys };
  }

  function getRaw(path) {
    var url = String(GoombaBotConfig.apiBase) + String(path);
    var requestOption = { url: String(url), method: "GET", timeout: DEFAULT_TIMEOUT_MS, headers: mergeHeaders(null) };

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

    var parsed = null, parseErrorMessage = null;
    try { parsed = JSON.parse(extracted.text); } catch (parseError) { parseErrorMessage = describeError(parseError); }

    var structure = parseErrorMessage === null ? describeStructure(parsed) : null;

    return {
      ok: parseErrorMessage === null,
      stage: "done",
      url: url,
      method: extracted.method,
      bodyPreview: extracted.text ? String(extracted.text).substring(0, 300) : "(빈 응답)",
      parseError: parseErrorMessage,
      structure: structure
    };
  }

  return { getJson: getJson, getRaw: getRaw };
})();


// ===================================================================

// ---- API 응답 파싱 공통 헬퍼 (search.js/market.js/maintenance.js/homework.js가 공용으로 씀) ----
GoombaBot.http.toArray = function (json) {
  if (!json) return [];
  if (Object.prototype.toString.call(json) === "[object Array]") return json;

  var candidateKeys = ["items", "data", "list", "results", "records", "rows", "content"];
  for (var i = 0; i < candidateKeys.length; i++) {
    var val = json[candidateKeys[i]];
    if (val && Object.prototype.toString.call(val) === "[object Array]") return val;
  }

  // 그래도 못 찾으면, 객체 안에서 배열인 첫 번째 값을 그대로 쓴다 (필드 이름이 전혀
  // 예상 못한 이름일 때의 최후 방어선 - !진단으로 실제 이름을 확인하는 게 근본 해결책)
  for (var key in json) {
    if (!json.hasOwnProperty(key)) continue;
    if (Object.prototype.toString.call(json[key]) === "[object Array]") return json[key];
  }

  return [];
};

GoombaBot.http.extractField = function (obj, candidateKeys) {
  for (var i = 0; i < candidateKeys.length; i++) {
    if (obj && obj[candidateKeys[i]] !== undefined && obj[candidateKeys[i]] !== null) return obj[candidateKeys[i]];
  }
  return null;
};

GoombaBot.http.fetchCached = function (cacheKey, ttlMs, path) {
  var cached = GoombaBot.storage.read(cacheKey, ttlMs);
  if (cached) return cached;
  try {
    var json = GoombaBot.http.getJson(path);
    var arr = GoombaBot.http.toArray(json);
    GoombaBot.storage.write(cacheKey, arr);
    return arr;
  } catch (e) {
    GoombaBot.log("조회 실패 (" + path + "): " + e);
    return GoombaBot.storage.readStale(cacheKey) || [];
  }
};



/**
 * util.js
 * --------
 * 출력 포맷(GoombaBot.format), 검색(GoombaBot.search, 초성/오타허용/유사도),
 * 관리자 판별(GoombaBot.isAdmin)을 담당한다.
 */



// ===================================================================
/** (분리한다면: utils/format.js, utils/search.js) */

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
    drop_location: "획득처", skill_no: "스킬번호", option: "옵션", options: "옵션",
    effect: "효과", extraEffect: "추가효과", extra_effect: "추가효과", part: "부위",
    requiredRunes: "필요 룬", required_runes: "필요 룬", recommendedJobs: "추천 직업",
    recommended_jobs: "추천 직업", type: "종류", rarity: "희귀도"
  };
  // 상세 출력에서 아예 안 보여줄 필드 (내부용/너무 긴 HTML 등)
  var FIELD_SKIP = ["id", "name", "description_html", "image", "icon", "iconUrl", "icon_url", "thumbnail"];

  /**
   * obj의 필드를 전부 자동으로 보여주는 상세 출력 라인을 만든다 (요구사항: "정보 없음"
   * 대신 실제 API 필드명을 확인해서 category/grade/description/option/effect/extraEffect
   * 등을 전부 출력).
   *   options.bodyField - 이 필드는 "▸ 라벨 : 값"이 아니라 그냥 문단(설명글)으로 맨 위에 보여줌
   *   options.order - 이 순서대로 먼저 보여주고, 목록에 없는 나머지 필드도 전부 이어서 보여줌
   */
  function renderDetail(obj, options) {
    options = options || {};
    var bodyField = options.bodyField;
    var order = options.order || [];
    var skip = FIELD_SKIP.concat(options.skip || []);
    var shown = {};
    var lines = [];

    if (bodyField && obj[bodyField]) {
      lines.push(String(obj[bodyField]));
      lines.push("");
      shown[bodyField] = true;
    }

    function pushField(key) {
      if (shown[key] || skip.indexOf(key) !== -1) return;
      var val = obj[key];
      if (val === undefined || val === null || val === "") return;
      if (typeof val === "object") return; // 배열/객체 값은 호출부에서 별도로 처리
      lines.push(field(FIELD_LABELS[key] || key, val));
      shown[key] = true;
    }

    for (var i = 0; i < order.length; i++) pushField(order[i]);
    for (var key2 in obj) { if (obj.hasOwnProperty(key2)) pushField(key2); }

    return lines;
  }

  var emoji = {
    search: "\uD83D\uDD0D", market: "\uD83D\uDCB0", enchant: "\uD83D\uDCDC", runeword: "\uD83E\uDDE9",
    artifact: "\uD83E\uDDE9", title: "\uD83C\uDFF7\uFE0F", item: "\uD83D\uDCE6", rune: "\uD83D\uDD2E",
    notice: "\uD83D\uDCE2", maintenance: "\uD83D\uDD27", ok: "\u2705", warn: "\u26A0\uFE0F", error: "\u274C",
    green: "\uD83D\uDFE2", red: "\uD83D\uDD34", party: "\uD83C\uDF89", clock: "\uD83D\uDD52", admin: "\u2699\uFE0F"
  };

  return { box: box, field: field, bulletList: bulletList, changeArrow: changeArrow, number: number, usageBlock: usageBlock, similarBlock: similarBlock, renderDetail: renderDetail, emoji: emoji };
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

  return { fuzzyFilter: fuzzyFilter, suggest: suggest };
})();

GoombaBot.isAdmin = function (senderName) {
  for (var i = 0; i < GoombaBotConfig.adminNames.length; i++) { if (GoombaBotConfig.adminNames[i] === String(senderName)) return true; }
  return false;
};


// ===================================================================



/**
 * commands.js
 * ------------
 * Event.COMMAND 리스너(라우터) 인프라 + !도움 명령어를 담당한다.
 * search.js/market.js/homework.js/maintenance.js/fun.js/admin.js가 전부 이 파일의
 * GoombaBot.registerCommand()로 자기 명령어를 등록한다.
 */




// ===================================================================
/** (분리한다면: bot/router.js) Event.COMMAND 리스너는 여기서 딱 한 번만 등록 */

GoombaBot.commands = GoombaBot.commands || {}; // require()가 여러 번 실행돼도 등록된 명령어가 안 지워지도록 방어

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

  if (handler.adminOnly && !GoombaBot.isAdmin(chat.author.name)) {
    chat.reply(GoombaBot.format.emoji.warn + " 이 명령어는 운영진만 사용할 수 있습니다.");
    return;
  }

  try {
    handler.execute(chat);
  } catch (executeError) {
    GoombaBot.log("명령어 실행 중 오류 (" + chat.command + "): " + executeError);
    try { chat.reply(GoombaBot.format.emoji.warn + " 명령어 처리 중 오류가 발생했습니다."); } catch (replyError) {}
  }
};


// ===================================================================

// ---- !도움 / !명령어 (별칭) - 기능설명+사용법+예시를 전부 보여줌 (hidden 명령어는 제외) ----
(function () {
  var F = GoombaBot.format;
  var CATEGORY_EMOJI = {
    "기본": "\u2b50", "정보": F.emoji.rune, "인챈트": F.emoji.enchant, "아티팩트": F.emoji.artifact,
    "거래소": F.emoji.market, "던전": "\uD83D\uDD73", "공지": F.emoji.notice, "관리자": F.emoji.admin
  };
  var CATEGORY_ORDER = ["기본", "정보", "인챈트", "아티팩트", "거래소", "던전", "공지", "관리자"];

  function buildHelpText(admin) {
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

    var out = ["\uD83D\uDCCB 굼바봇 사용 가능한 명령어", ""];
    var seen = {};

    function renderCategory(cat) {
      if (!grouped[cat] || seen[cat]) return;
      seen[cat] = true;
      out.push((CATEGORY_EMOJI[cat] || "\u25B8") + " " + cat, "");
      var list = grouped[cat];
      for (var i = 0; i < list.length; i++) {
        out.push("!" + list[i].name);
        if (list[i].summary) out.push("\u2192 " + list[i].summary);
        for (var j = 0; j < list[i].usage.length; j++) out.push("\uC608) " + list[i].usage[j]);
        out.push("");
      }
    }

    for (var c = 0; c < CATEGORY_ORDER.length; c++) renderCategory(CATEGORY_ORDER[c]);
    for (var cat2 in grouped) renderCategory(cat2); // 목록에 없는 카테고리도 누락 없이

    return out.join("\n");
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

    chat.reply(buildHelpText(admin));
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



/**
 * search.js
 * ----------
 * 룬/룬워드/인챈트/아티팩트/칭호/아이템 - 조회 서비스 + 검색형 명령어를 담당한다.
 * (!룬, !룬워드, !인챈트, !아티팩트, !칭호, !아이템)
 */






GoombaBot.provider = GoombaBot.provider || {};

// ---- 서비스 (API 조회 - 각 함수를 GoombaBot.provider에 붙인다) ----
(function () {
  var E = GoombaBotConfig.endpoints;
  var toArray = GoombaBot.http.toArray;
  var extractField = GoombaBot.http.extractField;
  var fetchCached = GoombaBot.http.fetchCached;

  // ---- 룬 ----
  function getRunes() { return fetchCached("runes", GoombaBotConfig.cacheTtlMs.default, E.runes); }
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
  function getRuneWords() { return fetchCached("rune_words", GoombaBotConfig.cacheTtlMs.default, E.runeWords); }
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

  function nameOf(obj) { return String(extractField(obj, ["name", "title"])); }
  function toListText(val) {
    if (val === null || val === undefined) return null;
    return Object.prototype.toString.call(val) === "[object Array]" ? val.join(", ") : String(val);
  }

  /** 상세 출력 - 제목줄 + (있으면) 설명 본문 + 필드 전부. 쿠짱봇 스타일(테두리 없는 담백한 카드). */
  function formatDetailCard(emojiChar, obj, detailOptions) {
    var name = nameOf(obj);
    var grade = extractField(obj, ["grade", "rarity"]);
    var category = extractField(obj, ["category", "part", "type"]);
    var tag = [grade, category].filter(function (v) { return !!v; }).join(" \u00B7 ");

    // 태그 줄에 이미 보여준 등급/분류는 아래 필드 목록에서 중복으로 또 안 나오게 뺀다
    var skip = (detailOptions.skip || []).concat(["grade", "rarity", "category", "part", "type"]);
    var lines = F.renderDetail(obj, {
      bodyField: detailOptions.bodyField,
      order: detailOptions.order,
      skip: skip
    });

    var out = [emojiChar + " " + name];
    if (tag) out.push("[" + tag + "]");
    if (lines.length) { out.push(""); out.push(lines.join("\n")); }
    return out.join("\n");
  }

  /** 검색 결과가 0개일 때 - 이름이 비슷한 것들을 추천해준다 */
  function replyNotFound(chat, keyword, catLabel, allItems) {
    var allNames = [];
    for (var i = 0; i < allItems.length; i++) allNames.push(nameOf(allItems[i]));
    var suggestions = GoombaBot.search.suggest(allNames, keyword, 3);

    if (suggestions.length === 0) {
      chat.reply(F.emoji.error + " 검색 결과가 없습니다.");
      return;
    }
    var lines = [F.emoji.error + " 검색 결과가 없습니다.", "", "혹시"];
    for (var j = 0; j < suggestions.length; j++) lines.push(suggestions[j]);
    lines.push("을(를) 찾으셨나요?");
    chat.reply(lines.join("\n"));
  }

  /** 도감(전체 목록) - 페이지네이션 지원 */
  function runCatalogCommand(chat, getAllFn, catLabel, emojiChar, pageArg) {
    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다."); return; }

    var pageSize = 10;
    var page = pageArg ? parseInt(String(pageArg), 10) : 1;
    if (isNaN(page)) page = 1;
    var totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    page = Math.min(Math.max(1, page), totalPages);
    var start = (page - 1) * pageSize;
    var pageItems = all.slice(start, start + pageSize);

    // 이름만이 아니라 분류(무기/방어구/장신구 등)도 같이 보여준다
    var lines = [];
    for (var i = 0; i < pageItems.length; i++) {
      var item = pageItems[i];
      var itemCategory = extractField(item, ["category", "part", "type"]);
      lines.push("\u2022 " + nameOf(item) + (itemCategory ? " (" + itemCategory + ")" : ""));
    }

    var pageNav = "\uD83D\uDCC4 " + page + " / " + totalPages + " 페이지";
    var navHint = [];
    if (page > 1) navHint.push("\u25C0 !" + catLabel + " 도감 " + (page - 1));
    if (page < totalPages) navHint.push("!" + catLabel + " 도감 " + (page + 1) + " \u25B6");

    chat.reply(F.box(emojiChar + " " + catLabel + " 도감 (총 " + all.length + "개)", [
      lines.join("\n"), "",
      pageNav + (navHint.length ? "  (" + navHint.join("  |  ") + ")" : "")
    ]));
  }

  /** 검색형 명령어 공통 실행기: 결과 1개=상세, 여러개=첫결과 상세+비슷한결과 */
  function runSearchCommand(chat, keyword, getAllFn, searchFn, catLabel, emojiChar, detailOptions, usageExamples) {
    if (!keyword) { chat.reply(F.usageBlock(usageExamples)); return; }

    var all = getAllFn();
    if (all.length === 0) { chat.reply(F.emoji.warn + " " + catLabel + " 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }

    var results = searchFn(keyword);
    if (results.length === 0) { replyNotFound(chat, keyword, catLabel, all); return; }

    var detailText = formatDetailCard(emojiChar, results[0], detailOptions);
    if (results.length === 1) { chat.reply(detailText); return; }

    var otherNames = [];
    for (var i = 1; i < results.length && otherNames.length < 7; i++) otherNames.push(nameOf(results[i]));
    chat.reply(detailText + F.similarBlock(otherNames));
  }

  // ---- !룬 ----
  GoombaBot.registerCommand("룬", {
    category: "정보", summary: "룬 검색 (설명/등급/추천직업/사용률 전체 표시)", usage: ["!룬 화염", "!룬 도감"],
    detail: { title: F.emoji.rune + " 룬 검색", examples: ["!룬 화염", "!룬 도감", "!룬 도감 2"], features: ["실제 API 설명(description)을 그대로 보여줍니다", "!룬 도감으로 전체 목록(10개씩 페이지)"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getRunes, "룬", F.emoji.rune, args[1]); return; }

      var keyword = args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!룬 화염", "!룬 도감"])); return; }
      var all = P.getRunes();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 룬 데이터를 가져오지 못했습니다. 운영진에게 !진단으로 확인을 요청해주세요."); return; }
      var results = P.searchRunes(keyword);
      if (results.length === 0) { replyNotFound(chat, keyword, "룬", all); return; }

      var first = results[0];
      var extraLines = [];
      var jobs = extractField(first, ["recommendedJobs", "jobs", "job"]);
      if (jobs) extraLines.push(F.field("추천 직업", toListText(jobs)));
      var usage = P.findUsageFor(nameOf(first));
      if (usage !== null) extraLines.push(F.field("사용률", usage + "%"));

      var detailText = formatDetailCard(F.emoji.rune, first, {
        bodyField: "description",
        order: ["category", "grade", "klass", "tier", "stars_value", "season", "drop_location"]
      });
      if (extraLines.length) detailText += "\n" + extraLines.join("\n");

      if (results.length === 1) { chat.reply(detailText); return; }
      var otherNames = [];
      for (var i = 1; i < results.length && otherNames.length < 7; i++) otherNames.push(nameOf(results[i]));
      chat.reply(detailText + F.similarBlock(otherNames));
    }
  });

  // ---- !ㄹ (룬 간단검색 - 결과 여러개면 이름만 빠르게 나열) ----
  GoombaBot.registerCommand("ㄹ", {
    category: "정보", summary: "룬 간단 검색 (여러 결과를 빠르게)", usage: ["!ㄹ 화염"],
    detail: { title: F.emoji.rune + " 룬 간단 검색", examples: ["!ㄹ 화염", "!ㄹ 바위"], features: ["결과가 1개면 이름+설명 한 번에", "여러 개면 이름만 목록으로 빠르게"] },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!ㄹ 화염"])); return; }
      var all = P.getRunes();
      if (all.length === 0) { chat.reply(F.emoji.warn + " 룬 데이터를 가져오지 못했습니다."); return; }
      var results = P.searchRunes(keyword);
      if (results.length === 0) { replyNotFound(chat, keyword, "룬", all); return; }

      if (results.length === 1) {
        var r = results[0];
        var desc = extractField(r, ["description", "effect"]);
        chat.reply(F.emoji.search + " " + nameOf(r) + (desc ? "\n" + desc : ""));
        return;
      }

      var lines = [];
      for (var i = 0; i < Math.min(results.length, 10); i++) lines.push(F.emoji.search + " " + nameOf(results[i]));
      chat.reply(lines.join("\n"));
    }
  });

  // ---- !룬워드 ----
  GoombaBot.registerCommand("룬워드", {
    category: "정보", summary: "룬워드 검색 (필요 룬/효과/추천직업)", usage: ["!룬워드 맹공", "!룬워드 도감"],
    detail: { title: F.emoji.runeword + " 룬워드 검색", examples: ["!룬워드 맹공", "!룬워드 도감"], features: ["!룬워드 도감으로 전체 목록"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getRuneWords, "룬워드", F.emoji.runeword, args[1]); return; }

      var keyword = args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getRuneWords, P.searchRuneWords, "룬워드", F.emoji.runeword, {
        bodyField: "description", order: ["effect", "requiredRunes", "recommendedJobs"]
      }, ["!룬워드 맹공", "!룬워드 도감"]);
    }
  });

  // ---- !인챈트 ----
  GoombaBot.registerCommand("인챈트", {
    category: "인챈트", summary: "인챈트 검색 (효과/등급)", usage: ["!인챈트 강력한", "!인챈트 도감"],
    detail: { title: F.emoji.enchant + " 인챈트 검색", examples: ["!인챈트 강력한", "!인챈트 도감", "!인챈트 도감 2"], features: ["!인챈트 도감으로 전체 목록(페이지 지원)"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getEnchants, "인챈트", F.emoji.enchant, args[1]); return; }

      var keyword = args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getEnchants, P.searchEnchants, "인챈트", F.emoji.enchant, {
        bodyField: "description", order: ["effect", "part", "grade"]
      }, ["!인챈트 강력한", "!인챈트 도감"]);
    }
  });

  // ---- !아티팩트 ----
  GoombaBot.registerCommand("아티팩트", {
    category: "아티팩트", summary: "아티팩트 검색 (효과/옵션)", usage: ["!아티팩트 이름", "!아티팩트 도감"],
    detail: { title: F.emoji.artifact + " 아티팩트 검색", examples: ["!아티팩트 이름", "!아티팩트 도감"], features: ["!아티팩트 도감으로 전체 목록"] },
    execute: function (chat) {
      var args = chat.args;
      if (String(args[0]) === "도감") { runCatalogCommand(chat, P.getArtifacts, "아티팩트", F.emoji.artifact, args[1]); return; }

      var keyword = args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getArtifacts, P.searchArtifacts, "아티팩트", F.emoji.artifact, {
        bodyField: "description", order: ["effect", "option", "grade"]
      }, ["!아티팩트 이름", "!아티팩트 도감"]);
    }
  });

  // ---- !칭호 ----
  GoombaBot.registerCommand("칭호", {
    category: "정보", summary: "칭호 도감 (이름/효과)", usage: ["!칭호"],
    execute: function (chat) {
      runCatalogCommand(chat, P.getTitles, "칭호", F.emoji.title, chat.args[0]);
    }
  });

  // ---- !아이템 ----
  GoombaBot.registerCommand("아이템", {
    category: "정보", summary: "아이템 검색 (분류/설명/기타정보)", usage: ["!아이템 아이템명"],
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      runSearchCommand(chat, keyword, P.getItems, P.searchItems, "아이템", F.emoji.item, {
        bodyField: "description", order: ["category", "grade"]
      }, ["!아이템 아이템명"]);
    }
  });
})();



/**
 * market.js
 * ----------
 * 거래소 시세 조회 서비스 + !시세 명령어를 담당한다.
 */






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

  function formatOneLine(item) {
    var name = String(extractField(item, ["name", "title"]));
    var price = GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0));
    var count = extractField(item, ["total_count", "totalCount"]);
    var change = F.changeArrow(Number(extractField(item, ["pct_change_24h", "pctChange24h"]) || 0));
    return "\u2022 " + name + "  " + price + "  (" + (count !== null ? count + "개 등록" : "등록수 미상") + ")  " + change;
  }

  // ---- !시세 ----
  GoombaBot.registerCommand("시세", {
    category: "거래소", summary: "거래소 시세 조회 (카테고리/세트 검색 지원)", usage: ["!시세 아이템명", "!시세 마력석"],
    detail: {
      title: F.emoji.market + " 거래소 시세", examples: ["!시세 켈틱류트", "!시세 마력석"],
      features: ["검색어가 여러 아이템에 걸치면(예: 마력석/영혼석 세트) 전부 한 번에 보여줍니다", "갱신시간이 항상 같이 표시됩니다"]
    },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!시세 아이템명", "!시세 마력석"])); return; }
      var results = P.searchMarket(keyword);
      if (results.length === 0) {
        var allNames = [];
        var catalog = P.getMarketCatalog();
        for (var n = 0; n < catalog.length; n++) allNames.push(String(extractField(catalog[n], ["name", "title"])));
        var suggestions = GoombaBot.search.suggest(allNames, keyword, 3);
        if (suggestions.length === 0) { chat.reply(F.emoji.error + " 검색 결과가 없습니다."); return; }
        var lines0 = [F.emoji.error + " 검색 결과가 없습니다.", "", "혹시"];
        for (var s = 0; s < suggestions.length; s++) lines0.push(suggestions[s]);
        lines0.push("을(를) 찾으셨나요?");
        chat.reply(lines0.join("\n"));
        return;
      }

      if (results.length === 1) {
        var item = results[0];
        var lines = F.renderDetail(item, {
          order: ["total_count", "totalCount"]
        });
        var name = String(extractField(item, ["name", "title"]));
        chat.reply(F.box(F.emoji.market + " " + name + " 시세", [
          F.field("최저가", GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0))),
          F.field("등록 개수", extractField(item, ["total_count", "totalCount"])),
          F.field("1시간 변동", F.changeArrow(Number(extractField(item, ["pct_change_1h", "pctChange1h"]) || 0))),
          F.field("24시간 변동", F.changeArrow(Number(extractField(item, ["pct_change_24h", "pctChange24h"]) || 0))),
          F.field("7일 변동", F.changeArrow(Number(extractField(item, ["pct_change_7d", "pctChange7d"]) || 0))),
          "", F.emoji.clock + " 갱신 : " + formatSyncedAt()
        ]));
        return;
      }

      // 여러 개 일치 - 카테고리/세트 검색으로 보고 전부 나열
      var multiLines = [];
      for (var i = 0; i < Math.min(results.length, 15); i++) multiLines.push(formatOneLine(results[i]));
      multiLines.push("", F.emoji.clock + " 갱신 : " + formatSyncedAt());
      chat.reply(F.box(F.emoji.market + ' "' + keyword + '" 시세 (' + results.length + "개)", multiLines));
    }
  });

})();



/**
 * maintenance.js
 * ---------------
 * 공지/점검 상태 조회 서비스 + !공지/!점검 명령어 + 자동 점검 알림 모니터를 담당한다.
 * (요구사항 ⑩ - "점검중 -> 정상" 전환 시에만 1회 알림)
 */






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
    category: "공지", summary: "점검 상태 확인", usage: ["!점검"],
    execute: function (chat) {
      var status = P.getMaintenanceStatus();
      if (!status.ok) { chat.reply(F.emoji.warn + " 점검 상태를 가져오지 못했습니다."); return; }
      chat.reply(status.isUnderMaintenance ? F.emoji.red + " 현재 점검중입니다." : F.emoji.green + " 현재 정상 운영중입니다.");
    }
  });
})();

// ---- MONITORS (Event.TICK 리스너는 이 프로젝트 전체에서 여기 한 곳에서만 등록) ----
// ===== MONITORS ======================================================
// ===================================================================
/**
 * (분리한다면: bot/monitors.js)
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


// ===================================================================



/**
 * homework.js
 * ------------
 * 검은 구멍/어비스 구멍/심층 구멍/숙제 - 조회 서비스 + 명령어를 담당한다.
 * (!검구, !어구, !심구, !숙제)
 *
 * ⚠️ 어구/심구/숙제는 API를 못 찾으셨다고 하셔서 지어내지 않고 TODO로 남깁니다.
 */






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
  GoombaBot.registerCommand("검구", {
    category: "던전", summary: "검은 구멍 추천/추적 지역", usage: ["!검구"],
    execute: function (chat) {
      var config = P.getDeepHoleConfig();
      if (!config) { chat.reply(F.emoji.warn + " 검은 구멍 정보를 가져오지 못했습니다."); return; }

      // ⚠️ 필드 이름을 추측하지 않고, 응답에 실제로 있는 모든 필드를 자동으로 보여준다.
      // 배열/객체 형태의 값도 최대한 사람이 읽을 수 있는 형태로 펼친다.
      var lines = [];
      var count = 0;
      for (var key in config) {
        if (!config.hasOwnProperty(key)) continue;
        var val = config[key];
        if (val === null || val === undefined || val === "") continue;
        var displayVal;
        if (Object.prototype.toString.call(val) === "[object Array]") {
          if (val.length === 0) continue;
          displayVal = val.map(function (v) { return typeof v === "object" ? JSON.stringify(v) : String(v); }).join(", ");
        } else if (typeof val === "object") {
          displayVal = JSON.stringify(val);
        } else {
          displayVal = val;
        }
        lines.push(F.field(key, displayVal));
        count++;
      }

      if (count === 0) {
        chat.reply(F.box("\uD83D\uDD73 검은 구멍", [F.emoji.warn + " 응답은 왔지만 표시할 필드가 없습니다. 운영진에게 !진단 9로 실제 구조 확인을 요청해주세요."]));
        return;
      }
      chat.reply(F.box("\uD83D\uDD73 검은 구멍", lines));
    }
  });

  // ---- !어구 / !심구 / !숙제 (API 미확인 - TODO) ----
  function makeTodoCommand(name, label) {
    GoombaBot.registerCommand(name, {
      category: "던전", summary: label + " (API 확인 전)", usage: ["!" + name],
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



/**
 * fun.js
 * -------
 * 검색 기능과 완전히 독립적인 "숨겨진" 재미 명령어들을 담당한다.
 * 대사를 배열로 관리해서 나중에 자유롭게 추가/삭제할 수 있다.
 */


// ===== COMMANDS - 재미 기능 ==============================================
// ===================================================================
/**
 * (분리한다면: commands/fun.js)
 * 검색 기능과 완전히 독립적으로 관리되는 "숨겨진" 이스터에그 명령어들.
 * !도움/!명령어 목록에 안 나오도록 handler에 hidden:true를 붙인다 (COMMAND ROUTER의
 * !도움 구현이 이 플래그를 보고 걸러낸다).
 *
 * 대사를 배열로 관리하기 때문에, 나중에 재미 명령어가 100개로 늘어나도 이 객체에
 * 새 키만 추가하면 된다 - 아래 makeFunCommand 함수가 등록을 전부 대신 처리한다.
 */

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

// ===================================================================
// ===== !굼 (v1에서 이관 - 숨김 아님, 도움말에 보임) ======================
// ===================================================================
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


// ===================================================================



/**
 * admin.js
 * ---------
 * 운영진 전용 진단 명령어(!진단)를 담당한다.
 */






// ===================================================================
/** (분리한다면: commands/admin.js) */

(function () {
  var F = GoombaBot.format;

  GoombaBot.registerCommand("진단", {
    category: "관리자", adminOnly: true, summary: "API 연결 상태 확인 (실제 필드 구조까지 표시)", usage: ["!진단 [번호]"],
    execute: function (chat) {
      var targets = [
        { label: "룬", path: GoombaBotConfig.endpoints.runes },
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
        var result = GoombaBot.http.getRaw(t.path);
        var lines = [F.field("URL", result.url)];
        if (result.stage === "request") {
          lines.push(F.field("결과", F.emoji.red + " 요청 실패"), F.field("상태코드", result.statusCode !== null ? result.statusCode : "확인 불가"), F.field("에러", result.error));
        } else if (!result.ok) {
          lines.push(F.field("결과", F.emoji.red + " JSON 파싱 실패"), F.field("에러", result.parseError), "", F.field("응답 미리보기", result.bodyPreview));
        } else {
          lines.push(F.field("결과", F.emoji.green + " 성공"));
          lines.push(F.field("최상위 형태", result.structure.rootType));
          if (result.structure.rootKeys.length) lines.push(F.field("최상위 키", result.structure.rootKeys.join(", ")));
          lines.push(F.field("실제 추출된 개수(toArray 기준)", result.structure.extractedCount));
          if (result.structure.firstItemKeys.length) {
            lines.push("", F.emoji.search + " 첫 항목의 실제 필드명");
            lines.push(F.bulletList(result.structure.firstItemKeys));
          } else if (result.structure.extractedCount === 0) {
            lines.push("", F.emoji.warn + " toArray()로 추출된 항목이 0개입니다 - 응답이 {items:[...]} 나 {data:[...]} 형태가 아닐 수 있습니다. 아래 미리보기를 확인해주세요.");
            lines.push("", F.field("응답 미리보기", result.bodyPreview));
          }
        }
        chat.reply(F.box(F.emoji.admin + " API 진단 - " + t.label, lines));
        return;
      }

      var out = [F.emoji.admin + " API 진단 (요약 - 상세: !진단 1~" + targets.length + ")", ""];
      for (var i = 0; i < targets.length; i++) {
        var r = GoombaBot.http.getRaw(targets[i].path);
        var statusIcon;
        var detail;
        if (r.stage === "request") {
          statusIcon = F.emoji.red;
          detail = "요청실패(" + (r.statusCode || "?") + ")";
        } else if (!r.ok) {
          statusIcon = F.emoji.red;
          detail = "파싱실패";
        } else if (r.structure.extractedCount === 0 && r.structure.rootType !== "object") {
          statusIcon = F.emoji.warn;
          detail = "응답은 왔지만 0건 추출";
        } else {
          statusIcon = F.emoji.green;
          detail = "성공 (" + r.structure.extractedCount + "건)";
        }
        out.push(statusIcon + " [" + (i + 1) + "] " + targets[i].label + " : " + detail);
      }
      chat.reply(out.join("\n"));
    }
  });
})();


// ===================================================================



// ===== INITIALIZATION ================================================
// ===================================================================
/** (분리한다면: index.js - 엔트리 포인트) 가장 마지막에 실행되어야 한다. */

GoombaBot.bot = BotManager.getCurrentBot();
GoombaBot.bot.setCommandPrefix(GoombaBotConfig.commandPrefix);
GoombaBot.bot.addListener(Event.COMMAND, GoombaBot.dispatchCommand);
GoombaBot.bot.addListener(Event.TICK, GoombaBot.dispatchTick);

GoombaBot.log(
  "GoombaBot 초기화 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
  "개, 모니터 " + GoombaBot.monitors.length + "개 등록됨 (prefix: " + GoombaBotConfig.commandPrefix + ")"
);

