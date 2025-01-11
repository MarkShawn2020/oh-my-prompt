/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { z } from "zod";

export type PromptType = "global" | "project";

export const PromptMetaSchema = z.object({
  type: z.enum(["global", "project"]),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  author: z.string().default("Annoymous"),
  version: z.string().default("0.0.1"),
  date: z.string().default(() => new Date().toISOString()),
  license: z.string().default("MIT"),
});
export type PromptMeta = z.infer<typeof PromptMetaSchema>;

export const PromptSchema = z.object({
  meta: PromptMetaSchema,
  content: z.string().min(1),
});

export type Prompt = z.infer<typeof PromptSchema>;
