# 관리자 비밀번호 로그인

사이트는 GitHub Pages를 계속 사용하고, `/admin*` 요청만 Cloudflare Worker가 처리합니다. `/admin`에서 비밀번호를 입력하면 8시간 동안 유효한 HttpOnly·Secure·SameSite 쿠키를 발급합니다. GitHub 토큰은 Worker에만 보관합니다. 브라우저의 이전 `adminKey` 저장값은 자동으로 제거합니다.

## 최초 배포

1. `yeoziphab.com`이 Cloudflare DNS에서 관리되는지 확인하고 `startube` 레코드를 **Proxied**로 설정합니다. GitHub Pages의 도메인 연결과 HTTPS 인증서도 유지합니다. 도메인의 DNS가 다른 곳에 있다면 먼저 Cloudflare로 연결해야 같은 주소의 `/admin` 경로를 사용할 수 있습니다.
2. 저장소의 프런트엔드 변경을 GitHub Pages에 배포합니다. Worker는 `/admin` 요청 시 Pages의 루트 HTML을 가져옵니다.
3. Node.js 24 환경에서 아래 명령을 실행합니다. `wrangler.toml`의 도메인이 실제 도메인과 일치해야 합니다.

   ```sh
   cd /workspace/StarTube/admin-worker
   npx wrangler@4.166.0 login
   npx wrangler@4.166.0 deploy
   npx wrangler@4.166.0 secret put ADMIN_PASSWORD
   npx wrangler@4.166.0 secret put SESSION_SECRET
   npx wrangler@4.166.0 secret put GITHUB_TOKEN
   npx wrangler@4.166.0 deploy
   ```

   `ADMIN_PASSWORD`에는 운영자가 정한 로그인 비밀번호를 입력합니다. `SESSION_SECRET`에는 비밀번호와 다른 충분히 긴 임의 문자열을 사용합니다. 예를 들어 `openssl rand -hex 32`로 생성한 값을 보안 입력창에 등록할 수 있습니다. `GITHUB_TOKEN`은 `iamnotfemale/StarTube`에만 접근 가능한 Fine-grained 토큰으로 Contents·Issues 쓰기, Actions 읽기 권한이 필요합니다. 값은 소스 코드나 채팅에 올리지 않습니다. Cloudflare 대시보드의 Worker Settings → Variables and Secrets에서도 암호화된 Secret으로 등록할 수 있습니다.

4. `https://startube.yeoziphab.com/admin`을 열어 로그인하고 채널·숨긴 영상·신고 목록이 로드되는지 확인합니다. 로그아웃한 뒤에는 관리자 API 요청이 거절되어야 합니다. 실제 저장 작업은 저장소에 커밋되므로 테스트용 변경도 운영 데이터에 반영됩니다.

Cloudflare 무료 플랜의 사용량 한도 내에서 운영할 수 있습니다. 로그인은 IP별 60초에 5회로 제한합니다. Worker의 로그인 제한은 분산 환경에서 근사치로 적용됩니다. 짧은 숫자 비밀번호는 추측하기 쉬우므로 공개 운영 시 더 긴 비밀번호로 바꿀 수 있습니다. 비밀번호를 바꾸면서 기존 세션까지 만료시키려면 `SESSION_SECRET`도 교체합니다. 로그아웃은 현재 브라우저의 쿠키를 삭제합니다.

GitHub 토큰을 아직 등록하지 않은 경우 비밀번호 로그인과 공개 목록 조회는 가능하지만, 관리자 변경 버튼은 비활성화됩니다. 토큰을 등록한 뒤 다시 로그인하면 저장 기능을 사용할 수 있습니다.

## 개발·검증

추가 패키지 없이 관리자 API의 인증·권한·변경 전달을 검사합니다. GitHub 응답과 비밀 설정은 테스트 대역이며 실제 저장소를 수정하지 않습니다.

```sh
cd /workspace/StarTube
node --test admin-worker/test/*.test.mjs
cd admin-worker
npx wrangler@4.166.0 deploy --dry-run --outdir /tmp/startube-worker-dist
```

정적 화면은 저장소 루트에서 `python -m http.server 8123 --bind 0.0.0.0`으로 실행합니다. 이 서버만으로는 Worker API가 실행되지 않습니다. Worker API를 따로 개발하려면 `admin-worker/.dev.vars`에 로컬 전용 테스트 설정을 넣고 `npx wrangler@4.166.0 dev --local --port 8787`을 사용합니다. `.dev.vars`는 Git에서 제외됩니다. 운영 토큰 없이 로컬 API 테스트를 실행할 수 있습니다. 전체 로그인 화면 검증은 같은 출처의 Worker 경로가 필요하며, 배포 후 위의 최종 확인 절차를 수행해야 합니다.
