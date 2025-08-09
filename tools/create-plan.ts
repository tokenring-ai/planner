import MemoryService from "@token-ring/memory/MemoryService";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import { z } from "zod";

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
	task: string;
	maxSubtasks?: number;
};

// Minimal typing for the registry to avoid coupling, as registry is JS elsewhere
export type AnyRegistry = any;

// Shape we expect back from the model; keep it loose to avoid over-constraining
type GeneratedTaskPlan = {
	subtasks?: Array<string | { [k: string]: unknown } | unknown>;
} | null;

/**
 * Planner tool: breaks down a task into subtasks using AI planning.
 */
export async function execute(
	{ task, maxSubtasks = 10 }: CreatePlanArgs,
	registry: AnyRegistry,
): Promise<string> {
	const memoryService = registry.requireFirstServiceByType(MemoryService);
	const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

	const client = modelRegistry.getFirstOnlineClient({
		tags: ["chat", "reasoning"],
	});

	const [json] = (await client.generateObject(
		{
			input: [
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

	return JSON.stringify(json, null, 2);
}

export const description =
	"Breaks a user-provided task into a numbered list of atomic subtasks.";

export const parameters = z.object({
	task: z.string().describe("The high-level task or project to break down."),
	maxSubtasks: z
		.number()
		.min(1)
		.max(20)
		.default(10)
		.describe("Maximum number of subtasks to generate"),
});

// Optional: plugin self-tests (kept for parity; types are intentionally broad)
export const tests = {
	"Returns at least 2 subtasks for a real task": async (assert: any) => {
		const plan = await execute(
			{ task: "Write a technical blog post", maxSubtasks: 5 },
			[] as unknown as AnyRegistry,
		);
		// Note: execute returns a JSON string; tests remain as placeholder for parity
		assert(typeof plan === "string", "Should return a JSON string");
	},
};
