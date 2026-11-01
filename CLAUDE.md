# 내비서 (dash) — 작업 규칙

개인용 PWA: 메모·노트·일정·가계부·자산·앤딩(스터디카페 관리). React + Vite, Supabase, Vercel 배포.
맥에서 도는 앤딩 수집·API는 별도 저장소 `mmmkk2/andingapp` (운영 브랜치 `supabase-vercel`).

## 대화
- 한국어로, 짧게. 화면 결과 위주로 설명하고 코드 설명은 최소로.
- 화면은 라이트 테마, 애플처럼 미니멀하게. 다른 탭과 모양(카드 16px 모서리, 칩, 밑줄 탭, 시트 창)을 맞춘다.

## 배포 흐름 ("바로 배포")
- 작업 브랜치에서 커밋 → PR → **squash 머지**까지 묻지 않고 진행. Vercel은 `main`만 배포 (`vercel.json`의 `claude/**`는 꺼져 있음).
- 배포 확인: `gh api repos/mmmkk2/dash/commits/<sha>/statuses --jq '.[0].state'` 가 `success`.
- Vercel 하루 배포 횟수에 한도가 있으니 작은 수정은 모아서.
- **디자인이 크게 바뀌면 바로 배포하지 말고** 미리보기 스크린샷을 먼저 보여 주고 "진행"을 받는다 (바꾼 내용은 `git stash`로 보관).
- 동시에 여러 세션이 일할 수 있다: 세션마다 **자기 브랜치**(`claude/<주제>`)를 쓰고, 머지 전에 `origin/main`을 받아 충돌을 정리한다. 같은 파일(`notes-app.jsx`, `pages/anding-home.jsx`, `budget-app.jsx`, `assets-app.jsx`)을 크게 고치는 일은 한 세션에서만.

## 디자인 기준 (모든 탭 공통)
- **화면 틀**: 내용 최대 폭 680, 좌우 여백 12px. 하단 탭이 있으면 제목 22px/굵게, 오른쪽에 ⋯ 메뉴.
- **카드**: 흰 배경, `0.5px` 연한 테두리, 모서리 16px. 목록은 카드 하나 안에 줄로, 줄 사이 0.5px 구분선 (메모 목록 방식).
- **칩 = 거르기 전용**: 작은 알약(12px, 5×10 여백), 색 점, 고르면 그 색으로 채움, '전체'는 코랄. 화면을 바꾸는 데는 칩을 쓰지 않는다.
- **밑줄 탭 = 화면 전환**: 가계부(내역·캘린더·통계·반복), 자산(주식·기타자산·연금·부채·AMAT)처럼 요약 카드 아래에.
- **순서**: 제목 → (거르기 칩) → 요약 카드 → 밑줄 탭 → 목록. + 버튼(FAB)은 오른쪽 아래.
- **창(Sheet/Modal)**: 폭 `calc(100% - 16px)`·최대 660, 높이 `min(78dvh, 100dvh - 80px)`, 뒤 배경 어둡게+살짝 흐림. 머리에 제목 20px + 취소 + 저장(동그란 버튼). 저장할 게 없으면 닫기만. 자주 안 쓰는 동작(보관·옮기기·삭제)은 머리의 ⋯ 메뉴로.
- **꾹 누르기**: 그 줄 오른쪽 자리에 아이콘 버튼(고정·보관/복원·삭제)만, 떠 있는 층 없이. 삭제는 빨강 + 확인 창.
- **확인·알림**: `ask`/`tell`(앱 안 창). 되돌리기 어려운 동작은 확인 버튼 빨강.
- **달력**: 흰 카드, 요일 11px(주말 흐리게), 날짜 32px 둥근 네모, 오늘은 연한 색·선택은 채움, 좌우로 밀어 달 넘기기.
- **색**: 메모·일정 기본 코랄 `#ef6a5f`. 태그 개인 `#b5814e`·앤딩 `#3e9478`·부동산 `#4d83ba`·고이온 `#9867b7` (노트 태그도 이름이 겹치면 같은 색). 앤딩은 `anding-shared.jsx`의 `COL`, 자산은 `TAB_COLOR`.
- **빈 상태**: 카드 안에 짧은 회색 한 줄. 비어 있으면 숨겨도 되는 칸(예: 앤딩 메모)은 '+ 추가'만.
- 다른 탭과 다르게 보이는 곳을 고칠 땐 브라우저에서 재서(여백·폭·모서리·글자 크기) 맞춘다.

## 세션 나눔
- ① 메모·노트·일정 (`notes-app.jsx`, `pages/lecture-notes.jsx`) ② 가계부·자산 (`budget-app.jsx`, `assets-app.jsx`) ③ 앤딩 (`pages/anding-*.jsx` + andingapp) ④ 공통(여러 화면에 걸친 통일·공용 컴포넌트 `src/`).
- 자기 영역 밖 파일은 꼭 필요할 때만 작게 고치고 알린다. 공통 작업은 다른 세션이 같은 파일을 고치지 않을 때.

## 빌드 주의
- `dist/`와 `node_modules/`가 저장소에 들어 있다. `npx vite build`로 확인한 뒤 반드시 되돌린다:
  `git checkout -q -- dist node_modules/.package-lock.json; git clean -fdq dist`
- 미리보기: `npx vite build --outDir <임시폴더>` + `npx vite preview --outDir <임시폴더> --port 4174`, Playwright로 Supabase(`**/rest/v1/**`, `**/auth/v1/**`)와 앤딩 API(`**/andingapp/**`)를 가짜 응답으로 채워 스크린샷. 로그인 세션은 localStorage `sb-ouloilbqajzwzegphnii-auth-token`.

## 데이터·보안
- Supabase 표: memos, events(repeat·done_dates·place·tag), lecture_notes(archived·pinned), transactions, assets, stocks, settings, anding_memo, anding_visits 등. 새 칸·표가 필요하면 `supabase_setup.sql` 맨 아래에 SQL을 추가하고, 사용자에게 실행할 줄을 알려 준다 (없을 때도 화면이 깨지지 않게 안내 문구).
- service_role 키는 맥 `.env`에만. 채팅·GitHub에 키·비밀번호를 쓰지 않는다. 앤딩 데이터(이름·전화)는 anon 읽기 금지.
- 실제 카카오톡/문자 발송·재발송, 운영 요청 기록 수정, **매장 문열기(gate_open) 실행은 테스트로도 하지 않는다.**

## 코드 모양
- 공용 창: `notes-app.jsx`의 `Sheet`(제목 + 취소·저장), 확인 창은 `src/dialog.js`의 `ask`/`tell` (브라우저 confirm/alert 쓰지 않기).
- 가계부·자산 `Modal`은 폼의 `data-form-title`·`data-submit`을 읽어 같은 머리를 만든다 — 새 폼도 이 두 표시를 단다.
- 주변 코드와 같은 말투의 한국어 주석, 짧게.
