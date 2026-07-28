# Incident Report: readinessProbe Failure Recovery Test

## 1. Summary

URL Shortener Backend Deployment의 readinessProbe 경로를 의도적으로 잘못된 경로로 변경하여 Pod가 Running 상태이지만 READY 0/1 상태가 되는 장애를 재현하였다.

이후 `kubectl describe pod`, `kubectl get endpoints`, health check 명령어를 통해 원인을 확인하고, readinessProbe 경로를 정상 값인 `/healthz`로 복구하였다.

이번 테스트는 Kubernetes에서 readinessProbe가 Service 트래픽 전달 여부에 어떤 영향을 주는지 학습하기 위한 장애 재현 훈련이다.

## 2. Incident Information

| Item | Value |
|---|---|
| Environment | Homelab K3s |
| Namespace | url-shortener |
| Target | url-shortener-backend |
| Workload Type | Deployment |
| Normal Readiness Path | /healthz |
| Failed Readiness Path | /wrong-healthz |
| Incident Type | readinessProbe Failure |
| Observed Status | Running, READY 0/1 |
| Result | 정상 복구 완료 |

## 3. Test Objective

이번 테스트의 목적은 다음과 같다.

    컨테이너는 정상 실행 중이지만
    readinessProbe가 실패할 경우
    Kubernetes가 해당 Pod를 Service Endpoint에서 제외하는지 확인한다.

readinessProbe는 컨테이너가 살아 있는지 보는 기능이 아니라, 해당 Pod가 트래픽을 받을 준비가 되었는지 판단하는 기능이다.

## 4. Pre-check

장애 재현 전 URL Shortener 리소스 상태를 확인하였다.

    kubectl get deployment -n url-shortener
    kubectl get endpoints -n url-shortener
    kubectl get pods -n url-shortener

확인 결과 Backend와 Frontend는 모두 정상 상태였다.

    NAME                     READY   UP-TO-DATE   AVAILABLE
    url-shortener-backend    1/1     1            1
    url-shortener-frontend   1/1     1            1

Pod 상태도 정상이다.

    url-shortener-backend-78dd5f9ccb-lkpct    1/1   Running
    url-shortener-frontend-6ff78c789c-4vljv   1/1   Running

Backend Service Endpoint도 정상적으로 존재하였다.

    url-shortener-backend    10.42.0.55:3000

## 5. Normal readinessProbe Path

장애 재현 전 Backend Deployment의 readinessProbe 경로를 확인하였다.

    kubectl get deployment url-shortener-backend \
      -n url-shortener \
      -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.httpGet.path}'
    echo

확인 결과:

    /healthz

정상 상태에서는 Backend 컨테이너의 `/healthz` 경로를 readinessProbe가 확인한다.

## 6. Incident Reproduction

Backend Deployment의 readinessProbe 경로를 존재하지 않는 경로로 변경하였다.

    kubectl patch deployment url-shortener-backend \
      -n url-shortener \
      --type='json' \
      -p='[
        {
          "op": "replace",
          "path": "/spec/template/spec/containers/0/readinessProbe/httpGet/path",
          "value": "/wrong-healthz"
        }
      ]'

변경 결과:

    deployment.apps/url-shortener-backend patched

Rollout 상태를 확인하였다.

    kubectl rollout status deployment/url-shortener-backend \
      -n url-shortener \
      --timeout=30s || true

확인 결과:

    Waiting for deployment "url-shortener-backend" rollout to finish: 1 old replicas are pending termination...
    error: timed out waiting for the condition

이 결과는 장애 재현 단계에서는 정상적으로 볼 수 있는 결과이다.

새 Pod가 readinessProbe를 통과하지 못했기 때문에 새 ReplicaSet으로 완전히 전환되지 못하고 rollout이 완료되지 않았다.

## 7. Observed Pod Status

Pod 상태를 확인하였다.

    kubectl get pods -n url-shortener

확인 결과:

    NAME                                      READY   STATUS    RESTARTS      AGE
    url-shortener-backend-5bbc6ff656-ndf6f    0/1     Running   0             84s
    url-shortener-backend-78dd5f9ccb-lkpct    1/1     Running   2             5d23h
    url-shortener-frontend-6ff78c789c-4vljv   1/1     Running   3             6d23h

중요한 점은 장애 Pod의 STATUS가 `Running`이라는 것이다.

컨테이너는 정상 실행 중이지만 READY가 `0/1`이므로 Kubernetes는 이 Pod를 트래픽 받을 준비가 안 된 상태로 판단하였다.

## 8. Failed Pod Detail

READY 0/1 상태인 Backend Pod를 확인하였다.

    BAD_POD=$(kubectl get pods -n url-shortener -l app=url-shortener-backend --no-headers | awk '$2!="1/1"{print $1; exit}')
    echo "Readiness failed pod: $BAD_POD"

