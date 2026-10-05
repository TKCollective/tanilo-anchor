# Repo rules

- No AI attribution trailers in commits or PRs (no "Co-Authored-By: Claude", no "Generated with Claude Code", no session links).
- The working rules in ../CLAUDE.md apply here in full.
- Git staging: never `git add -A` or `git add .`; stage only the files you changed, by name, and show `git status --short` before committing.
- Never chain a merge or push after a check with `;`: run the check, read the result, then merge or push in a separate command. If any check step errors, stop and tell Joe.
