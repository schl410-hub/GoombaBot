
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
  /**
   * ⚠️ 실제로 Http.requestSync가 몇 번 호출됐는지 경로별로 누적 집계한다(재시도 포함).
   * 봇이 켜져있는 동안 계속 누적되며, !속도진단에서 "정말 캐시가 걸려서 API를 다시
   * 안 부르는지"를 실측으로 보여주는 데 쓴다.
   */
  var callCounts = {};
  function recordCall(url) {
    var key = String(url).replace(String(GoombaBotConfig.apiBase), "").split("?")[0];
    callCounts[key] = (callCounts[key] || 0) + 1;
  }

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
      recordCall(url);
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
      recordCall(url);
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

    // ⚠️ Worker가 진단용으로 응답에 "_debug" 필드를 실어주는 경우(예: 공식 공지/이벤트/
    // 업데이트 파싱) 그대로 같이 넘겨준다 - items가 0건일 때 실제 받아온 HTML이 어떻게
    // 생겼는지(길이/앞뒤 미리보기/리다이렉트 여부)를 !진단에서 바로 볼 수 있게.
    var debugInfo = (parsed && typeof parsed === "object" && parsed._debug) ? parsed._debug : null;

    return { ok: true, stage: "done", url: url, topType: topType, topKeys: topKeys, arrayCount: arr.length, firstItemKeys: firstItemKeys, debugInfo: debugInfo };
  }

  /**
   * jsoup을 완전히 우회하는 1순위 방법 - Java의 URLConnection/InputStream을 LiveConnect로
   * 직접 사용한다. 실패하면 예외를 던진다(호출부에서 2순위로 넘어감).
   */
  function fetchViaJavaUrlConnection(url) {
    var javaUrl = new Packages.java.net.URL(String(url));
    var conn = javaUrl.openConnection();
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(15000);
    conn.setRequestProperty(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    );

    var inputStream = conn.getInputStream();
    var reader = new Packages.java.io.BufferedReader(new Packages.java.io.InputStreamReader(inputStream, "UTF-8"));
    var sb = new Packages.java.lang.StringBuilder();
    var line = reader.readLine();
    var isFirst = true;
    while (line !== null) {
      if (!isFirst) sb.append("\n");
      sb.append(line);
      isFirst = false;
      line = reader.readLine();
    }
    reader.close();
    return String(sb.toString());
  }

  /**
   * JSON이 아니라 순수 텍스트(예: GitHub의 코드 파일 원문)를 그대로 받아온다.
   * 1순위로 Java URLConnection(jsoup 완전 우회)을 시도하고, 실패하면 2순위로
   * Http.requestSync로 넘어간다.
   */
  function getRawText(url, timeoutMs) {
    try {
      return fetchViaJavaUrlConnection(url);
    } catch (javaError) {
      var requestOption = { url: String(url), method: "GET", timeout: timeoutMs || DEFAULT_TIMEOUT_MS, headers: mergeHeaders(null) };
      var doc = Http.requestSync(requestOption);
      try { return String(doc.body().text()); } catch (e1) {}
      try { return String(doc.text()); } catch (e2) {}
      return String(doc);
    }
  }

  /**
   * 순수 JavaScript(ES5)로 직접 구현한 base64 디코더 - loader.js와 완전히 동일한 구현.
   * !굼바봇 업데이트(botcontrol.js)가 GitHub의 코드 파일을 받아서 디코딩할 때 쓴다.
   */
  function base64Decode(b64) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var str = String(b64).replace(/[^A-Za-z0-9\+\/\=]/g, "");
    var output = [];
    var enc1, enc2, enc3, enc4;
    var i = 0;

    while (i < str.length) {
      enc1 = chars.indexOf(str.charAt(i++));
      enc2 = chars.indexOf(str.charAt(i++));
      enc3 = chars.indexOf(str.charAt(i++));
      enc4 = chars.indexOf(str.charAt(i++));

      var chr1 = (enc1 << 2) | (enc2 >> 4);
      var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      var chr3 = ((enc3 & 3) << 6) | enc4;

      output.push(String.fromCharCode(chr1));
      if (enc3 !== 64) output.push(String.fromCharCode(chr2));
      if (enc4 !== 64) output.push(String.fromCharCode(chr3));
    }

    var byteStr = output.join("");
    var result = "";
    var j = 0;
    while (j < byteStr.length) {
      var c1 = byteStr.charCodeAt(j);
      if (c1 < 0x80) {
        result += String.fromCharCode(c1);
        j++;
      } else if (c1 >= 0xC0 && c1 < 0xE0) {
        var c2 = byteStr.charCodeAt(j + 1);
        result += String.fromCharCode(((c1 & 0x1F) << 6) | (c2 & 0x3F));
        j += 2;
      } else if (c1 >= 0xE0 && c1 < 0xF0) {
        var c2b = byteStr.charCodeAt(j + 1);
        var c3b = byteStr.charCodeAt(j + 2);
        result += String.fromCharCode(((c1 & 0x0F) << 12) | ((c2b & 0x3F) << 6) | (c3b & 0x3F));
        j += 3;
      } else {
        var c2c = byteStr.charCodeAt(j + 1);
        var c3c = byteStr.charCodeAt(j + 2);
        var c4c = byteStr.charCodeAt(j + 3);
        var codepoint = ((c1 & 0x07) << 18) | ((c2c & 0x3F) << 12) | ((c3c & 0x3F) << 6) | (c4c & 0x3F);
        codepoint -= 0x10000;
        result += String.fromCharCode(0xD800 + (codepoint >> 10), 0xDC00 + (codepoint & 0x3FF));
        j += 4;
      }
    }
    return result;
  }

  /**
   * ⚠️ 공식공지/이벤트/업데이트(officialnews.js) 전용 - Worker가 base64로 감싼
   * 응답({b64:"..."})을 풀어서 inspect()와 똑같은 형태로 돌려준다. jsoup이 순수
   * 텍스트를 오염시키는 문제를 base64로 우회한 것이라, 진단할 때도 똑같이 풀어야
   * 실제 내용을 볼 수 있다.
   */
  function inspectBase64Wrapped(path, timeoutMs) {
    var url = String(GoombaBotConfig.apiBase) + String(path);
    var requestOption = { url: String(url), method: "GET", timeout: timeoutMs || DEFAULT_TIMEOUT_MS, headers: mergeHeaders(null) };

    var doc;
    try {
      recordCall(url);
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

    var outer;
    try {
      outer = JSON.parse(extracted.text);
    } catch (parseError) {
      var fullText = extracted.text ? String(extracted.text) : "";
      return {
        ok: false, stage: "parse(outer/b64래퍼)", url: url, error: describeError(parseError),
        bodyLength: fullText.length,
        bodyHead: fullText ? fullText.substring(0, 200) : "(빈 응답)",
        bodyTail: fullText.length > 200 ? fullText.substring(Math.max(0, fullText.length - 200)) : ""
      };
    }

    if (!outer || typeof outer.b64 !== "string") {
      return { ok: false, stage: "b64필드없음", url: url, error: "응답에 b64 필드가 없습니다(래핑 형식이 예상과 다름)" };
    }

    var parsed;
    try {
      var decodedText = GoombaBot.http.base64Decode(outer.b64);
      parsed = JSON.parse(decodedText);
    } catch (decodeError) {
      return { ok: false, stage: "parse(디코딩후)", url: url, error: describeError(decodeError) };
    }

    var topType = Object.prototype.toString.call(parsed) === "[object Array]" ? "array" : (typeof parsed === "object" ? "object" : typeof parsed);
    var topKeys = topType === "object" ? Object.keys(parsed) : null;
    var arr = GoombaBot.http.toArray(parsed);
    var firstItemKeys = (arr.length > 0 && arr[0] && typeof arr[0] === "object") ? Object.keys(arr[0]) : null;
    var firstItemTitle = (arr.length > 0 && arr[0] && arr[0].title) ? String(arr[0].title) : null;
    var debugInfo = (parsed && typeof parsed === "object" && parsed._debug) ? parsed._debug : null;

    return {
      ok: true, stage: "done", url: url, topType: topType, topKeys: topKeys, arrayCount: arr.length,
      firstItemKeys: firstItemKeys, firstItemTitle: firstItemTitle, debugInfo: debugInfo
    };
  }

  return { getJson: getJson, getJsonFromUrl: getJsonFromUrl, getRawText: getRawText, inspect: inspect, inspectBase64Wrapped: inspectBase64Wrapped, base64Decode: base64Decode, callCounts: callCounts };
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

/**
 * 어떤 zero-arg 조회 함수든 메모리 TTL 캐시로 감싼다. 같은 실행 세션 안에서는
 * TTL이 지나기 전까지 fn()을 다시 호출하지 않고 그 자리에서 바로 반환한다
 * (디스크 캐시보다 한 단계 더 빠름 - Database 읽기/JSON 파싱조차 생략).
 */
GoombaBot.http.memoize = function (fn, ttlMs) {
  var cache = null;
  var cachedAt = 0;
  var wrapped = function () {
    var now = Date.now();
    if (cache !== null && (now - cachedAt) < ttlMs) return cache;
    cache = fn();
    cachedAt = now;
    return cache;
  };
  // ⚠️ "!시세 새로고침" 같은 수동 강제 갱신용 - 메모리 캐시를 비워서 다음 호출 때
  // 무조건 fn()을 다시 실행하게 만든다. 기존 memoize(fn, ttl)() 호출부는 전혀
  // 안 바뀌고(그냥 함수 호출), 이 메서드를 쓰는 곳에서만 추가로 활용한다.
  wrapped.reset = function () { cache = null; cachedAt = 0; };
  return wrapped;
};

module.exports = { GoombaBot: GoombaBot };

