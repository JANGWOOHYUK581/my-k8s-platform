# URL Shortener Operations Runbook

## Purpose

이 문서는 K3s 환경에 배포된 URL Shortener 서비스의 운영 점검 절차를 정리한 Runbook이다.

서비스 장애 또는 접속 불가 상황이 발생했을 때 아래 순서대로 확인한다.

## Service Information

| Item | Value |
|---|---|
| Namespace | url-shortener |
| Frontend Deployment | url-shortener-frontend |
| Backend Deployment | url-shortener-backend |
| Frontend Service | url-shortener-frontend |
| Backend Service | url-shortener-backend |
| Ingress | url-shortener-ingress |
| Host | url.k3s.local |
| Node IP | 192.168.200.129 |

## Request Flow

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
 ├─ /        → Frontend Service → Frontend Pod
 ├─ /api     → Backend Service  → Backend Pod
 ├─ /healthz → Backend Service  → Backend Pod
 └─ /r       → Backend Service  → Backend Pod
```

---

## 1. 전체 리소스 상태 확인

```bash
kubectl get all -n url-shortener
```

정상 기준:

```text
pod/url-shortener-backend-xxxxx    1/1   Running
pod/url-shortener-frontend-xxxxx   1/1   Running

deployment.apps/url-shortener-backend    1/1
deployment.apps/url-shortener-frontend   1/1
```

---

## 2. Pod 상태 확인

```bash
kubectl get pods -n url-shortener -o wide
```

확인할 항목:

| 항목 | 정상 기준 |
|---|---|
| READY | 1/1 |
| STATUS | Running |
| RESTARTS | 반복 증가하지 않아야 함 |
| NODE | k3s-master-01 |

Pod 상태가 비정상일 경우 상세 확인:

```bash
kubectl describe pod -n url-shortener -l app=url-shortener-backend
kubectl describe pod -n url-shortener -l app=url-shortener-frontend
```

---

## 3. Service 상태 확인

```bash
kubectl get svc -n url-shortener
```

정상 기준:

```text
url-shortener-backend    ClusterIP   <IP>   3000/TCP
url-shortener-frontend   ClusterIP   <IP>   80/TCP
```

Service 상세 확인:

```bash
kubectl describe svc url-shortener-backend -n url-shortener
kubectl describe svc url-shortener-frontend -n url-shortener
```

확인 포인트:

```text
Selector가 Pod label과 일치하는지 확인한다.
Service port와 targetPort가 올바른지 확인한다.
```

---

## 4. Ingress 상태 확인

```bash
kubectl get ingress -n url-shortener
```

정상 기준:

```text
NAME                    CLASS   HOSTS           ADDRESS           PORTS
url-shortener-ingress   nginx   url.k3s.local   192.168.200.129   80
```

Ingress 상세 확인:

```bash
kubectl describe ingress url-shortener-ingress -n url-shortener
```

확인 포인트:

```text
Host가 url.k3s.local인지 확인한다.
ADDRESS가 192.168.200.129인지 확인한다.
/, /api, /healthz, /r 경로가 올바른 Service로 연결되어 있는지 확인한다.
```

---

## 5. Backend Health Check

Ingress를 통해 Backend health endpoint를 확인한다.

```bash
curl -H "Host: url.k3s.local" http://192.168.200.129/healthz
```

정상 응답:

```json
{"status":"ok","service":"url-shortener-backend"}
```

API health 확인:

```bash
curl -H "Host: url.k3s.local" http://192.168.200.129/api/health
```

정상 응답:

```json
{"status":"ok","message":"URL Shortener API is running"}
```

---

## 6. Frontend 접속 확인

서버 내부에서 HTML 응답 확인:

```bash
curl -H "Host: url.k3s.local" http://192.168.200.129
```

Windows 브라우저에서 접속:

```text
http://url.k3s.local
```

Windows hosts 파일에 아래 값이 있어야 한다.

```text
192.168.200.129 url.k3s.local
```

hosts 파일 위치:

```text
C:\Windows\System32\drivers\etc\hosts
```

---

## 7. URL Shortener API 테스트

Short URL 생성 테스트:

```bash
curl -s -X POST http://192.168.200.129/api/shorten \
  -H "Host: url.k3s.local" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/JANGWOOHYUK581/my-k8s-platform"}'
