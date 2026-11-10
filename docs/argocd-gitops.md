# Argo CD 기반 Kubernetes GitOps 구축

## 1. 구축 목적

기존 Kubernetes 환경에서는 kubectl을 이용해 Deployment, Service, Ingress 등을 직접 관리했다.

이번 실습에서는 GitHub 저장소를 Kubernetes 리소스의 선언적 관리 기준으로 사용하고,
Argo CD를 통해 Git의 설정과 실제 클러스터 상태를 비교하고 동기화하는 GitOps 환경을 구축했다.

### 구축 환경

| 항목 | 구성 |
|---|---|
| Kubernetes | K3s 단일 노드 |
| GitOps | Argo CD v3.6.1 |
| Git Repository | my-k8s-platform |
| Application | url-shortener |
| Namespace | url-shortener |
| Sync Policy | Manual |
| Auto Sync | Disabled |
| Prune | Disabled |

## 2. GitOps 아키텍처

GitHub Repository (main)
        |
        v
      Argo CD
        |
        | Manual Sync
        v
 Kubernetes Cluster
        |
        +-- Namespace: url-shortener
        +-- Backend Deployment / Service
        +-- Frontend Deployment / Service
        +-- Ingress

### 동작 방식

1. GitHub에 Kubernetes Manifest를 저장한다.
2. Argo CD가 Git에 정의된 상태와 클러스터 상태를 비교한다.
3. 차이가 발생하면 OutOfSync 상태로 표시한다.
4. 운영자가 Diff를 확인한 후 Manual Sync를 실행한다.
5. 동기화 후 Synced / Healthy 상태와 실제 서비스를 검증한다.

## 3. Argo CD 설치 및 구성

### 설치 환경

- Argo CD 버전: v3.6.1
- 설치 Namespace: argocd
- 설치 방식: 공식 릴리스 Manifest
- 설치 파일: /root/argocd-install/v3.6.1/install.yaml

### 주요 컴포넌트

| 컴포넌트 | 역할 |
|---|---|
| argocd-server | Web UI 및 API 제공 |
| argocd-repo-server | Git Manifest 조회 및 생성 |
| argocd-application-controller | Application 상태 비교 및 동기화 |
| argocd-applicationset-controller | ApplicationSet 리소스 관리 |
| argocd-dex-server | 인증 연동 |
| argocd-notifications-controller | 알림 처리 |
| argocd-redis | 캐시 제공 |

### 설치 상태 확인

    kubectl get pods -n argocd
    kubectl get deployments -n argocd
    kubectl get crd | grep argoproj

최종 확인 결과 Argo CD Pod 7개가 모두 Running 상태였다.

## 4. GitOps Application 설정

Argo CD Web UI에서 기존 URL Shortener를 Application으로 등록했다.

| 항목 | 설정값 |
|---|---|
| Application Name | url-shortener |
| Project | default |
| Repository | my-k8s-platform |
| Revision | main |
| Path | deploy/url-shortener |
| Destination | in-cluster |
| Namespace | url-shortener |
| Directory Recurse | Enabled |
| Sync Policy | Manual |
| Auto Sync | Disabled |
| Prune | Disabled |

Directory Recurse를 활성화한 이유는 Backend와 Frontend Manifest가
각각 하위 디렉터리에 위치하기 때문이다.

### GitOps 관리 대상

1. Namespace/url-shortener
2. Deployment/url-shortener-backend
3. Service/url-shortener-backend
4. Deployment/url-shortener-frontend
5. Service/url-shortener-frontend
6. Ingress/url-shortener-ingress

## 5. 첫 Manual Sync

### 동기화 전 상태

- Health: Healthy
- Sync Status: OutOfSync

기존 서비스는 정상 동작했지만 Git Manifest와 실제 클러스터 리소스 간
차이가 존재하여 OutOfSync로 표시됐다.

### Diff 분석

Argo CD의 Compact Diff 기능으로 6개 리소스를 확인했다.

주요 차이는 Argo CD가 리소스를 관리하기 위해 추가하는
argocd.argoproj.io/tracking-id Annotation이었다.

Deployment의 Pod Template, 이미지, Replicas와
Service 포트, Ingress 라우팅에는 변경 사항이 표시되지 않았다.

### 동기화 조건

- Manual Sync
- Prune 비활성화
- Force 비활성화
- Replace 비활성화
- 기존 6개 리소스 선택

### 동기화 결과

- Sync Status: Synced
- Health Status: Healthy
- Backend Deployment: 1/1 Ready
- Frontend Deployment: 1/1 Ready

동기화 후 기존 Backend 및 Frontend Pod 이름이 유지됐고,
추가적인 컨테이너 재시작도 확인되지 않았다.

## 6. ApplicationSet Controller 장애 및 복구

