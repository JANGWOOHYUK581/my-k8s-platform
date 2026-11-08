# Kubernetes GHCR Image Migration

## 1. Overview

URL Shortener 서비스의 컨테이너 이미지 저장소를
Local Registry에서 GitHub Container Registry(GHCR)로 전환했다.

## 2. Architecture

### Before

GitHub Repository → Local Docker Build → Local Registry → K3s

### After

GitHub Repository → GitHub Actions → Docker Build → GHCR → K3s

현재 Kubernetes 배포는 수동으로 진행하며,
GitOps 자동 배포는 이후 단계에서 구축할 예정이다.

## 3. Image Migration

| Component | Before | After |
|---|---|---|
| Backend | localhost:5000/url-shortener-backend:0.1.1 | ghcr.io/jangwoohyuk581/url-shortener-backend:latest |
| Frontend | localhost:5000/url-shortener-frontend:0.1.0 | ghcr.io/jangwoohyuk581/url-shortener-frontend:latest |

## 4. Pre-change Validation

- GHCR Backend/Frontend Public 확인
- K3s containerd 이미지 Pull 성공
- 기존 Deployment YAML 백업
- kubectl diff로 변경 범위 검증
- Backend와 Frontend 순차 전환

## 5. Deployment Migration

Backend와 Frontend를 순차적으로 GHCR 이미지로 전환했다.

작업 순서:

1. Backend Deployment 이미지 변경
2. Backend RollingUpdate 완료 확인
3. Backend Pod 및 HTTP Health Check 검증
4. Frontend Deployment 이미지 변경
5. Frontend RollingUpdate 완료 확인
6. Frontend Pod 및 HTTP 응답 검증

적용 명령어:

    kubectl apply -n url-shortener \
      -f deploy/url-shortener/backend/deployment.yaml

    kubectl rollout status deployment/url-shortener-backend \
      -n url-shortener --timeout=180s

Frontend에도 동일한 방식으로 적용했다.

## 6. Post-change Validation

| Validation | Result |
|---|---|
| Backend Pod | 1/1 Running, Restart 0 |
| Frontend Pod | 1/1 Running, Restart 0 |
| Backend Health Check | HTTP 200 |
| Frontend HTTP | HTTP 200 |
| URL Shortening API | HTTP 201 Created |
| URL Redirect | HTTP 302 Found |
| Redirect Location | https://example.com |

검증 결과 Backend와 Frontend 모두 정상 동작했다.

단, RollingUpdate 중 무중단 여부를 별도로 측정하지는 않았다.

## 7. Rollback Plan

변경 전 Deployment YAML을 다음 경로에 백업했다.

    ~/k8s-backups/step41/

장애 발생 시 기존 Local Registry 이미지로 복귀할 수 있다.

기존 이미지:

- Backend: localhost:5000/url-shortener-backend:0.1.1
- Frontend: localhost:5000/url-shortener-frontend:0.1.0

원복 전 Local Registry 접근 및 이미지 존재 여부를 확인해야 한다.

원복 후 Pod 상태, HTTP 응답 및 애플리케이션 기능을 재검증하고
Git Repository의 Manifest도 실제 운영 상태와 일치시켜야 한다.

## 8. Lessons Learned

- 이미지 Pull 성공만으로 서비스 정상 동작을 보장할 수 없다.
- 변경 전 Deployment 백업과 kubectl diff 검증이 중요하다.
- Backend와 Frontend를 순차적으로 전환해 변경 범위를 분리했다.
- RollingUpdate 이후 HTTP 및 실제 애플리케이션 기능 검증이 필요하다.
- Replica 1개 구성에서는 서비스 가용성에 주의해야 한다.
- latest 태그보다 Commit SHA 또는 Image Digest 기반 배포가 적합하다.
- GitHub Actions 이미지 배포와 Kubernetes 자동 배포는 별개다.

## 9. GitHub Commit

- Commit: 7aedd22
- Message: deploy: migrate url shortener images to ghcr