```

정상 응답 예시:

```json
{
  "code": "abc123",
  "originalUrl": "https://github.com/JANGWOOHYUK581/my-k8s-platform",
  "shortUrl": "http://url.k3s.local/r/abc123"
}
```

Redirect 확인:

```bash
curl -I -H "Host: url.k3s.local" http://192.168.200.129/r/<code>
```

정상 기준:

```text
HTTP/1.1 302 Found
Location: https://github.com/JANGWOOHYUK581/my-k8s-platform
```

---

## 8. 로그 확인

Backend 로그:

```bash
kubectl logs -n url-shortener -l app=url-shortener-backend --tail=100
```

Frontend 로그:

```bash
kubectl logs -n url-shortener -l app=url-shortener-frontend --tail=100
```

실시간 로그 확인:

```bash
kubectl logs -n url-shortener -l app=url-shortener-backend -f
```

---

## 9. ImagePullBackOff 발생 시 확인

증상:

```text
Pod STATUS가 ImagePullBackOff 또는 ErrImagePull
```

확인 명령어:

```bash
kubectl describe pod -n url-shortener -l app=url-shortener-backend
```

이미지 태그 확인:

```bash
kubectl get deployment url-shortener-backend -n url-shortener -o jsonpath='{.spec.template.spec.containers[0].image}'
echo
```

Local Registry 확인:

```bash
curl http://localhost:5000/v2/_catalog
curl http://localhost:5000/v2/url-shortener-backend/tags/list
curl http://localhost:5000/v2/url-shortener-frontend/tags/list
```

조치 방법:

```text
1. Deployment에 설정된 image tag가 Registry에 존재하는지 확인한다.
2. Registry에 이미지가 없으면 docker push를 다시 수행한다.
3. K3s registries.yaml 설정을 확인한다.
4. Pod를 재생성하거나 Deployment를 재시작한다.
```

Deployment 재시작:

```bash
kubectl rollout restart deployment/url-shortener-backend -n url-shortener
kubectl rollout restart deployment/url-shortener-frontend -n url-shortener
```

---

## 10. CrashLoopBackOff 발생 시 확인

증상:

```text
Pod STATUS가 CrashLoopBackOff
RESTARTS 값이 계속 증가
```

확인 명령어:

```bash
kubectl get pods -n url-shortener
kubectl logs -n url-shortener -l app=url-shortener-backend --tail=100
kubectl describe pod -n url-shortener -l app=url-shortener-backend
```

이전 컨테이너 로그 확인:

```bash
kubectl logs -n url-shortener -l app=url-shortener-backend --previous
```

주요 원인:

```text
애플리케이션 코드 오류
환경 변수 누락
포트 설정 오류
health check 실패
이미지 빌드 오류
```

---

## 11. 502 Bad Gateway 발생 시 확인

증상:

```text
브라우저 또는 curl 요청 시 502 Bad Gateway
```

확인 순서:

```bash
kubectl get pods -n url-shortener
kubectl get svc -n url-shortener
kubectl get ingress -n url-shortener
kubectl describe ingress url-shortener-ingress -n url-shortener
```

Ingress Controller 로그 확인:

```bash
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=100
```

확인 포인트:

```text
Backend Pod가 Running인지 확인한다.
Service selector가 Pod label과 일치하는지 확인한다.
Ingress backend service name과 port가 올바른지 확인한다.
readinessProbe 실패로 endpoint에서 제외된 것은 아닌지 확인한다.
```

Endpoint 확인:

```bash
kubectl get endpoints -n url-shortener
```

정상 기준:

```text
url-shortener-backend    <Pod IP>:3000
url-shortener-frontend   <Pod IP>:80
```

---

## 12. Deployment 재시작

Backend 재시작:

```bash
kubectl rollout restart deployment/url-shortener-backend -n url-shortener
```

Frontend 재시작:

```bash
kubectl rollout restart deployment/url-shortener-frontend -n url-shortener
```

재시작 상태 확인:

```bash
kubectl rollout status deployment/url-shortener-backend -n url-shortener
kubectl rollout status deployment/url-shortener-frontend -n url-shortener
```

---

## 13. Pod 강제 삭제 후 자동 복구 확인

Deployment가 관리하는 Pod는 삭제해도 자동으로 다시 생성된다.

Backend Pod 삭제:

```bash
kubectl delete pod -n url-shortener -l app=url-shortener-backend
```

복구 확인:

```bash
kubectl get pods -n url-shortener -w
```

확인 포인트:

```text
기존 Pod 삭제
새 Pod 자동 생성
READY 1/1 Running 복구
```

---

## 14. Rollout History 확인

```bash
kubectl rollout history deployment/url-shortener-backend -n url-shortener
kubectl rollout history deployment/url-shortener-frontend -n url-shortener
```

배포 상세 확인:

```bash
kubectl describe deployment url-shortener-backend -n url-shortener
kubectl describe deployment url-shortener-frontend -n url-shortener
```

---

## 15. Rollback

최근 배포로 인해 문제가 발생한 경우 이전 ReplicaSet으로 rollback할 수 있다.

Backend rollback:

```bash
kubectl rollout undo deployment/url-shortener-backend -n url-shortener
```

Frontend rollback:

```bash
kubectl rollout undo deployment/url-shortener-frontend -n url-shortener
```

Rollback 상태 확인:

```bash
kubectl rollout status deployment/url-shortener-backend -n url-shortener
kubectl rollout status deployment/url-shortener-frontend -n url-shortener
```

---

## 16. 장애 확인 순서 요약

서비스 접속 불가 시 아래 순서로 확인한다.

```text
1. 브라우저 또는 curl로 접속 확인
2. Ingress 상태 확인
3. Service 상태 확인
4. Endpoint 상태 확인
5. Pod 상태 확인
6. Pod 로그 확인
7. describe로 이벤트 확인
8. 이미지 태그 및 Registry 확인
9. Deployment 재시작 또는 Rollback
```

명령어 요약:

```bash
kubectl get ingress -n url-shortener
kubectl get svc -n url-shortener
kubectl get endpoints -n url-shortener
kubectl get pods -n url-shortener
kubectl logs -n url-shortener -l app=url-shortener-backend --tail=100
kubectl describe pod -n url-shortener -l app=url-shortener-backend
```

---

## Result

URL Shortener 서비스의 운영 점검 Runbook을 작성했다.

이 Runbook을 통해 서비스 장애 발생 시 Ingress, Service, Endpoint, Pod, Log, Registry 순서로 원인을 추적할 수 있다.

이번 문서는 단순 구축 기록이 아니라 실제 운영 상황에서 사용할 수 있는 장애 대응 문서이다.
