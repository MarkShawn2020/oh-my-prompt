/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import "reflect-metadata";
import * as vscode from "vscode";

import { PromptManager } from "./services/promptManager";
import { StatusBarItems } from "./ui/statusBarItems";
import Container from "typedi";

export function activate(context: vscode.ExtensionContext) {
  const statusBarItems = Container.get(StatusBarItems);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("oh-my-prompt.selectGlobalPrompt", () => {
      statusBarItems.showPromptQuickPick("global");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("oh-my-prompt.selectProjectPrompt", () => {
      statusBarItems.showPromptQuickPick("project");
    }),
  );

  // Add status bar items to subscriptions
  context.subscriptions.push(statusBarItems);
}

export function deactivate() {}
