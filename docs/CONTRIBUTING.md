# Contributing to Oh My Prompt

## Development Guidelines

### Code Style & Best Practices

1. **Single Responsibility Principle**
   - Each class should have a single responsibility
   - Keep files focused and concise (max 200 lines)
   - Use clear and descriptive names for functions and variables

2. **Dependency Injection**
   - Use dependency injection to reduce code coupling
   - Leverage TypeDI for service management
   - Avoid circular dependencies

3. **Documentation**
   - Never remove triple-slash (`///`) comments
   - Document public APIs and complex logic
   - Keep documentation up-to-date with code changes

### Technology Stack

#### JavaScript/TypeScript
- Package Manager: `pnpm`
- Core Stack:
  - TypeScript
  - VSCode Extension API
  - TypeDI for dependency injection
  - Jest for testing

#### Development Tools
- Compilation: TypeScript + Webpack
- Linting: ESLint + Prettier
- Testing: Jest

### Project Structure

```
oh-my-prompt/
├── src/                    # Source code
│   ├── services/          # Core services
│   ├── ui/                # UI components
│   ├── types/             # TypeScript type definitions
│   └── extension.ts       # Extension entry point
├── docs/                  # Documentation
├── test/                  # Test files
└── package.json          # Project configuration
```

### Workflow

1. **Feature Development**
   - Create a new branch for each feature
   - Follow the single responsibility principle
   - Add tests for new functionality
   - Update documentation as needed

2. **Code Review**
   - Ensure code follows project guidelines
   - Check for proper error handling
   - Verify test coverage
   - Review documentation updates

3. **Testing**
   - Write unit tests for new code
   - Run the full test suite before submitting PR
   - Test in both VSCode stable and insiders

### Commit Guidelines

Follow the Conventional Commits specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation only changes
- style: Changes that do not affect the meaning of the code
- refactor: Code change that neither fixes a bug nor adds a feature
- perf: Code change that improves performance
- test: Adding missing tests or correcting existing tests
- chore: Changes to the build process or auxiliary tools

Example:
```
feat(prompt): add support for TOML validation

- Add Zod schema for prompt validation
- Improve error messages for invalid prompts
- Update documentation with new validation rules
```
