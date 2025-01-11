/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as TOML from "@iarna/toml";
import { formatError } from "@oh-my-commit/shared";
import * as fs from "fs";
import * as path from "path";
import { Service } from "typedi";
import * as vscode from "vscode";
import { PromptType, PromptSchema } from "../types/prompt";
import { PromptManager } from "./promptManager";
import { EnvironmentDetector } from "./environmentDetector";
import { VscodeLogger } from "../vscode-logger";

@Service()
export class DocumentWatcher {
  private disposables: vscode.Disposable[] = [];
  private syncOperations = new Set<string>();
  private fileChangeEmitter = new vscode.EventEmitter<{
    type: PromptType;
    content: string;
  }>();
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private extensionContext?: vscode.ExtensionContext;

  constructor(
    private readonly promptManager: PromptManager,
    private readonly environmentDetector: EnvironmentDetector,
    private readonly logger: VscodeLogger,
  ) {
    // 监听文件保存事件
    vscode.workspace.onDidSaveTextDocument(
      async (document) => {
        try {
          if (document.uri.fsPath.endsWith(".toml")) {
            const content = document.getText();
            try {
              // 验证文件内容
              PromptSchema.parse(TOML.parse(content));
            } catch (error) {
              // 显示错误通知
              vscode.window.showErrorMessage(
                `Invalid prompt file: ${error instanceof Error ? error.message : "Unknown error"}`,
                { modal: false },
              );
            }
          }
        } catch (error) {
          this.logger.error("Error validating prompt file:", error);
        }
      },
      null,
      this.disposables,
    );
  }

  /**
   * Get the event emitter for file changes
   */
  get onDidChangeRules(): vscode.Event<{ type: PromptType; content: string }> {
    return this.fileChangeEmitter.event;
  }

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

      // 手动触发文件变更事件
      const type = await this.getRulesType(filePath);
      if (type) {
        try {
          const content = await fs.promises.readFile(filePath, "utf-8");
          this.fileChangeEmitter.fire({ type, content });
          this.logger.info(`Manually fired change event for: ${filePath}`);
        } catch (error) {
          this.logger.error(
            `Failed to read file after sync: ${filePath}`,
            error,
          );
          this.fileChangeEmitter.fire({ type, content: "" });
        }
      }
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
  async start() {
    // 设置全局规则文件监听器
    const globalRulesPath =
      await this.environmentDetector.getRulesPath("global");
    this.watchRulesFile(globalRulesPath, "global");

    // 设置项目规则文件监听器
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const projectRulesPath = await this.environmentDetector.getRulesPath(
        "project",
        workspaceRoot,
      );
      this.watchRulesFile(projectRulesPath, "project");
    }

    // 监听工作区变化
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        const newWorkspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (newWorkspaceRoot) {
          const projectRulesPath = await this.environmentDetector.getRulesPath(
            "project",
            newWorkspaceRoot,
          );
          this.watchRulesFile(projectRulesPath, "project");
        }
      }),
    );
  }

  /**
   * Watch a rules file for changes
   */
  private watchRulesFile(rulesPath: string, type: PromptType) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      rulesPath,
      false,
      false,
      false,
    );

    const handleFileChange = async () => {
      if (this.isSyncing(rulesPath)) {
        this.logger.info(
          `Ignoring change event for syncing file: ${rulesPath}`,
        );
        return;
      }

      this.logger.info(`Detected change in rules file: ${rulesPath}`);

      try {
        const content = await fs.promises.readFile(rulesPath, "utf-8");
        this.fileChangeEmitter.fire({ type, content });
      } catch (error) {
        this.logger.error(`Failed to read rules file: ${rulesPath}`, error);
        this.fileChangeEmitter.fire({ type, content: "" });
      }
    };

    this.disposables.push(
      watcher,
      watcher.onDidChange(handleFileChange),
      watcher.onDidCreate(handleFileChange),
      watcher.onDidDelete(() => {
        this.fileChangeEmitter.fire({ type, content: "" });
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

  /**
   * Initialize the watcher with extension context
   */
  initialize(context: vscode.ExtensionContext) {
    this.extensionContext = context;
    this.watchIdeRules();
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
              const content = await fs.promises.readFile(rulesPath, "utf-8");
              const prompts = await this.promptManager.loadPrompts(type);
              const currentPrompt = prompts.find(
                (p) => p.prompt?.content === content,
              );

              if (!currentPrompt) {
                const answer = await vscode.window.showInformationMessage(
                  `${ide} ${type} rules have been modified. Would you like to sync the changes?`,
                  {
                    modal: false,
                    detail:
                      "The changes can be synced as a new prompt in Oh My Prompt",
                  },
                  "Sync Now",
                );

                if (answer === "Sync Now") {
                  const prompt =
                    await this.promptManager.importFromIdeRules(type);
                  if (prompt) {
                    const tomlPath = path.join(
                      this.promptManager.getPromptDir(),
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

  /**
   * Dispose all watchers
   */
  dispose() {
    this.fileWatchers.forEach((watcher) => watcher.dispose());
    this.fileWatchers.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
