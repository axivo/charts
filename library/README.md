# Library Helm Charts

This directory contains `library` type Helm charts that provide reusable functionality for other Helm charts.

## Purpose

Library charts function as modular, reusable components that define common functionality, patterns, and templates which can be shared across multiple application charts. These charts:

- Cannot be installed directly on a Kubernetes cluster
- Provide reusable chart templates, helpers, and functions
- Enable standardization of chart development across the organization
- Reduce code duplication and maintenance overhead
- Ensure consistent implementations of common patterns

Library charts act as dependencies for application charts and help maintain consistency in deployments.

## Usage

Library charts are typically included as dependencies in application charts using the dependencies section of the Chart.yaml file. They are not meant to be deployed directly but rather consumed by other charts that utilize their templates and functionality.