### 장애 증상

Argo CD 설치 후 ApplicationSet Controller에서 CrashLoopBackOff가 발생했다.

- Pod 상태: 0/1 CrashLoopBackOff
- 재시작 횟수: 최대 28회 확인
- 다른 Argo CD 컴포넌트: 정상 실행

### 원인 분석

이전 컨테이너 로그에서 다음 오류를 확인했다.

    no matches for kind "ApplicationSet" in version "argoproj.io/v1alpha1"

Kubernetes CRD를 조회한 결과 ApplicationSet CRD가 누락되어 있었다.

    kubectl get crd | grep argoproj

최초 확인된 CRD:

- applications.argoproj.io
- appprojects.argoproj.io

설치 Manifest에는 ApplicationSet CRD가 포함되어 있었지만,
실제 클러스터에는 생성되지 않은 상태였다.

최초 설치 과정에서 누락된 정확한 원인은 확인하지 못했다.

### 복구 과정

설치 Manifest에서 ApplicationSet CRD만 추출했다.

추출 파일:

    /root/argocd-install/v3.6.1/applicationset-crd.yaml

일반 kubectl apply 검증에서는 다음 오류가 발생했다.

    metadata.annotations: Too long: may not be more than 262144 bytes

대용량 CRD에 대해 Client-Side Apply가 생성하는
last-applied-configuration Annotation이 크기 제한을 초과한 것으로 판단했다.

Server-Side Apply로 변경하여 CRD를 등록했다.

    kubectl apply --server-side --dry-run=server -f applicationset-crd.yaml
    kubectl apply --server-side -f applicationset-crd.yaml

CRD 등록 확인:

    kubectl wait --for=condition=Established \
      crd/applicationsets.argoproj.io --timeout=120s

### 복구 결과

- ApplicationSet CRD: Established
- ApplicationSet Controller: 1/1 Running
- Controller Deployment: 1/1 Available
- Argo CD 전체 Pod: 7/7 Running

기존 URL Shortener 리소스를 변경하거나
Argo CD 전체를 재설치하지 않고 복구했다.

## 7. GitOps 동기화 후 서비스 검증

### Kubernetes 상태

- Backend Deployment: 1/1 Ready
- Frontend Deployment: 1/1 Ready
- Backend Pod: 1/1 Running
- Frontend Pod: 1/1 Running
- Argo CD: Synced / Healthy

### HTTP 기능 검증

| 검증 항목 | 결과 |
|---|---|
| Frontend / | HTTP 200 |
| Backend /healthz | HTTP 200 |
| POST /api/shorten | HTTP 201 |
| GET /r/:code | HTTP 302 |
| Redirect Location | https://example.com |

URL 생성 API에서 단축 코드를 발급받고,
해당 코드로 Redirect 요청을 수행하여 목적지 응답을 확인했다.

## 8. 운영 관점에서 배운 점

- OutOfSync가 반드시 서비스 장애를 의미하지는 않는다.
- Sync 전 Git Manifest와 실제 리소스의 Diff를 확인해야 한다.
- Deployment의 spec.template 변경은 Pod 재생성을 유발할 수 있다.
- Prune과 Force는 운영 영향도를 검토한 후 사용해야 한다.
- CrashLoopBackOff 발생 시 이전 컨테이너 로그를 확인한다.
- CRD 기반 Controller 장애에서는 CRD 등록 여부를 점검한다.
- 로그 발생 시각과 복구 작업 시각을 비교해야 한다.
- Sync 성공 후 실제 HTTP 요청까지 검증해야 한다.

## 9. 현재 한계 및 개선 방향

현재는 Manual Sync 방식이므로 GitHub에 변경 사항을 Push해도
자동으로 Kubernetes에 반영되지는 않는다.

또한 컨테이너 이미지에 latest 태그를 사용하고 있어,
이미지 내용만 변경되면 Argo CD가 변경을 감지하지 못할 수 있다.

향후 개선 과제:

1. Git Commit SHA 기반 이미지 태그 적용
2. 이미지 버전 변경을 Git Manifest에 반영
3. GitOps 변경 및 롤백 실습
4. Auto Sync 및 Prune 정책 검토
5. GitHub Actions와 Argo CD 배포 흐름 연결

## 10. 최종 결과

Argo CD v3.6.1을 설치하고 기존 URL Shortener 애플리케이션을
GitOps 관리 대상으로 등록했다.

6개 Kubernetes 리소스의 Diff를 검증한 후 첫 Manual Sync를 수행하여
Synced / Healthy 상태를 확인했다.

설치 중 발생한 ApplicationSet CRD 누락 장애는 Server-Side Apply로 복구했고,
기존 서비스를 유지하면서 HTTP 200/201/302 기능 검증을 완료했다.
