# Argo CD GitOps 변경 및 롤백 실습

## 1. 실습 개요

- 실습 일자: 2026-11-12
- 환경: K3s 단일 노드 Kubernetes
- GitOps 도구: Argo CD v3.6.1
- Application: url-shortener
- Namespace: url-shortener
- Git 브랜치: main
- 배포 정책: Manual Sync
- 실습 목적: Git 기반 설정 변경과 원복 절차 검증

이번 실습에서는 기존 URL Shortener 서비스의 Deployment 메타데이터를 변경하고,
Argo CD가 Git과 Kubernetes의 차이를 감지하는지 확인했다.

변경 적용 후 Git Revert로 설정을 원복하고,
서비스 정상 동작과 기존 Pod 유지 여부를 검증했다.

## 2. 변경 전 상태

| 항목 | 확인 결과 |
|---|---|
| Kubernetes Node | Ready |
| Argo CD Pod | 7/7 Running |
| Application | Synced / Healthy |
| Backend Deployment | 1/1 Ready |
| Frontend Deployment | 1/1 Ready |
| Git 기준 Commit | 18fd11c |

변경 전 Kubernetes 및 Argo CD가 정상 상태임을 확인했다.

## 3. Git Manifest 변경

변경 파일:

    deploy/url-shortener/backend/deployment.yaml

Deployment 최상위 metadata에 다음 Annotation을 추가했다.

    metadata:
      annotations:
        opsnote.example.com/change-id: "step43-gitops-test"

Pod Template, 컨테이너 이미지 및 Replica 수는 변경하지 않았다.

변경 내용 확인:

    git diff -- deploy/url-shortener/backend/deployment.yaml

YAML 검증:

    kubectl apply --dry-run=client \
      -f deploy/url-shortener/backend/deployment.yaml

검증 결과:

    deployment.apps/url-shortener-backend configured (dry run)

## 4. GitHub 변경 반영

변경 Commit:

    ff82907 test: add gitops change annotation

GitHub main 브랜치에 Push했다.

Argo CD에 Git 상태 재조회를 요청했다.

    kubectl annotate application url-shortener \
      -n argocd \
      argocd.argoproj.io/refresh=hard \
      --overwrite

확인 결과:

- Argo CD Revision: ff82907
- Sync Status: OutOfSync
- Health Status: Healthy
- Kubernetes Annotation: 미적용

Git과 Kubernetes의 설정 차이를 Argo CD가 정상적으로 감지했다.

## 5. Manual Sync 적용

Argo CD Web UI에서 Diff를 확인했다.

변경 대상:

    Deployment/url-shortener-backend

변경 내용:

    opsnote.example.com/change-id: step43-gitops-test

다음 조건으로 Manual Sync를 수행했다.

- Backend Deployment만 선택
- Prune 비활성화
- Force 비활성화
- Replace 비활성화

적용 결과:

- Application: Synced / Healthy
- Annotation: step43-gitops-test
- Backend Pod: 기존 Pod 유지
- Frontend Pod: 기존 Pod 유지

## 6. 변경 후 서비스 검증

| 검증 항목 | 결과 |
|---|---|
| Frontend / | HTTP 200 |
| Backend /healthz | HTTP 200 |
| POST /api/shorten | HTTP 201 |
| 단축 코드 발급 | 성공 |

변경 적용 후에도 기존 서비스가 정상적으로 동작했다.

## 7. Git Revert를 이용한 설정 원복

변경 이력을 보존하면서 설정을 되돌리기 위해 Git Revert를 사용했다.

    git revert --no-edit ff82907

원복 Commit:

    7e5bbe5

GitHub main 브랜치에 원복 Commit을 Push했다.

원복 후 Git Manifest에서 다음 Annotation이 제거됐다.

    opsnote.example.com/change-id: step43-gitops-test

Argo CD에 Refresh를 요청한 후 상태를 확인했다.

    kubectl get application url-shortener -n argocd

확인 결과:

- Argo CD Revision: 7e5bbe5
- Sync Status: OutOfSync
- Health Status: Healthy

Git에서는 Annotation이 제거됐지만 Kubernetes에는 남아 있었으므로,
Argo CD가 다시 OutOfSync 상태를 표시했다.

## 8. Argo CD 원복 적용

Argo CD Web UI에서 변경 Diff를 검토한 후
Backend Deployment만 선택하여 Manual Sync를 수행했다.

원복 후 상태:

- Application: Synced / Healthy
- Backend Deployment: 1/1 Ready
- Frontend Deployment: 1/1 Ready
- 작업 식별 Annotation: 제거 확인
- Backend Pod: 기존 Pod 유지
- Frontend Pod: 기존 Pod 유지

원복 과정에서 Pod 재생성은 확인되지 않았다.

## 9. 원복 후 서비스 검증

| 검증 항목 | 결과 |
|---|---|
| Argo CD | Synced / Healthy |
| Frontend / | HTTP 200 |
| Backend /healthz | HTTP 200 |
| GET /r/oGozKz | HTTP 302 |
| Backend Deployment | 1/1 Ready |
| Frontend Deployment | 1/1 Ready |
| 기존 Pod 유지 | 확인 |

서비스 기능 검증 결과 모두 정상으로 확인됐다.

## 10. 운영 관점에서 배운 점

1. OutOfSync는 Git과 실제 클러스터 설정이 다르다는 의미이며, 반드시 장애를 뜻하지는 않는다.
2. Git 변경 후 Argo CD가 최신 Revision을 인식했는지 확인해야 한다.
3. Manual Sync 전 Diff를 검토하여 변경 범위를 확인해야 한다.
4. Deployment 최상위 metadata 변경은 Pod Template 변경과 구분해야 한다.
5. Git Revert를 사용하면 기존 Commit 이력을 유지하면서 설정을 되돌릴 수 있다.
6. Git Revert만으로 Kubernetes 설정이 원복되는 것은 아니며 Manual Sync가 필요하다.
7. Sync 성공 후에는 Deployment 상태뿐 아니라 실제 HTTP 기능도 검증해야 한다.

## 11. 최종 결과

Git Manifest 변경부터 Argo CD OutOfSync 감지,
Manual Sync, 서비스 검증, Git Revert 및 원복까지 수행했다.

변경 적용과 원복 과정에서 기존 Pod를 유지했으며,
최종적으로 Argo CD Synced / Healthy 및 HTTP 200/302 응답을 확인했다.

## 12. 향후 개선 방향

- Git Commit SHA 기반 이미지 버전 관리
- 이미지 변경에 따른 Pod Rollout 검증
- GitOps 변경 전후 상태 비교 자동화
- 배포 실패 상황에서의 롤백 절차 실습
- GitHub Actions와 Argo CD 연계
