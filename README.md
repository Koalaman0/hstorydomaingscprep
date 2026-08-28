# 히스토리노트 (HistoryNote)

역사(한국사·세계사) 정보 사이트 — 정적 사이트 + 관리자 전용 실시간 편집 기능

## 무엇이 들어있나요

- 정적 HTML/CSS/JS로 만든 정보 사이트 (홈, 카테고리, 글, 칼럼, 신뢰 페이지 6종, 사이트맵, 404)
- `/admin/` 경로의 관리자 화면 — 글/칼럼/카테고리 작성·수정, 리치 텍스트 에디터(글자 크기/색/이미지 삽입),
  사이트 설정(히어로 배경 이미지 등) 편집
- `/login/` 관리자 전용 로그인 페이지 (메인 헤더의 "로그인" 버튼으로 접근), IP당 짧은 시간에 너무 많이
  틀리면 잠깐 막는 로그인 시도 제한 포함
- `/functions/` 아래 Cloudflare Worker 코드 — 실제 서버 사이드 로그인 인증, 이미지 업로드, 관리자가
  저장한 내용을 GitHub 저장소에 직접 커밋하는 API. 정책 페이지(개인정보처리방침/이용약관/면책고지)는
  이 API가 다루는 `data/content.json`에 포함되지 않으므로 관리자 화면에서 수정할 수 없습니다.
- 관리자가 쓰는 본문은 저장 전에 서버에서 화이트리스트 필터(`functions/_lib/sanitize.js`)를 거쳐,
  `<script>`나 이벤트 속성 같은 위험한 태그/속성이 걸러진 뒤 저장됩니다.

## 배포 방법 (Cloudflare Workers + 정적 자산, 무료 티어)

Cloudflare의 최신 통합 대시보드에서는 이 구성이 "Pages"가 아니라 **"Worker(정적 자산 포함)"** 로 잡힙니다.
GitHub 저장소를 연결해 빌드/배포까지 자동으로 돌아가게 하는 방식(Workers Builds)을 기준으로 안내합니다.

1. https://dash.cloudflare.com 에서 **Workers & Pages → Create → Import a repository**로 이 저장소를 연결합니다.
2. 빌드/배포 설정:
   - **Build command**: `python3 scripts/build.py`
   - **Deploy command**: `npx wrangler deploy --keep-vars`
     (`--keep-vars`가 꼭 필요합니다 — 이게 없으면 배포할 때마다 아래 3번에서 등록한 값들이 초기화됩니다)
3. **저장소 루트에 아래 3개 파일이 있어야** Cloudflare 빌드가 정상 동작합니다(이미 포함되어 있음, 새로
   프로젝트를 처음부터 만드는 경우에만 참고):
   - `wrangler.jsonc` — Worker 이름, `main`(`functions/_worker-entry.js`), 정적 자산 디렉터리(`.`),
     KV 바인딩(`RATE_LIMIT_KV`)을 정의
   - `package.json` / `package-lock.json` — Cloudflare 빌드 환경이 `npm ci`로 `wrangler`를 설치하는 데 필요
   - `.assetsignore` — `node_modules/`, `functions/`, `scripts/` 등 정적 자산으로 올리면 안 되는 폴더를 제외
     (특히 `node_modules/workerd`는 100MB가 넘어 이게 없으면 배포가 실패합니다)
4. **Settings → Variables and Secrets**에서 아래 값들을 등록합니다 (표시된 타입 그대로).

   | 변수명 | 타입 | 설명 |
   |---|---|---|
   | `ADMIN_PASSWORD` | Secret | 관리자 로그인 비밀번호 |
   | `SESSION_SECRET` | Secret | 로그인 세션 쿠키 서명용 임의의 긴 무작위 문자열 (예: `openssl rand -hex 32`) |
   | `GITHUB_TOKEN` | Secret | 이 저장소의 `Contents: Read and write` 권한을 가진 GitHub Fine-grained PAT |
   | `GITHUB_OWNER` | Text | 저장소 소유자 (예: `koalaman0`) |
   | `GITHUB_REPO` | Text | 저장소 이름 (예: `hstorydomaingscprep`) |
   | `GITHUB_BRANCH` | Text | Cloudflare가 배포에 쓰는 브랜치명 (예: `master`) |

5. **로그인 시도 제한(rate limit)을 쓰려면** Workers & Pages → **KV**에서 네임스페이스를 하나 만들고,
   그 ID를 `wrangler.jsonc`의 `kv_namespaces[0].id`에 넣어야 합니다. (이미 설정되어 있다면 새로 할 필요 없음)
