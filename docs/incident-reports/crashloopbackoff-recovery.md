# Incident Report: CrashLoopBackOff Recovery Test

## 1. Summary

URL Shortener 서비스에 영향을 주지 않도록 별도 테스트 Deployment인 `crashloop-test`를 생성하여 `CrashLoopBackOff` 상황을 재현하였다.

테스트 컨테이너는 정상 이미지를 Pull한 뒤 실행되었지만, command에서 의도적으로 `exit 1`을 수행하도록 구성하였다.

그 결과 컨테이너가 실행 직후 종료되었고, kubelet이 컨테이너를 반복 재시작하면서 `Error`와 `CrashLoopBackOff` 상태가 발생하였다.

이번 테스트는 Kubernetes에서 컨테이너가 실행 후 반복 종료되는 장애 상황을 학습하기 위한 장애 재현 훈련이다.

## 2. Incident Information

| Item | Value |
|---|---|
| Environment | Homelab K3s |
| Namespace | url-shortener |
| Test Deployment | crashloop-test |
| Test Pod | crashloop-test-66969f4c6c-45wck |
| Image | localhost:5000/url-shortener-backend:0.1.1 |
| Incident Type | CrashLoopBackOff |
| Exit Code | 1 |
| Result | 재현 성공 및 테스트 리소스 삭제 완료 |

## 3. Test Objective

이번 테스트의 목적은 다음과 같다.

    컨테이너 이미지는 정상적으로 Pull되지만
    컨테이너 내부 프로세스가 비정상 종료될 경우
    Kubernetes가 어떤 상태를 표시하는지 확인한다.

이번 장애는 이미지 Pull 문제가 아니다.

이미지는 정상적으로 Pull되었고, 컨테이너도 생성 및 시작되었다.

하지만 컨테이너의 메인 프로세스가 `exit 1`로 종료되면서 kubelet이 반복 재시작을 수행하였다.

## 4. Pre-check

장애 재현 전 기존 URL Shortener 서비스 Pod 상태를 확인하였다.

    kubectl get pods -n url-shortener

확인 결과:

    NAME                                      READY   STATUS    RESTARTS      AGE
    url-shortener-backend-78dd5f9ccb-lkpct    1/1     Running   2 (26m ago)   6d
    url-shortener-frontend-6ff78c789c-4vljv   1/1     Running   3 (26m ago)   6d23h

기존 Backend와 Frontend는 모두 정상 Running 상태였다.

## 5. Incident Reproduction

운영 중인 Backend Deployment를 직접 수정하지 않고, 별도 테스트 Deployment를 생성하였다.

    cat <<'EOF' | kubectl apply -f -
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: crashloop-test
      namespace: url-shortener
      labels:
        app: crashloop-test
        app.kubernetes.io/name: crashloop-test
        app.kubernetes.io/part-of: home-k8s-platform
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: crashloop-test
      template:
        metadata:
          labels:
            app: crashloop-test
            app.kubernetes.io/name: crashloop-test
            app.kubernetes.io/part-of: home-k8s-platform
        spec:
          containers:
            - name: crashloop
              image: localhost:5000/url-shortener-backend:0.1.1
              imagePullPolicy: Always
              command:
                - sh
                - -c
              args:
                - |
                  echo "CrashLoopBackOff test started"
                  echo "This container will exit with code 1"
                  exit 1
              resources:
                requests:
                  cpu: 10m
                  memory: 32Mi
                limits:
                  cpu: 100m
                  memory: 128Mi
    EOF

생성 결과:

    deployment.apps/crashloop-test created

## 6. Observed Pod Status

테스트 Pod 상태를 확인하였다.

    kubectl get pods -n url-shortener -l app=crashloop-test

확인 결과:

    NAME                              READY   STATUS   RESTARTS      AGE
    crashloop-test-66969f4c6c-45wck   0/1     Error    3 (39s ago)   55s

실시간 상태 확인 중 `CrashLoopBackOff` 상태도 확인되었다.

    kubectl get pods -n url-shortener -l app=crashloop-test -w

확인 결과:

    NAME                              READY   STATUS             RESTARTS      AGE
    crashloop-test-66969f4c6c-45wck   0/1     Error              3             88s
    crashloop-test-66969f4c6c-45wck   0/1     CrashLoopBackOff   3             91s
    crashloop-test-66969f4c6c-45wck   0/1     Error              4             92s

