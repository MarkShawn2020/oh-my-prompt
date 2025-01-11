# Oh My Prompt Architecture

## Overview

Oh My Prompt is a VSCode extension designed to manage multiple AI prompts with a focus on IDE integration. The system follows enterprise-level best practices and emphasizes maintainability, extensibility, and user experience.

## Core Components

### 1. Prompt Management
- **PromptManager**: Handles prompt CRUD operations and synchronization with IDE rules
- **DocumentWatcher**: Monitors file changes and manages prompt updates
- **EnvironmentDetector**: Detects IDE environment and manages rule paths

### 2. UI Components
- **StatusBarItems**: Manages VSCode status bar integration
- **QuickPick**: Provides prompt selection and management interface

### 3. File System
- **Prompt Storage**: TOML-based prompt storage with metadata
- **IDE Rules**: Integration with IDE-specific rule files
- **Temporary Files**: Management of unsaved prompts

## Key Features

### 1. Prompt Lifecycle
- Creation: Temporary file → User editing → Optional saving
- Modification: File watching → Prompt update → IDE sync
- Deletion: Prompt removal with cleanup

### 2. IDE Integration
- Rules synchronization between prompts and IDE
- Support for both global and project-specific rules
- Automatic detection of IDE environment

### 3. Data Validation
- TOML parsing with @iarna/toml
- Schema validation with Zod
- Comprehensive error handling

## Design Principles

### 1. Single Responsibility
Each component has a clear, focused responsibility:
- **PromptManager**: Prompt lifecycle management
- **DocumentWatcher**: File system monitoring
- **StatusBarItems**: UI interaction

### 2. Dependency Injection
- Services are injected using TypeDI
- Reduces coupling between components
- Facilitates testing and maintenance

### 3. Error Handling
- Comprehensive error catching
- User-friendly error messages
- Detailed logging for debugging

## File Organization

```
src/
├── services/
│   ├── promptManager.ts      # Prompt management
│   ├── documentWatcher.ts    # File monitoring
│   └── environmentDetector.ts # IDE detection
├── ui/
│   └── statusBarItems.ts     # UI components
└── types/
    └── prompt.ts            # Type definitions
```

## Data Flow

1. **Prompt Creation**
   ```
   User Action → Create Temp File → Edit → Save Decision → Final Storage
   ```

2. **Rule Synchronization**
   ```
   File Change → Parse TOML → Validate → Update IDE Rules
   ```

3. **Prompt Selection**
   ```
   QuickPick → Load Prompts → User Selection → Apply Rules
   ```

## Future Considerations

1. **Extensibility**
   - Support for additional IDE integrations
   - Plugin system for custom prompt types
   - Enhanced validation rules

2. **Performance**
   - Caching for frequently accessed prompts
   - Optimized file watching
   - Batch operations for multiple prompts

3. **User Experience**
   - Enhanced error messages
   - Interactive prompt creation
   - Backup and restore functionality
