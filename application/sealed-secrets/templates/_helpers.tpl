{{/*
Sealed Secrets wrapper chart helpers
*/}}

{{/*
Return the proper rendered values for the Sealed Secrets subchart
*/}}
{{- define "sealed-secrets.values" -}}
{{- if index .Values "sealed-secrets" }}
  {{- $values := deepCopy (index .Values "sealed-secrets") }}
  {{/*
  Map global values to root level for Bitnami sealed-secrets chart
  */}}
  {{- if .Values.global }}
    {{- if .Values.global.imageRegistry }}
      {{- $_ := set $values "imageRegistry" .Values.global.imageRegistry }}
    {{- end }}
    {{- if .Values.global.imagePullSecrets }}
      {{- $_ := set $values "imagePullSecrets" .Values.global.imagePullSecrets }}
    {{- end }}
  {{- end }}
  {{- include "common.tplvalues.render" (dict "value" $values "context" $) }}
{{- else }}
  {{- include "common.tplvalues.render" (dict "value" (dict) "context" $) }}
{{- end }}
{{- end -}}
