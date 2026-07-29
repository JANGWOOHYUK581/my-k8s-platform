# CI/CD Pipeline: GitHub Actions와 GHCR 기반 이미지 배포 자동화

## 1. 개요

이 문서는 URL Shortener 애플리케이션의 CI/CD 자동화 구성 과정을 정리한 문서이다.

이번 챕터에서는 GitHub Actions를 이용하여 Backend와 Frontend의 빌드 검증을 자동화하고, Docker 이미지 빌드 및 GitHub Container Registry, GHCR 이미지 Push까지 자동화하였다.

이 과정을 통해 단순히 Kubernetes에 애플리케이션을 수동 배포하는 수준을 넘어, 코드 변경부터 컨테이너 이미지 생성까지 이어지는 기본적인 CI/CD 흐름을 구성하였다.

## 2. 자동화 목표

이번 CI/CD 구성의 목표는 다음과 같다.

    GitHub에 코드 Push
      ↓
    GitHub Actions 자동 실행
      ↓
    Backend CI 수행
      ↓
    Frontend CI 수행
      ↓
    Docker image build 검증
      ↓
    GHCR로 Docker image push

## 3. 구성 파일

GitHub Actions workflow 파일은 다음 위치에 작성하였다.

    .github/workflows/ci.yml

이 workflow는 main 브랜치에 Push가 발생하면 자동 실행된다.

