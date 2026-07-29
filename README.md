# Home Kubernetes DevOps Platform

개인 서비스를 안정적으로 운영하기 위한 Homelab 기반 Kubernetes DevOps 플랫폼입니다.

본 프로젝트는 집 PC의 VMware 환경에서 Ubuntu Server VM을 구성하고, K3s 기반 단일 노드 Kubernetes 클러스터를 구축한 뒤 Ingress, GitOps, 모니터링, 로깅, 장애 대응 문서화를 단계적으로 구성하는 것을 목표로 합니다.

## Project Goal

단순히 애플리케이션을 배포하는 것이 아니라, 개인 서비스를 운영하기 위한 Kubernetes 기반 운영 플랫폼을 직접 설계하고 구축하는 것을 목표로 합니다.

이 프로젝트의 핵심은 애플리케이션 기능 구현보다 Kubernetes 환경에서 서비스를 배포하고 운영하는 구조를 직접 구성하는 것입니다.

## Current Status

- VMware 기반 Ubuntu Server VM 구성
- K3s 단일 노드 Kubernetes 클러스터 구축
- cgroup v2 전환 후 K3s 정상 기동
- CoreDNS, metrics-server, local-path-provisioner 정상 동작 확인
- Helm 설치
- NGINX Ingress Controller 설치
- demo nginx 앱 배포
- Ingress Host 기반 라우팅 테스트 완료

## Environment

| Item | Value |
|---|---|
| Host | Home PC |
| Virtualization | VMware |
| OS | Ubuntu 22.04.5 LTS |
| Kubernetes | K3s |
| Node Type | Single-node control plane |
| Node Name | k3s-master-01 |
| Node IP | 192.168.200.129 |
| Container Runtime | containerd |
| Ingress Controller | ingress-nginx |
| Package Manager | Helm |

## Current Architecture

```text
User
 ↓
DNS / Local hosts
 ↓
NGINX Ingress Controller
 ↓
Kubernetes Service
 ↓
Application Pod
```

## Demo Architecture

```text
Client Request
 ↓
192.168.200.129:80
 ↓
ingress-nginx-controller
 ↓
demo-nginx-ingress
 ↓
demo-nginx Service
 ↓
demo-nginx Pod
 ↓
nginx response
```

## Planned Architecture

```text
User
 ↓
Cloudflare / DNS
 ↓
NGINX Ingress
 ↓
Frontend
 ↓
Backend API
 ├─ Redis
 └─ PostgreSQL
```

## Tech Stack

- Kubernetes: K3s
- OS: Ubuntu Server
- Virtualization: VMware
- Ingress: NGINX Ingress Controller
- Package Manager: Helm
- Container Runtime: containerd
- Monitoring: Prometheus, Grafana 예정
- Logging: Loki, Promtail 예정
- GitOps: ArgoCD 예정
- CI: GitHub Actions 예정
- Application: URL Shortener 예정
- Database: PostgreSQL 예정
- Cache: Redis 예정

## Repository Structure

```text
my-k8s-platform/
├── apps/
│   └── url-shortener/
├── deploy/
│   ├── demo-nginx/
│   └── url-shortener/
├── infra/
│   ├── k3s/
│   ├── ingress-nginx/
│   ├── cert-manager/
│   ├── monitoring/
│   └── logging/
├── docs/
│   ├── incident-reports/
│   └── runbooks/
└── scripts/
```

## Completed Milestone

### 1. K3s Cluster Setup

K3s 단일 노드 Kubernetes 클러스터를 구축하고, `k3s-master-01` 노드가 Ready 상태가 되는 것을 확인했습니다.

```bash
kubectl get nodes
```

```text
NAME            STATUS   ROLES           VERSION
k3s-master-01   Ready    control-plane   v1.35.5+k3s1
```

### 2. Ingress Controller Setup

Helm을 사용하여 NGINX Ingress Controller를 설치했습니다.

```bash
helm list -A
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

Ingress Controller는 `LoadBalancer` 타입으로 구성되었고, EXTERNAL-IP는 Node IP인 `192.168.200.129`로 할당되었습니다.

### 3. Demo Application Routing

테스트용 nginx 애플리케이션을 `demo` namespace에 배포하고, Ingress Host 기반 라우팅을 검증했습니다.

```bash
curl -H "Host: demo.k3s.local" http://192.168.200.129
```

정상 응답:

```text
Welcome to nginx!
```

## Troubleshooting Highlight

### K3s cgroup v1 Issue

K3s 설치 후 kubelet이 cgroup v1 환경에서 실행되지 않아 K3s 서비스가 반복 종료되는 문제가 발생했습니다.

확인된 로그:

```text
kubelet is configured to not run on a host using cgroup v1
```

해결 방법:

- GRUB 부팅 옵션에서 `systemd.unified_cgroup_hierarchy=0` 제거
- `systemd.unified_cgroup_hierarchy=1` 적용
- 서버 재부팅
- `/sys/fs/cgroup` 타입이 `cgroup2fs`로 변경된 것 확인
- K3s 서비스 정상 기동 확인

결과:

```bash
stat -fc %T /sys/fs/cgroup
```

```text
cgroup2fs
```

```bash
kubectl get nodes
```

```text
k3s-master-01   Ready   control-plane
```

### Helm kubeconfig Issue

Helm으로 ingress-nginx 설치 시 kubeconfig 경로를 찾지 못해 아래 오류가 발생했습니다.

```text
Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp 127.0.0.1:8080: connect: connection refused
```

해결 방법:

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
source ~/.bashrc
```

## Documentation

- `docs/architecture.md`: 전체 아키텍처 설명
- `docs/troubleshooting.md`: 구축 중 발생한 문제와 해결 과정
- `docs/runbooks/`: 운영 절차서 예정
- `docs/incident-reports/`: 장애 대응 시나리오 문서 예정

## Next Steps

- cert-manager 설치
- TLS 인증서 자동화
- URL Shortener 애플리케이션 개발
- PostgreSQL / Redis 배포
- GitHub Actions 기반 이미지 빌드
- ArgoCD 기반 GitOps 배포
- Prometheus / Grafana 모니터링 구성
- Loki / Promtail 로그 수집 구성
- 장애 시나리오 테스트 및 문서화

## Operations & Incident Reports

This project includes hands-on Kubernetes operation scenarios, failure reproduction tests, and recovery documentation.

### Runbooks

- [URL Shortener Operations Runbook](docs/runbooks/url-shortener-operations.md)
- [Local Registry Runbook](docs/runbooks/local-registry.md)

### Incident Reports

- [Backend Pod Recovery Test](docs/incident-reports/backend-pod-recovery.md)
- [ImagePullBackOff Recovery Test](docs/incident-reports/imagepullbackoff-recovery.md)
- [readinessProbe Failure Recovery Test](docs/incident-reports/readiness-probe-failure.md)
- [CrashLoopBackOff Recovery Test](docs/incident-reports/crashloopbackoff-recovery.md)

### Covered Scenarios

- Pod deletion and automatic recovery
- ImagePullBackOff due to invalid image tag
- readinessProbe failure and Service Endpoint exclusion
- CrashLoopBackOff caused by process exit
- Service health check through Ingress

