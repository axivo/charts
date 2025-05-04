# ubuntu

<img align="right" width="250" height="250" src="https://raw.githubusercontent.com/axivo/charts/main/application/ubuntu/icon.png" alt="ubuntu" />

![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square)  ![Version: 1.0.1](https://img.shields.io/badge/Version-1.0.1-informational?style=flat-square)  ![AppVersion: 24.04](https://img.shields.io/badge/AppVersion-24.04-informational?style=flat-square)

ArgoCD application for a minimal Ubuntu `24.04` LTS container, deployed into AXIVO [K3s Cluster](https://github.com/axivo/k3s-cluster). Review the cluster [documentation](https://axivo.com/k3s-cluster/), for additional details. The application deployment is also compatible with a generic Kubernetes cluster.

### Prerequisites

- Kubernetes v1.22+
- Helm v3.0+
- ArgoCD v7.5+

### Application Deployment

> [!IMPORTANT]
> Prior application deployment, adjust the [`values.yaml`](./values.yaml) chart configurable parameters.

The application can be deployed from ArgoCD UI, or terminal:

```shell
$ kubectl apply -f application/ubuntu/application.yaml
```

Alternatively, the chart can be deployed using Helm directly:

```shell
$ helm repo add axivo https://axivo.github.io/charts
$ helm install ubuntu axivo/ubuntu -n kube-system
```

### Chart Values

See the chart values, listed below.

> [!TIP]
> Use [Robusta KRR](https://axivo.com/k3s-cluster/tutorials/handbook/tools/#robusta-krr), to optimize the cluster resources allocation.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | map | {} | Affinity rules for pod assignment |
| fullnameOverride | string | "" | Override the full name of the chart |
| global.imagePullSecrets | list | [] | Global image pull secrets |
| global.imageRegistry | string | "" | Global image registry |
| image.digest | string | "" | Image digest (overrides tag when specified) |
| image.pullPolicy | string | IfNotPresent | Image pull policy |
| image.pullSecrets | list | [] | Image pull secrets |
| image.registry | string | "" | Image registry |
| image.repository | string | "ubuntu" | Image repository |
| image.tag | string | "" | Image tag, defaults to Chart.AppVersion if not set |
| livenessProbe.command | list | ["pidof", "sleep"] | Command to execute for liveness check |
| livenessProbe.enabled | bool | false | Enable liveness probe |
| livenessProbe.failureThreshold | int | 3 | Minimum consecutive failures for the probe to be considered failed after having succeeded |
| livenessProbe.initialDelaySeconds | int | 30 | Delay before liveness probe is initiated |
| livenessProbe.periodSeconds | int | 10 | How often to perform the probe |
| livenessProbe.successThreshold | int | 1 | Minimum consecutive successes for the probe to be considered successful after having failed |
| livenessProbe.timeoutSeconds | int | 5 | When the probe times out |
| nameOverride | string | "" | Override the chart name |
| nodeSelector | map | {} | Node selector for pod assignment |
| podAnnotations | map | {} | Annotations to add to the pod |
| podLabels | map | {} | Labels to add to the pod |
| podSecurityContext | map | {} | Pod security context |
| replicaCount | int | 1 | Number of replicas |
| resources.limits | map | `{"memory":"128Mi"}` | Resource limits for the container |
| resources.limits.memory | string | "128Mi" | Memory limit |
| resources.requests | map | `{"cpu":"10m","memory":"128Mi"}` | Resource requests for the container |
| resources.requests.cpu | string | "10m" | CPU request |
| resources.requests.memory | string | "128Mi" | Memory request |
| securityContext | map | {} | Container security context |
| serviceAccount.annotations | map | {} | Annotations to add to the service account |
| serviceAccount.create | bool | false | Specifies whether a service account should be created |
| serviceAccount.name | string | "" | The name of the service account to use |
| tolerations | list | [] | Tolerations for pod assignment |
| volumeMounts | list | [] | Additional volume mounts for the container |
| volumes | list | [] | Additional volumes for the pod |

### Shell Login

Example of container shell login:

```shell
$ kubectl get pods -n default -o go-template \
  --template='{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}'
ubuntu-6589cf5fb4-p9z2b

$ kubectl exec -itn default ubuntu-6589cf5fb4-p9z2b -- /bin/bash
root@ubuntu-6589cf5fb4-p9z2b:/#
```

Compact form example of container shell login:

```shell
$ kubectl exec -itn default $(
  kubectl get pods -n default -l app.kubernetes.io/name=ubuntu -o jsonpath='{.items[*].metadata.name}'
) -- /bin/bash
```

End-user will have `root` access to a minimal Ubuntu `24.04` LTS container, connected to the Kubernetes cluster network. Common tools may require manual installation via `apt-get`.

### Troubleshooting

If the pod doesn't start, check its status and events:

```shell
$ kubectl describe pod -n default -l app.kubernetes.io/name=ubuntu
```
