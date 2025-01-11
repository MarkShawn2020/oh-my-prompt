/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { formatError } from "@oh-my-commit/shared";
import * as fs from "fs";
import capitalize from "lodash/capitalize";
import * as path from "path";
import { Service } from "typedi";
import * as vscode from "vscode";
import { DocumentWatcher } from "../services/documentWatcher";
import { EnvironmentDetector } from "../services/environmentDetector";
import { PromptManager } from "../services/promptManager";
import { Prompt, PromptType } from "../types/prompt";
import { VscodeLogger } from "../vscode-logger";

const PRIORITY = 103;

@Service()
export class StatusBarItems {
  private globalPromptItem!: vscode.StatusBarItem;
  private projectPromptItem!: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly promptManager: PromptManager,
    private readonly environmentDetector: EnvironmentDetector,
    private readonly logger: VscodeLogger,
    private readonly documentWatcher: DocumentWatcher,
  ) {
    this.initializeStatusBarItems();
  }

  private async initializeStatusBarItems() {
    this.globalPromptItem = await this.createStatusBarItem("global");
    this.projectPromptItem = await this.createStatusBarItem("project");
    this.updateStatusBarItems();
  }

  private async createStatusBarItem(
    type: PromptType,
  ): Promise<vscode.StatusBarItem> {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      PRIORITY,
    );

    item.name = `${type} Prompt`;
    const Ctype = capitalize(type);
    item.text = Ctype;
    item.command = `oh-my-prompt.manage${Ctype}Prompts`;

    // 监听规则文件变更
    this.disposables.push(
      this.documentWatcher.onDidChangeRules(
        async ({ type: changedType, content }) => {
          this.logger.info(`Received rules change event:`, {
            itemType: type,
            changedType,
            hasContent: !!content,
          });

          if (type === changedType) {
            try {
              // 更新 tooltip
              const markdown = new vscode.MarkdownString(
                [content || "No content", "", "_Click to manage prompts_"].join(
                  "\n",
                ),
              );
              markdown.isTrusted = true;
              markdown.supportHtml = true;
              item.tooltip = markdown;

              // 确保状态栏可见
              item.show();

              this.logger.info(`Updated status bar item for ${type}`);
            } catch (error) {
              this.logger.error(
                `Failed to update status bar item for ${type}:`,
                error,
              );
            }
          }
        },
      ),
    );

    // 初始化 tooltip
    const tooltip = await this.updateTooltip(type);
    item.tooltip = tooltip;
    item.show();

    return item;
  }

  /**
   * Update tooltip with IDE prompt content
   */
  private async updateTooltip(
    type: PromptType,
  ): Promise<vscode.MarkdownString> {
    try {
      const workspaceRoot =
        type === "project"
          ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          : undefined;

      const rulesPath = await this.environmentDetector.getRulesPath(
        type,
        workspaceRoot,
      );

      let content: string;
      try {
        content = await fs.promises.readFile(rulesPath, "utf-8");
      } catch (error) {
        this.logger.error(`Failed to read rules file: ${rulesPath}`, error);
        content = "No content";
      }

      const tooltipLines = [content, "", "_Click to manage prompts_"];
      const markdown = new vscode.MarkdownString(tooltipLines.join("\n"));
      markdown.isTrusted = true;
      markdown.supportHtml = true;
      return markdown;
    } catch (error) {
      this.logger.error("Failed to update tooltip:", error);
      const markdown = new vscode.MarkdownString(
        "Failed to load prompt content. Click to manage prompts.",
      );
      markdown.isTrusted = true;
      markdown.supportHtml = true;
      return markdown;
    }
  }

  /**
   * Update both status bar items
   */
  private updateStatusBarItems() {
    try {
      this.globalPromptItem.show();
      this.projectPromptItem.show();
    } catch (error) {
      this.logger.error("Failed to update status bar items:", error);
    }
  }

  /**
   * Show the prompt quick pick UI
   */
  async showPromptQuickPick(type: PromptType) {
    try {
      const promptResults = await this.promptManager.loadPrompts(type);

      // Define a custom type for prompt items
      type PromptQuickPickItem = vscode.QuickPickItem & {
        prompt?: Prompt | null;
        path?: string;
        error?: string;
      };

      const items: PromptQuickPickItem[] = promptResults.map(
        ({ prompt, path, error }) => {
          if (error) {
            return {
              label: `$(error) ${path.split("/").pop()}`,
              description: "Error loading prompt",
              detail: `Error: ${error}`,
              buttons: [
                {
                  iconPath: new vscode.ThemeIcon("edit"),
                  tooltip: "Edit TOML file",
                },
                {
                  iconPath: new vscode.ThemeIcon("trash"),
                  tooltip: "Delete prompt",
                },
              ],
              prompt: null,
              path,
              error,
              decorations: {
                tooltip: error,
                colors: {
                  foreground: new vscode.ThemeColor("errorForeground"),
                  background: new vscode.ThemeColor("errorBackground"),
                },
              },
            };
          }
          return {
            label: prompt!.meta.name,
            description: prompt!.meta.description,
            detail: `Version: ${prompt!.meta.version} | Author: ${prompt!.meta.author} | Date: ${prompt!.meta.date}`,
            buttons: [
              {
                iconPath: new vscode.ThemeIcon("edit"),
                tooltip: "Edit TOML file",
              },
              {
                iconPath: new vscode.ThemeIcon("trash"),
                tooltip: "Delete prompt",
              },
            ],
            prompt,
            path,
          };
        },
      );

      const defaultItems: PromptQuickPickItem[] = [
        {
          label: "$(edit) Edit Current",
          description: `Edit ${type} rules in IDE directly`,
          alwaysShow: true,
          kind: vscode.QuickPickItemKind.Default,
        },
        {
          label: "$(plus) Create New",
          description: `Create a new ${type} prompt`,
          alwaysShow: true,
          kind: vscode.QuickPickItemKind.Default,
        },
        {
          label: "$(cloud-download) Import from IDE",
          description: `Import existing ${type} rules from IDE`,
          alwaysShow: true,
          kind: vscode.QuickPickItemKind.Default,
        },
        { kind: vscode.QuickPickItemKind.Separator, label: "Prompts" },
      ];

      const quickPick = vscode.window.createQuickPick<PromptQuickPickItem>();
      quickPick.items = [...defaultItems, ...items];
      quickPick.title = `Select ${type} Prompt`;
      quickPick.placeholder = "Choose a prompt or create a new one";
      quickPick.show();

      // Handle button clicks
      quickPick.onDidTriggerItemButton(async (event) => {
        try {
          const button = event.button;
          const item = event.item as PromptQuickPickItem;

          if (!item.path) {
            return;
          }

          if (button.tooltip === "Edit TOML file") {
            const doc = await vscode.workspace.openTextDocument(item.path);
            await vscode.window.showTextDocument(doc);
          } else if (button.tooltip === "Delete prompt") {
            const answer = await vscode.window.showWarningMessage(
              `Are you sure you want to delete this prompt?`,
              { modal: true },
              "Confirm",
            );
            if (answer === "Confirm") {
              await this.promptManager.deletePromptFile(item.path);
              // Keep default items and filter out the deleted prompt
              quickPick.items = [
                ...defaultItems,
                ...items.filter((i) => i.path !== item.path),
              ];
            }
          }
        } catch (error) {
          this.logger.error("Failed to handle button click:", error);
          vscode.window.showErrorMessage(`Failed to handle button: ${error}`);
        }
      });

      // Handle selection
      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (!selected) {
          return;
        }

        try {
          if (selected.label === "$(plus) Create New") {
            const prompt = await this.promptManager.createPrompt(type);
            const filePath = this.getPromptTomlPath(prompt);
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
            quickPick.hide();
          } else if (selected.label === "$(cloud-download) Import from IDE") {
            const prompt =
              await this.promptManager.importFromIdeRulesUnsaved(type);
            if (prompt) {
              // Save the imported prompt directly
              await this.promptManager.savePrompt(prompt);
              const filePath = this.getPromptTomlPath(prompt);
              const doc = await vscode.workspace.openTextDocument(filePath);
              await vscode.window.showTextDocument(doc);
              quickPick.hide();
            }
          } else if (selected.label === "$(edit) Edit Current") {
            const workspaceRoot =
              type === "project"
                ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                : undefined;
            const rulesPath = await this.environmentDetector.getRulesPath(
              type,
              workspaceRoot,
            );
            this.logger.info(`Opening ${type} rules file in IDE: ${rulesPath}`);
            const doc = await vscode.workspace.openTextDocument(rulesPath);
            await vscode.window.showTextDocument(doc);
            quickPick.hide();
          } else {
            const item = selected as PromptQuickPickItem;
            if (item.error) {
              const doc = await vscode.workspace.openTextDocument(item.path!);
              await vscode.window.showTextDocument(doc);
              quickPick.hide();
              return;
            }
            if (item.prompt) {
              // 同步到 IDE
              try {
                if (type === "global") {
                  await this.promptManager.syncGlobalPrompt(item.prompt);
                } else {
                  const workspaceRoot =
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  if (workspaceRoot) {
                    await this.promptManager.syncProjectPrompt(
                      item.prompt,
                      workspaceRoot,
                    );
                  }
                }
                vscode.window.showInformationMessage(
                  `Prompt "${item.prompt.meta.name}" has been synced to IDE`,
                );
              } catch (error) {
                this.logger.error("Failed to sync prompt to IDE:", error);
                vscode.window.showErrorMessage(
                  `Failed to sync prompt: ${error}`,
                );
              }

              quickPick.hide();
            }
          }
        } catch (error) {
          this.logger.error("Failed to handle quickpick selection:", error);
          vscode.window.showErrorMessage(
            `Failed to handle selection: ${formatError(error)}`,
          );
        }
      });
    } catch (error) {
      this.logger.error(`Failed to show ${type} prompt quick pick:`, error);
      vscode.window.showErrorMessage(
        `Failed to show prompt selection: ${formatError(error)}`,
      );
    }
  }

  /**
   * Get the absolute path to a prompt's TOML file
   */
  private getPromptTomlPath(prompt: Prompt): string {
    return path.join(
      this.promptManager.getPromptDir(),
      prompt.meta.type,
      `${prompt.meta.id}.toml`,
    );
  }

  dispose() {
    this.globalPromptItem.dispose();
    this.projectPromptItem.dispose();
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}
