import MemoryService from "@token-ring/memory/MemoryService";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import { z } from "zod";

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
/**
 * Planner tool: breaks down a task into subtasks using AI planning.
 * @param {Object} args   Tool arguments
 * @param {TokenRingRegistry} registry - The package registry
 */

export async function execute({ task, maxSubtasks = 10 }, registry) {
	const memoryService = registry.requireFirstServiceByType(MemoryService);
	const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

	const client = modelRegistry.getFirstOnlineClient({
		tags: ["chat", "reasoning"],
	});

	const [json] = await client.generateObject(
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
	);

	if (json) {
		// Store the main task and subtasks in attention items
		const type = `Current Task Plan for ${task}`;
		for (const subtask of json.subtasks) {
			memoryService.pushAttentionItem(type, `${subtask}`);
		}
		memoryService.spliceAttentionItems(type, 0, maxSubtasks); // +1 for the main task
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

// Optional: plugin self-tests
export const tests = {
	"Returns at least 2 subtasks for a real task": async (assert) => {
		const plan = await execute(
			{ task: "Write a technical blog post", maxSubtasks: 5 },
			[], // registry
		);
		assert(Array.isArray(plan), "Should return an array");
		assert(plan.length >= 2, "Should decompose into more than one step");
	},
};
