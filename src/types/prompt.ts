/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type PromptType = "global" | "project";

export interface PromptMeta {
  type: PromptType;
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  date: string;
  license: string;
}

export interface Prompt {
  meta: PromptMeta;
  content: string;
}
