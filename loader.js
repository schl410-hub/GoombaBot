/**
 * loader.js
 * -----------
 * 이 파일을 메신저봇R에 딱 한 번만 붙여넣으면 됩니다. 이후로는 다시 건드릴 필요가
 * 없습니다 - 실제 기능(명령어 등)은 전부 GitHub에서 자동으로 받아옵니다.
 */

var GOOMBABOT_MAIN_JS_B64_URL = "https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/main.js.b64";
var GOOMBABOT_REPORT_ROOM = "라쿤 모비노기 길드방";

var GoombaBotRuntime = {};

function goombaBase64Decode(b64) {
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

function goombaFetchViaJavaUrlConnection(url) {
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

function goombaFetchViaHttpRequestSync(url) {
  var doc = Http.requestSync({
    url: String(url),
    method: "GET",
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    }
  });
  try { return String(doc.body().text()); } catch (e1) {}
  try { return String(doc.text()); } catch (e2) {}
  return String(doc);
}

function goombaLoaderFetchAndApply(url, report) {
  report = report || function () {};
  var result = { success: false, error: null, length: 0 };

  // ⚠️ raw.githubusercontent.com은 CDN 캐시가 붙어있어서, GitHub에는 새 파일이
  // 정상적으로 올라가 있어도 캐시가 아직 안 갱신되면 예전 내용을 계속 돌려줄 수 있다
  // (실기기에서 "!로더업데이트는 성공했다는데 !버전은 그대로"인 현상으로 확인됨).
  // 매번 URL 끝에 현재 시각을 붙여서 완전히 새로운 요청으로 취급되게 만들어 캐시를 우회한다.
  var cacheBustedUrl = String(url) + (String(url).indexOf("?") === -1 ? "?" : "&") + "_cb=" + new Date().getTime();

  var b64Text = null;
  try {
    b64Text = goombaFetchViaJavaUrlConnection(cacheBustedUrl);
  } catch (javaError) {
    try {
      b64Text = goombaFetchViaHttpRequestSync(cacheBustedUrl);
    } catch (httpError) {
      result.error = "다운로드 실패";
      report(result.error);
      return result;
    }
  }

  if (!b64Text || b64Text.length < 100) {
    result.error = "받아온 코드가 비정상적으로 짧습니다";
    report(result.error);
    return result;
  }

  var code;
  try {
    code = goombaBase64Decode(b64Text);
  } catch (decodeError) {
    result.error = "코드 적용 실패";
    report(result.error);
    return result;
  }
  if (!code || code.length < 200) {
    result.error = "코드가 비정상적으로 짧습니다";
    report(result.error);
    return result;
  }
  result.length = code.length;

  try {
    var indirectEval = eval;
    indirectEval(code);
  } catch (evalError) {
    result.error = "코드 적용 중 오류 (기존 상태 유지됨)";
    report(result.error);
    return result;
  }

  if (typeof GoombaBotRuntime.dispatchCommand !== "function") {
    result.error = "코드가 올바르지 않습니다";
    report(result.error);
    return result;
  }

  result.success = true;
  return result;
}

var goombaBot = BotManager.getCurrentBot();
goombaBot.setCommandPrefix("!");

function goombaReportToRoom(message) {
  try { if (GOOMBABOT_REPORT_ROOM) goombaBot.send(GOOMBABOT_REPORT_ROOM, message); } catch (sendError) {}
  try { Log.i("GoombaBotLoader", message); } catch (logError) {}
}

goombaBot.addListener(Event.COMMAND, function (chat) {
  if (chat.command === "로더업데이트") {
    var r = goombaLoaderFetchAndApply(GOOMBABOT_MAIN_JS_B64_URL, function (step) { chat.reply(step); });
    chat.reply(r.success ? "\uD83D\uDD27 업데이트 완료" : "\u274C 업데이트 실패: " + r.error);
    return;
  }
  if (GoombaBotRuntime.dispatchCommand) GoombaBotRuntime.dispatchCommand(chat);
});

goombaBot.addListener(Event.TICK, function () {
  if (GoombaBotRuntime.dispatchTick) GoombaBotRuntime.dispatchTick();
});

try {
  var goombaInitialResult = goombaLoaderFetchAndApply(GOOMBABOT_MAIN_JS_B64_URL, function () {});
  goombaReportToRoom(goombaInitialResult.success
    ? "\uD83C\uDF44 굼바봇이 시작됐습니다!"
    : "\u26A0\uFE0F 굼바봇 시작 실패: " + goombaInitialResult.error + "\n(\"!로더업데이트\"로 다시 시도할 수 있습니다)");
} catch (topLevelError) {
  try { Log.i("GoombaBotLoader", "최초 실행 중 오류: " + topLevelError); } catch (ignore) {}
}
