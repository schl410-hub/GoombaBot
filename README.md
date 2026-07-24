# 굼바봇 (GoombaBot)

마비노기 모바일 카카오톡 봇 (메신저봇R API2)

## 이번 작업 - 구조 리팩토링 (기능 변경 없음)

기존 단일 `main.js`(검색 기능까지 구현된 버전)를 **기능은 100% 그대로 유지한 채** 아래 구조로
나눴습니다.

```
src/
├── core/
│   ├── config.js    # GoombaBotConfig, GoombaBot 공유 객체 원본, isAdmin
│   ├── cache.js       # GoombaBot.storage (Database API 기반 캐시)
│   ├── api.js           # GoombaBot.http (Http.requestSync 래퍼, toArray, fetchCached 등)
│   ├── format.js          # GoombaBot.format, GoombaBot.search (출력 포맷 + 검색 유틸)
│   └── router.js            # 명령어 등록/실행(registerCommand/dispatchCommand),
│                              !도움/!명령어, 모니터 등록/실행(registerMonitor/dispatchTick)
├── commands/
│   ├── search.js    # !룬 !ㄹ !룬워드 !인챈트 !아티팩트 !칭호 !아이템
│   ├── market.js      # !시세
│   ├── maintenance.js   # !공지 !점검 + 자동 점검 알림 모니터
│   ├── homework.js        # !검구 !어구 !심구 !숙제
│   ├── admin.js              # !진단
│   └── fun.js                  # 숨김 재미 명령어 + !굼
└── index.js         # 빌드 엔트리 포인트 + INITIALIZATION(봇 등록)
```

## 빌드 방법

```
npm install
npm run build      # src/ -> main.js 생성 (Browserify)
npm run verify      # main.js가 Rhino(ES5)에서 컴파일 가능한 문법인지 엄격 검사
```

`main.js`(저장소 루트)가 메신저봇R 스크립트 편집 화면에 그대로 붙여넣는 최종 파일입니다.

## 이번 리팩토링에서 실제로 검증한 것

- `npm run verify`(acorn ES5 strict) 통과
- **원본과 리팩토링본을 완전히 동일한 mock 환경(가짜 Http/Database/BotManager)에서 나란히
  실행해서, 아래 항목을 실제로 비교했습니다:**
  - `!도움`/`!명령어`/`!룬`/`!ㄹ`/`!룬워드`/`!인챈트`/`!아티팩트`/`!칭호`/`!아이템`/`!시세`/
    `!공지`/`!점검`/`!검구`/`!어구`/`!심구`/`!숙제`/`!진단`(요약+상세)/존재하지 않는 명령어 —
    **전부 출력이 한 글자도 다르지 않게 일치**
  - 등록된 명령어 이름 목록(`GoombaBot.registerCommand` 호출 전체) — **완전히 동일**
  - 랜덤 응답 명령어(`!굼`/`!뚠`/`!공구`/`!몽`/`!자몽`/`!찌`/`!오오`) — 확률/응답 테이블
    코드 자체를 원본과 직접 대조해서 **완전히 동일함을 확인**

## 다음 작업 (사용자 승인 후 진행 예정)

1. `renderCard` 공통 출력 시스템 구축
2. `!룬` UX 개선 (이번 리팩토링 구조 위에서)
3. `!룬워드` / `!인챈트` 개선
4. `!마도` / `!목표` / `!배율` (새 구조 위에서 신규 구현)

## 관리자 제어 기능 (`src/commands/botcontrol.js`)

- `!굼바봇 상태` / `켜기` / `끄기` / `재시작` / `업데이트` — 관리자(`신수아`, `굼바굼바_빙결`)
  전용. 마리오 굼바 세계관 테마 적용(대왕굼바/굼바봇/빙결굼바), 관리자에게는 "대왕굼바님"으로 응답.
- `!굼바봇 끄기` 상태에서는 `!굼바봇`(제어용) 명령어를 제외한 나머지가 전부 조용히 무시됩니다.

## GitHub → 메신저봇R 실시간 반영 (로더 방식)

**메신저봇R에 코드를 다시 붙여넣지 않고, `!굼바봇 업데이트` 명령어만으로 GitHub의 최신
코드를 실시간 반영하는 구조**를 만들었습니다. 핵심 원리: JavaScript의 "간접 eval"은
호출 위치와 상관없이 항상 전역 스코프에서 실행됩니다(ECMAScript 명세) — 이걸 이용해서
명령어 핸들러 안에서 GitHub 코드를 받아와도, 실행 중인 봇 전체에 실제로 반영됩니다.
Node.js로 이 메커니즘 자체와, 실제 빌드된 `main.js` 전체를 가지고 끝까지(초기 로드 →
명령어 실행 → 업데이트 → 재실행, 리스너 중복 없음) 재현 검증했습니다.

### 전환 방법 (한 번만 하면 됩니다)

1. `loader.js` 상단의 `GOOMBABOT_MAIN_JS_URL`에 GitHub raw 주소를 넣습니다.
   예: `https://raw.githubusercontent.com/사용자명/저장소명/main/main.js`
2. `src/core/config.js`의 `githubMainJsRawUrl`에도 같은 주소를 넣고 다시 빌드합니다
   (`!굼바봇 업데이트`가 이 값을 씁니다).
3. **메신저봇R 스크립트 편집 화면 내용을 전부 지우고, `loader.js` 내용으로 딱 한 번
   교체합니다.** 이후로는 이 화면을 다시 열 일이 없어야 합니다.
4. 이제부터 앞으로는:
   - GitHub의 `main.js`를 수정(Claude가 만들어드린 파일로 교체 + 커밋)
   - 길드방에서 관리자가 `!굼바봇 업데이트` 실행
   - 최신 코드가 메신저봇R을 다시 열지 않고도 그 자리에서 반영됨

### ⚠️ 정직하게 말씀드리는 한계

- 이 메커니즘은 **JavaScript 명세를 근거로 설계**했고 **Node.js로 재현 검증까지
  마쳤지만, 실제 메신저봇R(Rhino 엔진)에서 100% 동일하게 동작하는지는 확인하지
  못했습니다** — 실기기 테스트가 꼭 필요합니다.
- 로더 없이(예전 방식대로) `main.js`를 통째로 붙여넣은 상태에서 `!굼바봇 업데이트`를
  실행하면, 정직하게 "지금은 실시간 반영이 안 되는 방식입니다"라고 안내하고 아무것도
  바꾸지 않습니다 (조용히 실패하지 않습니다).
- GitHub 저장소가 **비공개(private)면 raw 파일을 못 받아옵니다** — 공개 저장소이거나,
  별도의 인증 방법이 필요합니다.


