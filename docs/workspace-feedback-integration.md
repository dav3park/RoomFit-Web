# 작업실 AI 피드백 연동

2026-10-13 · 연결 설계와 3단계 작업실 구현 기록

사용자는 OpenAI와 `gpt-4o-mini`를 선택했다. 서버 키 등록과 실제 모델 호출 성공을 확인했다.
서버의 새 미리보기 엔드포인트와 작업실 UI를 연결했다. 결과를 먼저 미리보고 명시적으로 적용할 때만 자동 저장한다.
사용자는 나머지 해석 보완은 실제 API를 사용한 뒤 검증하기로 했다. 첫 연결은 기존 실행기의
이동·회전·추가·삭제·같은 종류 상품 교체에 제한한다. 전체 명세의 치수 보정·재색칠·추상 목표와
방향·추상 목표에 대한 일반적인 `clarificationAnswer` 재전송은 아직 연결하지 않았다. 대상/기준 가구 선택은 원문과 revision에 묶인 `clarificationSelections`로 연결했다.
서버 설정·현재 API 계약은 `RoomFit-Backend/docs/workspace-feedback-preview.md`에 기록했다.

명령의 의미·유지/금지 조건·재질문·지원 범위는
[명령 해석 명세](workspace-feedback-semantics.md)를 따른다.
[평가 사례](fixtures/workspace-feedback-cases.json)는 연결 전후의 의미 검증 기준이다.
기존 Plan v2를 그대로 새 기능 전체의 해석 계약으로 간주하지 않는다.

## 코드에서 확인한 현재 상태

| 영역 | 현재 구현 | 연결할 때 필요한 변경 |
| --- | --- | --- |
| 새 작업실 | `src/pages/WorkspaceDemo.tsx`의 AI 피드백 버튼은 입력 확인 안내만 표시한다. | 요청 중·실패·대상 확인·미리보기·적용 상태를 연결한다. |
| 자동 저장 | `src/pages/Workspace.tsx`는 변경한 배치를 브라우저의 방별 draft와 선택한 방에 저장한다. | 피드백 요청에는 최신 draft를 전달한다. |
| 기존 Web API | `src/api/layouts.ts`의 `applyLayoutFeedback`는 `layoutId`, `feedback`, 선택적 `selectedFurnitureId`를 전송한다. | 현재 작업실은 서버 Layout을 만들지 않으므로 이 함수를 그대로 연결할 수 없다. |
| 기존 서버 API | `LayoutService.feedback`는 서버 Layout의 가구 배열을 읽고, 성공하면 파생 Layout을 저장한다. | 새 작업실의 미리보기는 저장 없이 현재 draft의 복사본을 사용한다. |
| 취향 컨텍스트 | 기존 서버 피드백은 `baseLayout.getContextId()`로 AgentContext를 필수 조회하고, LLM 프롬프트도 컨텍스트를 필수 사용한다. | 서버 Context가 없는 직접 배치 방에서도 동작해야 한다. |
| 자연어 해석 | `LlmFeedbackPlanInterpreter`와 `FeedbackPlanValidator`는 v2 계획, 대상·참조, 허용 연산을 검증한다. | 기존 해석 규칙을 재사용한다. |
| 실제 변경 | `DeterministicFeedbackExecutor`는 좌표를 계산하고 복합 작업 실패 시 원본을 반환한다. | 격리한 draft에서만 실행한다. |
| 색상·모델 | 작업실 draft에는 자동 색 조합, 모델·재질, 시각적 배율, 보정 기준, 자물쇠 등 Web 전용 정보가 있다. | API 응답으로 전체 RoomLayout을 갈아치워 이 정보를 잃지 않도록 한다. |
| 배치 검증 | 새 추천의 창문 높이·실제 모델 외곽·문 부채꼴·수납 개폐·60 cm 연결 통로는 `src/recommendation/layoutValidation.ts`가 검사한다. | 서버 후보도 이 검증을 추가로 통과해야 작업실에서 적용할 수 있다. |

기존 API와 새 작업실은 저장 기준이 다르다. 오래된 `layoutId`에 피드백을 보내거나
미리보기를 위해 Room 가구/서버 Layout을 먼저 덮어쓰는 방법은 사용하지 않는다.
기존 편집기와 기존 피드백 API의 계약은 유지한다.

## 연결 구조

```text
자연어 요청 + 최신 draft + 현재 취향 + 고정 가구
  → 서버: 방 접근 권한·입력 검증
  → OpenAI: 구조화된 변경 계획 해석
  → 서버: 계획·대상 검증, 결정론적 실행으로 후보 생성
  → 작업실: 모델·색상 정보 보존, 기존 추천 엔진의 공간 검증
  → 변경 이유·3D 미리보기
  → 사용자가 적용
  → 기존 changeRoom / 자동 저장 경로
```

