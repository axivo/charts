{{/*
Copyright AXIVO
SPDX-License-Identifier: BSD-3-Clause
*/}}

{{/* vim: set filetype=mustache: */}}

{{/*
Returns the proper image name.
If image tag and digest are not defined, termination fallbacks to chart appVersion.
*/}}
{{- define "common.images.image" -}}
  {{- $registryName := default .imageRoot.registry ((.global).imageRegistry) -}}
  {{- $repositoryName := .imageRoot.repository -}}
  {{- $separator := ":" -}}
  {{- $termination := .imageRoot.tag | toString -}}
  {{- if not .imageRoot.tag }}
    {{- if .chart }}
      {{- $termination = .chart.AppVersion | toString -}}
    {{- end -}}
  {{- end -}}
  {{- if .imageRoot.digest }}
    {{- $separator = "@" -}}
    {{- $termination = .imageRoot.digest | toString -}}
  {{- end -}}
  {{- if $registryName }}
    {{- printf "%s/%s%s%s" $registryName $repositoryName $separator $termination -}}
  {{- else -}}
    {{- printf "%s%s%s" $repositoryName $separator $termination -}}
  {{- end -}}
{{- end -}}

{{/*
Returns the proper Docker Image Registry Secret Names.
*/}}
{{- define "common.images.pullSecrets" -}}
  {{- $pullSecrets := list }}
  {{- range ((.global).imagePullSecrets) -}}
    {{- if kindIs "map" . -}}
      {{- $pullSecrets = append $pullSecrets .name -}}
    {{- else -}}
      {{- $pullSecrets = append $pullSecrets . -}}
    {{- end }}
  {{- end -}}
  {{- range .images -}}
    {{- range .pullSecrets -}}
      {{- if kindIs "map" . -}}
        {{- $pullSecrets = append $pullSecrets .name -}}
      {{- else -}}
        {{- $pullSecrets = append $pullSecrets . -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
  {{- if (not (empty $pullSecrets)) -}}
imagePullSecrets:
    {{- range $pullSecrets | uniq }}
  - name: {{ . }}
    {{- end }}
  {{- end }}
{{- end -}}
