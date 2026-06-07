# Local Registry Runbook

## Purpose

이 문서는 Homelab Kubernetes 환경에서 로컬 Docker Registry를 사용해 애플리케이션 이미지를 저장하고, K3s 클러스터에서 해당 이미지를 Pull할 수 있도록 구성한 절차를 기록합니다.

이 구성은 외부 Container Registry를 사용하지 않고, Homelab 내부에서 이미지를 빌드하고 저장한 뒤 Kubernetes에서 배포하는 흐름을 검증하기 위한 목적입니다.

## Registry Information

| Item | Value |
|---|---|
| Registry Type | Docker Registry |
| Registry Address | localhost:5000 |
| Backend Image | localhost:5000/url-shortener-backend:0.1.0 |
| Frontend Image | localhost:5000/url-shortener-frontend:0.1.0 |
| Kubernetes Distribution | K3s |
| Node | k3s-master-01 |

## 1. Local Registry 상태 확인

현재 서버에는 Docker Registry 컨테이너를 `5000` 포트로 실행하여 로컬 이미지 저장소로 사용합니다.

```bash
sudo docker ps | grep registry
```

Registry API를 통해 저장된 이미지 목록을 확인합니다.

```bash
curl http://localhost:5000/v2/_catalog
```

정상 예시:

```json
{"repositories":["url-shortener-backend","url-shortener-frontend"]}
```

## 2. Docker 이미지 확인

URL Shortener 애플리케이션의 Backend와 Frontend 이미지가 로컬 Docker에 존재하는지 확인합니다.

```bash
sudo docker images | egrep 'url-shortener|REPOSITORY'
```

확인 대상 이미지:

```text
url-shortener-backend    0.1.0
url-shortener-frontend   0.1.0
```

## 3. Backend 이미지 빌드

Backend 애플리케이션 이미지를 빌드합니다.

```bash
sudo docker build \
  -t url-shortener-backend:0.1.0 \
  apps/url-shortener/backend
```

## 4. Frontend 이미지 빌드

Frontend 애플리케이션 이미지를 빌드합니다.

```bash
sudo docker build \
  -t url-shortener-frontend:0.1.0 \
  --build-arg VITE_API_BASE=http://url.k3s.local \
  apps/url-shortener/frontend
```

## 5. Local Registry용 이미지 태그 생성

로컬에서 빌드한 이미지를 `localhost:5000` Registry 주소 형식으로 태그합니다.

```bash
sudo docker tag url-shortener-backend:0.1.0 \
  localhost:5000/url-shortener-backend:0.1.0
```

```bash
sudo docker tag url-shortener-frontend:0.1.0 \
  localhost:5000/url-shortener-frontend:0.1.0
```

태그가 정상적으로 생성되었는지 확인합니다.

```bash
sudo docker images | grep localhost:5000
```

## 6. Local Registry에 이미지 Push

Backend 이미지를 로컬 Registry에 Push합니다.

```bash
sudo docker push localhost:5000/url-shortener-backend:0.1.0
```

Frontend 이미지를 로컬 Registry에 Push합니다.

```bash
sudo docker push localhost:5000/url-shortener-frontend:0.1.0
```

## 7. Registry 저장 확인

Registry catalog를 조회하여 이미지가 저장되었는지 확인합니다.

```bash
curl http://localhost:5000/v2/_catalog
```

Backend 이미지 태그 확인:

```bash
curl http://localhost:5000/v2/url-shortener-backend/tags/list
```

Frontend 이미지 태그 확인:

```bash
curl http://localhost:5000/v2/url-shortener-frontend/tags/list
```

정상 예시:

```json
{"name":"url-shortener-backend","tags":["0.1.0"]}
```

## 8. K3s Registry Configuration

K3s에서 TLS 없는 로컬 Registry를 사용하기 위해 `/etc/rancher/k3s/registries.yaml` 파일을 구성합니다.

```yaml
mirrors:
  "localhost:5000":
    endpoint:
      - "http://localhost:5000"
  "127.0.0.1:5000":
    endpoint:
      - "http://127.0.0.1:5000"
```

설정 파일 생성 예시:

```bash
sudo mkdir -p /etc/rancher/k3s

sudo tee /etc/rancher/k3s/registries.yaml > /dev/null <<'EOF'
mirrors:
  "localhost:5000":
    endpoint:
      - "http://localhost:5000"
  "127.0.0.1:5000":
    endpoint:
      - "http://127.0.0.1:5000"
EOF
```

## 9. K3s 재시작

Registry 설정을 적용하기 위해 K3s를 재시작합니다.

```bash
sudo systemctl restart k3s
```

K3s 상태를 확인합니다.

```bash
sudo systemctl status k3s --no-pager -l
kubectl get nodes
kubectl get pods -A
```

정상 기준:

```text
k3s-master-01   Ready   control-plane
```

## 10. Kubernetes Image Pull Test

K3s가 로컬 Registry에서 이미지를 정상적으로 Pull할 수 있는지 테스트합니다.

테스트 namespace를 생성합니다.

```bash
kubectl create namespace image-test
```

Backend 이미지 Pull 테스트 Pod를 실행합니다.

```bash
kubectl run backend-image-pull-test \
  -n image-test \
  --image=localhost:5000/url-shortener-backend:0.1.0 \
  --restart=Never \
  --image-pull-policy=Always \
  --command -- sh -c "node -v && sleep 60"
```

Pod 상태를 확인합니다.

```bash
kubectl get pods -n image-test
```

상세 이벤트를 확인합니다.

```bash
kubectl describe pod backend-image-pull-test -n image-test
```

로그를 확인합니다.

```bash
kubectl logs backend-image-pull-test -n image-test
```

정상 예시:

```text
v22.x.x
```

테스트 namespace를 삭제합니다.

```bash
kubectl delete namespace image-test
```

## Result

로컬 Docker Registry에 URL Shortener Backend/Frontend 이미지를 저장하고, K3s 클러스터에서 해당 이미지를 Pull할 수 있는 구조를 구성했습니다.

이 구성을 통해 외부 Container Registry 없이 Homelab 내부에서 애플리케이션 이미지를 빌드, 저장, 배포하는 흐름을 검증할 수 있습니다.

## Portfolio Summary

본 단계에서는 URL Shortener 애플리케이션의 Docker 이미지를 로컬 Registry에 저장하고, K3s 클러스터에서 해당 이미지를 Pull할 수 있도록 Registry 설정을 구성했습니다.

이를 통해 Homelab 환경에서 이미지 빌드, Registry Push, Kubernetes Pull 테스트까지 이어지는 기본적인 컨테이너 배포 흐름을 검증했습니다.
