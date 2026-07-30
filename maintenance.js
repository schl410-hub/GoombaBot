
/**
 * commands/resistance.js
 * -------------------------
 * 마도 저항 계산기(!마도저항, !마저) - 과거 세션에서 실제로 구현했던 기능을
 * 트랜스크립트에서 찾아 그대로 복원한 것. 새로 만든 공식이 아니다.
 *
 * ⚠️ 공식 출처: 나무위키 "마비노기 모바일/능력치" 문서에 문서화된 공식
 * (Nexon 공식 발표 자료가 아니라 커뮤니티 문서) - 참고용으로만 사용.
 *   공격 최종대미지: 저항<압력 → 0.5^((압력-저항)/1000) | 저항=압력 → 100%
 *                    | 저항>압력 → 1.4-0.4*0.5^((저항-압력)/10000)
 *   피격 최종대미지: 저항<압력 → 1+(((압력-저항)/1000)^0.75) | 저항>=압력 → 100%
 * 두 값(내 마도 저항, 콘텐츠의 마도 압력)이 둘 다 있어야 계산할 수 있다 -
 * 값 하나만으로는 계산이 안 되는 공식이라 인자 2개가 필수다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
require("../core/format.js");
require("../core/router.js");

(function () {
  var F = GoombaBot.format;

  function calcAttackFinalDamagePct(resistance, pressure) {
    if (resistance < pressure) return Math.pow(0.5, (pressure - resistance) / 1000) * 100;
    if (resistance === pressure) return 100;
    return (1.4 - 0.4 * Math.pow(0.5, (resistance - pressure) / 10000)) * 100;
  }
  function calcHitFinalDamagePct(resistance, pressure) {
    if (resistance < pressure) return (1 + Math.pow((pressure - resistance) / 1000, 0.75)) * 100;
    return 100;
  }

  // ⚠️ 길드원 대부분이 "룬다 지옥1" 기준으로 계산한다는 요청으로 기본 압력값을 둔다.
  // 계산 공식 자체는 전혀 안 바뀌었고, 압력을 안 넣었을 때만 이 값을 대신 쓴다.
  var DEFAULT_PRESSURE = 4400; // 룬다 지옥1 마도 압력
  var DEFAULT_PRESSURE_LABEL = "룬다 지옥1";

  // ⚠️ 실기기 스크린샷(ErinnData 사이트 A=4,400/B=7,200 두 지점)으로 역산해서 확정한
  // 콘텐츠별 내부 압력표. 오차 전부 ±0.1%p 이내로 검증됨(공격 최종대미지 공식 기준).
  // "지옥2~4"/"카브락 어려움"은 ErinnData 사이트에도 "(예상)"으로 표기된 미공개 추정치.
  var CONTENT_PRESSURES = [
    { key: "abyss_intro", label: "어비스 입문", pressure: 1000 },
    { key: "abyss_hard", label: "어비스 어려움", pressure: 1600 },
    { key: "abyss_veryhard", label: "어비스 매우 어려움", pressure: 2700 },
    { key: "abyss_veryhard2", label: "어비스 매우 어려움 2", pressure: 3000 },
    { key: "abyss_hell1", label: "어비스 지옥1", pressure: 4400 },
    { key: "abyss_hell2", label: "어비스 지옥2", pressure: 7200, estimated: true },
    { key: "abyss_hell3", label: "어비스 지옥3", pressure: 8600, estimated: true },
    { key: "abyss_hell4", label: "어비스 지옥4", pressure: 10000, estimated: true },
    { key: "kabrak_intro", label: "카브락 입문", pressure: 2500 },
    { key: "kabrak_hard", label: "카브락 어려움", pressure: 3700, estimated: true }
  ];
  var ERINNDATA_NOTE = "\uD83D\uDCCC 공격 최종대미지(주는 피해)는 ErinnData 계산기 스크린샷으로 검증됨. 피격 최종대미지(받는 피해)는 나무위키 출처라 ErinnData와 대조 확인 전임";

  // ⚠️ "쿠짱봇 스타일" 단일 메시지 출력용 - 지옥2~4처럼 "(예상)" 표기가 붙는 미공개
  // 콘텐츠는 제외하고, 확정된 7개 콘텐츠만 보여준다(사용자 확정). 카브락 어려움은
  // 예상치이지만 사용자 예시에 포함되어 있어서 포함하되 "(예상)" 표기는 유지한다.
  var MAIN_DISPLAY_KEYS = ["abyss_intro", "abyss_hard", "abyss_veryhard", "abyss_veryhard2", "abyss_hell1", "kabrak_intro", "kabrak_hard"];
  var MAIN_DISPLAY_CONTENTS = [];
  for (var mi = 0; mi < CONTENT_PRESSURES.length; mi++) {
    if (MAIN_DISPLAY_KEYS.indexOf(CONTENT_PRESSURES[mi].key) !== -1) MAIN_DISPLAY_CONTENTS.push(CONTENT_PRESSURES[mi]);
  }

  // ⚠️ ErinnData 계산기의 프리셋 버튼 값과 동일(+잔영최대/해연최소·7200,
  // +해연최저·드레케인·8600, +해연최대·10000) - "목표 마저" 구간에서 재사용.
  var GOAL_TARGETS = [7200, 8600, 10000];
  // ⚠️ "8→10성 룬 N개" - 룬 하나당 +300(사용자 확정), 최대 4개까지 시뮬레이션.
  var RUNE_STEPS = [1, 2, 3, 4];

  var SECTION_LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";

  function formatContentLineOnly(resistance, content) {
    var pct = calcAttackFinalDamagePct(resistance, content.pressure) - 100;
    var sign = pct >= 0 ? "+" : "";
    return content.label + (content.estimated ? " (예상)" : "") + " : " + sign + pct.toFixed(1) + "%";
  }

  /** 룬 교체 섹션 전용 - 현재값 대비 증가량(▲)까지 한 줄에 같이 보여준다 */
  function formatContentLineWithDelta(newResistance, baseResistance, content) {
    var newPct = calcAttackFinalDamagePct(newResistance, content.pressure) - 100;
    var basePct = calcAttackFinalDamagePct(baseResistance, content.pressure) - 100;
    var deltaPct = newPct - basePct;
    var sign = newPct >= 0 ? "+" : "";
    return content.label + (content.estimated ? " (예상)" : "") + " : " + sign + newPct.toFixed(1) + "% (\u25B2" + deltaPct.toFixed(1) + "%)";
  }

  /**
   * "쿠짱봇 스타일" 출력 - !마저 [저항](압력 생략, 목표/전체/비교 아님) 전용.
   * 계산식은 calcAttackFinalDamagePct 그대로 재사용 - 새 공식 없음, 출력 형태만 다름.
   * 분할 전송 없이 한 메시지로 전부 보낸다(사용자 확정). 콘텐츠/목표는 한 줄 표시,
   * 룬 교체 섹션은 현재 대비 증가량(▲)까지 같이 보여준다(사용자 확정).
   */
  function buildKuzzangStyleReply(resistance) {
    var out = [SECTION_LINE, "\uD83D\uDCCA 마도저항 정보", "\u2694 현재 마도저항", String(resistance), SECTION_LINE];

    out.push("\uD83D\uDCC8 최종 대미지");
    for (var i = 0; i < MAIN_DISPLAY_CONTENTS.length; i++) {
      out.push(formatContentLineOnly(resistance, MAIN_DISPLAY_CONTENTS[i]));
    }
    out.push(SECTION_LINE);

    out.push("\uD83C\uDFAF 목표 마저");
    for (var g = 0; g < GOAL_TARGETS.length; g++) {
      var target = GOAL_TARGETS[g];
      var gap = target - resistance;
      out.push(String(target) + " \u2192 " + (gap > 0 ? gap + " 부족" : "달성"));
    }
    out.push(SECTION_LINE);

    out.push("\uD83D\uDCC9 룬 교체 예상");
    for (var r = 0; r < RUNE_STEPS.length; r++) {
      var count = RUNE_STEPS[r];
      var delta = count * 300;
      var newResistance = resistance + delta;
      out.push("\uD83D\uDD04 8\u219210성 룬 " + count + "개 (+" + delta + ")");
      for (var j = 0; j < MAIN_DISPLAY_CONTENTS.length; j++) {
        out.push(formatContentLineWithDelta(newResistance, resistance, MAIN_DISPLAY_CONTENTS[j]));
      }
    }
    out.push(SECTION_LINE);

    out.push("\uD83D\uDCCC 참고");
    out.push("• 계산식은 기존과 동일");
    out.push("• 출력 UX만 개선");
    out.push("• 기존 명령어는 모두 유지");
    out.push("• !마저 목표");
    out.push("• !마저 전체");
    out.push("• !마저 비교");
    out.push("• !마저 [저항] 만 출력 형식 변경");

    return out.join("\n");
  }


  function formatContentLine(c, resistance) {
    var pct = calcAttackFinalDamagePct(resistance, c.pressure);
    var sign = pct >= 100 ? "+" : "";
    var pctText = sign + (pct - 100).toFixed(1) + "%";
    return c.label + (c.estimated ? " (예상)" : "") + " : " + pctText;
  }

  function resistanceExecute(chat) {
    var args = chat.args;

    // ⚠️ "!마저 전체 [저항]" - ErinnData 계산기의 콘텐츠별 그리드와 동일하게, 확정된
    // 콘텐츠 압력표 전체에 대해 한 번에 계산해서 보여준다(공격 최종대미지 기준).
    if (String(args[0]) === "전체") {
      var resistanceAll = Number(args[1]);
      if (isNaN(resistanceAll)) {
        chat.reply(F.usageBlock(["!마저 전체 [내 저항]", "예) !마저 전체 4400"]));
        return;
      }
      var allLines = [F.field("내 마도 저항", resistanceAll), ""];
      for (var ai = 0; ai < CONTENT_PRESSURES.length; ai++) {
        allLines.push(formatContentLine(CONTENT_PRESSURES[ai], resistanceAll));
      }
      allLines.push("", ERINNDATA_NOTE);
      chat.reply(F.box(F.emoji.calc + " 마도 저항 - 콘텐츠별 대미지 배율", allLines));
      return;
    }

    // ⚠️ "!마저 비교 [A] [B]" - ErinnData 계산기의 A/B 프리셋 비교 그리드와 동일한
    // 형태. 콘텐츠 압력표 전체에 대해 A/B 두 저항값을 나란히 비교한다.
    if (String(args[0]) === "비교") {
      var valA = Number(args[1]);
      var valB = Number(args[2]);
      if (isNaN(valA) || isNaN(valB)) {
        chat.reply(F.usageBlock(["!마저 비교 [A] [B]", "예) !마저 비교 4400 7200"]));
        return;
      }
      var cmpLines = [F.field("A", valA), F.field("B", valB), ""];
      for (var ci = 0; ci < CONTENT_PRESSURES.length; ci++) {
        var c = CONTENT_PRESSURES[ci];
        var pctA = calcAttackFinalDamagePct(valA, c.pressure) - 100;
        var pctB = calcAttackFinalDamagePct(valB, c.pressure) - 100;
        cmpLines.push(c.label + (c.estimated ? " (예상)" : ""));
        cmpLines.push("  A " + (pctA >= 0 ? "+" : "") + pctA.toFixed(1) + "%   B " + (pctB >= 0 ? "+" : "") + pctB.toFixed(1) + "%");
      }
      cmpLines.push("", ERINNDATA_NOTE);
      chat.reply(F.box(F.emoji.calc + " 마도 저항 - A/B 비교", cmpLines));
      return;
    }

    // ⚠️ "!마저 목표 [현재] [목표저항]" - 현재/목표 두 저항값을 나란히 비교해서
    // "필요한 수치"까지 한눈에 보여주는 모드(기존 계산 공식/기본압력은 그대로 재사용,
    // 기존 "!마저 [저항] [압력]" 방식은 전혀 안 건드림).
    if (String(args[0]) === "목표") {
      var current = Number(args[1]);
      var goal = Number(args[2]);
      var pressureArg = Number(args[3]);
      var pressure2 = isNaN(pressureArg) ? DEFAULT_PRESSURE : pressureArg;

      if (isNaN(current) || isNaN(goal)) {
        chat.reply(F.usageBlock(["!마저 목표 [현재 저항] [목표 저항]", "예) !마저 목표 4100 4700"]));
        return;
      }

      var curAttack = calcAttackFinalDamagePct(current, pressure2);
      var curHit = calcHitFinalDamagePct(current, pressure2);
      var goalAttack = calcAttackFinalDamagePct(goal, pressure2);
      var goalHit = calcHitFinalDamagePct(goal, pressure2);
      var need = goal - current;

      var goalLines = [
        F.field("콘텐츠 마도 압력", pressure2 + (isNaN(pressureArg) ? " (" + DEFAULT_PRESSURE_LABEL + " 기준)" : "")),
        "",
        F.field("\uD83D\uDCCD 현재 마도저항", current),
        F.field("  ⚔️ 공격 최종대미지", curAttack.toFixed(1) + "%"),
        F.field("  \uD83D\uDEE1\uFE0F 피격 최종대미지", curHit.toFixed(1) + "%"),
        "",
        F.field("\uD83C\uDFAF 목표 마도저항", goal),
        F.field("  ⚔️ 공격 최종대미지", goalAttack.toFixed(1) + "%"),
        F.field("  \uD83D\uDEE1\uFE0F 피격 최종대미지", goalHit.toFixed(1) + "%"),
        "",
        F.field("\uD83D\uDCCA 필요한 수치", (need > 0 ? "저항 " + need + " 더 필요" : (need < 0 ? "이미 목표 초과(+" + (-need) + ")" : "이미 목표 도달"))),
        "",
        F.emoji.warn + " 공식 출처: 나무위키(커뮤니티 문서, 공식 자료 아님) - 참고용으로만 사용하세요."
      ];
      chat.reply(F.box(F.emoji.calc + " 마도 저항 목표 비교", goalLines));
      return;
    }

    var resistance = Number(args[0]);

    if (args.length === 0 || isNaN(resistance)) {
      chat.reply(F.usageBlock([
        "!마도저항 [내 저항]", "!마도저항 [내 저항] [콘텐츠 압력]", "!마도저항 목표 [현재] [목표]",
        "!마도저항 전체 [내 저항]", "!마도저항 비교 [A] [B]",
        "예) !마도저항 4100", "예) !마도저항 4100 4700", "예) !마도저항 목표 4100 4700",
        "예) !마도저항 전체 4400", "예) !마도저항 비교 4400 7200"
      ]));
      return;
    }

    var usingDefault = args.length < 2 || isNaN(Number(args[1]));

    // ⚠️ "!마저 [저항]" (압력 생략) 형태일 때만 새 쿠짱봇 스타일 출력 사용.
    // "!마저 [저항] [압력]"으로 압력을 직접 지정한 경우는 기존 출력 방식 그대로 유지
    // (사용자 확정: "!마저 [저항] 만 출력 형식 변경").
    if (usingDefault) {
      chat.reply(buildKuzzangStyleReply(resistance));
      return;
    }

    var pressure = Number(args[1]);

    var attackPct = calcAttackFinalDamagePct(resistance, pressure);
    var hitPct = calcHitFinalDamagePct(resistance, pressure);

    var lines = [
      F.field("내 마도 저항", resistance),
      F.field("콘텐츠 마도 압력", pressure),
      "",
      F.field("⚔️ 공격 최종대미지", attackPct.toFixed(1) + "%"),
      F.field("\uD83D\uDEE1\uFE0F 피격 최종대미지", hitPct.toFixed(1) + "%")
    ];

    if (resistance < pressure) {
      var needed = pressure - resistance;
      lines.push("", F.emoji.target + " 압력과 같아지려면 저항 " + needed + " 더 필요");
    }

    lines.push("", F.emoji.warn + " 공식 출처: 나무위키(커뮤니티 문서, 공식 자료 아님) - 참고용으로만 사용하세요.");

    chat.reply(F.box(F.emoji.calc + " 마도 저항 계산", lines));
  }

  GoombaBot.registerCommand("마도저항", {
    category: "정보", summary: "마도 저항 계산 (압력 생략 시 룬다 지옥1 기준)", usage: ["!마도저항 4100", "!마도저항 4100 4700", "!마도저항 목표 4100 4700", "!마도저항 전체 4400", "!마도저항 비교 4400 7200"],
    detail: {
      title: F.emoji.calc + " 마도 저항 계산기", examples: ["!마도저항 4100", "!마도저항 4100 4700", "!마도저항 목표 4100 4700", "!마도저항 전체 4400", "!마도저항 비교 4400 7200"],
      features: [
        "!마도저항 [저항]만 넣으면 어비스/카브락 7개 콘텐츠 + 목표(7200/8600/10000) + 8→10성 룬 1~4개 시뮬레이션까지 한 메시지로 전부 보여줍니다",
        "!마도저항 [저항] [압력]으로 압력을 직접 지정하면 그 콘텐츠 하나만 계산하는 기존 방식 그대로입니다",
        "!마도저항 목표 [현재] [목표]로 현재/목표 저항을 나란히 비교하고 필요한 수치까지 확인할 수 있습니다",
        "!마도저항 전체 [저항]으로 어비스/카브락 전체 콘텐츠(미공개 예상치 포함) 대미지 배율을 확인합니다",
        "!마도저항 비교 [A] [B]로 두 저항값을 전체 콘텐츠에 대해 나란히 비교합니다",
        "공격 최종대미지 공식과 콘텐츠 압력표는 ErinnData 계산기로 검증됨. 피격 최종대미지는 나무위키 출처(대조 확인 전)"
      ]
    },
    execute: resistanceExecute
  });

  // !마저 - !마도저항의 단축 명령어(완전히 동일한 함수를 그대로 사용)
  GoombaBot.registerCommand("마저", {
    category: "정보", summary: "마도 저항 계산 (!마도저항과 완전히 동일)", usage: ["!마저 4100", "!마저 4100 4700", "!마저 목표 4100 4700", "!마저 전체 4400", "!마저 비교 4400 7200"],
    detail: { title: F.emoji.calc + " 마도 저항 계산기", examples: ["!마저 4100", "!마저 4100 4700", "!마저 목표 4100 4700", "!마저 전체 4400", "!마저 비교 4400 7200"], features: ["!마도저항과 완전히 동일하게 동작합니다"] },
    execute: resistanceExecute
  });
})();

module.exports = { GoombaBot: GoombaBot };

