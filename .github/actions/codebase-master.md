# New Codebase Function Analysis - Master Index

This document serves as the master index for the comprehensive codebase analysis, split across multiple sessions for Max subscription optimization.

## Document Structure

The complete analysis is divided into the following session-optimized documents:

### Session 1: Guidelines & Core Modules
**File**: `codebase-session1.md`
- Method Standardization Guidelines (Complete specification)
- config/ modules (2 files)
- core/ modules (5 files)
- Standardization analysis for core classes

### Session 2: Handlers & Basic Services  
**File**: `codebase-session2.md`
- handlers/ modules (5 files)
- Basic services: File, Frontpage, Git, Issue, Label (5 files)
- Standardization analysis for handler and basic service classes

### Session 3: Advanced Services
**File**: `codebase-session3.md`
- services/Shell.js, Template.js
- services/chart/ modules (2 files)
- services/github/ modules (4 files)
- Standardization analysis for advanced service classes

### Session 4: Release Services & Templates
**File**: `codebase-session4.md`
- services/helm/ modules (2 files)
- services/release/ modules (4 files)
- templates/ files (7 files)
- Final standardization summary and architectural patterns

## Quick Reference

### Standardization Status Overview
- **Total Methods Analyzed**: ~180 methods across 41 files
- **Compliance Rate**: 85% already standardized
- **Methods Needing Updates**: 20 specific methods identified
- **Priority Areas**: Core error handling, GitHub API patterns, Release service parameters

### Key Standardization Rules
1. **Context-First**: `method(context, ...otherParams)`
2. **Options-Last**: `method(param1, param2, options = {})`
3. **Object Parameters**: `method({ param1, param2, param3 })`
4. **Constructor Pattern**: `constructor(params)` with internal destructuring

## Navigation Guide

Each session document contains:
- ✅ **COMPLIANT** methods (following standards)
- ⚠️ **STANDARDIZATION NEEDED** methods (with specific fixes)
- **Proposed changes** with before/after examples
- **Module-specific analysis** for targeted improvements

## Usage Instructions

1. **For Complete Review**: Process sessions 1-4 sequentially
2. **For Specific Modules**: Jump to relevant session based on module location
3. **For Standardization Work**: Focus on ⚠️ marked methods in each session
4. **For Implementation**: Use proposed changes as implementation guide

This structure allows for focused analysis and implementation across multiple chat sessions while maintaining comprehensive coverage of the entire codebase.