OpenAI는 어떤 가구에 어떤 변경을 요청했는지 해석한다. 가구 좌표·회전값·상품 치수나
검증 통과 여부를 모델이 임의로 확정하지 않는다. 기존 서버 실행기를 재사용하되,
작업실의 더 구체적인 공간 검증을 최종 적용 조건으로 둔다.

## 새 미리보기 API와 후속 계약

`POST /api/layouts/feedback/preview` — 서버 Room/Context/Layout을 저장하거나 확정하지 않는다.

- 현재 요청: `roomId`, `revision`, `feedback`, `roomDimensions`, 최신 `furniture` 배열,
  `lockedFurnitureIds`, 현재 `preferences`, 선택적 `selectedFurnitureId`.
  선택적 `clarificationSelections`는 원문/revision/역할/가구 ID를 함께 전송한다. 방향과 목표 재질문은 요청문을 수정해서 답한다.
- 방 구조는 접근 가능한 서버 Room에서 읽는다. Web과 서버의 방 구조가 다르면 후보를 적용하지 않고
  다시 불러오도록 안내한다. 첫 API는 치수 일치만 비교하며 벽/개구부 revision 비교는 아직 없다.
  가구 배열은 DB의 이전 배열 대신 요청의 최신 snapshot을 사용한다.
- `preferences`는 현재 작업실에서 선택한 라이프스타일·스타일·색감이다. 저장된 Context ID를
  요구하지 않고 메모리 안에서 해석 컨텍스트를 만든다. 자동 색 조합은 API의 기존 색감 enum에
  끼워 넣지 않고, 적용된 Web 색상 정보를 보존한다.
- 가구·ID·문자열·수치·개수·연산 수는 서버에서 제한한다. 음수/0 크기, 유한하지 않은 값,
  중복 ID, 존재하지 않는 고정/선택 ID는 OpenAI 호출 전에 거부한다.
- 요청 좌표는 기존 `toRoomFurnitureReplaceRequest`를 사용한다. 후보는 중앙 원점·radian으로 정확히 역변환한다. 기존 응답 매퍼의 좌표 보정/작은 각도 추측을 후보에 적용하지 않는다. 상품 교체/추가의 시각 정보는 기존 카탈로그 매퍼를 사용한다.
- 응답: 요청 `revision`, 상태, 해석 출처, 변경 요약, 작업별 결과, 후보 가구,
  필요 시 대상 선택 질문, 서버 검증 결과. 저장된 새 `layoutId`는 요구하지 않는다.
- 같은 종류의 가구가 여러 개라면 사용자에게 대상을 묻는다. 자동으로 첫 가구를 고르지 않는다.
- 고정 가구와 요청하지 않은 가구의 모델·크기·위치·방향은 보존한다. 하나의 작업이라도
  실패하거나 고정을 침해하면 복합 요청 전체를 적용하지 않는다.
- 호출 실패나 규칙 기반 대체 결과는 출처를 구분한다. 규칙 결과를 AI 성공처럼 표시하지 않는다.

OpenAI 키와 모델 설정은 기존 서버의 피드백 전용 환경변수
`ROOMFIT_LLM_FEEDBACK_API_KEY`, `ROOMFIT_LLM_FEEDBACK_BASE_URL`,
`ROOMFIT_LLM_FEEDBACK_MODEL`, `ROOMFIT_LLM_FEEDBACK_TIMEOUT_MS`와
`ROOMFIT_LLM_FEEDBACK_ENABLED`를 활용한다. 키를 Web 환경변수·localStorage·Git·로그에 넣지 않는다.
모델은 `gpt-4o-mini`로 선택했고, 아래 배포 후 검증에서 실호출을 확인했다.

기존 클라이언트 경로는 OpenAI 호환 Chat Completions의 JSON mode를 사용한다.
새 미리보기는 계획 스키마를 고정하는 Structured Outputs를 사용한다.
스키마 준수와 대상/공간 검증은 별개이며, 거절·불완전 응답·시간 초과도 변경 실패로 처리한다.
공식 근거: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat).

## 화면과 상태 규칙

- 요청과 결과는 현재 `검증 · 결과` 메뉴 안에 표시한다.
- 미리보기 버튼은 현재 draft를 저장하거나 바꾸지 않는다. 적용 버튼만 기존 자동 저장 경로를 호출한다.
- 기존 추천 미리보기와 피드백 미리보기를 구분해 잘못된 후보를 적용하지 않는다.
- 요청 중 사용자가 편집하거나 방을 바꾸면 요청을 취소하고, 늦게 도착한 이전 `revision`의 결과도 버린다.
- 취소·실패·대상 선택·적용 전에는 원본 draft와 색상 설정이 유지된다.
- 현재 색상과 자동 색 조합, 모델 정보는 변경하지 않은 가구에서 유지한다.
- 창문·개폐·동선 검증이 실패하면 이유를 표시하고 적용을 막는다. 수동 편집의 겹침 허용 규칙과
  검증된 자동 피드백 후보의 적용 조건을 구분한다.
