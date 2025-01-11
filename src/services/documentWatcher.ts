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
import { PromptSchema, PromptType } from "../types/prompt";
import { VscodeLogger } from "../vscode-logger";
import { EnvironmentDetector } from "./environmentDetector";
import { PromptManager } from "./promptManager";

@Service()
export class DocumentWatcher {
  private disposables: vscode.Disposable[] = [];
  private syncOperations = new Set<string>();
  private fileChangeEmitter = new vscode.EventEmitter<{
    type: PromptType;
    content: string;
  }>();

  constructor(
    private readonly promptManager: PromptManager,
    private readonly environmentDetector: EnvironmentDetector,
    private readonly logger: VscodeLogger,
  ) {}

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

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.fileChangeEmitter.dispose();
  }
}