6. **애드센스**를 쓴다면 저장소 루트의 `ads.txt`에 본인의 `pub-` ID가 들어있는지 확인하세요.
7. 커스텀 도메인은 **Custom domains** 탭에서 구매한 도메인을 연결하면 됩니다(무료).
8. 설정이 끝나면, 관리자 화면(`/admin/`)에서 "지금 사이트에 게시"를 누를 때마다 `GITHUB_TOKEN`으로
   `data/content.json`을 직접 커밋하고, 그 push가 자동 재배포(빌드 커맨드 재실행)를 트리거합니다.
   보통 1분 안에 실제 사이트에 반영됩니다.

## 관리자 로그인 및 편집 방법

1. 메인 페이지 헤더의 **로그인** 버튼(`/login/`)에서 `ADMIN_PASSWORD`로 로그인합니다. 인증은
   `/functions/api/login.js`가 서버에서 직접 검증하고, 검증 성공 시 서명된 HttpOnly 세션 쿠키를 내려줍니다.
   15분 안에 같은 IP에서 5번 틀리면 잠시 로그인이 막힙니다.
2. 로그인하면 전체 사이트 상단에 관리자 바가 나타나고 `/admin/`에서 대시보드를 사용할 수 있습니다.
3. **일반 글 관리 / 칼럼 관리**의 본문은 리치 텍스트 에디터로 작성합니다 — 제목 크기, 굵게/기울임/밑줄,
   글자색/배경색, 정렬, 목록, 인용구, 링크, 이미지 삽입을 지원합니다. 이미지를 넣으면 자동으로
   `assets/uploads/`에 커밋되고 대체 텍스트(alt)도 함께 입력받습니다.
4. **카테고리 / 사이트 설정**도 같은 화면에서 편집합니다. 이 화면에서의 "저장"은 우선 이 브라우저에만
   임시 보관되며, **사이트 설정 화면의 "지금 사이트에 게시"**를 눌러야 실제로 반영됩니다.
   - 사이트 설정의 **히어로 배경 이미지 URL**에 이미지 주소를 입력하면 메인 페이지 히어로 섹션 배경이 바뀝니다.
   - 개인정보처리방침/이용약관/면책고지 페이지는 관리자 화면에서 다루지 않는 별도 정적 페이지입니다.
5. "지금 사이트에 게시"를 누르면 `/functions/api/content.js`가 로그인 여부를 다시 확인하고, 본문 HTML을
   화이트리스트 필터에 통과시킨 뒤 GitHub API로 `data/content.json`을 커밋합니다.

### 알아두면 좋은 한계

- 관리자 계정은 비밀번호 1개로 동작하는 단일 관리자용 로그인입니다(회원가입/권한 구분 없음).
- 업로드한 이미지는 삭제해도 저장소의 `assets/uploads/` 파일 자체는 자동으로 정리되지 않습니다(수동 삭제 필요).
- 이미지는 업로드 전 브라우저에서 자동으로 리사이즈되지만(최대 폭 1600px), 그래도 크기가 5MB를 넘으면
  업로드가 거부됩니다.

## 로컬에서 콘텐츠만 수정하고 싶을 때

`scripts/build.py`를 로컬에서 직접 실행해도 됩니다(Cloudflare 없이 정적 파일만 다시 만들고 싶을 때).

```
python3 scripts/build.py
```

### 데이터 구조 한 장 요약
```
data/content.json          ← 사이트의 유일한 콘텐츠 소스 (설정/카테고리/글/칼럼)
        │
        ├─ scripts/build.py                 실행 시 → 모든 정적 HTML + data/*.js 재생성
        ├─ scripts/import_admin_export.py    admin JSON export를 content.json에 반영 + build() 실행 (로컬 백업용)
        └─ functions/api/content.js          admin "게시" 요청을 받아 GitHub에 직접 커밋 (본문은 sanitize.js를 거침)
```

## 폴더 구조

