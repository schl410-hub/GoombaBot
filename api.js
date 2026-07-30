
/**
 * index.js
 * ---------
 * 빌드 엔트리 포인트.
 */

var GoombaBot = require("./core/config.js").GoombaBot;
var GoombaBotConfig = require("./core/config.js").GoombaBotConfig;

require("./commands/search.js");
require("./commands/market.js");
require("./commands/resistance.js");
require("./commands/jobguide.js");
require("./commands/maintenance.js");
require("./commands/homework.js");
require("./commands/officialnews.js");
require("./commands/fun.js");
require("./commands/admin.js");
require("./commands/botcontrol.js");

// ===== INITIALIZATION ================================================
if (typeof GoombaBotRuntime !== "undefined") {
  GoombaBotRuntime.dispatchCommand = GoombaBot.dispatchCommand;
  GoombaBotRuntime.dispatchTick = GoombaBot.dispatchTick;
  GoombaBotRuntime.dispatchMessage = GoombaBot.dispatchMessage;
  GoombaBotRuntime.GoombaBot = GoombaBot;
  GoombaBot.log(
    "GoombaBot(로더 모드) 갱신 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개"
  );
} else {
  GoombaBot.bot = BotManager.getCurrentBot();
  GoombaBot.bot.setCommandPrefix(GoombaBotConfig.commandPrefix);
  GoombaBot.bot.addListener(Event.COMMAND, GoombaBot.dispatchCommand);
  GoombaBot.bot.addListener(Event.TICK, GoombaBot.dispatchTick);

  // ⚠️ !어구감시 시작의 "다음 시간을 입력해주세요" 대화 흐름을 위해 일반 메시지도
  // 받아야 한다. 이 메신저봇R 버전에 Event.MESSAGE가 없거나 다르면 여기서 조용히
  // 실패하고, 나머지 기능(!명령어들)은 전혀 영향 없이 정상 동작한다.
  try {
    GoombaBot.bot.addListener(Event.MESSAGE, GoombaBot.dispatchMessage);
  } catch (messageListenerError) {
    GoombaBot.log("Event.MESSAGE 등록 실패(어구감시 대화형 입력 비활성) - 원인: " + messageListenerError);
  }

  GoombaBot.log(
    "GoombaBot 초기화 완료 - 명령어 " + Object.keys(GoombaBot.commands).length +
    "개, 모니터 " + GoombaBot.monitors.length + "개 등록됨 (prefix: " + GoombaBotConfig.commandPrefix + ")"
  );
}

