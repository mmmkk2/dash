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
