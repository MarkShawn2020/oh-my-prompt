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
  private logger: VscodeLogger;
  // 记录最近同步的文件路径
  private recentlySyncedFiles = new Set<string>();
  private syncLock = false;
  private syncTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly promptManager: PromptManager,
    private readonly environmentDetector: EnvironmentDetector,
  ) {
    this.logger = new VscodeLogger("DocumentWatcher");
  }

  /**
   * Lock sync operations to prevent circular updates
   */
  async acquireSyncLock(): Promise<void> {
    this.syncLock = true;
    // 自动释放锁，以防止死锁
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => {
      this.releaseSyncLock();
    }, 1000); // 1秒后自动释放锁
  }

  /**
   * Release sync lock
   */
  releaseSyncLock(): void {
    this.syncLock = false;
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
  }

  /**
   * Mark a file as recently synced
   */
  markSynced(filePath: string) {
    this.recentlySyncedFiles.add(filePath);
    // 5秒后自动清除标记
    setTimeout(() => {
      this.recentlySyncedFiles.delete(filePath);
    }, 5000);
  }

  /**
   * Start watching documents
   */
  start() {
    if (this.disposables.length > 0) {
      return;
    }

    // Watch for document saves
    const saveDisposable = vscode.workspace.onDidSaveTextDocument(
      async (document) => {
        if (this.syncLock) {
          this.logger.info("Sync locked, skipping document save event");
          return;
        }

        try {
          const filePath = document.uri.fsPath;
          const promptDir = this.promptManager.getPromptDir();

          // Check if this is an IDE rules file (global or project)
          const globalRulesPath =
            await this.environmentDetector.getRulesPath("global");
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const projectRulesPath = workspaceRoot
            ? await this.environmentDetector.getRulesPath(
                "project",
                workspaceRoot,
              )
            : undefined;

          const normalizedPath = path.normalize(filePath);
          const isIdeRule = [globalRulesPath, projectRulesPath]
            .filter(Boolean)
            .map((p) => path.normalize(p!))
            .includes(normalizedPath);

          if (isIdeRule) {
            await this.acquireSyncLock();
            this.handleIdePromptSave(document);
            this.releaseSyncLock();
            return;
          }

          // Handle prompt file save
          if (filePath.startsWith(promptDir) && filePath.endsWith(".toml")) {
            await this.acquireSyncLock();
            this.handleOmpPromptSave(document);
            this.releaseSyncLock();
            return;
          }
        } catch (error) {
          this.logger.error("Failed to handle document save:", error);
        }
      },
    );

    // Watch for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        try {
          const document = event.document;
          const filePath = document.uri.fsPath;

          // Skip if file was recently synced
          if (this.recentlySyncedFiles.has(filePath)) {
            return;
          }

          // Check if this is a rules file
          const type = await this.getRulesType(filePath);
          if (!type) {
            return;
          }

          // Only handle manual edits in the editor
          if (
            event.reason !== vscode.TextDocumentChangeReason.Undo &&
            event.reason !== vscode.TextDocumentChangeReason.Redo &&
            !event.contentChanges.some((change) => change.text !== "")
          ) {
            return;
          }

          this.logger.info(`Rules file changed by user: ${filePath}`);

          // Get current prompts
          const prompts = await this.promptManager.loadPrompts(type);
          const content = document.getText();

          // Skip if content is synced from prompt list
          if (content.startsWith("<!-- synced from prompt:")) {
            return;
          }

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

    this.disposables.push(saveDisposable);
  }

  /**
   * Handle saving of a rules file
   */
  private async handleIdePromptSave(document: vscode.TextDocument) {
    const filePath = document.uri.fsPath;

    // Determine if this is a global or project rules file
    const globalRulesPath =
      await this.environmentDetector.getRulesPath("global");
    const isGlobal =
      path.normalize(filePath) === path.normalize(globalRulesPath);
    const type = isGlobal ? "global" : "project";

    const ide = await this.environmentDetector.detect();
    const answer = await vscode.window.showInformationMessage(
      `${ide} project rules have been saved. Would you like to apply the changes?`,
      {
        modal: false,
        detail: "The changes can be imported as a new prompt in Oh My Prompt",
      },
      "Apply Now",
    );

    if (answer === "Apply Now") {
      const prompt = await this.promptManager.importFromIdeRules(type);
      if (prompt) {
        const tomlPath = path.join(
          this.promptManager.getPromptDir(),
          type,
          `${prompt.meta.id}.toml`,
        );
        const doc = await vscode.workspace.openTextDocument(tomlPath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `Successfully applied project rules from ${ide}`,
        );
      }
    }

    this.logger.info(
      `Project rules saved: ${filePath}. User ${
        answer === "Apply Now" ? "applied" : "skipped"
      } the changes.`,
    );
  }

  /**
   * Handle saving of a prompt file of Oh My Prompt system
   */
  private async handleOmpPromptSave(document: vscode.TextDocument) {
    const filePath = document.uri.fsPath;
    const promptDir = this.promptManager.getPromptDir();
    const relativePath = path.relative(promptDir, filePath);
    const type = relativePath.split(path.sep)[0] as PromptType;

    // Skip temp files
    if (relativePath.startsWith(".temp")) {
      return;
    }

    const ide = await this.environmentDetector.detect();
    const answer = await vscode.window.showInformationMessage(
      `Prompt has been modified. Would you like to apply it to ${ide} ${type} rules?`,
      {
        modal: false,
        detail: "The changes will be synced to your IDE rules",
      },
      "Apply Now",
    );

    if (answer === "Apply Now") {
      try {
        // Parse the TOML content
        const documentContent = document.getText();
        let parsedContent: any;
        try {
          parsedContent = TOML.parse(documentContent);
        } catch (error) {
          throw new Error(`Invalid TOML format: ${formatError(error)}`);
        }

        // Validate with Zod schema
        this.logger.info("omp prompt: ", { documentContent, parsedContent });
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
          await this.promptManager.syncProjectPrompt(prompt, workspaceRoot);
        }

        vscode.window.showInformationMessage(
          `Successfully applied changes to ${ide} ${type} rules`,
        );
      } catch (error) {
        this.logger.error(`Failed to apply prompt changes:`, error);
        vscode.window.showErrorMessage(
          `Failed to apply changes: ${formatError(error)}`,
        );
      }
    }

    this.logger.info(
      `Prompt saved: ${filePath}. User ${
        answer === "Apply Now" ? "applied" : "skipped"
      } the changes.`,
    );
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }

  private async getRulesType(filePath: string): Promise<PromptType | null> {
    const globalRulesPath =
      await this.environmentDetector.getRulesPath("global");
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const projectRulesPath = workspaceRoot
      ? await this.environmentDetector.getRulesPath("project", workspaceRoot)
      : undefined;

    const normalizedPath = path.normalize(filePath);
    if (path.normalize(globalRulesPath) === normalizedPath) {
      return "global";
    } else if (
      projectRulesPath &&
      path.normalize(projectRulesPath) === normalizedPath
    ) {
      return "project";
    } else {
      return null;
    }
  }
}
