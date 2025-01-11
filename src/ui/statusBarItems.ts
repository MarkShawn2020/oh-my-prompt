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

@Service()
export class StatusBarItems {
  private globalPromptItem: vscode.StatusBarItem;
  private projectPromptItem: vscode.StatusBarItem;

  constructor(private promptManager: PromptManager) {
    this.globalPromptItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.projectPromptItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99,
    );

    this.initializeItems();
  }

  private initializeItems() {
    this.globalPromptItem.text = "$(globe) Global Prompt";
    this.globalPromptItem.command = "oh-my-prompt.selectGlobalPrompt";
    this.globalPromptItem.tooltip = "Select Global Prompt";
    this.globalPromptItem.show();

    this.projectPromptItem.text = "$(file-directory) Project Prompt";
    this.projectPromptItem.command = "oh-my-prompt.selectProjectPrompt";
    this.projectPromptItem.tooltip = "Select Project Prompt";
    this.projectPromptItem.show();
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
        this.globalPromptItem.text = `$(globe) ${selected.label}`;
      } else {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (workspaceRoot) {
          await this.promptManager.syncToWindsurfProject(
            selected.prompt,
            workspaceRoot,
          );
          this.projectPromptItem.text = `$(file-directory) ${selected.label}`;
        }
      }
    }
  }

  dispose() {
    this.globalPromptItem.dispose();
    this.projectPromptItem.dispose();
  }
}
