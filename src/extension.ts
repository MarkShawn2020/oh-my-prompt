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
import { DocumentWatcher } from "./services/documentWatcher";

export function activate(context: vscode.ExtensionContext) {
  const statusBarItems = Container.get(StatusBarItems);
  const documentWatcher = Container.get(DocumentWatcher);

  // Start watching for document saves
  documentWatcher.start();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("oh-my-prompt.createPrompt", () => {
      statusBarItems.showCreatePromptQuickPick();
    }),
  );

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

  // Add items to subscriptions for cleanup
  context.subscriptions.push(statusBarItems);
  context.subscriptions.push(documentWatcher);
}

export function deactivate() {}