- 안전한 위치를 찾지 못하면 조건을 임의로 완화하지 않는다. 원본 배치를 보존하고 이유를 알린다.

## 단계별 완료 기준

1. **연결 설계와 기준 검증:** 기존 코드/저장 차이 확인, 이 문서 작성, 관련 모의 테스트 실행.
2. **서버 미리보기:** 최신 snapshot 입력, 저장 없는 실행, OpenAI 구조화 응답·실패 처리,
   우선 기존 여섯 연산에 한정하여 명령 해석 명세와 Plan v2의 차이 구현,
   고정/모호한 대상/복합 실패/접근 권한 테스트.
   모델과 키를 설정한 비프로덕션 실호출 및 의미 사례 검증.
3. **작업실 연결:** 미리보기·변경 설명·대상 재질문·적용, 색상/모델 보존,
   공간 검증·오래된 응답 폐기·자동 저장 테스트. 배포 전 호출 빈도와 비용 상한을 설정한다.
4. **실사용 검증과 배포:** 창문 근처 이동, 침대 고정, 책상 회전/상품 교체,
   불가능한 이동, 여러 동일 종류 가구, 실패 후 재시도, 새로고침,
   데스크톱/모바일·키보드·콘솔 확인 후 실제 사이트에서 확인한다.

1단계에서는 실제 OpenAI 호출이나 UI 변경을 수행하지 않는다. 후속 구현의 통과 기준은
원본 보존·요청한 변경만 반영·명시적 적용·공간 검증·실패 이유 표시다.

## 1단계 검증 결과

- Web의 API 응답 변환·가구 메타데이터·피드백 세션·결과 표시 관련 4개 테스트 파일,
  62개 테스트가 통과했다. 현재 코드의 기준 검증이며 새 미리보기 기능의 검증은 아니다.
- Backend의 클라이언트·LLM 계획·컨트롤러·계획 검증·설정 누락 관련 5개 테스트 클래스,
  41개 중 40개가 통과했다. 실제 제공자 호출 대신 테스트 응답을 사용했다.
- 기존 `LayoutFeedbackControllerTest.feedback_addFurnitureKeepsExistingResponseShapeAndUsesCatalogMetadata`
  테스트는 `mood_lamp`를 기대하지만 실제 응답은 `lamp`여서 실패했다. 런타임 코드는 변경하지 않은
  상태에서 확인한 불일치다. 2단계에서 카탈로그/응답의 canonical type 계약을 확인한다.
- Gradle의 기본 JDK 탐색은 Java 21을 찾지 못했다. 설치된 JDK를 이번 명령에만
  `-Dorg.gradle.java.home=/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home`
  으로 지정해 실행했다. 프로젝트·전역 Java 설정은 변경하지 않았다.
- 실제 OpenAI 호출, 새 API, 새 UI, 브라우저 상호작용, 배포는 아직 검증하지 않았다.
  당시 변경 파일은 이 설계 문서 하나였다.

## 2단계 구현 기록

- 서버가 최신 snapshot을 별도로 구성하고, DB Room/Context/Layout을 저장하지 않는 API를 추가했다.
- 고정/명시적 유지 조건과 요청하지 않은 필드 변경을 검사한다. 서버 공간 검증 실패 시 후보를 폐기한다.
- 설정 누락은 503, 제공자 오류·잘못된 구조화 응답은 502이며 규칙 결과로 AI 성공을 가장하지 않는다.
- 기존 상품 alias는 새 API에서 canonical type으로 반환한다. 기존 API의 응답 계약은 변경하지 않았다.
- 환경변수 바인딩과 EC2 배포 컨테이너 전달 경로를 추가했다. 실제 키 등록·실호출·배포는 아래 기록을 따른다.
- 새 서버 미리보기와 관련 기존 회귀 테스트 12개 클래스, 190개 테스트가 통과했다. 실제 제공자는 모의 응답으로 대체했다.
- 요청당 한 번 호출, 최대 4096 output token, 자동 재시도 없음. 공개 파일럿은 서버 프로세스당 분당 20회·동시 2회로 제한한다.
- 서버와 Web의 공간 검증 차이, 구조 revision, 해석 범위 확대, 재질문 답변 처리, 모델·색상 병합은 남아 있다.

## 배포 후 실호출 검증 · 2026-10-13

