
/**
 * core/cache.js
 * --------------
 * Database API(메신저봇R API2) 기반 캐시 저장소(GoombaBot.storage)를 담당한다.
 */

var GoombaBot = require("./config.js").GoombaBot;
var GoombaBotConfig = require("./config.js").GoombaBotConfig;

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
  /** !굼바봇 재시작 등에서 캐시를 강제로 비울 때 쓴다. Database.remove가 없는 환경일 수도
   * 있어 방어적으로 try/catch 한다 (실패해도 조용히 넘어감 - 다음 TTL 만료 때 갱신됨). */
  function remove(key) {
    try { Database.remove(toFileName(key)); return true; } catch (e) { return false; }
  }
  return { read: read, readStale: readStale, write: write, getSyncedAt: getSyncedAt, remove: remove };
})();

module.exports = { GoombaBot: GoombaBot };

