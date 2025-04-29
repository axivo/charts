{{/*
Copyright AXIVO
SPDX-License-Identifier: BSD-3-Clause
*/}}

{{/* vim: set filetype=mustache: */}}

{{/*
Provides labels used on immutable fields.
*/}}
{{- define "common.labels.matchLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/name: {{ include "common.names.name" . }}
{{- end -}}

{{/*
Provides Kubernetes standard labels.
*/}}
{{- define "common.labels.standard" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/name: {{ include "common.names.name" . }}
{{- with .Chart.AppVersion }}
app.kubernetes.io/version: {{ . | quote }}
{{- end }}
helm.sh/chart: {{ include "common.names.chart" . }}
{{- end -}}
