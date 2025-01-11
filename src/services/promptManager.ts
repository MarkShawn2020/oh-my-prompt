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

interface PendingImport {
  type: PromptType;
  path: string;
  timestamp: string;
}

@Service()
export class PromptManager {
  private readonly PROMPT_DIR = "~/.oh-my-prompt/prompts";
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private extensionContext?: vscode.ExtensionContext;
  private pendingImportItem?: vscode.StatusBarItem;

  constructor(
    private environmentDetector: EnvironmentDetector,
    private logger: VscodeLogger,
  ) {
    this.ensurePromptDirectories();
  }

  /**
   * Initialize the manager with extension context
   */
  initialize(context: vscode.ExtensionContext) {
    this.extensionContext = context;
    this.watchIdeRules();
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

  /**
   * Import a prompt from IDE rules file
   */
  async importFromIdeRules(type: PromptType): Promise<Prompt | null> {
    try {
      const workspaceRoot =
        type === "project"
          ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          : undefined;

      const rulesPath = await this.environmentDetector.getRulesPath(
        type,
        workspaceRoot,
      );
      this.logger.info(`Importing ${type} rules from: ${rulesPath}`);

      if (await this.fileExists(rulesPath)) {
        const content = await fs.readFile(rulesPath, "utf-8");
        const ide = await this.environmentDetector.detect();

        // Generate a unique timestamp-based ID
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "")
          .replace(/[TZ]/g, "_")
          .slice(0, -4);

        // Create an imported prompt
        const prompt: Prompt = {
          meta: {
            type,
            id: `imported_${ide.toLowerCase()}_${timestamp}`,
            name: `Imported from ${ide}`,
            description: `Rules imported from ${ide} at ${new Date().toLocaleString()}`,
            author: "IDE Import",
            version: "0.0.1",
            date: new Date().toISOString(),
            license: "MIT",
          },
          content,
        };

        await this.savePrompt(prompt);
        this.logger.info(`Imported ${type} rules from ${ide}`);
        return prompt;
      } else {
        this.logger.info(`No ${type} rules file found at: ${rulesPath}`);
        return null;
      }
    } catch (error) {
      this.logger.error(`Failed to import ${type} rules:`, error);
      throw error; // Re-throw to handle in UI
    }
  }

  /**
   * Check if there are unsaved changes in IDE rules file
   */
  async hasUnsavedChanges(type: PromptType): Promise<boolean> {
    try {
      const workspaceRoot =
        type === "project"
          ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          : undefined;

      const rulesPath = await this.environmentDetector.getRulesPath(
        type,
        workspaceRoot,
      );
      this.logger.info(
        `Checking for changes in ${type} rules at: ${rulesPath}`,
      );

      if (await this.fileExists(rulesPath)) {
        const content = await fs.readFile(rulesPath, "utf-8");
        const prompts = await this.loadPrompts(type);
        const currentPrompt = prompts.find((p) => p.content === content);
        return !currentPrompt;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to check for unsaved changes:`, error);
      throw error; // Re-throw to handle in UI
    }
  }

  /**
   * Handle sync conflicts between IDE rules and prompts
   */
  async handleSyncConflict(type: PromptType): Promise<void> {
    try {
      const ide = await this.environmentDetector.detect();
      const rulesPath = await this.environmentDetector.getRulesPath(type);

      if (await this.fileExists(rulesPath)) {
        const content = await fs.readFile(rulesPath, "utf-8");
        const prompts = await this.loadPrompts(type);
        const currentPrompt = prompts.find((p) => p.content === content);

        if (!currentPrompt) {
          const answer = await vscode.window.showWarningMessage(
            `Detected changes in ${ide} ${type} rules. What would you like to do?`,
            { modal: true },
            "Import as New",
            "Keep Current",
          );

          if (answer === "Import as New") {
            await this.importFromIdeRules(type);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to handle sync conflict:`, error);
    }
  }

  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
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
   * Watch IDE rules files for changes
   */
  private async watchIdeRules() {
    if (!this.extensionContext) {
      this.logger.error("Extension context not initialized");
      return;
    }

    try {
      // Clear existing watchers
      this.fileWatchers.forEach((watcher) => watcher.dispose());
      this.fileWatchers.clear();

      // Clear existing pending import item
      this.pendingImportItem?.dispose();

      const types: PromptType[] = ["global", "project"];
      for (const type of types) {
        try {
          const workspaceRoot =
            type === "project"
              ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
              : undefined;

          const rulesPath = await this.environmentDetector.getRulesPath(
            type,
            workspaceRoot,
          );
          const rulesUri = vscode.Uri.file(rulesPath);

          // Create watcher for the rules file
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
              path.dirname(rulesPath),
              path.basename(rulesPath),
            ),
          );

          watcher.onDidChange(async () => {
            try {
              const ide = await this.environmentDetector.detect();
              const content = await fs.readFile(rulesPath, "utf-8");
              const prompts = await this.loadPrompts(type);
              const currentPrompt = prompts.find((p) => p.content === content);

              if (!currentPrompt) {
                const answer = await vscode.window.showInformationMessage(
                  `${ide} ${type} rules have been modified. Would you like to import the changes?`,
                  {
                    modal: false,
                    detail:
                      "The changes can be imported as a new prompt in Oh My Prompt",
                  },
                  "Import Now",
                  "Import Later",
                );

                if (answer === "Import Now") {
                  const prompt = await this.importFromIdeRules(type);
                  if (prompt) {
                    const tomlPath = path.join(
                      this.getPromptDir(),
                      type,
                      `${prompt.meta.id}.toml`,
                    );
                    const doc =
                      await vscode.workspace.openTextDocument(tomlPath);
                    await vscode.window.showTextDocument(doc);
                    vscode.window.showInformationMessage(
                      `Successfully imported ${type} rules from ${ide}`,
                    );
                  }
                }
              }
            } catch (error) {
              this.logger.error(`Failed to handle rules file change:`, error);
            }
          });

          this.fileWatchers.set(rulesPath, watcher);
          this.logger.info(`Watching ${type} rules at: ${rulesPath}`);
        } catch (error) {
          this.logger.error(
            `Failed to setup watcher for ${type} rules:`,
            error,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to setup rule watchers:`, error);
    }
  }

  /**
   * Import pending rules that were deferred
   */
  async importPendingRules(): Promise<void> {
    if (!this.extensionContext) {
      throw new Error("Extension context not initialized");
    }

    const pendingImport =
      this.extensionContext.workspaceState.get<PendingImport>("pendingImport");
    if (pendingImport) {
      try {
        const prompt = await this.importFromIdeRules(pendingImport.type);
        if (prompt) {
          const tomlPath = path.join(
            this.getPromptDir(),
            pendingImport.type,
            `${prompt.meta.id}.toml`,
          );
          const doc = await vscode.workspace.openTextDocument(tomlPath);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(
            `Successfully imported ${pendingImport.type} rules`,
          );
        }
        // Clear the pending import
        this.extensionContext.workspaceState.update("pendingImport", undefined);
        // Hide the status bar item
        this.pendingImportItem?.dispose();
      } catch (error) {
        this.logger.error(`Failed to import pending rules:`, error);
        throw error;
      }
    }
  }

  dispose() {
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    this.pendingImportItem?.dispose();
  }
}
