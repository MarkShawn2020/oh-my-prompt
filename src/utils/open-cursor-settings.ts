/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-12
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import vscode from "vscode";

export const openCursorSettings = async () => {
  await vscode.commands.executeCommand("aiSettings.action.openhidden");
};
