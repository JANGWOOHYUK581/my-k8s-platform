# Incident Report: Backend Pod Auto Recovery Test

## 1. Summary

URL Shortener 서비스의 Backend Pod를 강제로 삭제하고, Kubernetes Deployment가 새로운 Pod를 자동으로 생성하여 서비스를 복구하는지 확인하였다.

이번 테스트는 실제 장애가 아니라 Kubernetes Self-Healing 동작을 검증하기 위한 장애 재현 훈련이다.

## 2. Incident Information

| Item | Value |
|---|---|
| Date | 2026-06-07 |
| Environment | Homelab K3s |
| Namespace | url-shortener |
| Target Service | url-shortener-backend |
| Workload Type | Deployment |
| Incident Type | Backend Pod 강제 삭제 |
| Recovery Mechanism | Kubernetes Deployment Controller |
| Result | 자동 복구 성공 |

## 3. Test Objective

이번 테스트의 목적은 다음과 같다.

```text
Backend Pod가 갑자기 사라졌을 때
Kubernetes Deployment가 원하는 replica 수를 유지하기 위해
새로운 Pod를 자동으로 생성하는지 확인한다.
```

Deployment는 선언된 상태를 유지하려고 동작한다.

이번 환경에서 Backend Deployment는 `replicas: 1`로 설정되어 있었기 때문에, Backend Pod가 삭제되면 Kubernetes는 다시 1개의 Pod를 유지하기 위해 새 Pod를 생성해야 한다.

## 4. Current Architecture

```text
User Browser
 ↓
url.k3s.local
 ↓
192.168.200.129:80
 ↓
NGINX Ingress Controller
 ↓
url-shortener-ingress
 ↓
url-shortener-backend Service
 ↓
url-shortener-backend Pod
```

## 5. Pre-check

장애 재현 전 URL Shortener 리소스 상태를 확인한다.

```bash
kubectl get pods -n url-shortener
kubectl get deployment -n url-shortener
```

정상 기준:

```text
url-shortener-backend    1/1   Running
url-shortener-frontend   1/1   Running
```

Deployment 정상 기준:

```text
url-shortener-backend    READY 1/1
url-shortener-frontend   READY 1/1
```

## 6. Incident Reproduction

Backend Pod를 강제로 삭제한다.

```bash
kubectl delete pod -n url-shortener -l app=url-shortener-backend
```

Pod 상태 변화를 실시간으로 확인한다.

```bash
kubectl get pods -n url-shortener -w
```

`-w` 옵션은 watch의 의미이며, Pod 상태 변화를 실시간으로 계속 보여준다.

## 7. Observed Result

실제 확인된 결과는 다음과 같다.

```text
NAME                                      READY   STATUS    RESTARTS        AGE
url-shortener-backend-78dd5f9ccb-lkpct    0/1     Running   0               8s
url-shortener-frontend-6ff78c789c-4vljv   1/1     Running   1 (9m53s ago)   23h
url-shortener-backend-78dd5f9ccb-lkpct    1/1     Running   0               12s
```

## 8. Timeline

| Time | Event |
|---|---|
| T+0s | Backend Pod 강제 삭제 |
| T+8s | 새 Backend Pod 생성 후 Running 상태 진입, READY 0/1 |
| T+12s | readinessProbe 통과 후 READY 1/1 |
| Result | Backend Pod 자동 복구 완료 |

## 9. Analysis

Backend Pod 삭제 후 Kubernetes Deployment Controller가 즉시 새로운 Pod를 생성하였다.

새로운 Backend Pod는 생성 직후 `0/1 Running` 상태로 표시되었다.

이는 컨테이너는 실행되었지만 아직 readinessProbe를 통과하지 못해 트래픽을 받을 준비가 완료되지 않았다는 의미이다.

이후 약 12초 시점에 `1/1 Running` 상태가 되었고, 이는 Backend 애플리케이션이 정상적으로 준비되어 Service 트래픽을 받을 수 있는 상태가 되었음을 의미한다.

## 10. Root Cause

이번 장애는 실제 장애가 아니라 테스트를 위해 Backend Pod를 수동으로 삭제한 것이다.

```text
Root Cause:
운영자가 Backend Pod를 의도적으로 삭제하여 Pod 장애 상황을 재현함.
```

