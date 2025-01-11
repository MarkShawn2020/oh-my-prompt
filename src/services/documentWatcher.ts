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
    const content = document.getText();
    const filePath = document.uri.fsPath;
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";

    // Determine if this is a global or project rules file
    const globalRulesPath =
      await this.environmentDetector.getRulesPath("global");
    const isGlobal =
      path.normalize(filePath) === path.normalize(globalRulesPath);

    // Parse metadata from content if available
    const metaMatch = content.match(/---\n([\s\S]*?)\n---/);
    let title = "Untitled";
    let version = "0.0.1";
    let author = "User";

    if (metaMatch) {
      const metaContent = metaMatch[1];
      const titleMatch = metaContent.match(/title:\s*(.+)/);
      const versionMatch = metaContent.match(/version:\s*(.+)/);
      const authorMatch = metaContent.match(/author:\s*(.+)/);

      if (titleMatch) title = titleMatch[1].trim();
      if (versionMatch) version = versionMatch[1].trim();
      if (authorMatch) author = authorMatch[1].trim();
    }

    // Generate a unique ID based on title and timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .replace(/[TZ]/g, "_")
      .slice(0, -4);
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const ide = await this.environmentDetector.detect();
    const promptId = `${sanitizedTitle}_${timestamp}`;

    // Create a prompt from the file content
    const prompt = {
      meta: {
        type: isGlobal ? ("global" as const) : ("project" as const),
        id: promptId,
        name: title,
        description: `${ide} ${isGlobal ? "Global" : "Project"} Rules - Created ${new Date().toLocaleString()}`,
        author,
        version,
        date: new Date().toISOString(),
        license: "MIT",
      },
      content,
    };

    // Save to our prompt store
    await this.promptManager.savePrompt(prompt);
    this.logger.info(
      `Saved ${isGlobal ? "global" : "project"} prompt: ${title}`,
    );
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
