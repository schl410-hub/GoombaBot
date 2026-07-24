/**
 * commands/market.js
 * ---------------------
 * 거래소 시세 조회 서비스 + !시세 명령어를 담당한다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

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

  function formatBlock(item) {
    var name = String(extractField(item, ["name", "title"]));
    var price = GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0));
    var count = extractField(item, ["total_count", "totalCount"]);
    var lines = [name, price + " \uB370\uCE74"];
    if (count !== null) lines.push(count + "\uAC1C");
    return lines.join("\n");
  }

  // ---- !시세 ----
  GoombaBot.registerCommand("시세", {
    category: "거래소", summary: "거래소 시세 조회 (카테고리/세트 검색 지원)", usage: ["!시세 아이템명", "!시세 마력석"],
    detail: {
      title: F.emoji.market + " 거래소 시세", examples: ["!시세 켈틱류트", "!시세 마력석"],
      features: ["검색어가 여러 아이템에 걸치면(예: 마력석/영혼석 세트) 전부 한 번에, 이름순으로 정렬해서 보여줍니다", "가격/등록개수/갱신시간이 항상 같이 표시됩니다"]
    },
    execute: function (chat) {
      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!시세 아이템명", "!시세 마력석"])); return; }
      var results = P.searchMarket(keyword);
      if (results.length === 0) {
        var allNames = [];
        var catalog = P.getMarketCatalog();
        for (var ni = 0; ni < catalog.length; ni++) allNames.push(String(extractField(catalog[ni], ["name", "title"])));
        var suggestions = GoombaBot.search.suggest(allNames, keyword, 3);
        var failLines = [F.emoji.error + ' "' + keyword + '" 시세 정보를 찾지 못했습니다.'];
        if (suggestions.length) {
          failLines.push("", "혹시 아래를 찾으셨나요?");
          for (var si = 0; si < suggestions.length; si++) failLines.push(F.emoji.search + " " + suggestions[si]);
        }
        chat.reply(failLines.join("\n"));
        return;
      }

      if (results.length === 1) {
        var item = results[0];
        var name = String(extractField(item, ["name", "title"]));
        chat.reply(F.box(F.emoji.market + " " + name + " 시세", [
          F.field("최저가", GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0)) + " 데카"),
          F.field("등록 개수", extractField(item, ["total_count", "totalCount"])),
          F.field("1시간 변동", F.changeArrow(Number(extractField(item, ["pct_change_1h", "pctChange1h"]) || 0))),
          F.field("24시간 변동", F.changeArrow(Number(extractField(item, ["pct_change_24h", "pctChange24h"]) || 0))),
          F.field("7일 변동", F.changeArrow(Number(extractField(item, ["pct_change_7d", "pctChange7d"]) || 0))),
          "", F.emoji.clock + " 갱신 : " + formatSyncedAt()
        ]));
        return;
      }

      // 여러 개 일치 - 카테고리/세트 검색으로 보고, 이름순 정렬해서 항목 단위로 자동분할
      var sorted = results.slice().sort(function (a, b) {
        var an = String(extractField(a, ["name", "title"]));
        var bn = String(extractField(b, ["name", "title"]));
        return an < bn ? -1 : (an > bn ? 1 : 0);
      });
      var blocks = [];
      for (var i = 0; i < sorted.length; i++) blocks.push(formatBlock(sorted[i]));
      var chunks = F.chunkBlocks(blocks, 1200);
      for (var c = 0; c < chunks.length; c++) {
        var header = [F.field("총", sorted.length + "개")];
        if (chunks.length > 1) header.push(F.field("묶음", (c + 1) + " / " + chunks.length));
        header.push("");
        chat.reply(F.box(F.emoji.market + ' "' + keyword + '" 시세', header.concat([chunks[c].join("\n\n"), "", F.emoji.clock + " 갱신 : " + formatSyncedAt()])));
      }
    }
  });

})();

module.exports = { GoombaBot: GoombaBot };
