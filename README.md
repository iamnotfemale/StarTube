# StarTube

**알고리즘 없이, 엄선한 스타트업·창업·AI 영상만.**

👉 **https://iamnotfemale.github.io/StarTube/**

YouTube에서 창업 영상을 보다 보면 어느새 취미 영상, 쇼츠, 자극적인 추천 영상으로 넘어가 있곤 합니다.
StarTube는 스타트업·창업·AI 연구에만 집중하려고 만든 영상 사이트입니다. 직접 고른 채널의 영상만 보여주고 추천 알고리즘은 쓰지 않습니다.

[Andrej Karpathy의 HackerTube](https://hackertube.org)에서 영감을 받았습니다.

## 무엇이 다른가요

| | YouTube | StarTube |
|---|---|---|
| 보이는 영상 | 알고리즘이 고른 영상 | 큐레이션한 채널의 영상만 |
| 정렬 | 개인화 추천 | 최신순 |
| 쇼츠 | 섞여 나옴 | 3분 이하 영상은 자동 제외 |
| 썸네일 | 업로더가 만든 썸네일 | 영상 중간 장면 (낚시 썸네일 차단) |
| 조회수 | 표시 | 표시하지 않음 |
| 로그인 | 필요 | 필요 없음 (기록은 브라우저에만 저장) |

## 주요 기능

- **카테고리**: 스타트업·창업 / 투자·VC / AI 연구
- **검색**: 제목, 채널, 설명에서 검색 (`/` 키로 바로 검색)
- **나중에 볼 영상·시청 기록**: 계정 없이 브라우저에 저장
- **집중 시청 페이지**: 사이트 안에서 바로 재생하고, 오른쪽에는 같은 채널·같은 주제 영상만 표시
- **한국어 / English**, **다크 모드**, PC·모바일 지원
- **신고**: 주제와 맞지 않는 영상은 영상 페이지의 '신고' 버튼으로 알려주세요 (GitHub 계정 필요)
- **데이터 내보내기**: 전체 영상 목록을 [`videos.json`](videos.json)으로 받아서 자기만의 버전을 만들 수 있습니다

## 큐레이션 채널

| 카테고리 | 한국어 | 영어 |
|---|---|---|
| 스타트업·창업 | EO Korea, BZCF 비즈까페, 티타임즈TV, 디캠프 | Y Combinator, Lenny's Podcast, Stanford eCorner |
| 투자·VC | | a16z |
| AI 연구 | 테디노트 | Andrej Karpathy, Dwarkesh Patel |

전체 목록은 [`channels.txt`](channels.txt)에 있습니다. 좋은 채널을 알고 계시면 [이슈](https://github.com/iamnotfemale/StarTube/issues)로 알려주세요.

## 작동 방식

```
channels.txt ──▶ fetch.mjs (YouTube Data API) ──▶ videos.json ──▶ index.html (GitHub Pages)
                       ▲ 매일 06:00 KST · 채널 변경 시 자동 실행 (GitHub Actions)
```

- 서버도 DB도 없습니다. `index.html` 한 파일(프레임워크 없는 JS)과 정적 JSON으로 동작합니다.
- 운영자는 사이트의 관리 탭에서 채널 추가·삭제, 영상 숨기기, 신고 처리를 합니다. 변경 내용은 이 저장소에 커밋되고, 1~2분 뒤 사이트에 반영됩니다.

<details>
<summary>직접 실행하기</summary>

1. [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) 키를 발급해 `.env`에 `YT_API_KEY=...`로 넣습니다.
2. 영상을 수집하고 로컬 서버를 띄웁니다.
   ```
   node --env-file=.env fetch.mjs
   python -m http.server 8123
   ```
3. 배포하려면 저장소 Secret에 `YT_API_KEY`를 등록하고 GitHub Pages(main, /root)를 켭니다. 관리 탭은 저장소 쓰기 권한이 있는 Fine-grained 토큰(Contents·Issues 쓰기, Actions 읽기)을 `#/admin`에 입력해 사용합니다.

</details>
