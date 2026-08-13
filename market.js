
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
  // ⚠️ 실기기에서 "이상한 고양이의 특별 무기 선택 상자" 같은 아이템이 안 잡히는 문제
  // 발견 - 원인은 여기 있던 "page < 20"(200개×20페이지=최대 4000개) 하드코딩 상한이었음.
  // 24시간 변동률 내림차순 정렬이라, 가격이 잘 안 움직이는 비인기/희귀 아이템은 4000위
  // 밖으로 밀려서 아예 캐시에 못 들어오고 있었다. API가 스스로 "더 없다"고 할 때까지
  // (items.length < pageSize) 계속 가져오도록 바꾸고, 무한루프 방지용 안전상한만 훨씬
  // 넉넉하게(200페이지=4만개) 올려둔다.
  function fetchAllMarketPrices() {
    var all = [], pageSize = 200;
    for (var page = 0; page < 200; page++) {
      var json = GoombaBot.http.getJson(E.marketPrices + "?sort=pct_change_24h_desc&limit=" + pageSize + "&offset=" + (page * pageSize));
      var items = toArray(json);
      all = all.concat(items);
      if (items.length < pageSize) break;
    }
    return all;
  }
  var getMarketCatalog = GoombaBot.http.memoize(function () {
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
  }, GoombaBotConfig.cacheTtlMs.market);
  function searchMarket(keyword) { return GoombaBot.search.fuzzyFilter(getMarketCatalog(), keyword, function (r) { return String(extractField(r, ["name", "title"])); }); }

  GoombaBot.provider.getMarketCatalog = getMarketCatalog;
  GoombaBot.provider.searchMarket = searchMarket;
  // ⚠️ "!시세 새로고침"용 - 메모리(memoize)+디스크(storage) 캐시를 둘 다 비워야
  // 다음 조회에서 진짜로 새로 가져온다. 하나만 비우면 나머지 캐시가 여전히 예전
  // 데이터를 돌려줘서 소용없다.
  GoombaBot.provider.resetMarketCatalog = function () {
    getMarketCatalog.reset();
    GoombaBot.storage.remove("market_catalog");
  };
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

  var SEARCH_LIST_LIMIT = 10;
  function normalizeForExact(s) { return String(s).replace(/\s+/g, ""); }

  // ---- !시세 ----
  GoombaBot.registerCommand("시세", {
    category: "거래소", summary: "거래소 시세 조회", usage: ["!시세 아이템명", "!시세 마력석", "!시세 새로고침"],
    detail: {
      title: F.emoji.market + " 거래소 시세", examples: ["!시세 켈틱류트", "!시세 마력석"],
      features: [
        "이름이 정확히 일치하면 바로 시세를 보여줍니다",
        "최저가/평균가/최고가를 보여줍니다",
        "시세는 15분마다 자동 갱신됩니다. 급하면 관리자가 !시세 새로고침으로 즉시 갱신할 수 있습니다"
      ]
    },
    execute: function (chat) {
      // ⚠️ 신규 - 관리자가 캐시를 강제로 비우고 새로 가져오게 하는 서브커맨드.
      // 요청받은 배경: 새 품목이 등록돼도 캐시(15분) 때문에 바로 안 보이는 문제.
      if (String(chat.args[0]) === "새로고침") {
        if (!GoombaBot.isAdmin(chat.author.name)) {
          chat.reply(F.emoji.warn + " 이 기능은 관리자만 사용할 수 있습니다.");
          return;
        }
        P.resetMarketCatalog();
        var refreshed = P.getMarketCatalog();
        chat.reply(refreshed.length > 0
          ? F.emoji.ok + " 시세 캐시를 새로고침했습니다 (" + refreshed.length + "건)"
          : F.emoji.warn + " 새로고침 시도했지만 데이터를 가져오지 못했습니다.");
        return;
      }

      var keyword = chat.args.join(" ").trim();
      if (!keyword) { chat.reply(F.usageBlock(["!시세 아이템명", "!시세 마력석"])); return; }

      var catalog = P.getMarketCatalog();
      if (catalog.length === 0) { chat.reply(F.emoji.warn + " 시세 데이터를 가져오지 못했습니다."); return; }

      var normKeyword = normalizeForExact(keyword);
      // 1) 정확 일치를 먼저 빠르게 찾는다(유사검색보다 훨씬 빠름) - "분류: 이름"처럼
      // 콜론 뒤에 실제 이름이 오는 경우도 인식한다.
      var exactMatches = [];
      for (var i = 0; i < catalog.length; i++) {
        var itemName = String(extractField(catalog[i], ["name", "title"]));
        if (normalizeForExact(itemName) === normKeyword) { exactMatches.push(catalog[i]); continue; }
        var colonIdx = itemName.search(/[:：]/);
        if (colonIdx !== -1 && normalizeForExact(itemName.substring(colonIdx + 1)) === normKeyword) exactMatches.push(catalog[i]);
      }

      var item = null;
      if (exactMatches.length > 0) {
        item = exactMatches[0];
      } else {
        // 2) 정확 일치가 없으면 부분일치(포함) 검색 - fuzzyFilter 결과에는 부분일치가
        // 이미 포함되어 있다. ⚠️ 이전엔 여기서 바로 "비슷한 이름 추천(suggest)"으로
        // 넘어가서, "마력석"처럼 이름의 일부만 친 경우도 결과가 있는데 없다고 나오는
        // 버그가 있었다 - 부분일치 결과를 실제로 사용하도록 고쳤다.
        var results = P.searchMarket(keyword);
        if (results.length === 0) {
          chat.reply(F.emoji.error + " 검색 결과가 없습니다.");
          return;
        }
        if (results.length === 1) {
          item = results[0];
        } else {
          var lines = [F.emoji.search + " '" + keyword + "' 검색 결과 (" + results.length + "개)", ""];
          for (var ri = 0; ri < Math.min(results.length, SEARCH_LIST_LIMIT); ri++) {
            var ritem = results[ri];
            var riName = String(extractField(ritem, ["name", "title"]));
            var riPrice = GoombaBot.format.number(Number(extractField(ritem, ["min_price", "minPrice"]) || 0));
            lines.push("• " + riName + " " + riPrice + "데카");
          }
          if (results.length > SEARCH_LIST_LIMIT) lines.push("", "... 외 " + (results.length - SEARCH_LIST_LIMIT) + "개 더 (검색어를 더 구체적으로 입력해보세요)");
          chat.reply(lines.join("\n"));
          return;
        }
      }

      var name = String(extractField(item, ["name", "title"]));
      // ⚠️ "평균가"/"최고가"는 실제 API에 확인된 필드가 아닐 수 있어서, 있으면 보여주고
      // 없으면 "정보 없음"으로 정직하게 표시한다(지어내지 않음).
      chat.reply([
        F.emoji.market + " " + name + " 시세",
        "",
        F.field("최저가", GoombaBot.format.number(Number(extractField(item, ["min_price", "minPrice"]) || 0)) + " 데카"),
        F.field("평균가", extractField(item, ["avg_price", "avgPrice", "average_price"]) !== null ? GoombaBot.format.number(Number(extractField(item, ["avg_price", "avgPrice", "average_price"]))) + " 데카" : null),
        F.field("최고가", extractField(item, ["max_price", "maxPrice"]) !== null ? GoombaBot.format.number(Number(extractField(item, ["max_price", "maxPrice"]))) + " 데카" : null),
        "",
        F.emoji.clock + " 최근 갱신 : " + formatSyncedAt()
      ].join("\n"));
    }
  });

})();

module.exports = { GoombaBot: GoombaBot };

