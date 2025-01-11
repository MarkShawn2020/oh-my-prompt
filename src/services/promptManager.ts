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
import * as TOML from "@iarna/toml";
import { v4 as uuidv4 } from "uuid";
import git from "simple-git";

import { Prompt, PromptMeta, PromptType } from "../types/prompt";
import { Service } from "typedi";
import { EnvironmentDetector } from "./environmentDetector";
import { VscodeLogger } from "../vscode-logger";
import { formatError } from "@oh-my-commit/shared";
import { DocumentWatcher } from "../document-watcher"; // Add this line

@Service()
export class PromptManager {
  private readonly PROMPT_DIR = "~/.oh-my-prompt/prompts";
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private extensionContext?: vscode.ExtensionContext;
  private pendingImportItem?: vscode.StatusBarItem;
  private documentWatcher: DocumentWatcher; // Add this line

  constructor(
    public environmentDetector: EnvironmentDetector,
    private logger: VscodeLogger,
    documentWatcher: DocumentWatcher, // Add this line
  ) {
    this.documentWatcher = documentWatcher; // Add this line
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

  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load all prompts of a specific type
   */
  async loadPrompts(
    type: PromptType,
  ): Promise<Array<{ prompt: Prompt; path: string }>> {
    const promptDir = path.join(this.getPromptDir(), type);
    try {
      const files = await fs.readdir(promptDir);
      const prompts = await Promise.all(
        files
          .filter((file) => file.endsWith(".toml"))
          .map(async (file) => {
            const filePath = path.join(promptDir, file);
            try {
              const content = await fs.readFile(filePath, "utf-8");

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

              const prompt = {
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

              return { prompt, path: filePath };
            } catch (error) {
              this.logger.error(
                `Failed to parse prompt file ${filePath}:`,
                error,
              );
              return { prompt: null, path: filePath };
            }
          }),
      );
      return prompts.filter((item) => item.prompt !== null);
    } catch (error) {
      this.logger.error(`Failed to load ${type} prompts:`, error);
      return [];
    }
  }

  /**
   * Delete a prompt file by path
   */
  async deletePromptFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.info(`Deleted prompt file: ${filePath}`);
    } catch (error) {
      this.logger.error("Failed to delete prompt file:", error);
      throw error;
    }
  }

  /**
   * Create a new empty prompt
   */
  public async createPrompt(type: PromptType): Promise<Prompt> {
    const prompt = await this.createPromptUnsaved(type);
    const promptDir = path.join(this.getPromptDir(), type);
    await fs.mkdir(promptDir, { recursive: true });
    const filePath = path.join(promptDir, `${prompt.meta.id}.toml`);
    await this.writePromptToFile(prompt, filePath);
    return prompt;
  }

  /**
   * Create a new empty prompt without saving
   */
  private async createPromptUnsaved(type: PromptType): Promise<Prompt> {
    const meta: PromptMeta = {
      id: uuidv4(),
      type,
      name: "New Prompt",
      description: "",
      version: "0.1.0",
      author: "User",
      date: new Date().toISOString(),
      license: "MIT",
    };

    return {
      meta,
      content: "",
    };
  }

  /**
   * Save prompt content to file
   */
  public async savePrompt(prompt: Prompt): Promise<void> {
    const promptDir = path.join(this.getPromptDir(), prompt.meta.type);
    await fs.mkdir(promptDir, { recursive: true });
    const filePath = path.join(promptDir, `${prompt.meta.id}.toml`);
    await this.writePromptToFile(prompt, filePath);
  }

