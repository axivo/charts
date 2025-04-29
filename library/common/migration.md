# Common Library Migration Plan

This document outlines our approach to updating the common library chart to match Bitnami's design and structure, focusing specifically on our existing charts.

## Core Principles

1. **Backward Compatibility**: Maintain compatibility with existing charts
2. **Template-driven Configuration**: Use template rendering for values, avoiding hardcoded defaults
3. **Follow Bitnami Patterns**: Implement helpers following Bitnami's exact naming and structure

## Implementation Plan

### Phase 1: Common Library Foundation (Completed)

1. **Template Value Rendering (_tplvalues.tpl)**
   - Implemented `common.tplvalues.render` for processing template values
   - Implemented `common.tplvalues.merge` for combining multiple template values

2. **Names and Labels (_names.tpl, _labels.tpl)**
   - Implemented standardized resource naming with `common.names.name`, `common.names.chart`, and `common.names.fullname`
   - Created consistent labeling with `common.labels.standard` and `common.labels.matchLabels`
   - Labels follow Kubernetes best practices and are alphabetically sorted

3. **Image Handling (_images.tpl)**
   - Implemented `common.images.image` for standardized image naming with registry/digest support
   - Added `common.images.pullSecrets` for consistent image pull secret management

4. **Annotation Handling (_annotations.tpl)**
   - Implemented `common.certManager.clusterIssuer` helper for cert-manager integration
   - Added DNS and ACME server helpers for Ingress and Gateway configurations

### Phase 2: Ubuntu Chart Migration

1. **Update Dependencies**
   - Add common library as a dependency
   - Ensure proper versioning and chart relationships

2. **Name and Label Migration**
   - Replace custom naming helpers with `common.names.*` helpers
   - Update label definitions to use `common.labels.*` helpers
   - Ensure consistent metadata across all resources

3. **Image Configuration**
   - Update deployment to use `common.images.image` helper
   - Implement pull secrets handling with `common.images.pullSecrets`
   - Maintain backward compatibility with existing values

### Phase 3: Sealed Secrets Chart Migration

1. **Dependency Management**
   - Maintain the external dependency on bitnami-labs/sealed-secrets
   - Add common library as an additional dependency
   - Ensure consistent versioning between dependencies

2. **Template Value Rendering**
   - Implement template-based value passing using `common.tplvalues.render`
   - Configure proper value merging for override scenarios
   - Structure values.yaml to follow Bitnami patterns

## Approach

Our implementation strictly follows Bitnami's patterns, implementing only what is needed for our existing charts. This pragmatic approach ensures we maintain a clean, focused library without unnecessary complexity.