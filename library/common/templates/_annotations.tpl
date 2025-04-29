{{/*
Copyright AXIVO
SPDX-License-Identifier: BSD-3-Clause
*/}}

{{/* vim: set filetype=mustache: */}}

{{/*
Returns cert-manager cluster issuer name with provider prefix and conditional staging suffix.
*/}}
{{- define "common.certManager.clusterIssuer" -}}
  {{- $provider := .Values.global.externalDns.provider -}}
  {{- $baseIssuer := .Values.global.certManager.clusterIssuer -}}
  {{- $clusterIssuer := printf "%s-%s" $provider $baseIssuer -}}
  {{- $acmeServer := .Values.global.externalDns.acmeServer -}}
  {{- if ne $acmeServer "production" -}}
    {{- printf "%s-staging" $clusterIssuer -}}
  {{- else -}}
    {{- $clusterIssuer -}}
  {{- end -}}
{{- end -}}
