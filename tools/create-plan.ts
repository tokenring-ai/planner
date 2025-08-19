import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import MemoryService from "@token-ring/memory/MemoryService";
import type {Registry} from "@token-ring/registry";
import {z} from "zod";

// Export tool name for registration and error messages
export const name = "planner/create-plan";

// Define the schema the model should follow when generating a plan
const TaskPlan = z.object({
  type: z.literal("object"),
  properties: z.object({
    subtasks: z.object({
      type: z.literal("array"),
      items: z.object({
        type: z.literal("string"),
        description: z.literal("A clear, atomic subtask"),
      }),
      maxItems: z.number(),
      minItems: z.literal(1),
    }),
  }),
});

export type CreatePlanArgs = {
  task?: string;
  maxSubtasks?: number;
};

// Shape we expect back from the model; keep it loose to avoid over-constraining
type GeneratedTaskPlan = {
  subtasks?: Array<string | { [k: string]: unknown } | unknown>;
} | null;

/**
 * Planner tool: breaks down a task into subtasks using AI planning.
 */
export async function execute(
  {task, maxSubtasks = 10}: CreatePlanArgs,
  registry: Registry,
): Promise<string> {
  try {
    const memoryService = registry.requireFirstServiceByType(MemoryService);
    const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

    const client = await modelRegistry.chat.getFirstOnlineClient('chat:reasoning>5');

    const [json] = (await client.generateObject(
      {
        tools: {},
        messages: [
          {
            role: "system",
            content:
              "You are an expert planner. Break the user's task into atomic subtasks.",
          },
          {
            role: "user",
            content: `Task: "${task}". Break this task into clear, atomic subtasks.`,
          },
        ],
        schema: TaskPlan,
      },
      registry,
    )) as [GeneratedTaskPlan, ...unknown[]];

    if (json && Array.isArray((json as any).subtasks)) {
      // Store the main task and subtasks in attention items
      const type = `Current Task Plan for ${task}`;
      for (const subtask of (json as any).subtasks as any[]) {
        memoryService.pushAttentionItem(type, String(subtask));
      }
      memoryService.spliceAttentionItems(type, 0, maxSubtasks);
    }

    // Return the generated plan as JSON string without tool name prefix
    return JSON.stringify(json, null, 2);
  } catch (err: any) {
    // Throw errors with tool name prefix for consistency
    throw new Error(`[${name}] ${err?.message ?? String(err)}`);
  }
}

export const description =
  "Breaks a user-provided task into a numbered list of atomic subtasks.";

export const inputSchema = z.object({
  task: z.string().describe("The high-level task or project to break down."),
  maxSubtasks: z
    .number()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum number of subtasks to generate"),
});
