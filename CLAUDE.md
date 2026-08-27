# Project instructions

## React Native / Expo UI skill

This repo has the `vercel-react-native-skills` skill installed at
`.claude/skills/vercel-react-native-skills` (via `npx skills add
vercel-labs/agent-skills --skill vercel-react-native-skills`). It covers React
Native/Expo best practices for list performance, animations, navigation, UI
patterns, state management, rendering, and monorepo/config concerns.

**Consult this skill whenever a task touches UI or UX** — new or edited
screens (`src/app/`), shared UI components (`src/components/`), navigation
flow, list rendering, animations, or styling. Check its rules
(`.claude/skills/vercel-react-native-skills/rules/`, or the compiled
`AGENTS.md` in that same folder) before and while making the change, not just
when something is already slow or broken.

To update the skill to the latest version later:
`npx skills add vercel-labs/agent-skills --skill vercel-react-native-skills`
