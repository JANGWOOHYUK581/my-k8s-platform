# Troubleshooting Log

## 1. K3s 설치 후 API Server 접속 실패

### Symptom

K3s 설치 후 `kubectl get nodes` 실행 시 아래 오류가 발생했습니다.

```text
The connection to the server 127.0.0.1:6443 was refused
```

### Check

K3s 서비스 상태와 로그를 확인했습니다.

```bash
sudo systemctl status k3s --no-pager -l
sudo journalctl -u k3s -n 100 --no-pager
```

### Cause

K3s가 기동되는 과정에서 kubelet이 cgroup v1 환경을 감지하고 종료되었습니다.

로그에서 아래 메시지를 확인했습니다.

```text
kubelet is configured to not run on a host using cgroup v1
```

### Action

현재 cgroup 상태를 확인했습니다.

```bash
stat -fc %T /sys/fs/cgroup
```

초기 결과는 `tmpfs`였고, cgroup v1 환경으로 확인되었습니다.

GRUB 설정을 수정했습니다.

```bash
sudo sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash systemd.unified_cgroup_hierarchy=1"/' /etc/default/grub
sudo sed -i 's/^GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX=""/' /etc/default/grub
sudo update-grub
sudo reboot
```

### Result

재부팅 후 cgroup v2 적용을 확인했습니다.

```bash
stat -fc %T /sys/fs/cgroup
```

결과:

```text
cgroup2fs
```

K3s 서비스와 Kubernetes Node 상태도 정상으로 확인했습니다.

```bash
sudo systemctl status k3s --no-pager -l
kubectl get nodes
```

결과:

```text
k3s-master-01   Ready   control-plane
```

---

## 2. Helm 설치 후 Kubernetes Cluster Unreachable 오류

### Symptom

Helm으로 ingress-nginx 설치 시 아래 오류가 발생했습니다.

```text
Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp 127.0.0.1:8080: connect: connection refused
```

### Cause

Helm이 K3s kubeconfig 경로를 찾지 못해 기본 주소인 `localhost:8080`으로 접속하려 했습니다.

### Action

KUBECONFIG 환경 변수를 설정했습니다.

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
source ~/.bashrc
```

### Result

Helm이 Kubernetes 클러스터에 정상 접근했고, ingress-nginx 설치를 완료했습니다.

```bash
helm list -A
kubectl get pods -n ingress-nginx
```

---

## 3. apt install 시 dpkg lock 발생

### Symptom

`apt install` 실행 시 아래 메시지가 발생했습니다.

```text
Could not get lock /var/lib/dpkg/lock-frontend
It is held by process unattended-upgr
```

### Cause

Ubuntu 자동 업데이트 프로세스인 `unattended-upgrades`가 apt lock을 잡고 있었습니다.

### Check

```bash
ps -ef | egrep 'apt|dpkg|unattended' | grep -v grep
sudo fuser /var/lib/dpkg/lock-frontend
```

### Action

자동 업데이트가 종료될 때까지 잠시 대기한 뒤 다시 apt 명령어를 실행했습니다.

```bash
sudo apt install -y git tree
```

### Result

apt lock이 해제된 후 필요한 패키지 설치를 계속 진행할 수 있었습니다.
