# 히스토리노트 (HistoryNote)

역사(한국사·세계사) 정보 사이트 — Cloudflare Worker가 요청마다 그 자리에서 페이지를 만들어주는
**동적 사이트** + 관리자 전용 실시간 편집 기능. 관리자가 "저장"을 누르는 순간 데이터베이스(D1)에
바로 반영되며, 커밋이나 재배포를 기다릴 필요가 없습니다.

## 무엇이 들어있나요

- 홈, 카테고리, 글, 칼럼, 신뢰 페이지 6종, 사이트맵, 404 — 전부 요청이 올 때마다 Cloudflare D1에서
  최신 데이터를 읽어 그 자리에서 HTML을 만듭니다(사전 생성된 정적 파일이 아닙니다).
- `/admin/` 경로의 관리자 화면 — 글/칼럼/카테고리 작성·수정, 리치 텍스트 에디터(글자 크기/색/이미지 삽입),
  사이트 설정(히어로 배경 이미지 등) 편집. **"저장" = 즉시 게시**이며, 상태를 "초안"으로 두면 저장은 되어도
  공개되지 않습니다.
- `/login/` 관리자 전용 로그인 페이지, IP당 짧은 시간에 너무 많이 틀리면 잠깐 막는 로그인 시도 제한 포함
- 이미지는 Cloudflare R2(오브젝트 저장소)에 업로드되어 `/media/...` 경로로 바로 서빙됩니다.
- 관리자가 쓰는 본문은 저장 전에 서버에서 화이트리스트 필터(`functions/_lib/sanitize.js`)를 거쳐,
  `<script>`나 이벤트 속성 같은 위험한 태그/속성이 걸러진 뒤 저장됩니다.

## 배포 방법 (Cloudflare Workers + D1 + R2, 무료 티어)

이 저장소는 정적 파일을 빌드해두는 게 아니라 **Worker 코드 자체가 매 요청마다 페이지를 렌더링**합니다.
그래서 배포 후 콘텐츠가 바뀔 때마다 재빌드가 필요 없고, `wrangler deploy`는 코드/디자인을 바꿀 때만
다시 실행하면 됩니다.

### 1. Cloudflare Worker 프로젝트 연결

1. https://dash.cloudflare.com 에서 **Workers & Pages → Create → Import a repository**로 이 저장소를 연결합니다.
2. 빌드/배포 설정:
   - **Build command**: 비워두어도 됩니다 (더 이상 빌드 스크립트가 없습니다)
   - **Deploy command**: `npx wrangler deploy --keep-vars`
     (`--keep-vars`가 꼭 필요합니다 — 이게 없으면 배포할 때마다 아래에서 등록한 값들이 초기화됩니다)

### 2. D1 데이터베이스 만들기 (콘텐츠 저장소)

1. Cloudflare 대시보드 → **Workers & Pages → D1** → 데이터베이스 생성 (이름 예: `hstorydomaingscprep-db`)
2. 생성된 데이터베이스의 **Console** 탭에서 `d1/schema.sql` 파일 내용을 그대로 붙여넣고 실행합니다.
3. 기존 콘텐츠를 옮기려면(처음 한 번만): 로컬에서 `python3 scripts/generate_d1_seed.py`를 실행해
   `d1/seed.sql`을 만들고, 그 내용을 D1 콘솔에 붙여넣어 실행합니다. (이미 실행해서 만들어진
   `d1/seed.sql`이 저장소에 포함되어 있다면 그대로 써도 됩니다)
4. `wrangler.jsonc`의 `d1_databases[0]`에서 `database_id`를 방금 만든 데이터베이스의 실제 ID로 바꿉니다
   (D1 데이터베이스 목록 화면에서 확인 가능).

### 3. R2 버킷 만들기 (이미지 저장소)

1. Cloudflare 대시보드 → **R2** → 버킷 생성 (이름 예: `hstorydomaingscprep-media`)
2. `wrangler.jsonc`의 `r2_buckets[0].bucket_name`이 실제 버킷 이름과 일치하는지 확인합니다.

### 4. KV 네임스페이스 (로그인 시도 제한용, 이미 설정되어 있다면 생략)

