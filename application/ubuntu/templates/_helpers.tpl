{{/*
Expand the name of the chart.
*/}}
{{- define "ubuntu.name" -}}
{{- include "common.names.name" . -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "ubuntu.fullname" -}}
{{- include "common.names.fullname" . -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ubuntu.chart" -}}
{{- include "common.names.chart" . -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "ubuntu.labels" -}}
{{ include "common.labels.standard" . }}
{{- end -}}

{{/*
Selector labels.
*/}}
{{- define "ubuntu.selectorLabels" -}}
{{ include "common.labels.matchLabels" . }}
{{- end -}}

{{/*
Create the name of the service account to use.
*/}}
{{- define "ubuntu.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ubuntu.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
{{- default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}
