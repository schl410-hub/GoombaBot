
/**
 * commands/admin.js
 * --------------------
 * 운영진 전용 진단 명령어(!진단)를 담당한다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

(function () {
  var F = GoombaBot.format;

  GoombaBot.registerCommand("진단", {
    category: "관리자", adminOnly: true, summary: "API 연결 상태 확인 (🟢/🔴)", usage: ["!진단", "!진단 [1~9]"],
    detail: { title: F.emoji.admin + " API 진단", examples: ["!진단", "!진단 1"], features: ["요약: 각 API의 🟢성공/🔴실패를 한눈에", "!진단 [번호]: 최상위 형태/키, 배열 추출 개수, 첫 항목의 실제 필드명까지 노출"] },
    execute: function (chat) {
      var targets = [
        { label: "룬", path: GoombaBotConfig.endpoints.runes, timeout: 20000 },
        { label: "룬워드", path: GoombaBotConfig.endpoints.runeWords },
        { label: "인챈트", path: GoombaBotConfig.endpoints.enchants },
        { label: "아티팩트", path: GoombaBotConfig.endpoints.artifacts },
        { label: "칭호", path: GoombaBotConfig.endpoints.titles },
        { label: "아이템", path: GoombaBotConfig.endpoints.items },
        { label: "공지", path: GoombaBotConfig.endpoints.notices },
        { label: "점검상태", path: GoombaBotConfig.endpoints.maintenanceStatus },
        { label: "검은구멍", path: GoombaBotConfig.endpoints.deepHoleConfig },
        { label: "시세", path: GoombaBotConfig.endpoints.marketPrices + "?sort=pct_change_24h_desc&limit=100&offset=0" },
        { label: "공식공지", path: GoombaBotConfig.endpoints.officialNotice, base64Wrapped: true },
        { label: "공식이벤트", path: GoombaBotConfig.endpoints.officialEvents, base64Wrapped: true },
        { label: "공식업데이트", path: GoombaBotConfig.endpoints.officialUpdate, base64Wrapped: true }
      ];

      var indexArg = parseInt(chat.args[0], 10);
      var singleIndex = !isNaN(indexArg) && indexArg >= 1 && indexArg <= targets.length ? indexArg - 1 : -1;

      if (singleIndex !== -1) {
        var t = targets[singleIndex];
        // ⚠️ 공식공지/이벤트/업데이트는 Worker가 base64로 감싸서 보내므로(jsoup이
        // 순수 텍스트를 오염시키는 문제 우회용) 전용 진단 함수로 풀어서 봐야 한다.
        var r2 = t.base64Wrapped ? GoombaBot.http.inspectBase64Wrapped(t.path, t.timeout) : GoombaBot.http.inspect(t.path, t.timeout);
        var lines = [F.field("URL", r2.url)];
        if (!r2.ok) {
          lines.push(F.field("상태", F.emoji.red + " 실패 (" + r2.stage + ")"));
          if (r2.statusCode !== undefined && r2.statusCode !== null) lines.push(F.field("HTTP 상태코드", r2.statusCode));
          if (r2.error) lines.push(F.field("에러", r2.error));
          if (r2.bodyLength !== undefined) lines.push(F.field("응답 전체 길이", r2.bodyLength + "자"));
          if (r2.bodyHead) lines.push("", F.field("응답 앞부분", r2.bodyHead));
          if (r2.bodyTail) lines.push("", F.field("응답 끝부분", r2.bodyTail));
        } else {
          lines.push(F.field("상태", F.emoji.green + " 성공"));
          lines.push(F.field("최상위 형태", r2.topType));
          if (r2.topKeys) lines.push(F.field("최상위 키", r2.topKeys.join(", ")));
          lines.push(F.field("배열 추출 개수", r2.arrayCount + "건"));
          if (r2.firstItemKeys) lines.push(F.field("첫 항목 실제 필드명", r2.firstItemKeys.join(", ")));
          if (r2.firstItemTitle) lines.push(F.field("첫 항목 제목", r2.firstItemTitle));
          // ⚠️ 공식 공지/이벤트/업데이트처럼 Worker가 HTML을 파싱하는 경우, 0건일 때
          // 원인을 바로 알 수 있도록 Worker가 실어준 디버그 정보를 그대로 보여준다.
          if (r2.debugInfo) {
            lines.push("", F.field("(디버그) 받아온 HTML 길이", r2.debugInfo.htmlLength + "자"));
            if (r2.debugInfo.newsAnchorCount !== undefined) lines.push(F.field("(디버그) News 링크 패턴 발견 개수", r2.debugInfo.newsAnchorCount));
          }
        }
        chat.reply(F.box(F.emoji.admin + " API 진단 - " + t.label, lines));
        return;
      }

      var out = [F.emoji.admin + " API 진단 (요약 - 상세: !진단 1~" + targets.length + ")", ""];
      for (var i = 0; i < targets.length; i++) {
        var rr = targets[i].base64Wrapped
          ? GoombaBot.http.inspectBase64Wrapped(targets[i].path, targets[i].timeout)
          : GoombaBot.http.inspect(targets[i].path, targets[i].timeout);
        var icon = rr.ok ? F.emoji.green : F.emoji.red;
        var extra = rr.ok ? ("(" + rr.arrayCount + "건)") : ("(" + rr.stage + (rr.statusCode ? " " + rr.statusCode : "") + ")");
        out.push("[" + (i + 1) + "] " + icon + " " + targets[i].label + " " + extra);
      }
      chat.reply(out.join("\n"));
    }
  });

  /**
   * ⚠️ 성능 분석 전용 - 기존 검색 명령어(!룬 등)는 전혀 건드리지 않는다. 룬 데이터를
   * 기준으로 "API 호출 → 배열 추출 → 메모리 캐시 적중 → 정확일치 검색"의 각 단계가
   * 실제 기기에서 몇 ms인지 그대로 보여준다. 결과를 보고 어디가 병목인지 판단하는 용도.
   */
  GoombaBot.registerCommand("속도진단", {
    category: "관리자", adminOnly: true, summary: "검색 성능(API호출/배열추출/캐시적중/검색) 단계별 소요시간 측정", usage: ["!속도진단"],
    detail: {
      title: F.emoji.admin + " 속도 진단", examples: ["!속도진단"],
      features: ["룬 데이터를 기준으로 API호출/배열추출/캐시적중/검색 각 단계 소요시간(ms)을 그대로 보여줍니다", "실제 병목이 어디인지 판단하는 용도(코드 수정 없음)"]
    },
    execute: function (chat) {
      var lines = [F.emoji.admin + " 속도 진단 (룬 기준)", ""];

      // ⚠️ 지금까지(봇이 켜진 뒤부터) 각 API가 실제로 몇 번 호출됐는지 - 이 숫자는
      // !속도진단을 실행하기 전부터 누적된 값이다. 이 명령어를 여러 번 실행해도
      // "이전 실행 전"과 "이후" 값을 비교하면 몇 번 늘었는지 알 수 있다.
      var before = {
        runes: GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0,
        runeWords: GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runeWords] || 0,
        items: GoombaBot.http.callCounts[GoombaBotConfig.endpoints.items] || 0
      };
      lines.push("\uD83D\uDCCA 지금까지 누적 API 호출 횟수 (이 명령어 실행 전 기준)");
      lines.push("• 룬 API: " + before.runes + "회");
      lines.push("• 룬워드 API: " + before.runeWords + "회");
      lines.push("• 아이템 API: " + before.items + "회");
      lines.push("");

      // ① API 호출 - 캐시를 거치지 않고 getJson()을 직접 호출해서 "지금 이 순간" 실제
      // 네트워크(+JSON파싱)가 얼마나 걸리는지 그대로 잰다.
      // ⚠️ 이 단계는 측정 목적으로 캐시를 일부러 건너뛰는 강제 호출이라, 아래 호출
      // 횟수에 +1이 무조건 반영된다(실제 검색에서는 발생하지 않는 추가 호출).
      var t0 = Date.now();
      var coldJson = null, coldError = null;
      try {
        coldJson = GoombaBot.http.getJson(GoombaBotConfig.endpoints.runes, { timeout: 20000 });
      } catch (e) { coldError = e; }
      var t1 = Date.now();
      lines.push("① API 호출(캐시 안 거침, 지금 직접 요청 - 측정용 강제 호출): " + (t1 - t0) + "ms" + (coldError ? " (실패: " + coldError + ")" : ""));

      // ② 배열 추출 - toArray()가 JSON 구조에서 배열을 뽑아내는 시간(파싱 자체는 이미
      // ①에 포함되어 있어 완전히 분리는 안 되지만, 추가 처리 비용은 이걸로 확인 가능).
      var t2a = Date.now();
      var arr = coldJson ? GoombaBot.http.toArray(coldJson) : [];
      var t2 = Date.now();
      lines.push("② 배열 추출: " + (t2 - t2a) + "ms (" + arr.length + "건)");

      // ③④ 실제 사용 중인 getRunes()(memoize 적용됨)를 연달아 두 번 호출 - 1차는 이번
      // 요청에서 처음이라 디스크캐시나 네트워크를 탈 수 있고, 2차는 메모리캐시 적중을
      // 기대한다. 두 값의 차이가 "메모리 캐시가 실제로 효과가 있는지"를 그대로 보여준다.
      var t3a = Date.now();
      var runes1 = GoombaBot.provider.getRunes();
      var t3b = Date.now();
      var runes2 = GoombaBot.provider.getRunes();
      var t3c = Date.now();
      var runesCallsDuringThis = (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0) - before.runes - 1; // -1은 위 ①의 강제호출분 제외
      lines.push("③ getRunes() 1차 호출(디스크캐시/네트워크 예상): " + (t3b - t3a) + "ms (" + runes1.length + "건)");
      lines.push("④ getRunes() 2차 호출(메모리캐시 적중 예상): " + (t3c - t3b) + "ms");
      lines.push("  → ③④ 두 번 호출하는 동안 룬 API가 실제로 늘어난 횟수: " + runesCallsDuringThis + "회 " + (runesCallsDuringThis <= 1 ? "(정상 - 0이면 이미 캐시돼있던 것, 1이면 ③에서 최초 1회 부르고 ④는 캐시 사용)" : "(⚠️ 2회 이상 - ④도 다시 API를 부르고 있어 캐시가 안 먹힘)"));

      // ⑤ 정확일치 검색 - 실제 !룬이 쓰는 것과 동일한 방식(전체 순회 후 이름 직접비교)의
      // 소요시간. 1756건 같은 큰 배열을 순회하는 게 실제로 느린지 여기서 확인 가능.
      var sampleKeyword = runes1.length ? String(GoombaBot.http.extractField(runes1[0], ["name", "title"])) : "";
      var t4a = Date.now();
      var exactCount = 0;
      for (var i = 0; i < runes1.length; i++) {
        if (String(GoombaBot.http.extractField(runes1[i], ["name", "title"])).replace(/\s+/g, "") === sampleKeyword.replace(/\s+/g, "")) exactCount++;
      }
      var t4b = Date.now();
      lines.push("⑤ 정확일치 검색(전체 " + runes1.length + "건 순회): " + (t4b - t4a) + "ms");

      // ⑥⑦ !룬 검색 시 룬워드도 매번 API를 다시 부르는지 확인 - getRuneWords()를
      // 연달아 두 번 호출해서 룬과 똑같은 방식으로 검증한다.
      var t5a = Date.now();
      var words1 = GoombaBot.provider.getRuneWords();
      var t5b = Date.now();
      var words2 = GoombaBot.provider.getRuneWords();
      var t5c = Date.now();
      var wordsCallsDuringThis = (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runeWords] || 0) - before.runeWords;
      lines.push("⑥ getRuneWords() 1차 호출: " + (t5b - t5a) + "ms (" + words1.length + "건)");
      lines.push("⑦ getRuneWords() 2차 호출(메모리캐시 적중 예상): " + (t5c - t5b) + "ms");
      lines.push("  → ⑥⑦ 두 번 호출하는 동안 룬워드 API가 실제로 늘어난 횟수: " + wordsCallsDuringThis + "회 " + (wordsCallsDuringThis <= 1 ? "(정상 - 최초 1회만 호출되고 그 다음은 메모리)" : "(⚠️ 매번 다시 호출되고 있음)"));

      lines.push("", "콜드 fetch~검색까지 총: " + (t4b - t0) + "ms");
      lines.push("④+⑤ 캐시 적중 상태일 때(2번째 검색부터) 체감 총합: " + ((t3c - t3b) + (t4b - t4a)) + "ms");

      lines.push("", "📊 이 명령어 실행 후 누적 API 호출 횟수");
      lines.push("• 룬 API: " + (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0) + "회 (이번 실행에서 +" + ((GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runes] || 0) - before.runes) + ", 그 중 1회는 ①의 측정용 강제호출)");
      lines.push("• 룬워드 API: " + (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.runeWords] || 0) + "회 (이번 실행에서 +" + wordsCallsDuringThis + ")");
      lines.push("• 아이템 API: " + (GoombaBot.http.callCounts[GoombaBotConfig.endpoints.items] || 0) + "회 (이번 실행에서 +" + ((GoombaBot.http.callCounts[GoombaBotConfig.endpoints.items] || 0) - before.items) + ")");

      chat.reply(lines.join("\n"));
    }
  });

  /**
   * ⚠️ !속도진단은 별도 명령어라 "정말 !룬이 같은 코드를 타는지" 의심이 남을 수 있다.
   * 이 토글을 켜면 !룬 등 실제 검색 명령어 뒤에 "이번 이 호출 자체의" 타이밍이
   * 별도 메시지로 덧붙는다(평소엔 안 보임 - 껐을 때는 기존 출력과 완전히 동일).
   */
  GoombaBot.isDebugTimingEnabled = function () {
    return GoombaBot.storage.readStale("debug_timing_enabled") === true;
  };

  GoombaBot.registerCommand("디버그모드", {
    category: "관리자", adminOnly: true, summary: "!룬 등 실제 검색 명령어에 타이밍 로그를 붙였다 뗐다 함", usage: ["!디버그모드 켜기", "!디버그모드 끄기"],
    detail: {
      title: F.emoji.admin + " 디버그 모드", examples: ["!디버그모드 켜기", "!디버그모드 끄기"],
      features: ["켜면 !룬 검색 결과 뒤에 실제 이번 호출의 데이터로딩/검색 소요시간이 별도 메시지로 따라붙습니다", "!속도진단이 아니라 실제 명령어 자체를 실측하기 위한 용도"]
    },
    execute: function (chat) {
      var sub = String(chat.args[0] || "");
      if (sub === "켜기") { GoombaBot.storage.write("debug_timing_enabled", true); chat.reply(F.emoji.admin + " 디버그 모드 켜짐 - 이제 !룬 검색 뒤에 타이밍이 따라붙습니다."); return; }
      if (sub === "끄기") { GoombaBot.storage.write("debug_timing_enabled", false); chat.reply(F.emoji.admin + " 디버그 모드 꺼짐."); return; }
      chat.reply(F.usageBlock(["!디버그모드 켜기", "!디버그모드 끄기"]));
    }
  });
  GoombaBot.registerCommand("버전", {
    category: "기본", summary: "지금 실행 중인 코드 버전 확인", usage: ["!버전"],
    detail: { title: F.emoji.admin + " 버전", examples: ["!버전"], features: ["GitHub에 올린 코드가 실제로 반영됐는지 확인할 때 사용"] },
    execute: function (chat) {
      chat.reply(F.emoji.admin + " 코드 버전: " + GoombaBotConfig.buildVersion);
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };

