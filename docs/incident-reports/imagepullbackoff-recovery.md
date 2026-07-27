# Incident Report: ImagePullBackOff Recovery Test

## 1. Summary

URL Shortener Backend Deployment의 이미지 태그를 존재하지 않는 버전으로 변경하여 `ImagePullBackOff` 장애를 재현하였다.

이후 `kubectl describe pod` 명령어를 통해 원인을 확인하고, 정상 이미지 태그로 복구하여 서비스가 다시 정상 동작하는 것을 확인하였다.

이번 테스트는 실제 장애가 아니라 Kubernetes 이미지 Pull 장애 대응 절차를 학습하기 위한 장애 재현 훈련이다.

## 2. Incident Information

| Item | Value |
|---|---|
| Environment | Homelab K3s |
| Namespace | url-shortener |
| Target | url-shortener-backend |
| Workload Type | Deployment |
| Normal Image | localhost:5000/url-shortener-backend:0.1.1 |
| Failed Image | localhost:5000/url-shortener-backend:9.9.9 |
| Incident Type | ImagePullBackOff |
| Result | 정상 복구 완료 |

## 3. Test Objective

이번 테스트의 목적은 다음과 같다.

    존재하지 않는 이미지 태그를 Deployment에 적용했을 때
    Kubernetes Pod가 어떤 상태가 되는지 확인하고,
    describe 명령어로 원인을 분석한 뒤
    정상 이미지 태그로 복구하는 절차를 익힌다.

## 4. Incident Reproduction

Backend Deployment의 이미지를 존재하지 않는 태그로 변경하였다.

    kubectl set image deployment/url-shortener-backend \
      backend=localhost:5000/url-shortener-backend:9.9.9 \
      -n url-shortener

## 5. Observed Pod Status

장애 발생 후 Pod 상태를 확인하였다.

    kubectl get pods -n url-shortener

확인된 결과:

    NAME                                      READY   STATUS             RESTARTS      AGE
    url-shortener-backend-78dd5f9ccb-lkpct    1/1     Running            1 (12m ago)   4d23h
    url-shortener-backend-7cff8855f5-tp7wd    0/1     ImagePullBackOff   0             3m46s
    url-shortener-frontend-6ff78c789c-4vljv   1/1     Running            2 (12m ago)   5d23h

## 6. Detailed Analysis

장애 Pod를 상세 조회하였다.

    kubectl describe pod -n url-shortener url-shortener-backend-7cff8855f5-tp7wd

확인된 핵심 내용:

    Image: localhost:5000/url-shortener-backend:9.9.9
    State: Waiting
    Reason: ImagePullBackOff
    Ready: False

Events에서 확인된 원인:

    Failed to pull image "localhost:5000/url-shortener-backend:9.9.9"
    localhost:5000/url-shortener-backend:9.9.9: not found
    Error: ErrImagePull
    Error: ImagePullBackOff
    Back-off pulling image "localhost:5000/url-shortener-backend:9.9.9"

## 7. Root Cause

Deployment에 설정된 이미지 태그 `9.9.9`가 Local Registry에 존재하지 않았다.

    Root Cause:
    localhost:5000/url-shortener-backend:9.9.9 이미지 태그가 Registry에 존재하지 않아 kubelet이 이미지를 Pull하지 못함.

## 8. Impact

새로운 Backend Pod는 이미지를 Pull하지 못해 `ImagePullBackOff` 상태가 되었다.

다만 기존 정상 Backend Pod가 계속 Running 상태로 유지되고 있었다.

    url-shortener-backend-78dd5f9ccb-lkpct    1/1   Running
    url-shortener-backend-7cff8855f5-tp7wd    0/1   ImagePullBackOff

이것은 RollingUpdate 과정에서 새 Pod가 정상 준비되지 않았기 때문에 기존 정상 Pod가 유지된 것으로 볼 수 있다.

따라서 서비스 전체 중단은 발생하지 않았다.

## 9. Recovery Action

정상 이미지 태그 `0.1.1`로 Deployment 이미지를 복구하였다.

    kubectl set image deployment/url-shortener-backend \
      backend=localhost:5000/url-shortener-backend:0.1.1 \
      -n url-shortener

Rollout 상태를 확인하였다.

    kubectl rollout status deployment/url-shortener-backend -n url-shortener

정상 결과:

    deployment "url-shortener-backend" successfully rolled out

## 10. Recovery Validation

복구 후 Pod 상태를 확인하였다.

    kubectl get pods -n url-shortener

