# VSCode 版本兼容问题

## 问题描述

在使用 `yo code` 生成 VSCode 插件代码时，遇到了版本兼容性问题：

- 开发环境：Windsurf (VSCode 1.90)
- 本地环境：VSCode 1.96
- 症状：插件运行失败，但没有明显的错误提示
- 原因：版本不匹配导致插件无法正常工作

## 解决方案

需要手动修改 `package.json` 中的 `engines.vscode` 版本号，使其与开发环境版本匹配。

## 预防措施

1. 开发前检查：
   - Windsurf 的 VSCode 版本
   - 本地 VSCode 版本
   - `package.json` 中指定的版本

2. 版本同步：
   - 确保开发环境和目标运行环境的 VSCode 版本一致
   - 或将 `package.json` 中的版本设置为兼容范围

## 相关文件

- `package.json`: 需要修改 `engines.vscode` 字段
- 插件主入口文件：可能需要根据版本差异调整 API 使用

## 参考资料

- [VSCode 插件开发文档 - 版本兼容性](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#visual-studio-code-compatibility)
- [yo code 生成器文档](https://github.com/Microsoft/vscode-generator-code)
