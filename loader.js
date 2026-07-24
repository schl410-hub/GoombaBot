/**
 * loader.js
 * ----------
 * ⚠️ 이 파일이 메신저봇R 스크립트 편집 화면에 붙여넣는 "유일한" 파일입니다.
 * 이후로는 이 파일을 다시 건드릴 일이 없어야 합니다 - 모든 실제 로직은
 * GitHub의 main.js에서 관리하고, 이 로더가 그걸 받아와서 실행합니다.
 *
 * 동작 원리:
 *   1) GoombaBotRuntime이라는 빈 그릇을 하나 만든다 (전역).
 *   2) 안정적인 리스너(Event.COMMAND / Event.TICK)를 "딱 한 번" 등록한다. 이 리스너는
 *      실제 로직을 담고 있지 않고, 그때그때 GoombaBotRuntime.dispatchCommand/dispatchTick를
 *      찾아서 위임만 한다 - 그래서 나중에 GoombaBotRuntime 안의 내용이 바뀌어도
 *      리스너를 다시 등록할 필요가 없다 (중복 리스너로 명령어가 두 번 응답하는 문제 방지).
 *   3) GitHub의 main.js를 받아와서 간접 eval로 실행한다 - 간접 eval은 항상 "전역 스코프"에서
 *      실행되기 때문에(직접 eval과 다름, ECMAScript 명세), main.js 안의 모든 내용이
 *      이 로더와 같은 전역 공간에 자리잡는다.
 *   4) 이후 "!굼바봇 업데이트" 명령어가 같은 방식(간접 eval)으로 GitHub의 최신 main.js를
 *      다시 받아와서 실행하면, GoombaBotRuntime의 내용이 새 것으로 교체된다 - 봇을
 *      재시작하지 않고도 실시간으로 반영된다.
 *
 * ⚠️ 정직하게 말씀드리면, 이 메커니즘은 JavaScript 명세(간접 eval의 스코프 규칙)를
 * 근거로 설계했고 Node.js로 재현 검증까지 했지만, 실제 메신저봇R(Rhino)에서 100%
 * 똑같이 동작하는지는 확인하지 못했습니다 - 실기기 테스트가 꼭 필요합니다.
 */

// TODO: 실제 GitHub raw main.js 주소로 교체해주세요.
// 예: "https://raw.githubusercontent.com/사용자명/저장소명/main/main.js"
var GOOMBABOT_MAIN_JS_URL = "";

var GoombaBotRuntime = {};

function goombaLoaderFetchAndApply(url) {
  var doc = Http.requestSync({
    url: String(url),
    method: "GET",
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    }
  });
  var code = doc.body().text();
  if (!code || code.length < 200) {
    throw new Error("받아온 코드가 비정상적으로 짧습니다 (" + (code ? code.length : 0) + "자) - URL을 확인해주세요.");
  }
  // ⚠️ 반드시 간접 eval (eval을 변수에 담아서 호출) - 직접 eval(code)이라고 쓰면 이 함수의
  // 지역 스코프에만 반영되고 함수가 끝나는 순간 사라져서 아무 효과가 없다.
  var indirectEval = eval;
  indirectEval(code);
}

var goombaBot = BotManager.getCurrentBot();

// 안정적인 래퍼 - 절대 다시 등록되지 않는다. 실제 로직은 매번 새로 조회한다.
goombaBot.addListener(Event.COMMAND, function (chat) {
  if (GoombaBotRuntime.dispatchCommand) GoombaBotRuntime.dispatchCommand(chat);
});
goombaBot.addListener(Event.TICK, function () {
  if (GoombaBotRuntime.dispatchTick) GoombaBotRuntime.dispatchTick();
});

// 최초 실행 - GitHub의 main.js를 받아와서 적용한다.
try {
  if (!GOOMBABOT_MAIN_JS_URL) {
    Log.i("GoombaBotLoader", "GOOMBABOT_MAIN_JS_URL이 비어있습니다 - 최초 코드가 로드되지 않았습니다.");
  } else {
    goombaLoaderFetchAndApply(GOOMBABOT_MAIN_JS_URL);
    Log.i("GoombaBotLoader", "최초 로드 완료");
  }
} catch (e) {
  Log.i("GoombaBotLoader", "최초 로드 실패: " + e);
}