## 11. Recovery Action

별도의 수동 복구 작업은 수행하지 않았다.

Kubernetes Deployment가 선언된 replica 수를 유지하기 위해 자동으로 새로운 Backend Pod를 생성하였다.

```text
Expected replicas: 1
Actual running replicas after recovery: 1
Recovery method: Automatic self-healing by Deployment
```

## 12. Validation

복구 후 서비스 정상 여부는 아래 명령어로 확인한다.

```bash
curl -H "Host: url.k3s.local" http://192.168.200.129/healthz
```

정상 응답:

```json
{"status":"ok","service":"url-shortener-backend"}
```

API 상태 확인:

```bash
curl -H "Host: url.k3s.local" http://192.168.200.129/api/health
```

정상 응답:

```json
{"status":"ok","message":"URL Shortener API is running"}
```

Pod 상태 확인:

```bash
kubectl get pods -n url-shortener
```

정상 기준:

```text
url-shortener-backend    1/1   Running
```

## 13. Impact

이번 테스트는 Backend Pod 1개를 강제로 삭제하는 방식으로 진행되었다.

현재 Backend Deployment의 replica 수가 1개이기 때문에, Pod 재생성 중 짧은 시간 동안 Backend API 요청이 실패할 가능성이 있다.

다만 Kubernetes가 새 Pod를 자동으로 생성하여 약 12초 내외로 복구되는 것을 확인하였다.

## 14. What Went Well

- Backend Pod 삭제 후 Deployment가 자동으로 새 Pod를 생성하였다.
- 새 Pod가 정상적으로 Running 상태에 진입하였다.
- readinessProbe 통과 후 READY 1/1 상태가 되었다.
- Kubernetes Self-Healing 동작을 실제로 확인하였다.
- 운영 장애 대응 문서로 남길 수 있는 결과를 확보하였다.

## 15. What Could Be Improved

현재 Backend replica 수가 1개이기 때문에 Pod가 삭제되는 동안 일시적인 API 단절 가능성이 있다.

운영 환경에서는 최소 2개 이상의 replica를 구성하여 하나의 Pod가 장애 나도 다른 Pod가 트래픽을 처리할 수 있도록 구성하는 것이 좋다.

향후 개선 방향:

```text
1. Backend replicas를 2 이상으로 증가
2. RollingUpdate 전략 확인
3. readinessProbe 기준 강화
4. PodDisruptionBudget 적용 검토
5. HPA 적용 검토
```

## 16. Lessons Learned

이번 테스트를 통해 Kubernetes의 핵심 장점 중 하나인 Self-Healing을 확인하였다.

중요한 점은 Pod 자체가 안정적인 단위가 아니라는 것이다.

Pod는 언제든 삭제되거나 재생성될 수 있으며, Kubernetes 운영에서는 개별 Pod가 아니라 Deployment, Service, Ingress 단위로 상태를 관리해야 한다.

```text
Pod는 사라질 수 있다.
Deployment는 원하는 상태를 유지한다.
Service는 변하지 않는 접근 지점을 제공한다.
Ingress는 외부 요청을 Service로 연결한다.
```

## 17. Related Commands

장애 재현:

```bash
kubectl delete pod -n url-shortener -l app=url-shortener-backend
```

복구 상태 확인:

```bash
kubectl get pods -n url-shortener -w
```

Deployment 상태 확인:

```bash
kubectl get deployment -n url-shortener
```

로그 확인:

```bash
kubectl logs -n url-shortener -l app=url-shortener-backend --tail=100
```

서비스 확인:

```bash
curl -H "Host: url.k3s.local" http://192.168.200.129/healthz
curl -H "Host: url.k3s.local" http://192.168.200.129/api/health
```

## 18. Conclusion

Backend Pod 강제 삭제 테스트 결과, Kubernetes Deployment가 새로운 Pod를 자동으로 생성하여 정상 상태로 복구하는 것을 확인하였다.

이번 테스트를 통해 URL Shortener 서비스가 기본적인 Kubernetes Self-Healing 구조 위에서 동작하고 있음을 검증하였다.

다음 단계에서는 잘못된 이미지 태그를 적용하여 `ImagePullBackOff` 상황을 재현하고, 이미지 Pull 장애 대응 절차를 문서화한다.
