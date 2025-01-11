/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as vscode from "vscode";
import { PromptManager } from "../services/promptManager";
import { Prompt, PromptType } from "../types/prompt";
import { Inject, Service } from "typedi";
import prettyjson from "prettyjson";
import { VscodeLogger } from "../vscode-logger";
import * as path from "path";

@Service()
export class StatusBarItems {
  private globalPromptItem: vscode.StatusBarItem;
  private projectPromptItem: vscode.StatusBarItem;
  private newPromptItem: vscode.StatusBarItem;
  private currentGlobalPrompt?: Prompt;
  private currentProjectPrompt?: Prompt;

  constructor(
    private promptManager: PromptManager,
    private logger: VscodeLogger,
  ) {
    this.globalPromptItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.projectPromptItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.newPromptItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );

    this.initializeItems();
    this.loadCurrentPrompts();
  }

  private async loadCurrentPrompts() {
    try {
      const [globalPrompts, projectPrompts] = await Promise.all([
        this.promptManager.loadPrompts("global"),
        this.promptManager.loadPrompts("project"),
      ]);

      if (globalPrompts.length > 0) {
        this.updatePromptItem("global", globalPrompts[0]);
      }
      if (projectPrompts.length > 0) {
        this.updatePromptItem("project", projectPrompts[0]);
      }
    } catch (error) {
      this.logger.error("Failed to load current prompts:", error);
    }
  }

  private initializeItems() {
    // Initialize new prompt button
    this.newPromptItem.text = "$(plus)";
    this.newPromptItem.tooltip = "Create a new prompt";
    this.newPromptItem.command = "oh-my-prompt.createPrompt";
    this.newPromptItem.show();

    // Initialize global prompt
    this.globalPromptItem.text = "$(globe)";
    this.globalPromptItem.command = "oh-my-prompt.selectGlobalPrompt";
    this.updateTooltip(this.globalPromptItem, "global", undefined);
    this.globalPromptItem.show();

    // Initialize project prompt
    this.projectPromptItem.text = "$(file-directory)";
    this.projectPromptItem.command = "oh-my-prompt.selectProjectPrompt";
    this.updateTooltip(this.projectPromptItem, "project", undefined);
    this.projectPromptItem.show();
  }

  private updateTooltip(
    item: vscode.StatusBarItem,
    type: PromptType,
    prompt?: Prompt,
  ) {
    if (!prompt) {
      item.tooltip = `Select ${type} prompt...`;
      return;
    }

    const tooltipLines = [
      "## Prompt",
      prompt.content,
      "## Meta",
      prettyjson.render(prompt.meta).replace(/\n/g, "<br>"),
      "## Note",
      "Click to change prompt",
    ];
    this.logger.info("tooltipLines:", tooltipLines);

    item.tooltip = new vscode.MarkdownString(tooltipLines.join("\n"));
    item.tooltip.isTrusted = true;
    item.tooltip.supportHtml = true;
  }

  private updatePromptItem(type: PromptType, prompt: Prompt) {
    const item =
      type === "global" ? this.globalPromptItem : this.projectPromptItem;
    // item.text = `$(${type === "global" ? "globe" : "file-directory"}) ${prompt.meta.name}`;
    this.updateTooltip(item, type, prompt);

    if (type === "global") {
      this.currentGlobalPrompt = prompt;
    } else {
      this.currentProjectPrompt = prompt;
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

  async showCreatePromptQuickPick() {
    const items = [
      { label: "Global Prompt", type: "global" as const },
      { label: "Project Prompt", type: "project" as const },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select prompt type to create...",
    });

    if (selected) {
      const prompt = await this.promptManager.createPrompt(selected.type);
      const tomlPath = this.getPromptTomlPath(prompt);
      const doc = await vscode.workspace.openTextDocument(tomlPath);
      await vscode.window.showTextDocument(doc);
    }
  }

  async showPromptQuickPick(type: PromptType) {
    const prompts = await this.promptManager.loadPrompts(type);
    const items = prompts.map((prompt) => ({
      label: prompt.meta.name,
      description: prompt.meta.description,
      detail: `Version: ${prompt.meta.version} | Author: ${prompt.meta.author} | Date: ${prompt.meta.date}`,
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
    }));

    const quickPick = vscode.window.createQuickPick();
    quickPick.items = items;
    quickPick.placeholder = `Select ${type} prompt...`;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    quickPick.onDidTriggerItemButton(async (event) => {
      const button = event.button;
      const item = event.item as any;

      if (button.tooltip === "Edit TOML file") {
        const tomlPath = this.getPromptTomlPath(item.prompt);
        const doc = await vscode.workspace.openTextDocument(tomlPath);
        await vscode.window.showTextDocument(doc);
      } else if (button.tooltip === "Delete prompt") {
        const answer = await vscode.window.showWarningMessage(
          `Are you sure you want to delete prompt "${item.prompt.meta.name}"?`,
          { modal: true },
          "Confirm",
        );

        if (answer === "Confirm") {
          await this.promptManager.deletePrompt(item.prompt);
          quickPick.items = quickPick.items.filter(
            (i: any) => i.prompt?.meta.id !== item.prompt.meta.id,
          );
        }
      }
    });

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0] as any;
      if (selected) {
        if (type === "global") {
          await this.promptManager.syncGlobalPrompt(selected.prompt);
          this.updatePromptItem("global", selected.prompt);
        } else {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0].uri.fsPath;
          if (workspaceRoot) {
            await this.promptManager.syncProjectPrompt(
              selected.prompt,
              workspaceRoot,
            );
            this.updatePromptItem("project", selected.prompt);
          }
        }
        quickPick.hide();
      }
    });

    quickPick.show();
  }

  dispose() {
    this.globalPromptItem.dispose();
    this.projectPromptItem.dispose();
    this.newPromptItem.dispose();
  }
}
