  // Catalog-only fallback. A 403 is never treated as a successful live response.
  var catalogSnapshots = {"/runes":{"label":"룬","key":null,"count":1764,"fetchedAt":"2026-10-26T19:46:52.909Z","url":"https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/data/catalog-snapshots/2026-10-27-0446/runes.json"},"/rune-words/catalog":{"label":"룬워드","key":"words","count":198,"fetchedAt":"2026-10-26T19:46:54.705Z","url":"https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/data/catalog-snapshots/2026-10-27-0446/rune-words-catalog.json"},"/enchants":{"label":"인챈트","key":null,"count":80,"fetchedAt":"2026-10-26T19:46:55.974Z","url":"https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/data/catalog-snapshots/2026-10-27-0446/enchants.json"},"/artifacts":{"label":"아티팩트","key":null,"count":36,"fetchedAt":"2026-10-26T19:46:57.008Z","url":"https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/data/catalog-snapshots/2026-10-27-0446/artifacts.json"},"/titles/catalog":{"label":"칭호","key":"titles","count":280,"fetchedAt":"2026-10-26T19:46:58.635Z","url":"https://raw.githubusercontent.com/schl410-hub/GoombaBot/main/data/catalog-snapshots/2026-10-27-0446/titles-catalog.json"}};
  var catalogStateKey = "catalog_sources_v1";
  var catalogSources = null;
  function sources() {
    if (!catalogSources) catalogSources = GoombaBot.storage.readStale(catalogStateKey) || {};
    return catalogSources;
  }
  function markCatalog(path) {
    if (!catalogSnapshots.hasOwnProperty(path)) return;
    GoombaBot._catalogLastPath = path;
    GoombaBot._catalogUsed = GoombaBot._catalogUsed || {};
    GoombaBot._catalogUsed[path] = true;
  }
  function saveSource(path, value) {
    sources()[path] = value;
    try { GoombaBot.storage.write(catalogStateKey, sources()); }
    catch (storageError) { GoombaBot.log("도감 출처 저장 실패: " + storageError); }
    markCatalog(path);
  }
  GoombaBot.catalogFallback = {
    mark: markCatalog,
    sources: sources,
    notes: function () {
      var notes = [], used = GoombaBot._catalogUsed || {}, all = sources();
      for (var path in used) {
        if (used.hasOwnProperty(path) && all[path] && all[path].source === "snapshot") {
          notes.push("⚠ " + catalogSnapshots[path].label + ": 원본 403으로 GitHub 보관본 사용 (수집: " + all[path].fetchedAt + ")");
        }
      }
      return notes;
    }
  };
  var liveGetJson = getJson;
  getJson = function (path, options) {
    path = String(path);
    var snapshot = catalogSnapshots.hasOwnProperty(path) ? catalogSnapshots[path] : null;
    try {
      var data = liveGetJson(path, options);
      if (snapshot) saveSource(path, { source: "live", checkedAt: new Date().toISOString() });
      return data;
    } catch (liveError) {
      if (!snapshot || !/HTTP 403\b/.test(String(liveError))) throw liveError;
      try {
        var envelope = JSON.parse(getRawText(snapshot.url, 20000));
        var fetched = Date.parse(envelope.fetchedAt);
        var age = Date.now() - fetched;
        var rows = envelope.data;
        if (snapshot.key) rows = rows && rows[snapshot.key];
        if (envelope.path !== path || envelope.fetchedAt !== snapshot.fetchedAt ||
            !isFinite(fetched) || age < -300000 || age > 7 * 24 * 60 * 60 * 1000 ||
            Object.prototype.toString.call(rows) !== "[object Array]" || rows.length !== snapshot.count) {
          throw new Error("보관본 경로/수집 시각/건수 검증 실패 또는 7일 유효기간 만료");
        }
        saveSource(path, { source: "snapshot", fetchedAt: envelope.fetchedAt, reason: "HTTP 403" });
        GoombaBot.log("원본 403 - 도감 보관본 사용: " + path + " / " + envelope.fetchedAt);
        return envelope.data;
      } catch (snapshotError) {
        throw new Error(String(liveError) + " / 보관본 조회도 실패: " + String(snapshotError));
      }
    }
  };