## 7. Detailed Analysis

테스트 Pod 상세 정보를 확인하였다.

    kubectl describe pod crashloop-test-66969f4c6c-45wck -n url-shortener

확인된 핵심 내용:

    State:          Terminated
      Reason:       Error
      Exit Code:    1

    Last State:     Terminated
      Reason:       Error
      Exit Code:    1

    Ready:          False
    Restart Count:  5

Events에서 확인된 내용:

    Successfully pulled image "localhost:5000/url-shortener-backend:0.1.1"
    Container created
    Container started
    Back-off restarting failed container crashloop

## 8. Root Cause

테스트 Deployment의 컨테이너 command에서 의도적으로 `exit 1`을 실행하도록 구성하였다.

    echo "CrashLoopBackOff test started"
    echo "This container will exit with code 1"
    exit 1

이로 인해 컨테이너의 메인 프로세스가 비정상 종료되었고, kubelet이 컨테이너를 반복 재시작하였다.

    Root Cause:
    컨테이너 메인 프로세스가 exit code 1로 종료되어 kubelet이 반복 재시작을 수행함.

## 9. Difference from ImagePullBackOff

이번 장애는 `ImagePullBackOff`와 다르다.

    ImagePullBackOff:
    이미지 Pull 단계에서 실패하여 컨테이너가 시작되지 못한 상태

    CrashLoopBackOff:
    이미지는 정상 Pull되고 컨테이너도 시작되지만, 내부 프로세스가 반복 종료되는 상태

이번 테스트에서는 이미지 Pull이 정상적으로 수행되었다.

    Successfully pulled image "localhost:5000/url-shortener-backend:0.1.1"

따라서 원인은 Registry나 이미지 태그 문제가 아니라 컨테이너 내부 실행 프로세스 문제이다.

## 10. Log Analysis

컨테이너 로그를 확인하였다.

    kubectl logs -n url-shortener "$CRASH_POD" || true

확인 결과:

    CrashLoopBackOff test started
    This container will exit with code 1

이 로그를 통해 컨테이너가 의도한 메시지를 출력한 뒤 종료되었음을 확인하였다.

`--previous` 옵션으로 이전 컨테이너 로그 조회도 시도하였다.

    kubectl logs -n url-shortener "$CRASH_POD" --previous || true

하지만 다음 메시지가 출력되며 이전 로그를 가져오지 못하였다.

    unable to retrieve container logs

이 경우 현재 로그와 `kubectl describe pod`의 Last State, Exit Code, Events를 함께 확인해야 한다.

## 11. Service Impact

이번 테스트는 기존 URL Shortener Backend Deployment를 직접 변경하지 않고, 별도 `crashloop-test` Deployment로 수행하였다.

따라서 실제 서비스에는 영향이 없어야 한다.

서비스 정상 여부를 확인하였다.

    curl -H "Host: url.k3s.local" http://192.168.200.129/healthz

정상 응답:

    {"status":"ok","service":"url-shortener-backend"}

API health endpoint도 확인하였다.

    curl -H "Host: url.k3s.local" http://192.168.200.129/api/health

정상 응답:

    {"status":"ok","message":"URL Shortener API is running"}

## 12. Recovery Action

테스트 목적이 완료되었으므로 `crashloop-test` Deployment를 삭제하였다.

    kubectl delete deployment crashloop-test -n url-shortener

삭제 결과:

    deployment.apps "crashloop-test" deleted from url-shortener namespace

## 13. Recovery Validation

테스트 리소스 삭제 후 Pod 상태를 다시 확인하였다.

    kubectl get pods -n url-shortener

확인 결과:

    NAME                                      READY   STATUS    RESTARTS      AGE
    url-shortener-backend-78dd5f9ccb-lkpct    1/1     Running   2 (32m ago)   6d
    url-shortener-frontend-6ff78c789c-4vljv   1/1     Running   3 (32m ago)   6d23h

`crashloop-test` Pod는 사라졌고, 기존 Backend와 Frontend Pod만 정상 Running 상태로 남았다.

## 14. Command Mistake Note

중간에 다음 명령어를 실행하였다.

    kubectl get pods -n url-shortener -l app=crashloop-test -w 2

이 명령어는 잘못된 형태이다.

`-w`는 watch 옵션이며 뒤에 숫자를 붙이는 방식으로 시간을 지정할 수 없다.

