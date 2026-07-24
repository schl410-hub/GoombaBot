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

  /** JSON이 아니라 순수 텍스트(예: GitHub의 main.js 소스코드 원문)를 그대로 받아온다 */
  function getRawText(url, timeoutMs) {
    var requestOption = { url: String(url), method: "GET", timeout: timeoutMs || DEFAULT_TIMEOUT_MS, headers: mergeHeaders(null) };
    var doc = Http.requestSync(requestOption); // 실패하면 예외가 그대로 호출부로 전파됨 (의도적)
    return extractBodyText(doc).text;
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

  return { getJson: getJson, getJsonFromUrl: getJsonFromUrl, getRawText: getRawText, inspect: inspect };
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
