/**
 * commands/fun.js
 * ------------------
 * 검색 기능과 완전히 독립적인 "숨겨진" 재미 명령어들을 담당한다.
 * 대사를 배열로 관리해서 나중에 자유롭게 추가/삭제할 수 있다.
 * !도움/!명령어 목록에 안 나오도록 handler에 hidden:true를 붙인다.
 *
 * !굼은 v1(길드용 굼바봇)에 있던 대표 명령어로, 숨김이 아니라 !도움에 보인다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
require("../core/cache.js");
require("../core/format.js");
require("../core/router.js");

var funCommands = {
  "뚠": [
    "누가 공주일까....공구일까 뚠일까... 뚠일까 공구일까... 그것이 문제로다....(둘이 알아서 정해서 알려주면 수정 예정 ^^)",
    "개미는 뚠뚠 오늘도 뚠뚠~",
    "3메다72 (계속 자라는 중)"
  ],
  "공구": [
    "누가 공주일까....공구일까 뚠일까... 뚠일까 공구일까... 그것이 문제로다....(둘이 알아서 정해서 알려주면 수정 예정 ^^)",
    "신육공",
    "신씨 실세"
  ],
  "몽": [
    "검술을 했다~",
    "석궁을 했다~",
    "추억이 됐다~",
    "다시 직변했다.",
    "내 사랑은 검술이었지만 다시 석궁.",
    "비틱으로는 세계 최강."
  ],
  "자몽": [
    "검술을 했다~",
    "석궁을 했다~",
    "추억이 됐다~",
    "다시 직변했다.",
    "내 사랑은 검술이었지만 다시 석궁.",
    "비틱으로는 세계 최강."
  ],
  "라마다": [
    "반포자이 자가에 롤스로이스 타는 부잣집 도련님"
  ],
  "버거": [
    "어이 숨씨"
  ],
  "찌": [
    "신씨",
    "바보",
    "멍충이",
    "딸깍좌"
  ],
  "찌릿": [
    "신씨",
    "바보",
    "멍충이",
    "딸깍좌"
  ],
  "오오": [
    "바보",
    "멍충이"
  ],
  "레오": [
    "바보",
    "멍충이"
  ],
  "하늘": [
    "오늘이라구!? 인계동이야!?"
  ],
  "랑님": [
    "내칭구"
  ],
  "이랑": [
    "내칭구"
  ],
  "쌀": [
    "전격의 왕"
  ],
  "둥누": [
    "월드클래스 비주얼 스타"
  ],
  "존": [
    "교슷님"
  ],
  "존광": [
    "교슷님"
  ],
  "루이": [
    "루버지 짐덩이들 어비스 버스 태우다 바지적삼 다 적시셨네..."
  ],
  "굼바": [
    "충성 ^^7"
  ],
  "호두": [
    "(제가 보이시나요?)"
  ]
};

(function () {
  function makeFunCommand(name, lines) {
    GoombaBot.registerCommand(name, {
      hidden: true, // !도움/!명령어에 표시 안 함
      execute: function (chat) {
        var pick = lines[Math.floor(Math.random() * lines.length)];
        chat.reply(pick);
      }
    });
  }

  for (var name in funCommands) {
    if (funCommands.hasOwnProperty(name)) makeFunCommand(name, funCommands[name]);
  }
})();

// ---- !굼 (v1에서 이관 - 숨김 아님, 도움말에 보임) ----
/**
 * v1(길드용 굼바봇)에 있던 대표 명령어. 랜덤 응답(기본/희귀/전설)에 더해,
 * 사용자별 누적 호출 횟수를 Database에 저장해뒀다가 100/500/1000회 달성 시
 * 업적 문구를 함께 보여준다.
 *
 * ⚠️ 메신저봇R(API2)은 아직 고유 ID가 아니라 표시 닉네임으로만 사람을 구분하므로,
 * 닉네임이 같은 사람이 있으면 카운트가 섞일 수 있다 (플랫폼 자체의 한계, v1과 동일).
 */
(function () {
  var NORMAL_RESPONSES = [
    "바! \uD83D\uDE0E", "바! \uD83D\uDC4B", "바! 오늘도 출근 완료!", "바! 룬 찾으러 갑니다!",
    "바! 굼바봇 대기 중!", "바! 길드원 호출 확인! \uD83E\uDEE1", "바! 오늘도 행운의 룬을 기원합니다! \uD83C\uDF40"
  ];
  var RARE_RESPONSE = "\u2728 전설 응답 등장!\n\n바!!!!!!!!!!";
  var LEGENDARY_RESPONSE = "\uD83D\uDC51 운영자도 보기 힘든 전설의 굼바입니다.";
  var RARE_RATE = 2, LEGENDARY_RATE = 0.1;
  var ACHIEVEMENTS = [
    { threshold: 1000, label: "\uD83D\uDC51 굼바의 화신" },
    { threshold: 500, label: "\uD83C\uDFC5 굼바 마스터" },
    { threshold: 100, label: "\uD83C\uDFC6 굼바 중독자" }
  ];

  function pickBaseText() {
    var roll = Math.random() * 100;
    if (roll < LEGENDARY_RATE) return LEGENDARY_RESPONSE;
    if (roll < LEGENDARY_RATE + RARE_RATE) return RARE_RESPONSE;
    return NORMAL_RESPONSES[Math.floor(Math.random() * NORMAL_RESPONSES.length)];
  }
  function findNewAchievement(prev, next) {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      if (prev < ACHIEVEMENTS[i].threshold && next >= ACHIEVEMENTS[i].threshold) return ACHIEVEMENTS[i].label;
    }
    return null;
  }

  GoombaBot.registerCommand("굼", {
    category: "기본", summary: "굼바봇을 호출합니다.", usage: ["!굼"],
    execute: function (chat) {
      var key = "user_stats_" + chat.author.name;
      var stats = GoombaBot.storage.readStale(key) || { goomCallCount: 0 };
      var prev = stats.goomCallCount || 0, next = prev + 1;
      stats.goomCallCount = next; stats.lastUsedAt = Date.now();
      GoombaBot.storage.write(key, stats);

      var baseText = pickBaseText();
      var newAchievement = findNewAchievement(prev, next);
      chat.reply(newAchievement ? baseText + "\n\n\uD83C\uDF89 업적 달성! " + newAchievement + " (누적 " + next + "회)" : baseText);
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };
