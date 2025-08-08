# GQuery - Google Apps Script Query Library

GQuery is a TypeScript library that provides SQL-like operations for Google Sheets within Google Apps Script. It offers a fluent API for querying, updating, and manipulating spreadsheet data with operations similar to database queries.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Initial Setup
- Install Node.js (project uses Node.js v20+)
- Bootstrap the repository:
  - `npm install` -- installs dependencies in ~1-2 seconds
  - `npm run build` -- builds the library in under 3 seconds

### Build Process
- `npm run build` -- builds both ES module and IIFE bundles plus type definitions (under 3 seconds, no timeout needed)
  - Creates `dist/bundle.js` (ES module format)
  - Creates `dist/bundle.global.js` (IIFE format for direct browser/GAS usage)
  - Creates `dist/bundle.d.ts` and `dist/bundle.global.d.ts` (TypeScript definitions)
  - Runs post-processing to wrap global declarations for IIFE usage
- The build process uses Rollup with TypeScript compilation
- **CRITICAL**: The `dist/types/` directory is committed to version control and required for builds to succeed

### Development Workflow
- Make changes to TypeScript source files in `src/`
- Run `npm run build` to rebuild (fast, under 3 seconds)
- Run `npx tsc --noEmit` for type checking without building
- **Note**: There are no automated tests or linting in this repository

### Project Structure
- `src/` -- TypeScript source files
  - `index.ts` -- Main entry point with GQuery and GQueryTable classes
  - `get.ts` -- Query and read operations
  - `update.ts` -- Update operations with rate limiting
  - `append.ts` -- Append operations
  - `delete.ts` -- Delete operations
  - `types.ts` -- Type definitions
  - `ratelimit.ts` -- Rate limiting utilities for Google Apps Script API
- `dist/` -- Build output (committed to version control)
- `rollup.config.js` -- Build configuration
- `post-rollup.js` -- Post-processing for global declarations
- `tsconfig.json` -- TypeScript configuration

## Validation

### Build Validation
- Always run `npm run build` after making changes
- Verify all expected files are generated:
  - `dist/bundle.js` and `dist/bundle.js.map`
  - `dist/bundle.global.js` and `dist/bundle.global.js.map`
  - `dist/bundle.d.ts` and `dist/bundle.global.d.ts`
- Check that `dist/bundle.global.d.ts` contains proper namespace wrapping
- Ensure TypeScript compilation succeeds with `npx tsc --noEmit`

### Manual Testing Scenarios
Since there are no automated tests, validate changes by:
- Confirming the API surface area is preserved in generated `.d.ts` files
- Checking that the generated bundles contain expected exports
- Verifying that TypeScript compilation succeeds without errors
- Testing that both ES module and IIFE bundles are generated correctly

### CI/CD
- The repository uses GitHub Actions for publishing to GitHub Packages
- Workflow: `.github/workflows/publish.yml` -- triggered on release publication
- Publishing requires Node.js 22.x and uses `npm ci` and `npm publish`

## Common Tasks

### Adding New Functionality
1. Add TypeScript code to appropriate file in `src/`
2. Export new functionality through `src/index.ts` if needed
3. Run `npm run build` to rebuild
4. Test that both bundle formats include your changes
5. Verify TypeScript definitions are generated correctly

### Debugging Build Issues
- If build fails looking for `dist/types/index.d.ts`, ensure the `dist/types/` directory exists (it should be in version control)
- TypeScript compilation errors usually indicate usage of JavaScript features not compatible with ES2015 target
- The project targets ES2015 but uses modern features through Rollup transpilation

### Understanding the API
The library provides a fluent interface:
```typescript
const gquery = new GQuery(spreadsheetId);
const result = gquery.from('Sheet1')
  .select(['name', 'email'])
  .where(row => row.age > 18)
  .join('Sheet2', 'id', 'userId', ['department'])
  .get();
```

### Repository Characteristics
- **No Tests**: This repository does not include any test framework or test files
- **No Linting**: No ESLint, Prettier, or other code formatting tools are configured
- **Committed Dist**: Unlike typical Node.js projects, the `dist/` directory is committed to version control
- **Google Apps Script Target**: Code is designed to run within Google Apps Script environment
- **Rate Limiting**: Includes built-in rate limiting for Google Sheets API calls

## Key Commands Reference

```bash
# Fresh clone setup
npm install                    # Install dependencies (~1-2 seconds)
npm run build                  # Build library (under 3 seconds)

# Development
npx tsc --noEmit              # Type check without building
npm run build                 # Full rebuild (under 3 seconds)

# Verification
npm run build                 # Ensure build succeeds
ls dist/                      # Verify all output files exist
head -5 dist/bundle.d.ts      # Check type definitions
```

Remember: This is a library project without tests or linting. Focus on ensuring builds succeed and the API surface remains stable when making changes.