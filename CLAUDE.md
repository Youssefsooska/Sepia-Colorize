# CLAUDE.md

## Code Style

- Keep all code minimal, clean, and simple. Avoid over-engineering.
- Add clear, helpful comments to every file explaining what the code does and why.
- Prioritize security in all code decisions.

## Git Workflow

- After every change, bugfix, or new feature, automatically:
  1. Stage the changes (`git add`)
  2. Write a clear, detailed commit message explaining what changed and why
  3. Commit the changes locally
- Do NOT push to GitHub automatically. Instead, ask me "Ready to push?" and wait for my confirmation.
- Never push without my explicit approval.

## Documentation

- Keep the README.md updated with:
  - What the app does
  - How it works
  - How to run it
- Update the README whenever the app changes significantly.

## Security & Privacy

- Automatically generate and maintain a `.gitignore` file appropriate for the project type.
- Never commit sensitive data: no API keys, passwords, tokens, emails, names, or personal info.
- If environment variables are needed, use a `.env` file and make sure `.env` is in `.gitignore`.
- Never leak any personal information in code, comments, or commit messages.

## Explaining Work

- After completing any task, briefly explain what was done and how it works in plain language.
