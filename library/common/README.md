# common

<img align="right" width="250" height="250" src="https://raw.githubusercontent.com/axivo/charts/main/library/common/icon.png" alt="common" />

![Type: library](https://img.shields.io/badge/Type-library-informational?style=flat-square)  ![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-informational?style=flat-square)

Common library used for ArgoCD applications, deployed into AXIVO [K3s Cluster](https://github.com/axivo/k3s-cluster). Review the cluster [documentation](https://axivo.com/k3s-cluster/), for additional details. The library chart is also compatible with a generic Kubernetes cluster.

## Overview

This is a library chart providing commonly used templates and utilities to applications. Library charts do not deploy any resources by themselves and must be used as dependencies by application charts.

## Usage

To use this library chart, include it as a dependency in your `Chart.yaml` file:

```yaml
dependencies:
  - name: common
    version: 1.0.0
    repository: https://axivo.github.io/charts
```

Then include the templates you need in your application chart.

## Available Templates

This library provides several templates to standardize application deployments:

- Deployments
- Services
- Ingress resources
- ConfigMaps and Secrets
- ServiceAccounts

### Chart Values

See the chart values, listed below.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| global.certManager.clusterIssuer | string | "cloudflare-cluster-issuer" | Default cert-manager cluster issuer |
| global.domain | string | "noty.cc" | Primary domain used across applications |
| global.externalDns.acmeServer | string | "production" | ACME server environment, `production` or `staging` |
| global.externalDns.provider | string | "cloudflare" | DNS provider for external-dns |

## Development

When developing this library chart, test it thoroughly with dependent application charts to ensure backward compatibility and proper functionality.
