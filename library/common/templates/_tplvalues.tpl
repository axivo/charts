{{/*
Copyright AXIVO
SPDX-License-Identifier: BSD-3-Clause
*/}}

{{/* vim: set filetype=mustache: */}}

{{/*
Merges a list of values that contains template after rendering them.
*/}}
{{- define "common.tplvalues.merge" -}}
  {{- $dst := dict -}}
  {{- range .values -}}
    {{- $dst = include "common.tplvalues.render" (dict "value" . "context" $.context "scope" $.scope) | fromYaml | merge $dst -}}
  {{- end -}}
  {{ $dst | toYaml }}
{{- end -}}

{{/*
Renders a value that contains template perhaps with scope if the scope is present.
*/}}
{{- define "common.tplvalues.render" -}}
  {{- $value := typeIs "string" .value | ternary .value (.value | toYaml) }}
  {{- if contains "{{" (toJson .value) }}
    {{- if .scope }}
      {{- tpl (cat "{{- with $.RelativeScope -}}" $value "{{- end }}") (merge (dict "RelativeScope" .scope) .context) }}
    {{- else }}
      {{- tpl $value .context }}
    {{- end }}
  {{- else }}
    {{- $value }}
  {{- end }}
{{- end -}}
