/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

import { Prompt, PromptType } from "../types/prompt";
import { Service } from "typedi";
import { EnvironmentDetector } from "./environmentDetector";
import { VscodeLogger } from "../vscode-logger";

@Service()
export class PromptManager {
  private readonly PROMPT_DIR = "~/.oh-my-prompt/prompts";

  constructor(
    private environmentDetector: EnvironmentDetector,
    private logger: VscodeLogger,
  ) {
    this.ensurePromptDirectories();
  }

  /**
   * Get the absolute path to the prompt directory
   */
  getPromptDir(): string {
    return this.expandPath(this.PROMPT_DIR);
  }

  private async ensurePromptDirectories() {
    try {
      // Create base prompt directory
      const baseDir = this.getPromptDir();
      await fs.mkdir(baseDir, { recursive: true });

      // Create type-specific directories
      const types: PromptType[] = ["global", "project"];
      await Promise.all(
        types.map(async (type) => {
          const typeDir = path.join(baseDir, type);
          await fs.mkdir(typeDir, { recursive: true });
        }),
      );
    } catch (error) {
      this.logger.error("Failed to create prompt directories:", error);
    }
  }

  private expandPath(filepath: string): string {
    if (filepath.startsWith("~/")) {
      return path.join(
        process.env.HOME || process.env.USERPROFILE || "",
        filepath.slice(2),
      );
    }
    return filepath;
  }

  async loadPrompts(type: PromptType): Promise<Prompt[]> {
    const promptDir = path.join(this.getPromptDir(), type);
    try {
      const files = await fs.readdir(promptDir);
      const prompts = await Promise.all(
        files
          .filter((file) => file.endsWith(".toml"))
          .map(async (file) => {
            const content = await fs.readFile(
              path.join(promptDir, file),
              "utf-8",
            );

            // Parse TOML sections
            const sections = content.split("\n\n");
            const metaSection = sections[0];
            const contentSection = sections[1];

            // Parse meta section
            const meta: Record<string, string> = {};
            metaSection
              .split("\n")
              .slice(1) // Skip [meta] line
              .forEach((line) => {
                const [key, value] = line.split(" = ");
                meta[key.trim()] = value.trim().replace(/"/g, "");
              });

            // Parse content section
            const contentMatch = contentSection.match(
              /content = """\n([\s\S]*)\n"""/,
            );
            const promptContent = contentMatch ? contentMatch[1] : "";

            return {
              meta: {
                type: meta.type as PromptType,
                id: meta.id,
                name: meta.name,
                description: meta.description,
                author: meta.author,
                version: meta.version,
                date: meta.date,
                license: meta.license,
              },
              content: promptContent,
            } as Prompt;
          }),
      );
      return prompts;
    } catch (error) {
      this.logger.error(`Failed to load ${type} prompts:`, error);
      return [];
    }
  }

  async savePrompt(prompt: Prompt): Promise<void> {
    const promptDir = path.join(this.getPromptDir(), prompt.meta.type);
    const filepath = path.join(promptDir, `${prompt.meta.id}.toml`);
    try {
      // Convert Prompt to TOML format
      const tomlContent = `[meta]
type = "${prompt.meta.type}"
id = "${prompt.meta.id}"
name = "${prompt.meta.name}"
description = "${prompt.meta.description}"
author = "${prompt.meta.author}"
version = "${prompt.meta.version}"
date = "${prompt.meta.date}"
license = "${prompt.meta.license}"

content = """
${prompt.content}
"""`;
      await fs.writeFile(filepath, tomlContent);
    } catch (error) {
      this.logger.error("Failed to save prompt:", error);
      throw error;
    }
  }

  /**
   * Sync a global prompt to the current IDE's global rules location
   */
  async syncGlobalPrompt(prompt: Prompt): Promise<void> {
    if (prompt.meta.type !== "global") {
      throw new Error("Can only sync global prompts to global rules");
    }

    const ide = await this.environmentDetector.detect();
    const targetPath = await this.environmentDetector.getRulesPath("global");

    this.logger.info(`Syncing global prompt to ${targetPath} (IDE: ${ide})`);
    await fs.writeFile(targetPath, prompt.content);
  }

  /**
   * Sync a project prompt to the current IDE's project rules location
   */
  async syncProjectPrompt(
    prompt: Prompt,
    workspaceRoot: string,
  ): Promise<void> {
    if (prompt.meta.type !== "project") {
      throw new Error("Can only sync project prompts to project rules");
    }

    const ide = await this.environmentDetector.detect();
    const targetPath = await this.environmentDetector.getRulesPath(
      "project",
      workspaceRoot,
    );

    this.logger.info(`Syncing project prompt to ${targetPath} (IDE: ${ide})`);
    await fs.writeFile(targetPath, prompt.content);
  }

  /**
   * Delete a prompt from the store
   */
  async deletePrompt(prompt: Prompt): Promise<void> {
    const promptDir = path.join(this.getPromptDir(), prompt.meta.type);
    const filepath = path.join(promptDir, `${prompt.meta.id}.toml`);

    try {
      await fs.unlink(filepath);
      this.logger.info(`Deleted prompt: ${prompt.meta.name}`);
    } catch (error) {
      this.logger.error("Failed to delete prompt:", error);
      throw error;
    }
  }

  /**
   * Create a new empty prompt
   */
  async createPrompt(type: PromptType): Promise<Prompt> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .replace(/[TZ]/g, "_")
      .slice(0, -4);

    const prompt: Prompt = {
      meta: {
        type,
        id: timestamp,
        name: "New Prompt",
        description: "No description yet",
        author: "User",
        version: "0.0.1",
        date: new Date().toISOString(),
        license: "MIT",
      },
      content: `
# Enter your prompt content here...`,
    };

    await this.savePrompt(prompt);
    return prompt;
  }
}
