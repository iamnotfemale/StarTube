# StarTube

알고리즘 없이, 엄선한 스타트업·창업·AI 채널의 영상만 모아 보는 YouTube 클론. ([HackerTube](https://hackertube.org) 참고: 엄선된 소스, 영상 중간 장면 썸네일, 데이터 내보내기)

- `index.html`: 사이트 전체 (바닐라 JS, 해시 라우터, 한/영 UI, 다크모드, 나중에 볼/시청 기록은 브라우저 저장)
- `channels.txt`: 큐레이션 채널 목록 (`카테고리 | @핸들`)
- `fetch.mjs`: YouTube Data API로 영상 수집 → `videos.json` (쇼츠·임베드 금지 영상 제외, 누적)
- `hidden.txt`: 숨긴 영상 ID
- `.github/workflows/fetch.yml`: 매일 06:00 KST 자동 수집 후 커밋

## 설정
1. **YouTube API 키**: Google Cloud Console → YouTube Data API v3 사용 설정 → API 키 발급 → `.env`에 `YT_API_KEY=...` (GitHub에는 Secret `YT_API_KEY`)
2. **배포**: GitHub 저장소에 push → Settings › Pages › Deploy from branch(main, /root).

## 로컬 실행
```
node --env-file=.env fetch.mjs
python -m http.server 8123
```

## 관리 (운영자 전용)
1. GitHub → Settings → Developer settings → **Fine-grained token** 생성
   - Repository access: `StarTube`만 / Permissions: **Contents** Read and write, **Issues** Read and write, **Actions** Read-only
2. `https://iamnotfemale.github.io/StarTube/#/admin?key=토큰` 접속 → 키가 브라우저에 저장되고 주소창에서 지워짐 → 사이드바에 **관리** 탭
3. 관리 탭: 채널 추가/삭제, 영상 숨기기/해제, 시청자 신고(이슈) 처리. 변경은 커밋되고 수집 워크플로가 돌아 1~2분 뒤 반영.

시청자는 영상 페이지의 **신고** 버튼으로 GitHub 이슈(`report` 라벨)를 남깁니다.
