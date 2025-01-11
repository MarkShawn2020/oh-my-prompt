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

@Service()
export class StatusBarItems {
  private globalPromptItem: vscode.StatusBarItem;
  private projectPromptItem: vscode.StatusBarItem;
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
      99,
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
      console.error("Failed to load current prompts:", error);
    }
  }

  private initializeItems() {
    this.globalPromptItem.text = "$(globe) Global Prompt";
    this.globalPromptItem.command = "oh-my-prompt.selectGlobalPrompt";
    this.updateTooltip(this.globalPromptItem, "global", undefined);
    this.globalPromptItem.show();

    this.projectPromptItem.text = "$(file-directory) Project Prompt";
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
    item.text = `$(${type === "global" ? "globe" : "file-directory"}) ${prompt.meta.name}`;
    this.updateTooltip(item, type, prompt);

    if (type === "global") {
      this.currentGlobalPrompt = prompt;
    } else {
      this.currentProjectPrompt = prompt;
    }
  }

  async showPromptQuickPick(type: PromptType) {
    const prompts = await this.promptManager.loadPrompts(type);
    const items = prompts.map((prompt) => ({
      label: prompt.meta.name,
      description: prompt.meta.description,
      detail: `Version: ${prompt.meta.version} | Author: ${prompt.meta.author}`,
      prompt,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Select ${type} prompt...`,
    });

    if (selected) {
      if (type === "global") {
        await this.promptManager.syncToWindsurfGlobal(selected.prompt);
        this.updatePromptItem("global", selected.prompt);
      } else {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (workspaceRoot) {
          await this.promptManager.syncToWindsurfProject(
            selected.prompt,
            workspaceRoot,
          );
          this.updatePromptItem("project", selected.prompt);
        }
      }
    }
  }

  dispose() {
    this.globalPromptItem.dispose();
    this.projectPromptItem.dispose();
  }
}
