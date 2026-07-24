/**
 * index.js
 * ---------
 * 빌드 엔트리 포인트. `npm run build`가 이 파일부터 시작해서 require 그래프를
 * 전부 따라가며 main.js 하나로 합친다. 가장 마지막에 봇을 초기화한다
 * (원본 main.js의 INITIALIZATION 섹션).
 */

var GoombaBot = require("./core/config.js").GoombaBot;
var GoombaBotConfig = require("./core/config.js").GoombaBotConfig;

require("./commands/search.js");
require("./commands/market.js");
require("./commands/maintenance.js");
require("./commands/homework.js");
require("./commands/fun.js");
require("./commands/admin.js");
require("./commands/botcontrol.js");

// ===== INITIALIZATION ================================================
// 가장 마지막에 실행되어야 한다.
//
// ⚠️ 두 가지 실행 방식을 모두 지원한다:
//   1) 로더(loader.js) 없이 이 파일(main.js) 전체를 메신저봇R에 직접 붙여넣은 경우
//      -> 예전 방식 그대로: 여기서 직접 BotManager/addListener를 호출한다.
//   2) 로더를 붙여넣고, 로더가 GitHub에서 이 main.js를 받아와 실행한 경우
//      -> 로더가 이미 리스너를 등록해뒀으므로, 여기서는 GoombaBotRuntime에
//         최신 dispatchCommand/dispatchTick만 연결해준다 (중복 등록 방지).
if (typeof GoombaBotRuntime !== "undefined") {
  GoombaBotRuntime.dispatchCommand = GoombaBot.dispatchCommand;
  GoombaBotRuntime.dispatchTick = GoombaBot.dispatchTick;
  GoombaBotRuntime.GoombaBot = GoombaBot; // !굼바봇 업데이트 등에서 참조할 수 있도록
  GoombaBot.log(
    "GoombaBot(로더 모드) 갱신 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개"
  );
} else {
  GoombaBot.bot = BotManager.getCurrentBot();
  GoombaBot.bot.setCommandPrefix(GoombaBotConfig.commandPrefix);
  GoombaBot.bot.addListener(Event.COMMAND, GoombaBot.dispatchCommand);
  GoombaBot.bot.addListener(Event.TICK, GoombaBot.dispatchTick);

  GoombaBot.log(
    "GoombaBot 초기화 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개 등록됨 (prefix: " + GoombaBotConfig.commandPrefix + ")"
  );
}