1. **Workers & Pages → KV**에서 네임스페이스 생성
2. `wrangler.jsonc`의 `kv_namespaces[0].id`를 그 ID로 설정

### 5. Variables and Secrets 등록

**Settings → Variables and Secrets**에서 아래 값들을 등록합니다.

| 변수명 | 타입 | 설명 |
|---|---|---|
| `ADMIN_PASSWORD` | Secret | 관리자 로그인 비밀번호 |
| `SESSION_SECRET` | Secret | 로그인 세션 쿠키 서명용 임의의 긴 무작위 문자열 (예: `openssl rand -hex 32`) |

(예전 GitHub 커밋 방식에서 쓰던 `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO`/`GITHUB_BRANCH`는 더 이상
필요 없습니다 — 콘텐츠와 이미지가 각각 D1/R2에 직접 저장되기 때문입니다.)

### 6. 그 외

- **애드센스**를 쓴다면 저장소 루트의 `ads.txt`에 본인의 `pub-` ID가 들어있는지 확인하세요.
- 커스텀 도메인은 **Custom domains** 탭에서 구매한 도메인을 연결하면 됩니다(무료).
- 저장소 루트에 `wrangler.jsonc` / `package.json` / `package-lock.json` / `.assetsignore`가 있어야
  Cloudflare 빌드가 정상 동작합니다 (npm ci로 wrangler 설치, node_modules 등 자산 제외 목적).

## 관리자 로그인 및 편집 방법

1. 메인 페이지 헤더의 **로그인** 버튼(`/login/`)에서 `ADMIN_PASSWORD`로 로그인합니다. 인증은
   `/functions/api/login.js`가 서버에서 직접 검증하고, 검증 성공 시 서명된 HttpOnly 세션 쿠키를 내려줍니다.
   15분 안에 같은 IP에서 5번 틀리면 잠시 로그인이 막힙니다.
2. 로그인하면 전체 사이트 상단에 관리자 바가 나타나고 `/admin/`에서 대시보드를 사용할 수 있습니다.
3. **일반 글 관리 / 칼럼 관리**의 본문은 리치 텍스트 에디터로 작성합니다 — 제목 크기, 굵게/기울임/밑줄,
   글자색/배경색, 정렬, 목록, 인용구, 링크, 이미지 삽입을 지원합니다. 이미지를 넣으면 자동으로
   R2에 업로드되고 대체 텍스트(alt)도 함께 입력받습니다.
4. **카테고리 / 사이트 설정**도 같은 화면에서 편집합니다. **"저장"을 누르는 즉시 D1에 반영되어 다음
   요청부터 바로 사이트에 나타납니다.** 발행 상태를 "초안"으로 두면 저장은 되지만 공개 페이지에는
   나타나지 않고, "발행"으로 바꿔 저장하는 순간 실제로 보입니다.
   - 사이트 설정의 **히어로 배경 이미지 URL**에 이미지 주소를 입력하면 메인 페이지 히어로 섹션 배경이 바뀝니다.
   - 개인정보처리방침/이용약관/면책고지 페이지는 관리자 화면에서 다루지 않는 별도 페이지입니다(내용은
     `functions/_lib/render.js`에 고정 텍스트로 들어있습니다).
5. **미디어** 탭에서 지금까지 업로드한 이미지를 목록으로 보고, 안 쓰는 이미지를 지울 수 있습니다.

### 알아두면 좋은 한계

- 관리자 계정은 비밀번호 1개로 동작하는 단일 관리자용 로그인입니다(회원가입/권한 구분 없음).
- 이미지는 업로드 전 브라우저에서 자동으로 리사이즈되지만(최대 폭 1600px), 그래도 크기가 5MB를 넘으면
  업로드가 거부됩니다.
- 삭제한 이미지는 R2에서 즉시 지워지며 되돌릴 수 없습니다.

## 폴더 구조

