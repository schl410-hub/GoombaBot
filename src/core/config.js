/**
 * core/config.js
 * ---------------
 * 프로젝트의 설정값(GoombaBotConfig)을 담당한다.
 *
 * ⚠️ 이 파일이 GoombaBot 공유 객체의 "유일한 원본"이다. 다른 모든 모듈은
 * require("../core/config.js").GoombaBot 으로 이 객체를 가져다 써야 하며,
 * 자기 나름대로 "var GoombaBot = GoombaBot || {}"로 새로 만들면 안 된다
 * (CommonJS에서 var는 모듈마다 독립된 스코프라서, 그러면 서로 다른 객체가 되어
 * 공유가 깨진다 - 실전에서 겪었던 문제).
 */

var GoombaBot = {};

var GoombaBotConfig = {
  commandPrefix: "!",

  // ⚠️ 사용자가 확인한 API들이 전부 "/d/api/v1/..." 형태라, 이전 프로젝트에서 확인된
  // mabimobi.life와 같은 사이트로 보고 이 베이스 URL을 사용합니다. 다르다면 이 값만 고치면
  // 전체 API 호출이 전부 맞게 바뀝니다.
  // ⚠️ 중계 서버(Cloudflare Worker)로 전환됨 - mabimobi.life가 메신저봇R 요청을
  // 사이트 전체에서 403으로 막고 있어서, 실제 요청은 이 Worker가 대신 보낸다.
  // Worker가 받은 경로(예: /runes)를 그대로 https://mabimobi.life/d/api/v1 뒤에 붙여서
  // 전달해주므로, 아래 endpoints 값들은 전혀 안 바꿔도 된다.
  apiBase: "https://goombabot-relay.schl410.workers.dev",

  endpoints: {
    runes: "/runes",
    runeUsage: "/runes/usage-batch",
    runeWords: "/rune-words/catalog",
    enchants: "/enchants",
    artifacts: "/artifacts",
    titles: "/titles/catalog",
    items: "/items",
    marketPrices: "/market/prices", // 이전 프로젝트에서 실제 확인된 시세 엔드포인트 재사용
    notices: "/notices",
    maintenanceStatus: "/maintenance-status",
    mainArticles: "/main/articles",
    popularRankings: "/rankings/popular",
    deepHoleConfig: "/deep-hole-config",
    worldChatRecent: "/world-chat/recent"
  },

  cacheTtlMs: {
    default: 30 * 60 * 1000, // 30분 - 대부분의 도감류 데이터
    notice: 10 * 60 * 1000, // 10분
    market: 30 * 60 * 1000 // 30분
  },

  // ⚠️ 메신저봇R(API2)은 고유 ID가 아니라 표시 닉네임 문자열로만 사람을 구분합니다.
  adminNames: ["신수아", "굼바굼바_빙결"],

  httpHeaders: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://mabimobi.life/",
    Origin: "https://mabimobi.life"
  },

  cacheFilePrefix: "goombabot2_cache_",
  pageSize: 10,

  // 자동 점검 알림 - 몇 초마다 maintenance-status를 확인할지
  maintenanceCheckIntervalMs: 60 * 1000, // 1분

  // 자동 알림을 보낼 방 목록
  alertRooms: ["라쿤 모비노기 길드방"],

  // ⚠️ !굼바봇 업데이트가 GitHub의 최신 main.js를 실제로 받아와서 반영할 때 쓰는 raw 주소.
  // 로더(loader.js)를 통해 실행 중일 때만 실제로 "즉시 반영"이 되고, 로더 없이 main.js를
  // 통째로 붙여넣은 예전 방식이면 이 명령어는 반영 확인만 해주고 실제로는 안 바뀐다
  // (자세한 원리는 loader.js와 commands/botcontrol.js 주석 참고).
  // 예: "https://raw.githubusercontent.com/사용자명/저장소명/main/main.js"
  githubMainJsRawUrl: null // TODO: 실제 저장소 주소로 교체
};

module.exports = {
  GoombaBot: GoombaBot,
  GoombaBotConfig: GoombaBotConfig
};
