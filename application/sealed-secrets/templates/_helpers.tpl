{{/*
Sealed Secrets wrapper chart helpers
*/}}

{{/*
Return the proper rendered values for the Sealed Secrets subchart
*/}}
{{- define "sealed-secrets.values" -}}
{{- if index .Values "sealed-secrets" }}
  {{- $values := deepCopy (index .Values "sealed-secrets") }}
  {{- include "common.tplvalues.render" (dict "value" $values "context" $) }}
{{- else }}
  {{- include "common.tplvalues.render" (dict "value" (dict) "context" $) }}
{{- end }}
{{- end -}}
