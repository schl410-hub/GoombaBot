/**
 * commands/homework.js
 * -----------------------
 * 검은 구멍/어비스 구멍/심층 구멍/숙제 - 조회 서비스 + 명령어를 담당한다.
 * (!검구, !어구, !심구, !숙제)
 *
 * ⚠️ 어구/심구/숙제는 API를 못 찾으셨다고 하셔서 지어내지 않고 TODO로 남깁니다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

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
  // ⚠️ 추측 필드명(recommendedAreas 등)이 실제와 다르면 전부 "정보 없음"으로 보이던 문제가
  // 있었음 - 추측 대신 응답에 실제로 들어있는 필드를 F.renderDetail로 전부 자동 나열한다.
  // (필드명이 완전히 다르게 와도 정상 표시됨 - !진단 9번(검은구멍)으로 실제 필드명 확인 가능)
  GoombaBot.registerCommand("검구", {
    category: "던전", summary: "검은 구멍 추천/추적 지역", usage: ["!검구"],
    detail: { title: "\uD83D\uDD73 검은 구멍", examples: ["!검구"], features: ["응답에 실제로 들어있는 필드를 전부 자동으로 보여줍니다(필드명이 달라도 안전)"] },
    execute: function (chat) {
      var config = P.getDeepHoleConfig();
      if (!config) { chat.reply(F.emoji.warn + " 검은 구멍 정보를 가져오지 못했습니다. 운영진에게 !진단 9로 확인을 요청해주세요."); return; }

      var isArray = Object.prototype.toString.call(config) === "[object Array]";
      var out = [];
      if (isArray) {
        for (var i = 0; i < config.length; i++) {
          var entry = config[i];
          var entryName = extractField(entry, ["name", "area", "areaName", "title"]);
          var entryLines = F.renderDetailAll(entry, {});
          out.push((entryName ? "\u25B8 " + entryName : "\u25B8 " + (i + 1) + "\uBC88\uC9F8 \uC9C0\uC5ED") + (entryLines.length ? "\n" + entryLines.join("\n") : ""));
        }
      } else {
        out = F.renderDetailAll(config, {});
      }
      if (out.length === 0) { chat.reply(F.emoji.warn + " 검은 구멍 응답에서 표시할 필드를 찾지 못했습니다. !진단 9로 실제 구조를 확인해주세요."); return; }
      chat.reply(F.box("\uD83D\uDD73 검은 구멍", out));
    }
  });

  // ---- !어구 / !심구 / !숙제 (API 미확인 - TODO) ----
  function makeTodoCommand(name, label) {
    GoombaBot.registerCommand(name, {
      category: "던전", summary: label + " (API 확인 전)", usage: ["!" + name],
      detail: { title: F.emoji.warn + " " + label, examples: ["!" + name], features: ["API가 아직 확인되지 않아 추측으로 정보를 만들지 않습니다"] },
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

module.exports = { GoombaBot: GoombaBot };