확인 결과:

    Readiness failed pod: url-shortener-backend-5bbc6ff656-ndf6f

장애 Pod 상세 정보를 확인하였다.

    kubectl describe pod -n url-shortener url-shortener-backend-5bbc6ff656-ndf6f

확인된 핵심 내용:

    Status: Running
    State: Running
    Ready: False
    Readiness: http-get http://:3000/wrong-healthz
    Conditions:
      Ready: False
      ContainersReady: False

Events에서 확인된 원인:

    Warning  Unhealthy  kubelet  Readiness probe failed: HTTP probe failed with statuscode: 404

## 9. Root Cause

readinessProbe가 확인하는 경로가 정상 `/healthz`가 아니라 존재하지 않는 `/wrong-healthz`로 설정되어 있었다.

Backend 애플리케이션에는 `/wrong-healthz` endpoint가 없기 때문에 HTTP 404가 반환되었고, kubelet은 readinessProbe 실패로 판단하였다.

    Root Cause:
    readinessProbe 경로가 /wrong-healthz로 잘못 설정되어 HTTP 404가 발생함.

## 10. Endpoint Analysis

Service Endpoint를 확인하였다.

    kubectl get endpoints -n url-shortener

확인 결과:

    url-shortener-backend    10.42.0.55:3000
    url-shortener-frontend   10.42.0.50:80

장애 Pod IP는 다음과 같았다.

    Failed Pod IP: 10.42.0.56

하지만 Backend Endpoint에는 기존 정상 Pod IP인 `10.42.0.55:3000`만 존재하였다.

즉, readinessProbe에 실패한 Pod는 Running 상태여도 Service Endpoint에 포함되지 않았다.

이것이 이번 실습의 핵심이다.

    Running이어도 Ready가 False이면 Service 트래픽을 받지 않는다.

## 11. Impact

이번 장애 상황에서 새 Backend Pod는 Running 상태였지만 READY 0/1 상태였다.

따라서 해당 Pod는 Service Endpoint에서 제외되었고, 트래픽을 받지 않았다.

다만 기존 정상 Backend Pod가 계속 Running 상태로 유지되고 있었기 때문에 서비스 전체 중단은 발생하지 않았다.

    기존 정상 Pod:
    url-shortener-backend-78dd5f9ccb-lkpct    1/1   Running

    신규 장애 Pod:
    url-shortener-backend-5bbc6ff656-ndf6f    0/1   Running

RollingUpdate 과정에서 새 Pod가 Ready 상태가 되지 못했기 때문에 기존 Pod가 유지되었다.

## 12. Recovery Action

readinessProbe 경로를 정상 값인 `/healthz`로 복구하였다.

    kubectl patch deployment url-shortener-backend \
      -n url-shortener \
      --type='json' \
      -p='[
        {
          "op": "replace",
          "path": "/spec/template/spec/containers/0/readinessProbe/httpGet/path",
          "value": "/healthz"
        }
      ]'

변경 결과:

    deployment.apps/url-shortener-backend patched

Rollout 상태를 확인하였다.

    kubectl rollout status deployment/url-shortener-backend \
      -n url-shortener \
      --timeout=120s

정상 결과:

    deployment "url-shortener-backend" successfully rolled out

## 13. Recovery Validation

복구 후 Pod 상태를 확인하였다.

    kubectl get pods -n url-shortener

확인 결과:

    url-shortener-backend-78dd5f9ccb-lkpct    1/1   Running
    url-shortener-frontend-6ff78c789c-4vljv   1/1   Running

Deployment 상태도 정상이다.

    kubectl get deployment -n url-shortener

확인 결과:

    NAME                     READY   UP-TO-DATE   AVAILABLE
    url-shortener-backend    1/1     1            1
    url-shortener-frontend   1/1     1            1

Endpoint 상태도 정상이다.

    kubectl get endpoints -n url-shortener

확인 결과:

    url-shortener-backend    10.42.0.55:3000
    url-shortener-frontend   10.42.0.50:80

## 14. Service Health Check

복구 후 Backend health endpoint를 확인하였다.

    curl -H "Host: url.k3s.local" http://192.168.200.129/healthz

정상 응답:

    {"status":"ok","service":"url-shortener-backend"}

API health endpoint도 확인하였다.

    curl -H "Host: url.k3s.local" http://192.168.200.129/api/health

정상 응답:

    {"status":"ok","message":"URL Shortener API is running"}

## 15. Command Mistake Note

중간에 다음 명령어를 실행하였다.

    kubectl get pods url-shortener

이 명령어는 namespace의 Pod 목록을 조회하는 명령어가 아니다.

Kubernetes는 이 명령어를 다음처럼 해석한다.

    pods 중에서 이름이 url-shortener인 Pod를 조회하라

