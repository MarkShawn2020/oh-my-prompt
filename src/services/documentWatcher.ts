/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as TOML from "@iarna/toml";
import { formatError } from "@oh-my-commit/shared";
import * as path from "path";
import { Service } from "typedi";
import * as vscode from "vscode";
import { PromptSchema, PromptType } from "../types/prompt";
import { VscodeLogger } from "../vscode-logger";
import { EnvironmentDetector } from "./environmentDetector";
import { PromptManager } from "./promptManager";

@Service()
export class DocumentWatcher {
  private disposables: vscode.Disposable[] = [];
  private syncOperations = new Set<string>();

  constructor(
    private readonly promptManager: PromptManager,
    private readonly environmentDetector: EnvironmentDetector,
    private readonly logger: VscodeLogger,
  ) {}

  /**
   * Track a sync operation for a specific file
   */
  async trackSyncOperation(
    filePath: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      // 记录同步操作
      this.syncOperations.add(filePath);
      this.logger.info(`Starting sync operation for: ${filePath}`);

      // 执行操作
      await operation();
    } finally {
      // 完成后移除记录
      this.syncOperations.delete(filePath);
      this.logger.info(`Completed sync operation for: ${filePath}`);
    }
  }

  /**
   * Check if a file is currently being synced
   */
  private isSyncing(filePath: string): boolean {
    return this.syncOperations.has(filePath);
  }

  /**
   * Start watching documents
   */
  start() {
    // Watch for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        try {
          const document = event.document;
          const filePath = document.uri.fsPath;

          // 如果文件正在被同步，忽略这个事件
          if (this.isSyncing(filePath)) {
            this.logger.info(
              `Ignoring change event for syncing file: ${filePath}`,
            );
            return;
          }

          // Check if this is a rules file
          const type = await this.getRulesType(filePath);
          if (!type) {
            return;
          }

          this.logger.info(`Rules file changed: ${filePath}`);

          // Get current prompts
          const prompts = await this.promptManager.loadPrompts(type);
          const content = document.getText();

          // Find if we already have this content
          const existingPrompt = prompts.find(
            (p) => p.prompt.content === content,
          );

          if (!existingPrompt) {
            const answer = await vscode.window.showInformationMessage(
              `Do you want to save the current ${type} rules as a new prompt?`,
              "Save",
              "Ignore",
            );

            if (answer === "Save") {
              const prompt =
                await this.promptManager.importFromIdeRulesUnsaved(type);
              if (prompt) {
                await this.promptManager.savePrompt(prompt);
                vscode.window.showInformationMessage(
                  "Rules saved as new prompt successfully",
                );
              }
            }
          }
        } catch (error) {
          this.logger.error("Failed to handle document change:", error);
        }
      }),
    );

    // Watch for document saves
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        try {
          const filePath = document.uri.fsPath;
          const promptDir = this.promptManager.getPromptDir();
          const relativePath = path.relative(promptDir, filePath);
          const type = relativePath.split(path.sep)[0] as PromptType;

          // Skip temp files
          if (relativePath.startsWith(".temp")) {
            return;
          }

          // Handle prompt file save
          if (filePath.startsWith(promptDir) && filePath.endsWith(".toml")) {
            await this.trackSyncOperation(filePath, async () => {
              // Parse the TOML content
              const documentContent = document.getText();
              let parsedContent: any;
              try {
                parsedContent = TOML.parse(documentContent);
              } catch (error) {
                throw new Error(`Invalid TOML format: ${formatError(error)}`);
              }

              // Validate with Zod schema
              this.logger.info("omp prompt: ", {
                documentContent,
                parsedContent,
              });
              const validationResult = PromptSchema.safeParse(parsedContent);
              this.logger.info({ validationResult });
              if (!validationResult.success) {
                const errors = validationResult.error.errors
                  .map((err) => `${err.path.join(".")}: ${err.message}`)
                  .join("\n");
                throw new Error(`Invalid prompt format:\n${errors}`);
              }

              const prompt = {
                meta: {
                  ...validationResult.data.meta,
                  type, // Override type from file path
                },
                content: validationResult.data.content,
              };

              if (type === "global") {
                await this.promptManager.syncGlobalPrompt(prompt);
              } else {
                const workspaceRoot =
                  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspaceRoot) {
                  throw new Error("Workspace root not found");
                }
                await this.promptManager.syncProjectPrompt(
                  prompt,
                  workspaceRoot,
                );
              }

              vscode.window.showInformationMessage(
                `Successfully applied changes to ${type} rules`,
              );
            });
          }
        } catch (error) {
          this.logger.error("Failed to handle document save:", error);
        }
      }),
    );
  }

  /**
   * Get rules type from file path
   */
  private async getRulesType(
    filePath: string,
  ): Promise<PromptType | undefined> {
    try {
      const globalRulesPath =
        await this.environmentDetector.getRulesPath("global");
      if (filePath === globalRulesPath) {
        return "global";
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const projectRulesPath = await this.environmentDetector.getRulesPath(
          "project",
          workspaceRoot,
        );
        if (filePath === projectRulesPath) {
          return "project";
        }
      }
    } catch (error) {
      this.logger.error("Failed to get rules type:", error);
    }
    return undefined;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
