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

## IDE Rules File Synchronization

### Problem

When synchronizing prompts between the prompt list and IDE rules files, we need to prevent circular updates:

1. When a prompt is synced from prompt list to IDE rules file, it triggers a file change event
2. The file watcher detects this change and tries to save it back as a new prompt
3. This could lead to unnecessary prompts or infinite loops

### Solution Comparison

We explored several solutions:

1. **Special Marker in Content**
   - Add a special comment to mark synced content
   - Pros: Simple to implement, self-documenting
   - Cons: Modifies prompt content which should be preserved exactly

2. **Memory-based Flag**
   - Keep track of recently synced files in memory
   - Pros: No content modification, simple implementation
   - Cons: State management, timing issues with file system events

3. **VSCode Change Event Source**
   - Use `event.reason` to detect manual changes
   - Pros: Uses built-in VSCode API, no state management
   - Cons: Not all file changes have clear reasons

4. **Lock Mechanism** 
   - Use a lock during sync operations
   - Pros:
     - Clear and reliable synchronization control
     - No content modification
     - Works with any file change source
   - Cons:
     - Need proper lock management
     - Need timeout mechanism to prevent deadlocks

### Implementation Details

The lock mechanism is implemented in `DocumentWatcher`:

```typescript
@Service()
export class DocumentWatcher {
  private syncLock = false;
  private syncTimeout: NodeJS.Timeout | null = null;

  async acquireSyncLock(): Promise<void> {
    this.syncLock = true;
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => {
      this.releaseSyncLock();
    }, 1000); // Auto-release after 1s
  }

  releaseSyncLock(): void {
    this.syncLock = false;
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
  }
}
```

Usage in file operations:

```typescript
// When syncing from prompt list to IDE
try {
  await this.documentWatcher.acquireSyncLock();
  await fs.writeFile(ideRulesPath, prompt.content);
} finally {
  this.documentWatcher.releaseSyncLock();
}

// In file watcher
if (this.syncLock) {
  return; // Skip processing during sync
}
```

### Best Practices

1. Always use try-finally to ensure lock release
2. Keep lock duration short
3. Include auto-release timeout as safety net
4. Log lock acquisition and release for debugging

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
