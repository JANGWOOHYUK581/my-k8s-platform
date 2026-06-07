# Architecture

## Overview

이 프로젝트는 Homelab 환경에서 개인 서비스를 운영하기 위한 Kubernetes 기반 DevOps 플랫폼입니다.

집 PC의 VMware 위에 Ubuntu Server VM을 구성하고, 해당 VM에 K3s 단일 노드 Kubernetes 클러스터를 설치했습니다.

현재 단계에서는 NGINX Ingress Controller를 설치하고, 테스트용 nginx 애플리케이션을 배포하여 Host 기반 Ingress 라우팅을 검증했습니다.

## Current Architecture

```text
Windows Host PC
 ↓
VMware
 ↓
Ubuntu Server VM
 ↓
K3s Single-node Cluster
 ↓
NGINX Ingress Controller
 ↓
demo nginx Application
```

## Node Information

| Item | Value |
|---|---|
| Node Name | k3s-master-01 |
| Node IP | 192.168.200.129 |
| OS | Ubuntu 22.04.5 LTS |
| Kernel | 6.8.0-87-generic |
| Kubernetes | K3s |
| Runtime | containerd |

## Kubernetes Components

| Component | Status | Description |
|---|---|---|
| CoreDNS | Running | Kubernetes 내부 DNS |
| metrics-server | Running | CPU/Memory 리소스 메트릭 수집 |
| local-path-provisioner | Running | K3s 기본 로컬 스토리지 프로비저너 |
| ingress-nginx-controller | Running | 외부 HTTP/HTTPS 요청을 Service로 라우팅 |

## Ingress Flow

```text
Client Request
 ↓
192.168.200.129:80
 ↓
ingress-nginx-controller
 ↓
Ingress Rule
 ↓
Kubernetes Service
 ↓
Application Pod
```

## Demo Test

테스트용 nginx 애플리케이션을 `demo` namespace에 배포하고, Ingress Host 기반 라우팅을 구성했습니다.

```text
Host: demo.k3s.local
Target Service: demo-nginx
Result: Welcome to nginx!
```

## Planned Architecture

향후 URL Shortener 애플리케이션을 배포하고, Redis와 PostgreSQL을 연결할 예정입니다.

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