그래서 다음 오류가 발생했다.

    Error from server (NotFound): pods "url-shortener" not found

특정 namespace의 Pod 목록을 보려면 아래 명령어를 사용해야 한다.

    kubectl get pods -n url-shortener

namespace 목록 확인은 아래 명령어를 사용한다.

    kubectl get namespace

또는 짧게:

    kubectl get ns

## 16. Endpoints Deprecation Note

`kubectl get endpoints` 실행 시 다음 경고가 표시되었다.

    Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice

현재 실습에서는 `kubectl get endpoints`로도 확인이 가능하지만, Kubernetes 최신 버전에서는 EndpointSlice 사용이 권장된다.

EndpointSlice 확인 명령어:

    kubectl get endpointslice -n url-shortener

## 17. Troubleshooting Flow

readinessProbe 실패가 의심될 때 확인 순서는 다음과 같다.

    1. kubectl get pods로 READY 상태 확인
    2. STATUS가 Running인데 READY가 0/1인지 확인
    3. kubectl describe pod로 Readiness 설정 확인
    4. Events에서 Readiness probe failed 메시지 확인
    5. HTTP status code 확인
    6. Service Endpoint에 해당 Pod IP가 포함되어 있는지 확인
    7. Deployment readinessProbe 경로 확인
    8. 올바른 readinessProbe 경로로 복구
    9. rollout status 확인
    10. health check 수행

## 18. Related Commands

Pod 상태 확인:

    kubectl get pods -n url-shortener

Deployment 상태 확인:

    kubectl get deployment -n url-shortener

readinessProbe 경로 확인:

    kubectl get deployment url-shortener-backend \
      -n url-shortener \
      -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.httpGet.path}'
    echo

Pod 상세 확인:

    kubectl describe pod -n url-shortener <pod-name>

Endpoint 확인:

    kubectl get endpoints -n url-shortener
    kubectl get endpointslice -n url-shortener

readinessProbe 정상 경로 복구:

    kubectl patch deployment url-shortener-backend \
      -n url-shortener \
      --type='json' \
      -p='[
        {
          "op": "replace",
          "path": "/spec/template/spec/containers/0/readinessProbe/httpGet/path",
          "value": "/healthz"
        }
      ]'

Rollout 확인:

    kubectl rollout status deployment/url-shortener-backend -n url-shortener

서비스 확인:

    curl -H "Host: url.k3s.local" http://192.168.200.129/healthz
    curl -H "Host: url.k3s.local" http://192.168.200.129/api/health

## 19. Lessons Learned

이번 테스트를 통해 readinessProbe의 역할을 명확히 이해할 수 있었다.

readinessProbe는 컨테이너가 살아 있는지를 보는 것이 아니라, 해당 Pod가 트래픽을 받을 준비가 되었는지 확인한다.

중요한 차이는 다음과 같다.

    livenessProbe:
    컨테이너가 살아 있는지 확인한다.
    실패하면 kubelet이 컨테이너를 재시작할 수 있다.

    readinessProbe:
    Pod가 트래픽을 받을 준비가 되었는지 확인한다.
    실패하면 Service Endpoint에서 제외된다.

이번 장애에서 Backend 컨테이너는 정상적으로 실행 중이었다.

하지만 readinessProbe가 404를 반환했기 때문에 READY 0/1 상태가 되었고, Service Endpoint에서 제외되었다.

## 20. Improvement Points

향후 운영 안정성을 높이기 위해 다음 개선을 검토할 수 있다.

    1. readinessProbe와 livenessProbe의 목적을 분리해서 설계
    2. health endpoint를 애플리케이션 배포 전에 테스트
    3. readinessProbe 변경 시 rollout 상태와 endpoints를 함께 확인
    4. 운영 환경에서는 replica를 2개 이상 구성
    5. EndpointSlice 기반 확인 명령어도 Runbook에 포함
    6. 장애 재현 결과를 incident report로 문서화

## 21. Conclusion

Backend Deployment의 readinessProbe 경로를 `/wrong-healthz`로 변경하여 readinessProbe 실패 상황을 재현하였다.

Pod는 Running 상태였지만 readinessProbe가 HTTP 404로 실패하면서 READY 0/1 상태가 되었고, 해당 Pod는 Service Endpoint에서 제외되었다.

이후 readinessProbe 경로를 `/healthz`로 복구하여 Deployment rollout이 정상 완료되었고, `/healthz`, `/api/health` 요청 모두 정상 응답하는 것을 확인하였다.

이번 테스트를 통해 Kubernetes에서 Running 상태와 Ready 상태가 다르며, Service 트래픽 전달 여부는 Ready 상태와 Endpoint 등록 여부에 의해 결정된다는 점을 학습하였다.
