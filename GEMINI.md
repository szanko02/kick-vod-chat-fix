# Antigravity Project Guidelines

## Git Automation
- **Always Commit and Push**: Whenever code changes, bug fixes, or version bumps are completed, always stage all relevant changes, create a structured git commit (e.g., following Conventional Commits), and push to GitHub (`origin main`).
- Never leave finished work or release artifacts uncommitted.

## Quality & Verification
- Run `npm test` and `npm run lint` before committing.
- Build and verify release archives (`npm run build` and `npm run pack-source`) upon version bumps.
