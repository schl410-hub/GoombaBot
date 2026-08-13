
/**
 * commands/jobguide.js
 * --------------------
 * 직업별 룬 티어 / 스킬 개조 / 세공작 조회. 전부 JSON(src/data/*.json) 기반이라
 * 시즌이 바뀌거나 직업/데이터가 추가돼도 이 파일 코드는 안 건드리고 JSON만
 * 고치면 된다. 스탯/장신구/펫/가이드 이미지는 다음 단계에서 같은 구조에
 * 필드만 추가하면 되도록 만들어뒀다(지금은 미구현 - "추후" 표시).
 *
 * ⚠️ 룬 티어 데이터는 사용자가 올려준 이미지에서 사람이 옮겨적은 것이라, 오탈자가
 * 있을 수 있다 - 발견되면 rune-tier.json만 고치면 된다.
 */

var GoombaBot = require("../core/config.js").GoombaBot;
var GoombaBotConfig = require("../core/config.js").GoombaBotConfig;
require("../core/api.js");
require("../core/format.js");
require("../core/router.js");

var RUNE_TIER = require("../data/rune-tier.json");
var SKILL_REMODEL = require("../data/skill-remodel.json");
var ENGRAVING = require("../data/engraving.json");
var JOB_ALIASES = require("../data/job-aliases.json");

// 스탯/펫/사이클 - 13개 직업 인포그래픽에서 확인된 내용만 옮겨둔 것.
// 데이터 없는 직업은 자동으로 해당 섹션이 안 보인다(허용목록 방식과 동일한 원리).
var JOB_STATS = require("../data/job-stats.json");
var JOB_PETS = require("../data/job-pets.json");
var JOB_CYCLES = require("../data/job-cycles.json");

