# Local Registry Runbook

## Purpose

이 문서는 Homelab Kubernetes 환경에서 로컬 Docker Registry를 사용해 애플리케이션 이미지를 저장하고, K3s 클러스터에서 해당 이미지를 Pull할 수 있도록 구성한 절차를 기록합니다.

## Registry Information

| Item | Value |
|---|---|
| Registry Type | Docker Registry |
| Registry Address | localhost:5000 |
| Backend Image | localhost:5000/url-shortener-backend:0.1.0 |
| Frontend Image | localhost:5000/url-shortener-frontend:0.1.0 |

## Image Build

```bash
sudo docker build -t url-shortener-backend:0.1.0 apps/url-shortener/backend

sudo docker build \
  -t url-shortener-frontend:0.1.0 \
  --build-arg VITE_API_BASE=http://url.k3s.local \
  apps/url-shortener/frontend
```

## Image Tagging

```bash
sudo docker tag url-shortener-backend:0.1.0 localhost:5000/url-shortener-backend:0.1.0
sudo docker tag url-shortener-frontend:0.1.0 localhost:5000/url-shortener-frontend:0.1.0
```

## Image Push

```bash
sudo docker push localhost:5000/url-shortener-backend:0.1.0
sudo docker push localhost:5000/url-shortener-frontend:0.1.0
```

## Registry Check

```bash
curl http://localhost:5000/v2/_catalog
curl http://localhost:5000/v2/url-shortener-backend/tags/list
curl http://localhost:5000/v2/url-shortener-frontend/tags/list
```

## K3s Registry Configuration

K3s에서 TLS 없는 로컬 Registry를 사용하기 위해 `/etc/rancher/k3s/registries.yaml` 파일을 구성했습니다.

```yaml
mirrors:
  "localhost:5000":
    endpoint:
      - "http://localhost:5000"
  "127.0.0.1:5000":
    endpoint:
      - "http://127.0.0.1:5000"
```

## Restart K3s

```bash
sudo systemctl restart k3s
kubectl get nodes
kubectl get pods -A
```

## Pull Test

```bash
kubectl create namespace image-test

kubectl run backend-image-pull-test \
  -n image-test \
  --image=localhost:5000/url-shortener-backend:0.1.0 \
  --restart=Never \
  --image-pull-policy=Always \
  --command -- sh -c "node -v && sleep 60"

kubectl get pods -n image-test
kubectl logs backend-image-pull-test -n image-test
kubectl delete namespace image-test
```

## Result

로컬 Docker Registry에 URL Shortener Backend/Frontend 이미지를 저장하고, K3s 클러스터에서 해당 이미지를 Pull할 수 있는 구조를 구성했습니다.

이 구성을 통해 외부 Container Registry 없이 Homelab 내부에서 애플리케이션 이미지를 빌드, 저장, 배포하는 흐름을 검증할 수 있습니다.