대상 경로는 다음과 같다.

    apps/url-shortener/**
    .github/workflows/ci.yml

즉, 애플리케이션 코드나 CI 설정이 변경될 때만 workflow가 실행되도록 구성하였다.

## 4. Backend CI

Backend CI는 URL Shortener Backend 애플리케이션의 의존성 설치와 테스트 가능 여부를 검증한다.

작업 위치:

    apps/url-shortener/backend

주요 단계:

    1. Repository checkout
    2. Node.js 22 설정
    3. Backend dependency install
    4. npm test --if-present
    5. npm run build --if-present

Backend는 현재 별도 build script가 없어도 실패하지 않도록 `--if-present` 옵션을 사용하였다.

이를 통해 초기 프로젝트 단계에서도 CI가 과하게 깨지지 않으면서, 나중에 test/build script를 추가하면 자연스럽게 검증 범위를 확장할 수 있다.

## 5. Frontend CI

Frontend CI는 URL Shortener Frontend 애플리케이션의 의존성 설치와 빌드 성공 여부를 검증한다.

작업 위치:

    apps/url-shortener/frontend

주요 단계:

    1. Repository checkout
    2. Node.js 22 설정
    3. Frontend dependency install
    4. npm test --if-present
    5. npm run build

Frontend는 Vite 기반으로 구성되어 있으며, `npm run build`를 통해 정적 파일 생성이 정상적으로 수행되는지 확인한다.

## 6. Docker Build 자동화

초기 CI 구성 이후 Dockerfile 검증을 위해 Docker Build job을 추가하였다.

검증 대상:

    apps/url-shortener/backend/Dockerfile
    apps/url-shortener/frontend/Dockerfile

Docker build 검증을 통해 애플리케이션 코드뿐만 아니라 실제 컨테이너 이미지 생성 과정도 GitHub Actions에서 확인할 수 있도록 구성하였다.

이 단계의 의미는 다음과 같다.

    로컬에서는 빌드되지만 CI 환경에서는 실패하는 문제를 조기에 발견할 수 있다.
    Dockerfile 문법 오류나 누락된 파일을 Push 시점에 확인할 수 있다.
    이후 Registry Push와 GitOps 배포로 확장하기 위한 기반을 마련한다.

## 7. GHCR 이미지 Push 자동화

Docker build 검증 이후 GitHub Container Registry, GHCR로 이미지 Push를 자동화하였다.

Workflow에는 다음 권한을 추가하였다.

    permissions:
      contents: read
      packages: write

GHCR 이미지 Push를 위해 GitHub Actions의 GITHUB_TOKEN을 사용하였다.

생성되는 이미지 이름은 다음과 같다.

    ghcr.io/jangwoohyuk581/url-shortener-backend:latest
    ghcr.io/jangwoohyuk581/url-shortener-frontend:latest

또한 commit SHA 기반 태그도 함께 Push되도록 구성하였다.

    ghcr.io/jangwoohyuk581/url-shortener-backend:<commit-sha>
    ghcr.io/jangwoohyuk581/url-shortener-frontend:<commit-sha>

latest 태그는 최신 배포용으로 사용할 수 있고, commit SHA 태그는 특정 버전 추적과 롤백 기준으로 사용할 수 있다.

## 8. GitHub Actions Job 구성

현재 workflow는 다음 3개의 job으로 구성되어 있다.

| Job | 역할 |
|---|---|
| Backend CI | Backend 의존성 설치 및 test/build script 검증 |
| Frontend CI | Frontend 의존성 설치 및 build 검증 |
| Docker Build and Push | Backend/Frontend Docker image build 후 GHCR Push |

Docker Build and Push job은 Backend CI와 Frontend CI가 모두 성공한 뒤 실행되도록 구성하였다.

    needs:
      - backend-ci
      - frontend-ci

이를 통해 애플리케이션 검증이 실패한 상태에서는 이미지 Push가 진행되지 않도록 하였다.

## 9. GitHub Actions Badge

README 상단에는 GitHub Actions 상태 배지를 추가하였다.

배지 목적:

    GitHub 저장소 첫 화면에서 CI 상태를 바로 확인할 수 있다.
    포트폴리오 방문자가 자동화 구성 여부를 빠르게 파악할 수 있다.
    main 브랜치 기준 CI 상태를 시각적으로 보여준다.

README에 표시되는 배지:

    URL Shortener CI | passing

## 10. GHCR Package 생성 확인

GitHub Actions 실행 후 GitHub Packages에 다음 2개의 패키지가 생성되었다.

    url-shortener-backend
    url-shortener-frontend

이를 통해 GitHub Actions에서 Docker image build뿐만 아니라 Registry Push까지 정상 수행되는 것을 확인하였다.

## 11. 해결한 문제

이번 챕터에서 해결한 주요 문제는 다음과 같다.

| 문제 | 원인 | 해결 |
|---|---|---|
| workflow 파일 push 실패 | Personal Access Token에 workflow 권한 없음 | PAT에 workflow 권한 추가 |
| GitHub Actions 경고 발생 | actions/checkout@v4가 Node.js 20 runtime 사용 | actions/checkout@v5로 변경 |
| README 수정 시 CI 미실행 | paths 조건에 README.md가 포함되지 않음 | 정상 동작으로 판단, CI 배지는 최신 성공 상태 표시 |
| GHCR image owner 대소문자 문제 가능성 | Docker image 경로는 소문자 권장 | owner 값을 lowercase로 변환 |

## 12. 현재 완료 상태

현재 완료된 항목은 다음과 같다.

    GitHub Actions workflow 생성 완료
    Backend CI 구성 완료
    Frontend CI 구성 완료
    Docker build 검증 자동화 완료
    README CI badge 추가 완료
    GHCR image push 자동화 완료
    backend/frontend GHCR package 생성 확인 완료

## 13. 포트폴리오 관점에서의 의미

이번 CI/CD 챕터는 다음 역량을 보여준다.

    GitHub Actions workflow 작성 능력
    Backend / Frontend 분리 CI 구성 능력
    Node.js 기반 애플리케이션 빌드 검증
    Dockerfile 기반 이미지 빌드 자동화
    GitHub Container Registry 사용 경험
    CI 성공 후 이미지 Push로 이어지는 기본 CD 흐름 이해
    GitHub README를 통한 자동화 상태 시각화

이 구성은 이후 ArgoCD 기반 GitOps 배포로 확장하기 위한 기반 단계이다.

## 14. 다음 단계

다음 단계에서는 Kubernetes manifest의 image 경로를 Local Registry에서 GHCR 기준으로 변경한다.

현재 구조:

    localhost:5000/url-shortener-backend:0.1.1
    localhost:5000/url-shortener-frontend:0.1.0

변경 예정 구조:

    ghcr.io/jangwoohyuk581/url-shortener-backend:latest
    ghcr.io/jangwoohyuk581/url-shortener-frontend:latest

이후 ArgoCD를 구성하여 GitHub Repository의 manifest를 기준으로 Kubernetes 클러스터에 자동 배포되는 GitOps 흐름으로 확장한다.