```
/
├─ ads.txt
├─ wrangler.jsonc / package.json / package-lock.json / .assetsignore   Cloudflare 배포 설정
├─ assets/css/style.css        디자인 시스템(색상, 타이포, 레이아웃)
├─ assets/js/common.js         내비게이션, 서버 세션 확인
├─ assets/js/login.js          로그인 폼 처리
├─ assets/js/admin.js          관리자 화면 로직 + 리치 에디터 + D1/R2 API 호출
├─ assets/uploads/              예전 GitHub 방식으로 올라간 기존 이미지들(하위 호환용, 새 업로드는 R2로 감)
├─ assets/icons/favicon.svg
├─ functions/
│  ├─ _worker-entry.js         모든 요청의 진입점 — 동적 페이지 렌더링, /api/*, /media/*, 정적 자산 라우팅
│  ├─ api/login.js             비밀번호 검증(+ 시도 횟수 제한) + 세션 쿠키 발급
│  ├─ api/logout.js            세션 쿠키 삭제
│  ├─ api/session.js           로그인 여부 확인
│  ├─ api/posts.js             글 저장/삭제 (D1에 즉시 반영)
│  ├─ api/columns.js           칼럼 저장/삭제
│  ├─ api/categories.js        카테고리 저장/삭제
│  ├─ api/config.js            사이트 설정 저장
│  ├─ api/data.js              관리자 화면이 쓰는, D1의 현재 전체 데이터 조회
│  ├─ api/upload.js            이미지 업로드 → R2에 저장
│  ├─ api/media.js             업로드된 이미지 목록/삭제
│  └─ _lib/
│     ├─ render.js             페이지 HTML을 만드는 렌더링 엔진(예전 scripts/build.py를 그대로 옮긴 것)
│     ├─ db.js                 D1 읽기/쓰기 (config/categories/posts/columns)
│     ├─ auth.js                세션 쿠키 서명/검증
│     ├─ ratelimit.js           로그인 시도 제한 (KV)
│     ├─ sanitize.js            본문 HTML 화이트리스트 필터
│     └─ convert.js             관리자 폼 데이터 → 저장용 데이터 변환
├─ scripts/
│  └─ generate_d1_seed.py      data/content.json → d1/seed.sql 생성 (D1로 처음 옮길 때 한 번만 사용)
├─ d1/
│  ├─ schema.sql                D1 테이블 정의 (D1 콘솔에서 한 번 실행)
│  └─ seed.sql                  초기 콘텐츠 데이터 (D1 콘솔에서 한 번 실행)
└─ data/
   └─ content.json              예전 방식의 콘텐츠 스냅샷(기록용, 지금은 D1이 실제 소스입니다)
```

## 자주 수정하는 항목의 위치

| 수정하고 싶은 것 | 위치 |
|---|---|
| 사이트명 / 한줄 소개 / 운영자 정보 / 히어로 배경 | `/admin/` 사이트 설정 화면 (D1의 `config` 테이블에 바로 저장) |
| 메인/서브 컬러 | `assets/css/style.css` 상단 `:root`의 `--ink`, `--brass` |
| 카테고리 / 글 / 칼럼 내용 | `/admin/` 화면에서 작성·수정 (저장 즉시 반영) |
| 관리자 비밀번호 / 세션 설정 | Cloudflare의 Variables and Secrets `ADMIN_PASSWORD` / `SESSION_SECRET` |
| 애드센스 퍼블리셔 ID | `functions/_lib/render.js`의 `head()` 함수(`ca-pub-` 코드) + 저장소 루트 `ads.txt` |
| 정책 페이지(개인정보처리방침 등) 문구 | `functions/_lib/render.js`의 `renderPrivacy`/`renderTerms`/`renderDisclaimer` (코드를 고치고 재배포 필요) |

## 참고 — 이 사이트의 한계

- 실제 회원가입, 댓글, 이메일 자동 발송 기능은 없습니다. 문의는 이메일(mailto) 링크로 연결됩니다.
- 관리자 인증/저장 기능은 Cloudflare의 D1/R2/Secrets가 모두 설정되어 있어야 동작합니다(위 "배포 방법" 참고).
- 콘텐츠는 애드센스 심사 등에서 참고가 될 수 있도록 일반 정보성 주제로 작성되었으며, 승인 자체를 보장하지 않습니다.