  /**
   * Write prompt content to a file
   */
  private async writePromptToFile(
    prompt: Prompt,
    filePath: string,
  ): Promise<void> {
    try {
      const content = TOML.stringify(prompt);
      await fs.writeFile(filePath, content, "utf-8");
    } catch (error) {
      this.logger.error(`Failed to write prompt to file:`, error);
      throw new Error(`Failed to write prompt to file: ${formatError(error)}`);
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
   * Import rules from IDE into a temporary prompt
   */
  async importFromIdeRulesUnsaved(
    type: PromptType,
  ): Promise<Prompt | undefined> {
    try {
      const workspaceRoot =
        type === "project"
          ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          : undefined;

      const rulesPath = await this.environmentDetector.getRulesPath(
        type,
        workspaceRoot,
      );

      const content = await fs.readFile(rulesPath, "utf-8");
      const ide = await this.environmentDetector.detect();

      // Parse metadata from content if available
      const metaMatch = content.match(/---\n([\s\S]*?)\n---/);
      let title = "Untitled";
      let version = "0.0.1";
      let author = "User";

      if (metaMatch) {
        const metaContent = metaMatch[1];
        const titleMatch = metaContent.match(/title:\s*(.+)/);
        const versionMatch = metaContent.match(/version:\s*(.+)/);
        const authorMatch = metaContent.match(/author:\s*(.+)/);

        if (titleMatch) title = titleMatch[1].trim();
        if (versionMatch) version = versionMatch[1].trim();
        if (authorMatch) author = authorMatch[1].trim();
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "")
        .replace(/[TZ]/g, "_")
        .slice(0, -4);
      const sanitizedTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const promptId = `${sanitizedTitle}_${timestamp}`;

      return {
        meta: {
          type,
          id: promptId,
          name: title,
          description: `${ide} ${type} Rules - Created ${new Date().toLocaleString()}`,
          author,
          version,
          date: new Date().toISOString(),
          license: "MIT",
        },
        content,
      };
    } catch (error) {
      this.logger.error(`Failed to import ${type} rules from IDE:`, error);
      vscode.window.showErrorMessage(
        `Failed to import ${type} rules: ${formatError(error)}`,
      );
      return undefined;
    }
  }

  /**
   * Sync a global prompt to the current IDE's global rules location
   */
  async syncGlobalPrompt(prompt: Prompt): Promise<void> {
    if (prompt.meta.type !== "global") {
      throw new Error("Can only sync global prompts");
    }

    // Get the IDE rules file path
    const ideRulesPath = await this.environmentDetector.getRulesPath("global");
    if (!ideRulesPath) {
      throw new Error("No IDE rules file found");
    }

    try {
      await fs.writeFile(ideRulesPath, prompt.content, "utf-8");
      this.documentWatcher.markSynced(ideRulesPath);
      this.logger.info(
        `Synced prompt "${prompt.meta.name}" to IDE rules file: ${ideRulesPath}`,
      );
    } catch (error) {
      this.logger.error("Failed to sync prompt to IDE rules:", error);
      throw error;
    }
  }

  /**
   * Sync a project prompt to the current IDE's project rules location
   */
  async syncProjectPrompt(
    prompt: Prompt,
    workspaceRoot: string,
  ): Promise<void> {
    if (prompt.meta.type !== "project") {
      throw new Error("Can only sync project prompts");
    }

    // Get the IDE rules file path
    const ideRulesPath = await this.environmentDetector.getRulesPath(
      "project",
      workspaceRoot,
    );
    if (!ideRulesPath) {
      throw new Error("No IDE rules file found");
    }

    try {
      await fs.writeFile(ideRulesPath, prompt.content, "utf-8");
      this.documentWatcher.markSynced(ideRulesPath);
      this.logger.info(
        `Synced prompt "${prompt.meta.name}" to IDE rules file: ${ideRulesPath}`,
      );
    } catch (error) {
      this.logger.error("Failed to sync prompt to IDE rules:", error);
      throw error;
    }
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

          // Create watcher for the rules file
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
              path.dirname(rulesPath),
              path.basename(rulesPath),
            ),
            false, // Only trigger watcher for external changes
          );

          watcher.onDidChange(async () => {
            try {
              const ide = await this.environmentDetector.detect();
              const content = await fs.readFile(rulesPath, "utf-8");
              const prompts = await this.loadPrompts(type);
              const currentPrompt = prompts.find(
                (p) => p.prompt.content === content,
              );

              if (!currentPrompt) {
                const answer = await vscode.window.showInformationMessage(
                  `${ide} ${type} rules have been modified. Would you like to import the changes?`,
                  {
                    modal: false,
                    detail:
                      "The changes can be imported as a new prompt in Oh My Prompt",
                  },
                  "Import Now",
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
                  }
                }
              }
            } catch (error) {
              this.logger.error(`Failed to handle rules file change:`, error);
            }
          });

          watcher.onDidCreate(async () => {
            this.logger.info(`Rules file created: ${rulesPath}`);
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

  dispose() {
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    this.pendingImportItem?.dispose();
  }
}