Kubernetes는 뒤에 붙은 `2`를 리소스 이름처럼 해석할 수 있기 때문에 다음 오류가 발생하였다.

    error: name cannot be provided when a selector is specified

일정 시간만 watch하고 싶다면 Linux의 timeout 명령어를 함께 사용한다.

    timeout 10s kubectl get pods -n url-shortener -l app=crashloop-test -w

또한 `kubectk`는 오타이다.

    잘못된 명령어:
    kubectk get namespace

    올바른 명령어:
    kubectl get namespace

## 15. Troubleshooting Flow

CrashLoopBackOff 발생 시 확인 순서는 다음과 같다.

    1. kubectl get pods로 STATUS와 RESTARTS 확인
    2. kubectl describe pod로 State, Last State, Exit Code 확인
    3. Events에서 Back-off restarting failed container 확인
    4. kubectl logs로 애플리케이션 로그 확인
    5. 필요 시 kubectl logs --previous로 이전 컨테이너 로그 확인
    6. command, args, 환경 변수, ConfigMap, Secret, 포트 설정 확인
    7. 수정 후 rollout 또는 Deployment 재생성
    8. Pod 상태와 서비스 응답 확인

## 16. Related Commands

Pod 상태 확인:

    kubectl get pods -n url-shortener

CrashLoopBackOff Pod 확인:

    kubectl get pods -n url-shortener -l app=crashloop-test

Pod 상세 확인:

    kubectl describe pod -n url-shortener <pod-name>

현재 로그 확인:

    kubectl logs -n url-shortener <pod-name>

이전 컨테이너 로그 확인:

    kubectl logs -n url-shortener <pod-name> --previous

이벤트 확인:

    kubectl get events -n url-shortener --sort-by='.lastTimestamp' | tail -n 20

테스트 Deployment 삭제:

    kubectl delete deployment crashloop-test -n url-shortener

서비스 확인:

    curl -H "Host: url.k3s.local" http://192.168.200.129/healthz
    curl -H "Host: url.k3s.local" http://192.168.200.129/api/health

## 17. Lessons Learned

이번 테스트를 통해 `CrashLoopBackOff`는 컨테이너 이미지 Pull 문제가 아니라 컨테이너 실행 이후의 문제라는 점을 확인하였다.

컨테이너는 생성되고 시작되었지만, 내부 프로세스가 `exit 1`로 종료되어 kubelet이 재시작을 반복하였다.

따라서 `CrashLoopBackOff` 상황에서는 이미지 태그보다 먼저 컨테이너 로그, Exit Code, command, args, 환경 변수, ConfigMap, Secret 등을 확인해야 한다.

핵심 구분은 다음과 같다.

    ImagePullBackOff:
    이미지 Pull 실패

    readinessProbe Failure:
    컨테이너는 Running이지만 READY 0/1

    CrashLoopBackOff:
    컨테이너가 실행 후 반복 종료

## 18. Improvement Points

향후 운영 안정성을 높이기 위해 다음 개선을 검토할 수 있다.

    1. 애플리케이션 시작 스크립트 검증
    2. 환경 변수 누락 시 명확한 에러 로그 출력
    3. ConfigMap, Secret 변경 후 배포 전 검증
    4. livenessProbe와 readinessProbe 분리 설계
    5. 배포 전 테스트 namespace에서 사전 검증
    6. CrashLoopBackOff 발생 시 확인 순서를 Runbook에 반영

## 19. Conclusion

별도 `crashloop-test` Deployment를 생성하여 `CrashLoopBackOff` 상황을 재현하였다.

테스트 컨테이너는 정상 이미지를 Pull하고 실행되었으나, command에서 `exit 1`을 수행하여 반복 종료되었다.

`kubectl describe pod`를 통해 `Exit Code: 1`, `Restart Count: 5`, `Back-off restarting failed container`를 확인하였고, `kubectl logs`로 컨테이너가 의도적으로 종료되었음을 확인하였다.

기존 URL Shortener 서비스는 정상 응답하였으며, 테스트가 끝난 뒤 `crashloop-test` Deployment를 삭제하여 환경을 정리하였다.

이번 테스트를 통해 Kubernetes에서 CrashLoopBackOff 발생 시 원인을 확인하는 절차와 ImagePullBackOff, readinessProbe 실패와의 차이를 학습하였다.
