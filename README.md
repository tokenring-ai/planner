# @token-ring/planner

Planning utilities and tools for the Token Ring ecosystem. This package exposes a simple, registry-driven tool that converts a high-level task into a list of atomic subtasks using an LLM, and stores those subtasks in memory for later use by other services or agents.

## What it provides

- Package metadata exports: `name`, `description`, `version`.
- tools.createPlan
  - Description: Breaks a user-provided task into a numbered list of atomic subtasks using a reasoning-capable chat model.
  - Side effects: Writes the generated subtasks to the registered MemoryService as attention items for the current session.

## Installation

This package is part of the Token Ring monorepo and is referenced from workspaces as:
- Name: `@token-ring/planner`
- Version: `0.1.0`

It expects the following peer services to be available/registered in your application:
- `@token-ring/registry`
- `@token-ring/ai-client` (ModelRegistry)
- `@token-ring/memory` (MemoryService)
- `@token-ring/chat` (used transitively by AI client)

## Quick start

```ts
import { ServiceRegistry } from "@token-ring/registry";
import { ModelRegistry } from "@token-ring/ai-client";
import MemoryService from "@token-ring/memory/MemoryService";
import * as Planner from "@token-ring/planner";

const registry = new ServiceRegistry();
await registry.start();

// Register required services
await registry.services.addServices(
  new ModelRegistry(),
  new MemoryService(),
);

// Create a plan for your high-level task
const planJson = await Planner.tools.createPlan.execute(
  { task: "Implement user login with OAuth2", maxSubtasks: 8 },
  registry,
);

console.log(planJson);
// => Pretty-printed JSON object with `subtasks: string[]`

// Subtasks are also written into MemoryService attention items for quick access by other components.
```

## Tool API

### tools.createPlan
- Signature: `async function execute({ task, maxSubtasks = 10 }, registry): Promise<string>`
- Parameters (zod schema):
  - `task: string` — The high-level task or project to break down.
  - `maxSubtasks: number` (min 1, max 20, default 10) — Maximum number of subtasks to keep.
- Returns: A JSON string representing the generated plan. Example shape:

```json
{
  "subtasks": [
    "Set up OAuth2 client credentials",
    "Implement authorization code flow",
    "Add callback route and token exchange",
    "Store session and user info securely"
  ]
}
```

- Behavior details:
  - Model selection: uses `ModelRegistry.chat.getFirstOnlineClient('chat:reasoning>5')` to obtain a reasoning-capable chat model.
  - The LLM is instructed (system + user messages) to output a structure matching a Zod schema for an object with a `subtasks` array of strings.
  - If the response includes a `subtasks` array, each subtask is pushed to `MemoryService` as an attention item under the type `Current Task Plan for <task>`, then the list is truncated to `maxSubtasks`.

## Exports

```ts
import { name, description, version, tools } from "@token-ring/planner";
// tools.createPlan.execute(...)
```

- `name`: "@token-ring/planner"
- `description`: "A tool for creating execution plans for executing tasks."
- `version`: "0.1.0"

## Notes and limitations
- The quality and granularity of the plan depend on the configured model. Ensure your ModelRegistry has at least one online client that satisfies the selection string.
- The returned value is a stringified JSON object; parse it if you need structured access.
- Memory side-effect: The tool writes attention items to MemoryService to make the plan immediately available to other services/agents.

## License
MIT (see LICENSE in the repository root).
