/**
 * @Copyright Copyright (c) 2024 Oh My Prompt
 * @CreatedAt 2025-01-11
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { openCursorSettings } from "../utils/open-cursor-settings";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { Service } from "typedi";
import { VscodeLogger } from "../vscode-logger";

export type IDEType = "vscode" | "windsurf" | "cursor" | "unknown";

@Service()
export class EnvironmentDetector {
  constructor(private logger: VscodeLogger) {}

  /**
   * Detect the current IDE environment
   * @returns Promise<IDEType>
   */
  async detect(): Promise<IDEType> {
    try {
      // Check application name
      const appName = vscode.env.appName.toLowerCase();
      this.logger.info("Detected app name:", appName);

      if (appName.includes("windsurf")) {
        return "windsurf";
      }

      if (appName.includes("cursor")) {
        return "cursor";
      }

      if (
        appName.includes("visual studio code") ||
        appName.includes("vscode")
      ) {
        return "vscode";
      }

      // If app name doesn't give us enough information, check for specific files/paths
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";

      // Check for Windsurf-specific paths
      const windsurfPaths = [
        path.join(homeDir, ".codeium", "windsurf"),
        // Add more Windsurf-specific paths if needed
      ];

      // Check for Cursor-specific paths
      const cursorPaths = [
        path.join(homeDir, ".cursor"),
        // Add more Cursor-specific paths if needed
      ];

      for (const windsurfPath of windsurfPaths) {
        try {
          await fs.access(windsurfPath);
          return "windsurf";
        } catch {
          // Path doesn't exist
        }
      }

      for (const cursorPath of cursorPaths) {
        try {
          await fs.access(cursorPath);
          return "cursor";
        } catch {
          // Path doesn't exist
        }
      }

      // If we can't definitively determine the environment
      this.logger.warn("Could not definitively determine IDE environment");
      return "unknown";
    } catch (error) {
      this.logger.error("Error detecting IDE environment:", error);
      return "unknown";
    }
  }

  /**
   * Get the appropriate rules file path for the current environment
   * @param type "global" | "project"
   * @param workspaceRoot Optional workspace root path for project rules
   * @returns Promise<string>
   */
  async getRulesPath(
    type: "global" | "project",
    workspaceRoot?: string,
  ): Promise<string> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const ide = await this.detect();
    let rulesPath: string;

    if (type === "global") {
      switch (ide) {
        case "windsurf":
          rulesPath = path.join(
            homeDir,
            ".codeium",
            "windsurf",
            "memories",
            "global_rules.md",
          );
          break;
        case "cursor":
          // For Cursor, we'll show a notification to guide users
          await openCursorSettings();
          await vscode.window.showInformationMessage(
            "Please configure global rules in Custom Instructions.",
          );
          return "cursor://settings";
        case "vscode":
        case "unknown":
        default:
          throw new Error(`The ${ide} does not support global rules`);
      }
    } else {
      // Project rules
      if (!workspaceRoot) {
        throw new Error("Workspace root is required for project rules");
      }

      switch (ide) {
        case "windsurf":
          rulesPath = path.join(workspaceRoot, ".windsurfrules");
          break;
        case "cursor":
          rulesPath = path.join(workspaceRoot, ".cursorrules");
          break;
        case "vscode":
        case "unknown":
        default:
          throw new Error(`The ${ide} does not support project rules`);
      }
    }

    // Create the file if it doesn't exist (except for Cursor global rules)
    if (!(ide === "cursor" && type === "global")) {
      try {
        await fs.access(rulesPath);
      } catch {
        // Create parent directories if they don't exist
        await fs.mkdir(path.dirname(rulesPath), { recursive: true });
        // Create an empty file
        await fs.writeFile(rulesPath, "", "utf-8");
        this.logger.info(`Created rules file at ${rulesPath}`);
      }
    }

    return rulesPath;
  }
}
