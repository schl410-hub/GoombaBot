// Runs in the entry module after providers and router have been loaded.
GoombaBot.registerCommand("데이터상태", {
  category: "관리자", adminOnly: true,
  summary: "도감의 실시간/보관본 사용 상태 확인", usage: ["!데이터상태"],
  execute: function (chat) {
    var all = GoombaBot.catalogFallback.sources(), lines = ["도감 데이터 상태 / 2026-10-27-403-fallback-1"];
    var found = false;
    for (var path in all) {
      if (!all.hasOwnProperty(path)) continue;
      found = true;
      lines.push(path + ": " + (all[path].source === "snapshot" ? "GitHub 보관본 / 수집 " + all[path].fetchedAt : "실시간 응답 / 확인 " + all[path].checkedAt));
    }
    if (!found) lines.push("아직 도감을 조회하지 않았습니다. !룬 태초 등을 먼저 실행하세요.");
    lines.push("보관본은 수집 후 7일 이내만 신규 로딩합니다. 시세/공지/아이템 목록에는 적용하지 않습니다.");
    chat.reply(lines.join("\n"));
  }
});
var catalogOriginalDispatch = GoombaBot.dispatchCommand;
GoombaBot.dispatchCommand = function (chat) {
  GoombaBot._catalogUsed = {};
  try { return catalogOriginalDispatch(chat); }
  finally {
    var catalogNotes = GoombaBot.catalogFallback.notes();
    if (catalogNotes.length) chat.reply(catalogNotes.join("\n"));
  }
};