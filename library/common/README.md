# common

<img align="right" width="250" height="250" src="https://raw.githubusercontent.com/axivo/charts/main/library/common/icon.png" alt="common" />

![Type: library](https://img.shields.io/badge/Type-library-informational?style=flat-square)  ![Version: 1.0.8](https://img.shields.io/badge/Version-1.0.8-informational?style=flat-square)

Common library used for ArgoCD applications, deployed into AXIVO [K3s Cluster](https://github.com/axivo/k3s-cluster). Review the cluster [documentation](https://axivo.com/k3s-cluster/), for additional details. The library chart is also compatible with a generic Kubernetes cluster.

### Usage

This library chart provides a set of reusable Helm templates that simplify the creation of Kubernetes resources with consistent configuration and best practices. It contains helpers for deployments, services, ingress resources, and standard label patterns used across ArgoCD applications.

The library can be included as dependency, into `Chart.yaml` file:

```yaml
dependencies:
  - name: common
    repository: https://axivo.github.io/charts
    version: 1.0.8
```

### Chart Values

See the chart values, listed below.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| global.certManager.clusterIssuer | string | "cluster-issuer" | Default cert-manager cluster issuer |
| global.domain | string | "noty.cc" | Primary domain used across applications |
| global.externalDns.acmeServer | string | "production" | ACME server environment, `production` or `staging` |
| global.externalDns.provider | string | "cloudflare" | DNS provider for external-dns |