```
/
├─ index.html                 홈
├─ about/                     사이트 소개
├─ author/                    운영자 허브(칼럼 목록 + 관리자 세션 시 작성 버튼)
├─ contact/                   문의하기
├─ login/                     관리자 로그인
├─ categories/                카테고리 목록 + 카테고리별 상세
├─ posts/<slug>/               글 상세
├─ columns/<slug>/             칼럼 상세 (+ /columns/ 목록)
├─ admin/                      관리자 화면
├─ privacy/ terms/ disclaimer/ 신뢰·정책 페이지 (관리자 화면에서 수정 불가)
├─ sitemap/                    HTML 사이트맵
├─ 404.html
├─ robots.txt / sitemap.xml / ads.txt
├─ wrangler.jsonc / package.json / package-lock.json / .assetsignore   Cloudflare 배포 설정
├─ assets/css/style.css        디자인 시스템(색상, 타이포, 레이아웃)
├─ assets/js/common.js         내비게이션, 서버 세션 확인
├─ assets/js/login.js          로그인 폼 처리
├─ assets/js/admin.js          관리자 화면 로직 + 리치 에디터 + 게시/업로드 API 호출
├─ assets/uploads/              에디터에서 업로드한 이미지들이 저장되는 곳
├─ assets/icons/favicon.svg
├─ functions/
│  ├─ _worker-entry.js         요청을 /api/* 핸들러 또는 정적 자산으로 라우팅
│  ├─ api/login.js             비밀번호 검증(+ 시도 횟수 제한) + 세션 쿠키 발급
│  ├─ api/logout.js            세션 쿠키 삭제
│  ├─ api/session.js           로그인 여부 확인
│  ├─ api/content.js           게시 요청 → 본문 sanitize 후 GitHub에 content.json 커밋
│  ├─ api/upload.js            이미지 업로드 → GitHub에 assets/uploads/ 커밋
│  └─ _lib/                    세션 서명(auth.js), GitHub API(github.js), 폼→콘텐츠 변환(convert.js),
│                               본문 HTML 화이트리스트 필터(sanitize.js), 로그인 시도 제한(ratelimit.js)
├─ scripts/
│  ├─ build.py                 content.json → 전체 정적 HTML + data/*.js 생성
│  ├─ import_admin_export.py   admin의 JSON export를 content.json에 반영 + build() 실행 (로컬 백업용)
│  └─ sanitize_html.py         sanitize.js와 동일한 필터의 파이썬 버전 (로컬 백업 경로용)
└─ data/
   ├─ content.json              ★ 콘텐츠 원본(설정·카테고리·글·칼럼) — 여기를 고치는 것이 기본
   ├─ site.config.js            (build.py가 생성하는 결과물 — 직접 수정 금지)
   ├─ categories.js             (〃)
   ├─ posts.js                  (〃)
   └─ columns.js                (〃)
```

## 자주 수정하는 항목의 위치

| 수정하고 싶은 것 | 위치 |
|---|---|
| 사이트명 / 한줄 소개 | `/admin/` 사이트 설정, 또는 `data/content.json`의 `config.name`, `config.tagline` |
| 히어로 배경 이미지 | `/admin/` 사이트 설정의 "히어로 배경 이미지 URL", 또는 `data/content.json`의 `config.hero_image_url` |
| 메인/서브 컬러 | `assets/css/style.css` 상단 `:root`의 `--ink`, `--brass` (그리고 `data/content.json`의 `config.main_color`/`config.sub_color`는 참고용 값) |
| 연락 이메일 | `/admin/` 사이트 설정, 또는 `data/content.json`의 `config.email` |
| 운영자명 / 소개 문구 | `/admin/` 사이트 설정, 또는 `data/content.json`의 `config.owner_name`, `config.owner_bio` |
| 카테고리 구성 | `/admin/`의 "카테고리" 화면, 또는 `data/content.json`의 `categories` 배열 |
| 일반 글 내용 | `/admin/`의 "일반 글 관리", 또는 `data/content.json`의 `posts` 배열 |
| 칼럼 내용 | `/admin/`의 "칼럼 관리", 또는 `data/content.json`의 `columns` 배열 |
| 관리자 비밀번호 / 세션 설정 | Cloudflare의 Variables and Secrets `ADMIN_PASSWORD` / `SESSION_SECRET` |
| 애드센스 퍼블리셔 ID | `scripts/build.py`의 `head()` 함수(`ca-pub-` 코드) + 저장소 루트 `ads.txt` |

`data/site.config.js`, `data/categories.js`, `data/posts.js`, `data/columns.js`는 `scripts/build.py`가
`content.json`으로부터 자동 생성하는 **결과물**입니다. 이 파일들을 직접 고쳐도 다음 빌드 시 덮어써지니,
콘텐츠는 항상 `content.json`(또는 `/admin/` 화면)에서 고쳐 주세요.

## 참고 — 이 사이트의 한계

- 완전한 정적 사이트 + 서버리스 함수 조합이므로, 실제 회원가입, 댓글, 이메일 자동 발송 기능은 없습니다. 문의는 이메일(mailto) 링크로 연결됩니다.
- 관리자 인증/게시 기능은 Cloudflare의 Variables and Secrets가 설정되어 있어야 동작합니다(위 "배포 방법" 참고). 설정 전에는 로그인이 항상 실패합니다.
- 콘텐츠는 애드센스 심사 등에서 참고가 될 수 있도록 일반 정보성 주제로 작성되었으며, 승인 자체를 보장하지 않습니다.
