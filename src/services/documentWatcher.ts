/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as vscode from "vscode";
import * as path from "path";
import { Service } from "typedi";
import { EnvironmentDetector } from "./environmentDetector";
import { PromptManager } from "./promptManager";
import { VscodeLogger } from "../vscode-logger";

@Service()
export class DocumentWatcher {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private environmentDetector: EnvironmentDetector,
    private promptManager: PromptManager,
    private logger: VscodeLogger,
  ) {}

  /**
   * Start watching for document save events
   */
  async start() {
    // Watch for document saves
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async (document) => {
        try {
          const ide = await this.environmentDetector.detect();
          const filePath = document.uri.fsPath;

          // Check if this is a rules file
          if (await this.isRulesFile(filePath)) {
            this.logger.info(`Rules file saved: ${filePath}`);
            await this.handleRulesSave(document);
          }
        } catch (error) {
          this.logger.error("Error handling document save:", error);
        }
      }),
    );
  }

  /**
   * Check if a file is a rules file for any supported IDE
   */
  private async isRulesFile(filePath: string): Promise<boolean> {
    const normalizedPath = path.normalize(filePath);
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";

    // Get all possible rules paths
    const globalRulesPath =
      await this.environmentDetector.getRulesPath("global");
    const projectRulesPaths =
      vscode.workspace.workspaceFolders?.map(
        async (folder) =>
          await this.environmentDetector.getRulesPath(
            "project",
            folder.uri.fsPath,
          ),
      ) || [];

    const allRulesPaths = [
      globalRulesPath,
      ...(await Promise.all(projectRulesPaths)),
    ].map((p) => path.normalize(p));

    return allRulesPaths.includes(normalizedPath);
  }

  /**
   * Handle saving of a rules file
   */
  private async handleRulesSave(document: vscode.TextDocument) {
    const filePath = document.uri.fsPath;
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";

    // Determine if this is a global or project rules file
    const globalRulesPath =
      await this.environmentDetector.getRulesPath("global");
    const isGlobal =
      path.normalize(filePath) === path.normalize(globalRulesPath);
    const type = isGlobal ? "global" : "project";

    // Only show apply notification for project rules
    if (!isGlobal) {
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
    } else {
      // For IDE rules, just log the change
      this.logger.info(`IDE rules saved: ${filePath}`);
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
