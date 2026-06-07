# URL Shortener

K3s 기반 Homelab Kubernetes 플랫폼에서 운영할 샘플 애플리케이션입니다.

## Purpose

이 애플리케이션은 Kubernetes 운영 플랫폼의 배포, Ingress 라우팅, CI/CD, GitOps, 모니터링, 로깅, 장애 대응 테스트를 위한 실서비스 역할을 합니다.

## Current Scope

현재 단계에서는 Redis/PostgreSQL 연결 전이며, Backend 메모리 저장소를 사용합니다.

## Backend API

| Method | Path | Description |
|---|---|---|
| GET | /healthz | Backend health check |
| GET | /api/health | API health check |
| POST | /api/shorten | Create short URL |
| GET | /api/urls | List stored URLs |
| GET | /:code | Redirect to original URL |

## Planned Components

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL 예정
- Cache: Redis 예정
- Deployment: Kubernetes Manifests
- CI: GitHub Actions 예정
- CD: ArgoCD 예정
