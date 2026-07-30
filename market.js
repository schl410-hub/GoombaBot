
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
   * 직업 종합 가이드 - "이것 하나만 보면 세팅 끝" 목표(요청 반영)로 개조/세공/룬티어
   * (4개 부위 전부)/스탯/펫/사이클을 섹션 구분선으로 나눠서 한 번에 보여준다.
   * 데이터 없는 섹션은 자동으로 안 보인다(스탯/펫/사이클은 아직 전 직업 데이터가
   * 없어서 있는 직업만 표시 - 허용목록 방식과 동일한 원리).
   */
  function buildJobOverview(jobName) {
    var lines = [jobIcon(jobName) + " " + jobName, "", SECTION_LINE];

    lines.push("", "\uD83D\uDD27 추천 개조", "");
    var codes = JOB_TO_CODES[jobName];
    if (codes && codes.length) {
      lines.push.apply(lines, formatRemodelList(codes));
    } else {
      lines.push("준비중입니다.");
    }
    lines.push("", SECTION_LINE);

    lines.push("", "\uD83D\uDC8E 추천 세공", "");
    var tags = ENGRAVING[jobName];
    lines.push(tags && tags.length ? formatEngravingLine(tags) : "준비중입니다.");
    lines.push("", SECTION_LINE);

    var runeLines = buildRuneTierLines(jobName);
    if (runeLines.length) {
      lines.push("", "\uD83E\uDDFF 추천 룬", "");
      lines.push.apply(lines, runeLines);
      lines.push("", SECTION_LINE);
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
  var CATEGORY_ORDER = ["무기", "방어구", "장신구", "엠블럼"];
  var CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

  /**
   * 룬티어 - 카테고리별로 헤더를 붙여 구분, 전 카테고리 원문자(①②③)로 통일(요청 반영).
   * 방어구는 룬 슬롯이 5개라 5개까지, 나머지(무기/장신구/엠블럼)는 3개까지 보여준다.
   * ⚠️ 방어구 데이터는 이미지의 "종합 추천 순위" 하나뿐이라, 실제 슬롯별(투구/상의/
   * 하의/장갑/신발 등) 구분은 아직 없다 - 나중에 슬롯별 데이터를 받으면 확장하면 된다.
   * 제목 없이 본문 라인 배열만 돌려준다(overview/상세 양쪽에서 재사용하기 위함).
   */
  function buildRuneTierLines(jobName) {
    var data = RUNE_TIER[jobName];
    if (!data) return [];
    var lines = [];
    for (var c = 0; c < CATEGORY_ORDER.length; c++) {
      var cat = CATEGORY_ORDER[c];
      var list = data[cat];
      if (!list || !list.length) continue;
      var showCount = (cat === "방어구") ? 5 : 3;
      if (lines.length) lines.push("");
      lines.push((CATEGORY_ICONS[cat] || "") + " " + cat);
      for (var i = 0; i < Math.min(list.length, showCount); i++) {
        lines.push((CIRCLED[i] || (i + 1) + ".") + " " + list[i]);
      }
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
      var codes = JOB_TO_CODES[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 개조", ""];
      if (codes && codes.length) {
        lines.push.apply(lines, formatRemodelList(codes));
      } else {
        lines.push("준비중입니다.");
      }
      return lines.join("\n");
    },
    "세공": function (jobName) {
      var tags = ENGRAVING[jobName];
      var lines = [jobIcon(jobName) + " " + jobName + " 세공", ""];
      if (tags && tags.length) {
        lines.push(formatEngravingLine(tags));
      } else {
        lines.push("준비중입니다.");
      }
      return lines.join("\n");
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
    detail: { title: "\uD83D\uDD2E 개조 검색", examples: ["!개조", "!개조 135"], features: ["!개조만 치면 전 직업 추천 개조 목록, !개조 135처럼 번호를 입력하면 그 개조를 쓰는 직업들을 보여줍니다"] },
    execute: function (chat) {
      var code = String(chat.args[0] || "").trim();

      if (!code) {
        var lines0 = ["\uD83D\uDD2E 개조 목록", ""];
        var sortedJobs = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
        for (var j = 0; j < sortedJobs.length; j++) {
          var jobCodes = JOB_TO_CODES[sortedJobs[j]];
          if (!jobCodes || !jobCodes.length) continue;
          lines0.push(sortedJobs[j]);
          lines0.push.apply(lines0, formatRemodelList(jobCodes));
          lines0.push("");
        }
        chat.reply(lines0.join("\n").replace(/\n+$/, ""));
        return;
      }

      if (!SKILL_REMODEL.hasOwnProperty(code)) { chat.reply(F.emoji.warn + " '" + code + "' 개조 데이터가 없습니다."); return; }
      var entries = SKILL_REMODEL[code];
      var lines = ["\uD83D\uDD2E 개조 " + code, "", "사용 직업"];
      for (var i = 0; i < entries.length; i++) lines.push("• " + entries[i].job + (entries[i].note ? " (" + entries[i].note + ")" : ""));
      chat.reply(lines.join("\n"));
    }
  });

  // ---- !세공 [태그] ----
  GoombaBot.registerCommand("세공", {
    category: "정보", summary: "세공 목록/태그로 사용 직업 검색", usage: ["!세공", "!세공 강타"],
    detail: { title: "\uD83D\uDC8E 세공 검색", examples: ["!세공", "!세공 강타"], features: ["!세공만 치면 전 직업 추천 세공 목록, !세공 강타처럼 태그를 입력하면 그 태그를 추천하는 직업들을 보여줍니다"] },
    execute: function (chat) {
      var tag = String(chat.args[0] || "").trim();

      if (!tag) {
        var lines0 = ["\uD83D\uDC8E 세공 목록", ""];
        var sortedJobs = JOB_NAMES.slice().sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
        for (var j = 0; j < sortedJobs.length; j++) {
          var jobTags = ENGRAVING[sortedJobs[j]];
          if (!jobTags || !jobTags.length) continue;
          lines0.push(sortedJobs[j]);
          lines0.push(formatEngravingLine(jobTags));
          lines0.push("");
        }
        chat.reply(lines0.join("\n").replace(/\n+$/, ""));
        return;
      }

      var jobs = findJobsByEngravingTag(tag);
      var lines = ["\uD83D\uDC8E " + tag + " 태그 사용 직업", ""];
      if (jobs.length === 0) { lines.push("해당 태그를 추천하는 직업이 없습니다."); } else {
        for (var i = 0; i < jobs.length; i++) lines.push("• " + jobs[i]);
      }
      chat.reply(lines.join("\n"));
    }
  });
})();

module.exports = { GoombaBot: GoombaBot };