(function () {
  var F = GoombaBot.format;
  var JOB_NAMES = Object.keys(RUNE_TIER); // 정식 직업명 목록(데이터 기준 - 직업 추가되면 자동 반영)

  /** 직업 아이콘 - 목록/헤더 표시용. 새 직업이 추가되면 여기에 한 줄만 추가하면 됨. */
  var JOB_ICONS = {
    "전사": "⚔", "대검전사": "⚔", "검술사": "\uD83D\uDDE1", "기사": "\uD83D\uDEE1",
    "궁수": "\uD83C\uDFF9", "석궁사수": "\uD83C\uDFAF", "장궁병": "\uD83C\uDFF9",
    "마법사": "\uD83D\uDD2E", "화염술사": "\uD83D\uDD25", "빙결술사": "❄",
    "전격술사": "⚡", "힐러": "\uD83D\uDC9A", "사제": "✝", "수도사": "\uD83D\uDE4F",
    "암흑술사": "\uD83C\uDF11", "음유시인": "\uD83C\uDFB5", "댄서": "\uD83D\uDC83", "악사": "\uD83C\uDFB6",
    "도적": "\uD83D\uDDE1", "격투가": "\uD83E\uDD4A", "듀얼블레이드": "⚔"
  };
  function jobIcon(jobName) { return JOB_ICONS[jobName] || "⚔"; }

  function resolveJobName(input) {
    var s = String(input).trim();
    if (RUNE_TIER.hasOwnProperty(s)) return s;
    if (JOB_ALIASES.hasOwnProperty(s)) return JOB_ALIASES[s];
    return null;
  }

  // ---- 직업 -> 개조번호 리스트 (skill-remodel.json은 번호->직업이라 반대로 뒤집는다) ----
  // ⚠️ 제보 데이터가 있는 직업은 아래 CODE_TO_REPORTS/TAG 인덱스가 우선이고, 이건 제보가
  // 아직 없는 직업(향후 추가 대비)을 위한 폴백으로만 남겨둔다.
  var JOB_TO_CODES = {};
  (function buildJobToCodes() {
    for (var code in SKILL_REMODEL) {
      if (!SKILL_REMODEL.hasOwnProperty(code)) continue;
      var entries = SKILL_REMODEL[code];
      for (var i = 0; i < entries.length; i++) {
        var job = entries[i].job;
        if (!JOB_TO_CODES[job]) JOB_TO_CODES[job] = [];
        JOB_TO_CODES[job].push({ code: code, note: entries[i].note });
      }
    }
  })();

  /** 태그 문자열(예: "강타/보조 쿨") 안에 검색어가 포함되는지로 대충 판단 - "강타"/"보조"/"이동" 등 짧은 키워드는 이걸로 충분히 잡힌다. */
  function findJobsByEngravingTag(tag) {
    var results = [];
    for (var job in ENGRAVING) {
      if (!ENGRAVING.hasOwnProperty(job)) continue;
      var tags = ENGRAVING[job];
      for (var i = 0; i < tags.length; i++) {
        if (tags[i].indexOf(tag) !== -1) { results.push(job); break; }
      }
    }
    return results;
  }

  // ⚠️ 요청 반영 - "!직업명"과 "!개조"/"!세공"이 서로 다른 자료를 참고하면 혼란스럽다는
  // 지적을 받아서, 이제 "제보의 영역"(rune-tier.json의 각 직업 .제보 배열)을 개조/세공
  // 검색의 단일 출처로 통일한다. 개조코드→직업들, 세공태그→직업들 역인덱스를 여기서
  // 미리 만들어둔다(직업당 조합이 여러 개일 수 있어서 코드/태그 하나가 여러 조합에
  // 걸쳐 나올 수 있음 - 전부 따로 보여준다).
  var CODE_TO_REPORTS = {}; // 개조코드 -> [{job, 조합, 세공, 비고}]
  var ALL_REPORTS = [];     // 세공 태그 검색용 - {job, 조합, 세공, 비고} 전부
  (function buildReportIndexes() {
    for (var job in RUNE_TIER) {
      if (!RUNE_TIER.hasOwnProperty(job)) continue;
      var reports = RUNE_TIER[job].제보;
      if (!reports) continue;
      for (var i = 0; i < reports.length; i++) {
        var r = reports[i];
        var entry = { job: job, 조합: r.조합, 세공: r.세공, 비고: r.비고 };
        ALL_REPORTS.push(entry);
        if (r.개조) {
          if (!CODE_TO_REPORTS[r.개조]) CODE_TO_REPORTS[r.개조] = [];
          CODE_TO_REPORTS[r.개조].push(entry);
        }
      }
    }
  })();

  /** 세공 태그(부분일치)로 제보 항목 검색 - 직업/조합/비고까지 같이 돌려준다 */
  function findReportsByEngravingTag(tag) {
    var results = [];
    for (var i = 0; i < ALL_REPORTS.length; i++) {
      var r = ALL_REPORTS[i];
      if (!r.세공) continue;
      for (var t = 0; t < r.세공.length; t++) {
        if (r.세공[t].indexOf(tag) !== -1) { results.push(r); break; }
      }
    }
    return results;
  }

  /** 룬 이름(공백 무시 비교)으로 어떤 직업의 어떤 부위(무기/엠블럼/장신구/방어구)에 몇 순위로 있는지 전부 찾는다. */
  function findRuneUsage(runeName) {
    var norm = String(runeName).replace(/\s+/g, "");
    var results = [];
    for (var job in RUNE_TIER) {
      if (!RUNE_TIER.hasOwnProperty(job)) continue;
      var categories = RUNE_TIER[job];
      for (var cat in categories) {
        if (!categories.hasOwnProperty(cat)) continue;
        var list = categories[cat];
        for (var i = 0; i < list.length; i++) {
          if (list[i].replace(/\s+/g, "") === norm) {
            results.push({ job: job, category: cat, rank: i + 1, name: list[i] });
          }
        }
      }
    }
    return results;
  }

  var CIRCLED_FOR_LIST = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  function circledMark(index) { return CIRCLED_FOR_LIST[index] || (index + 1) + "."; }

  /** 개조 목록 - "① 135\nnote" 처럼 번호+코드, 그 아래 줄에 노트(있으면) */
  function formatRemodelList(codes) {
    var lines = [];
    for (var i = 0; i < codes.length; i++) {
      lines.push(circledMark(i) + " " + codes[i].code);
      if (codes[i].note) lines.push(codes[i].note);
    }
    return lines;
  }

  /** 세공 목록 - "원소 · 강타 · 연타"처럼 한 줄로 이어붙임(요청: #태그 나열보다 이게 더 보기 좋음) */
  function formatEngravingLine(tags) {
    return tags.join(" \u00B7 ");
  }

  var SECTION_LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";

  /**
   * 직업 종합 가이드 - "이것 하나만 보면 세팅 끝" 목표로 태그/장신구/방어구/무기·엠블럼/
   * 제보의 영역(개조+세공+비고)/스탯/펫/사이클을 섹션 구분선으로 나눠서 한 번에 보여준다.
   * 데이터 없는 섹션은 자동으로 안 보인다.
   */
  function buildJobOverview(jobName) {
    var data = RUNE_TIER[jobName];
    var lines = [jobIcon(jobName) + " " + jobName];
    if (data && data.태그 && data.태그.length) lines.push(data.태그.join(" \u00B7 "));
    lines.push("", SECTION_LINE);

    var runeLines = buildRuneTierLines(jobName);
    if (runeLines.length) {
      lines.push("", "\uD83E\uDDFF 추천 룬", "");
      lines.push.apply(lines, runeLines);
      lines.push("", SECTION_LINE);
    }

    var reportLines = buildReportLines(jobName);
    if (reportLines.length) {
      lines.push("", "\uD83D\uDCCB 제보의 영역", "");
      lines.push.apply(lines, reportLines);
      lines.push("", SECTION_LINE);
    } else {
      // 신규 스키마 데이터가 아직 없는 직업(있을 경우 대비) - 예전 방식(개조/세공 각각)으로 폴백
      lines.push("", "\uD83D\uDD27 추천 개조", "");
      var codes = JOB_TO_CODES[jobName];
      lines.push.apply(lines, codes && codes.length ? formatRemodelList(codes) : ["준비중입니다."]);
      lines.push("", SECTION_LINE);

      lines.push("", "\uD83D\uDC8E 추천 세공", "");
      var tags = ENGRAVING[jobName];
      lines.push(tags && tags.length ? formatEngravingLine(tags) : "준비중입니다.");
      lines.push("", SECTION_LINE);
    }

    if (data && data.참고) {
      lines.push("", "\uD83D\uDCCC 참고", "", data.참고, "", SECTION_LINE);
    }

    if (JOB_STATS[jobName]) {
      lines.push("", "\uD83D\uDCCA 추천 스탯", "");
      lines.push.apply(lines, JOB_STATS[jobName]);
      lines.push("", SECTION_LINE);
    }

    if (JOB_PETS[jobName]) {
      lines.push("", "\uD83D\uDC36 추천 펫", "");
      lines.push.apply(lines, JOB_PETS[jobName]);
      lines.push("", SECTION_LINE);
    }

    if (JOB_CYCLES[jobName] && JOB_CYCLES[jobName].length) {
      lines.push("", "\uD83D\uDD04 추천 사이클", "");
      var cycleList = JOB_CYCLES[jobName];
      for (var cy = 0; cy < cycleList.length; cy++) {
        if (cy > 0) lines.push("");
        lines.push(cycleList[cy]);
      }
      lines.push("", SECTION_LINE);
    }

    lines.push("", "\uD83D\uDCD6 상세 명령어", "",
      "!" + jobName + " 룬티어", "!" + jobName + " 개조", "!" + jobName + " 세공", "!" + jobName + " 사이클");
    return lines.join("\n");
  }

  var CATEGORY_ICONS = { "무기": "⚔️", "방어구": "\uD83D\uDEE1\uFE0F", "장신구": "\uD83D\uDC8D", "엠블럼": "\uD83D\uDD37" };
  var ARMOR_SUBCATS = ["각성", "용문장", "침식", "그외"];
  var ARMOR_SUBCAT_LABEL = { "각성": "각성", "용문장": "용문장", "침식": "침식", "그외": "그 외" };

  /**
   * 신규 룬티어 스키마 렌더링(2026-08 자료 갱신 반영).
   * ⚠️ 기존엔 "무기/방어구/장신구/엠블럼"이 그냥 이름 나열 배열이었는데, 이번에
   * 받은 자료는 장신구가 채용률 구간별(60%/30%/10%)로, 방어구가 각성/용문장/침식/
   * 그외로 나뉘어 있고, 무기/엠블럼에 "대체" 옵션이 따로 있어서 스키마 자체를
   * 확장했다(rune-tier.json 참고). 사람이 스크린샷을 옮겨적은 것이라 오탈자가
   * 있을 수 있음 - 발견되면 rune-tier.json만 고치면 된다.
   */
  function buildRuneTierLines(jobName) {
    var data = RUNE_TIER[jobName];
    if (!data) return [];
    var lines = [];

    if (data.장신구) {
      lines.push(CATEGORY_ICONS.장신구 + " 장신구");
      for (var tier in data.장신구) {
        if (!data.장신구.hasOwnProperty(tier)) continue;
        lines.push(tier + " : " + data.장신구[tier].join(" \u00B7 "));
      }
    }

    if (data.방어구) {
      if (lines.length) lines.push("");
      lines.push(CATEGORY_ICONS.방어구 + " 방어구");
      for (var a = 0; a < ARMOR_SUBCATS.length; a++) {
        var subcat = ARMOR_SUBCATS[a];
        var list = data.방어구[subcat];
        if (!list || !list.length) continue;
        lines.push(ARMOR_SUBCAT_LABEL[subcat] + " : " + list.join(" \u00B7 "));
      }
    }

    if (data.무기) {
      if (lines.length) lines.push("");
      var weaponLine = CATEGORY_ICONS.무기 + " 무기 : " + data.무기.주력.join(" \u00B7 ");
      if (data.무기.대체 && data.무기.대체.length) weaponLine += " (대체: " + data.무기.대체.join(", ") + ")";
      lines.push(weaponLine);
    }

    if (data.엠블럼) {
      var emblemLine = CATEGORY_ICONS.엠블럼 + " 엠블럼 : " + data.엠블럼.주력.join(" \u00B7 ");
      if (data.엠블럼.대체 && data.엠블럼.대체.length) emblemLine += " (대체: " + data.엠블럼.대체.join(", ") + ")";
      lines.push(emblemLine);
    }

    return lines;
  }

  /** 제보의 영역 - 조합별로 번호 매겨서 개조/세공/비고를 묶어 보여준다(스크린샷의 "제보의 영역" 표 그대로) */
  function buildReportLines(jobName) {
    var data = RUNE_TIER[jobName];
    if (!data || !data.제보 || !data.제보.length) return [];
    var lines = [];
    for (var i = 0; i < data.제보.length; i++) {
      var r = data.제보[i];
      if (i > 0) lines.push("");
      lines.push(circledMark(i) + " " + r.조합);
      if (r.개조) lines.push("개조 " + r.개조);
      if (r.세공 && r.세공.length) lines.push("세공 " + r.세공.join(" \u00B7 "));
      if (r.비고) lines.push("비고 " + r.비고);
    }
    return lines;
  }

  function buildRuneTierDetail(jobName) {
    var lines = buildRuneTierLines(jobName);
    if (!lines.length) return null;
    return [jobIcon(jobName) + " " + jobName + " 룬티어", ""].concat(lines).join("\n");
  }

  // ---- !룬티어 (전체 직업 목록) ----
  GoombaBot.registerCommand("룬티어", {
    category: "정보", summary: "직업별 룬 티어 조회", usage: ["!룬티어", "!기사 룬티어"],
    detail: { title: "⚔️ 룬티어", examples: ["!룬티어", "!기사 룬티어"], features: ["!룬티어로 전체 직업 목록, !직업명 룬티어로 그 직업 상세"] },
    execute: function (chat) {
      var lines = ["\uD83D\uDCD6 직업 선택", ""];
      var sorted = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
      for (var i = 0; i < sorted.length; i++) lines.push(jobIcon(sorted[i]) + " " + sorted[i]);
      lines.push("", "사용법", "!기사 룬티어");
      chat.reply(lines.join("\n"));
    }
  });

  // ⚠️ 확장 포인트 - 나중에 데이터(stat.json, pet.json, cycle.json 등)가 생기면
  // 이 맵에 렌더 함수만 추가하면 "!직업명 스탯" 같은 서브명령어가 자동으로 살아난다.
  // 지금은 전부 데이터가 없어서 "준비중입니다."만 보여준다.
  var SUBCOMMANDS = {
    "룬티어": function (jobName) { return buildRuneTierDetail(jobName) || (F.emoji.warn + " " + jobName + "의 룬티어 데이터가 없습니다."); },
    "개조": function (jobName) {
      var reports = RUNE_TIER[jobName] && RUNE_TIER[jobName].제보;
      var lines = [jobIcon(jobName) + " " + jobName + " 개조", ""];
      if (reports && reports.length) {
        for (var i = 0; i < reports.length; i++) {
          if (!reports[i].개조) continue;
          if (lines.length > 2) lines.push("");
          lines.push(circledMark(i) + " " + reports[i].조합);
          lines.push("개조 " + reports[i].개조);
          if (reports[i].비고) lines.push("비고 " + reports[i].비고);
        }
        if (lines.length === 2) lines.push("준비중입니다.");
      } else {
        var codes = JOB_TO_CODES[jobName];
        lines.push.apply(lines, codes && codes.length ? formatRemodelList(codes) : ["준비중입니다."]);
      }
      return lines.join("\n");
    },
    "세공": function (jobName) {
      var reports2 = RUNE_TIER[jobName] && RUNE_TIER[jobName].제보;
      var lines2 = [jobIcon(jobName) + " " + jobName + " 세공", ""];
      if (reports2 && reports2.length) {
        for (var j2 = 0; j2 < reports2.length; j2++) {
          if (!reports2[j2].세공) continue;
          if (lines2.length > 2) lines2.push("");
          lines2.push(circledMark(j2) + " " + reports2[j2].조합);
          lines2.push("세공 " + formatEngravingLine(reports2[j2].세공));
          if (reports2[j2].비고) lines2.push("비고 " + reports2[j2].비고);
        }
        if (lines2.length === 2) lines2.push("준비중입니다.");
      } else {
        var tags = ENGRAVING[jobName];
        lines2.push(tags && tags.length ? formatEngravingLine(tags) : "준비중입니다.");
      }
      return lines2.join("\n");
    },
    "스탯": function (jobName) {
      var list = JOB_STATS[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 스탯", ""];
      lines.push.apply(lines, (list && list.length) ? list : ["준비중입니다."]);
      return lines.join("\n");
    },
    "펫": function (jobName) {
      var list = JOB_PETS[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 펫", ""];
      lines.push.apply(lines, (list && list.length) ? list : ["준비중입니다."]);
      return lines.join("\n");
    },
    "사이클": function (jobName) {
      var list = JOB_CYCLES[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 사이클", ""];
      if (list && list.length) {
        for (var cy = 0; cy < list.length; cy++) {
          if (cy > 0) lines.push("");
          lines.push(list[cy]);
        }
      } else {
        lines.push("준비중입니다.");
      }
      return lines.join("\n");
    },
    "장신구": function (jobName) { return jobIcon(jobName) + " " + jobName + " 장신구\n\n준비중입니다."; },
    "가이드": function (jobName) { return jobIcon(jobName) + " " + jobName + " 가이드\n\n준비중입니다."; }
  };

  /** 직업 하나의 명령어를 등록한다(정식명+별칭 전부 이 함수로) - "!직업명"과 "!직업명 [서브명령어]" 둘 다 처리. */
  function registerJobCommand(commandName, canonicalName) {
    GoombaBot.registerCommand(commandName, {
      category: "직업", summary: canonicalName + " 정보(개조/세공/룬티어)", usage: ["!" + commandName, "!" + commandName + " 룬티어"],
      detail: { title: canonicalName, examples: ["!" + commandName, "!" + commandName + " 룬티어"], features: ["!" + commandName + "만 치면 개조/세공, !" + commandName + " 룬티어는 룬 티어"] },
      execute: function (chat) {
        var sub = String(chat.args[0] || "");
        if (SUBCOMMANDS.hasOwnProperty(sub)) {
          chat.reply(SUBCOMMANDS[sub](canonicalName));
          return;
        }
        chat.reply(buildJobOverview(canonicalName));
      }
    });
  }

  for (var j = 0; j < JOB_NAMES.length; j++) registerJobCommand(JOB_NAMES[j], JOB_NAMES[j]);
  for (var alias in JOB_ALIASES) {
    if (JOB_ALIASES.hasOwnProperty(alias)) registerJobCommand(alias, JOB_ALIASES[alias]);
  }

  // ---- !개조 [번호] ----
  GoombaBot.registerCommand("개조", {
    category: "정보", summary: "개조 목록/번호로 사용 직업 검색", usage: ["!개조", "!개조 135"],
    detail: { title: "\uD83D\uDD2E 개조 검색", examples: ["!개조", "!개조 135"], features: ["!개조만 치면 전 직업 추천 개조 목록, !개조 135처럼 번호를 입력하면 그 개조를 쓰는 직업들을 조합/세공/비고와 함께 보여줍니다"] },
    execute: function (chat) {
      var code = String(chat.args[0] || "").trim();

      if (!code) {
        var lines0 = ["\uD83D\uDD2E 개조 목록", ""];
        var sortedJobs = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
        for (var j = 0; j < sortedJobs.length; j++) {
          var reportLines = buildReportLines(sortedJobs[j]);
          if (!reportLines.length) continue;
          lines0.push(sortedJobs[j]);
          lines0.push.apply(lines0, reportLines);
          lines0.push("");
        }
        chat.reply(lines0.join("\n").replace(/\n+$/, ""));
        return;
      }

      var codeReports = CODE_TO_REPORTS[code];
      if (!codeReports || !codeReports.length) { chat.reply(F.emoji.warn + " '" + code + "' 개조 데이터가 없습니다."); return; }
      var lines = ["\uD83D\uDD2E 개조 " + code, "", "사용 직업"];
      for (var i = 0; i < codeReports.length; i++) {
        var cr = codeReports[i];
        lines.push("• " + cr.job + " (" + cr.조합 + ")" + (cr.비고 ? " - " + cr.비고 : ""));
      }
      chat.reply(lines.join("\n"));
    }
  });

  // ---- !세공 [태그] ----
  GoombaBot.registerCommand("세공", {
    category: "정보", summary: "세공 목록/태그로 사용 직업 검색", usage: ["!세공", "!세공 강타"],
    detail: { title: "\uD83D\uDC8E 세공 검색", examples: ["!세공", "!세공 강타"], features: ["!세공만 치면 전 직업 추천 세공 목록, !세공 강타처럼 태그를 입력하면 그 태그를 추천하는 직업들을 조합/비고와 함께 보여줍니다"] },
    execute: function (chat) {
      var tag = String(chat.args[0] || "").trim();

      if (!tag) {
        var lines0 = ["\uD83D\uDC8E 세공 목록", ""];
        var sortedJobs = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
        for (var j = 0; j < sortedJobs.length; j++) {
          var reportLines = buildReportLines(sortedJobs[j]);
          if (!reportLines.length) continue;
          lines0.push(sortedJobs[j]);
          lines0.push.apply(lines0, reportLines);
          lines0.push("");
        }
        chat.reply(lines0.join("\n").replace(/\n+$/, ""));
        return;
      }

      var tagReports = findReportsByEngravingTag(tag);
      var lines = ["\uD83D\uDC8E " + tag + " 태그 사용 직업", ""];
      if (tagReports.length === 0) { lines.push("해당 태그를 추천하는 직업이 없습니다."); } else {
        for (var i = 0; i < tagReports.length; i++) {
          var tr = tagReports[i];
          lines.push("• " + tr.job + " (" + tr.조합 + ")" + (tr.비고 ? " - " + tr.비고 : ""));
        }
      }
      chat.reply(lines.join("\n"));
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };

