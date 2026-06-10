# Contributing to Neseser

First off, thank you for considering contributing to Neseser! It's people like you that make Neseser such a great tool for the Obsidian community.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please create an issue on GitHub. Include as much detail as possible:

- Your OS and Obsidian version.
- Steps to reproduce the bug.
- Expected behavior vs actual behavior.
- Screenshots or console errors, if applicable.

### Suggesting Enhancements

Feature requests are always welcome! Please check the existing issues to see if your idea has already been proposed. If not, open a new issue describing the feature and how it would be useful.

### Pull Requests

We gladly accept pull requests. Please follow these steps:

1. Fork the repository and create your branch from `main`.
2. Make your changes and ensure tests pass.
3. Keep your PR focused on a single feature or bug fix.
4. Provide a clear description of the problem your PR solves or the feature it adds.

## Development Setup

Neseser is built using TypeScript, React, and the Obsidian API.

### Prerequisites

- Node.js (v18 or higher)
- npm

### Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd neseser
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server (watches for changes and compiles):

   ```bash
   npm run dev
   ```

### Building and Testing

To build for production:

```bash
npm run build
```

To run tests:

```bash
npm run test
```

For test coverage:

```bash
npm run coverage
```

## Code Style

- We use TypeScript and React. Try to keep components modular.
- Follow the existing code style. If your editor supports ESLint/Prettier, please ensure formatting matches the rest of the project.