확인 결과:

    NAME                                      READY   STATUS    RESTARTS      AGE
    url-shortener-backend-78dd5f9ccb-lkpct    1/1     Running   1 (26m ago)   4d23h
    url-shortener-frontend-6ff78c789c-4vljv   1/1     Running   2 (26m ago)   5d23h

ReplicaSet 상태도 확인하였다.

    kubectl get rs -n url-shortener

확인 결과:

    NAME                                DESIRED   CURRENT   READY   AGE
    url-shortener-backend-576d58bc9     0         0         0       5d23h
    url-shortener-backend-78dd5f9ccb    1         1         1       5d23h
    url-shortener-backend-7cff8855f5    0         0         0       17m
    url-shortener-frontend-6ff78c789c   1         1         1       5d23h
    url-shortener-frontend-7fc5d489c4   0         0         0       5d23h

잘못된 이미지 태그로 생성된 ReplicaSet은 더 이상 Pod를 유지하지 않는 상태가 되었다.

## 11. Service Health Check

복구 후 Backend health check를 수행하였다.

    curl -H "Host: url.k3s.local" http://192.168.200.129/healthz

정상 응답:

    {"status":"ok","service":"url-shortener-backend"}

API health check도 정상 응답을 확인하였다.

    curl -H "Host: url.k3s.local" http://192.168.200.129/api/health

정상 응답:

    {"status":"ok","message":"URL Shortener API is running"}

## 12. Troubleshooting Flow

ImagePullBackOff 발생 시 확인 순서는 다음과 같다.

    1. kubectl get pods로 STATUS 확인
    2. kubectl describe pod로 Events 확인
    3. Failed to pull image 메시지 확인
    4. Deployment에 설정된 image tag 확인
    5. Registry에 해당 image tag 존재 여부 확인
    6. 정상 image tag로 복구
    7. rollout status 확인
    8. health check 수행

## 13. Related Commands

Pod 상태 확인:

    kubectl get pods -n url-shortener

Pod 상세 확인:

    kubectl describe pod -n url-shortener <pod-name>

Deployment 이미지 확인:

    kubectl get deployment url-shortener-backend \
      -n url-shortener \
      -o jsonpath='{.spec.template.spec.containers[0].image}'
    echo

Local Registry 태그 확인:

    curl http://localhost:5000/v2/url-shortener-backend/tags/list

정상 이미지로 복구:

    kubectl set image deployment/url-shortener-backend \
      backend=localhost:5000/url-shortener-backend:0.1.1 \
      -n url-shortener

Rollout 확인:

    kubectl rollout status deployment/url-shortener-backend -n url-shortener

서비스 확인:

    curl -H "Host: url.k3s.local" http://192.168.200.129/healthz
    curl -H "Host: url.k3s.local" http://192.168.200.129/api/health

## 14. Lessons Learned

`ImagePullBackOff`는 애플리케이션 코드가 실행되기 전 단계의 문제이다.

즉, 컨테이너가 실행 중에 죽은 것이 아니라 kubelet이 이미지를 가져오지 못해 컨테이너 생성 자체가 실패한 상태이다.

중요한 구분은 다음과 같다.

    CrashLoopBackOff:
    컨테이너는 실행됐지만 애플리케이션이 반복 종료되는 상태

    ImagePullBackOff:
    컨테이너 실행 전 이미지 Pull 단계에서 실패한 상태

따라서 `ImagePullBackOff` 상황에서는 애플리케이션 로그보다 먼저 Pod Events와 이미지 태그, Registry 상태를 확인해야 한다.

## 15. Improvement Points

향후 운영 안정성을 높이기 위해 다음 개선을 검토할 수 있다.

    1. 이미지 태그를 latest 대신 명확한 버전으로 관리
    2. GitHub Actions에서 이미지 빌드 후 Registry Push 자동화
    3. ArgoCD 배포 전 이미지 태그 검증
    4. Registry health check 추가
    5. 운영 환경에서는 단일 replica보다 2개 이상 replica 구성

## 16. Conclusion

존재하지 않는 Backend 이미지 태그를 적용하여 `ImagePullBackOff` 장애를 재현하였다.

`kubectl describe pod`의 Events를 통해 이미지 태그가 Registry에 존재하지 않는 것이 원인임을 확인하였고, 정상 이미지 태그 `0.1.1`로 복구하여 서비스가 정상 응답하는 것을 검증하였다.

이번 테스트를 통해 Kubernetes 이미지 Pull 장애 발생 시 확인해야 할 순서와 복구 절차를 학습하였다.