- Backend main `f3731efa013f6287d75dacf98f8531f679a7a6a4`를 push했고 EC2 배포가 완료됐다.
  [배포 실행](https://github.com/dav3park/RoomFit-Backend/actions/runs/38355271469).
- 호출 제한을 포함한 관련 테스트 192개가 통과했다. CI 전체는 728개 중 기존 알려진 11개 실패가 남았다.
  기존 워크플로의 `continue-on-error`를 유지했으며 전체 테스트 통과로 간주하지 않는다.
- 공개 Sample Room 1과 임시 책상 한 개를 입력하여 `/api/layouts/feedback/preview`를 한 번 호출했다.
  피드백: `책상을 방 기준 오른쪽으로 조금 옮겨줘`.
- 약 4.02초 뒤 HTTP 200, `status=SUCCESS`, `source=LLM`, 작업 `MOVE/APPLIED`가 반환됐다.
  x 좌표 2.0 → 2.2m, z 좌표 2.0m 유지. 상품·variant·크기·회전·스타일 태그와 revision이 보존됐다.
- 호출 전후 서버 Room 응답이 같았다. Room/Layout/Context 저장·확정 요청은 실행하지 않았다.
- 실제 제공자 연결 확인이며, 전체 해석 사례의 정확도나 Web 미리보기·적용 흐름 검증은 아니다.


## 3단계 작업실 연결 · 2026-10-13

- 기존 `검증 · 결과` 패널 안에서 요청, 진행, 오류, 재질문, 3D 미리보기, 변경 설명, 적용을 처리한다.
- 최신 draft를 전송한다. `selectedFurnitureId`와 자물쇠를 전달하고 대상/기준 선택은 최대 두 역할을 별도로 보낸다. 선택 응답의 원문·revision·ID·역할을 서버에서 검증한다.
- 이동/회전은 기존 상품·색상·재질·모델·시각 배율·보정 기준·자동 색 조합을 보존한다. 상품 교체는 새 카탈로그 시각 정보를 사용하며 원래 위치·방향을 유지한다.
- 서버 성공 후에도 Web 공간 검증을 실행한다. 본체·경계·창문·문/수납 개폐·60 cm 연결 통로 문제가 있으면 이유를 표시하고 적용 버튼을 비활성화한다. 후보를 임의로 보정하지 않는다.
- 취소, 입력 수정, 가구 변경, 취향 변경, 방 이동, 화면 종료는 응답을 취소/폐기한다. 중복 요청을 막고 활성 클라이언트와 원본 객체가 다른 응답은 수용하지 않는다.
- 추천과 피드백 미리보기를 구분한다. 미적용 후보가 있는 동안 상단 다음 단계는 비활성화한다. 적용은 기존 브라우저 자동 저장 경로만 사용하며 DB Room/Layout/Context 저장 API를 호출하지 않는다.

### 검증

- Web 전체 78개 파일, 738개 테스트 통과. 새 연결 테스트는 API 응답/취소 신호, snapshot 변환·메타데이터 보존·허용 변경 범위·공간 검증, 패널 상태를 포함한다.
- TypeScript/프로덕션 빌드와 ESLint 통과. 기존 RoomViewer 번들 크기 경고는 남아 있다.
- Backend 관련 13개 클래스, 199개 테스트 통과. 역할별 선택, 원문/개정 불일치·없는 ID·중복 역할의 외부 호출 전 거부를 포함한다.
- Playwright 별도 Chrome 세션에서 모의 응답으로 미리보기/취소 원본 보존, 적용/새로고침 자동 저장, 느린 응답 취소, 요청 중 수동 회전 후 늦은 결과 폐기, 429/502와 재시도, 경계 밖 후보 적용 차단, 대상/기준 선택의 원문·revision 유지, 추천과 피드백 미리보기 분리를 확인했다.
- 1440×900 및 390×844에서 기존/새 화면을 비교했다. 기존 헤더·폰트·버튼·패널·장면 배치를 유지하며 모바일 수평 스크롤이 없고 Tab/Enter로 요청 및 적용 버튼에 접근했다. 콘솔 오류는 없었고 기존 Three.js 폐기 예정 API 경고는 남았다.
- Impeccable 수동 검사에서 결정론적 이슈가 검출되지 않았다. 실제 화면 확인 결과와 함께 판단했다.
- 스크린샷: `/private/tmp/roomfit-feedback-before-desktop.png`, `/private/tmp/roomfit-feedback-desktop.png`, `/private/tmp/roomfit-feedback-desktop-preview.png`, `/private/tmp/roomfit-feedback-before-mobile.png`, `/private/tmp/roomfit-feedback-mobile.png`, `/private/tmp/roomfit-feedback-mobile-preview.png`.
- 위 상호작용 검증은 모의 응답이며 실제 OpenAI 해석의 정확도를 보장하지 않는다. 배포한 UI에서 실호출 결과는 별도로 기록한다.
