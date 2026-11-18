# Project rules

- Use pnpm and the scripts defined in package.json.
- Follow the existing TypeScript and Tailwind conventions in src/app. Reuse existing components and styles where practical.
- Keep route components as Server Components by default. Add a Client Component where browser APIs, state, or event handlers are needed.
- Run pnpm lint after code changes. Run pnpm build when a change affects routing, rendering, or build configuration.
