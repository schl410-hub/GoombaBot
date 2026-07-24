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
        { label: "검은구멍", path: GoombaBotConfig.endpoints.deepHoleConfig }
      ];

      var indexArg = parseInt(chat.args[0], 10);
      var singleIndex = !isNaN(indexArg) && indexArg >= 1 && indexArg <= targets.length ? indexArg - 1 : -1;

      if (singleIndex !== -1) {
        var t = targets[singleIndex];
        var r2 = GoombaBot.http.inspect(t.path, t.timeout);
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
        }
        chat.reply(F.box(F.emoji.admin + " API 진단 - " + t.label, lines));
        return;
      }

      var out = [F.emoji.admin + " API 진단 (요약 - 상세: !진단 1~" + targets.length + ")", ""];
      for (var i = 0; i < targets.length; i++) {
        var rr = GoombaBot.http.inspect(targets[i].path, targets[i].timeout);
        var icon = rr.ok ? F.emoji.green : F.emoji.red;
        var extra = rr.ok ? ("(" + rr.arrayCount + "건)") : ("(" + rr.stage + (rr.statusCode ? " " + rr.statusCode : "") + ")");
        out.push("[" + (i + 1) + "] " + icon + " " + targets[i].label + " " + extra);
      }
      chat.reply(out.join("\n"));
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };
