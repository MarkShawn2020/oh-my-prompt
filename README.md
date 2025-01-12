<div align="center">

```shell
                 @@@@@@   @@@  @@@     @@@@@@@@@@   @@@ @@@  
                @@@@@@@@  @@@  @@@     @@@@@@@@@@@  @@@ @@@  
                @@!  @@@  @@!  @@@     @@! @@! @@!  @@! !@@  
                !@!  @!@  !@!  @!@     !@! !@! !@!  !@! @!!  
                @!@  !@!  @!@!@!@!     @!! !!@ @!@   !@!@!   
                !@!  !!!  !!!@!!!!     !@!   ! !@!    @!!!   
                !!:  !!!  !!:  !!!     !!:     !!:    !!:    
                :!:  !:!  :!:  !:!     :!:     :!:    :!:    
                ::::: ::  ::   :::     :::     ::      ::    
                 : :  :    :   : :      :      :       :     


                @@@@@@@   @@@@@@@    @@@@@@   @@@@@@@@@@   @@@@@@@   @@@@@@@  
                @@@@@@@@  @@@@@@@@  @@@@@@@@  @@@@@@@@@@@  @@@@@@@@  @@@@@@@  
                @@!  @@@  @@!  @@@  @@!  @@@  @@! @@! @@!  @@!  @@@    @@!    
                !@!  @!@  !@!  @!@  !@!  @!@  !@! !@! !@!  !@!  @!@    !@!    
                @!@@!@!   @!@!!@!   @!@  !@!  @!! !!@ @!@  @!@@!@!     @!!    
                !!@!!!    !!@!@!    !@!  !!!  !@!   ! !@!  !!@!!!      !!!    
                !!:       !!: :!!   !!:  !!!  !!:     !!:  !!:         !!:    
                :!:       :!:  !:!  :!:  !:!  :!:     :!:  :!:         :!:    
                 ::       ::   :::  ::::: ::  :::     ::    ::          ::    
                 :         :   : :   : :  :    :      :     :           :          

```

<h1 align="center">Oh My Prompt</h1>

<p align="center">
  ✨Your Next-gen Prompt Solution for AI Coding ✨
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&color=00a8f0" alt="License" />
</p>


English | [中文](./README.zh-CN.md) | [Website Docs](https://oh-my-prompt.github.io) | [VScode Extension](https://marketplace.visualstudio.com/items?itemName=markshawn2020.oh-my-prompt) | [Open Visx Extension](https://open-vsx.org/extension/markshawn2020/oh-my-prompt) | [Releases](https://github.com/markshawn2020/oh-my-prompt/releases)


</div>

# Oh My Prompt

一种 AI IDE 多 prompt 管理系统，让您轻松管理和切换 AI IDE（如 Windsurf、Cursor）的 Global 和 Project Prompts。

```
Oh My Prompt Store        IDE Rules Files
(TOML with metadata)      (Plain text)
[~/.oh-my-prompt/]        [IDE specific paths]
     ↓    ↑                    ↑    ↓
   Export  Import           Apply  Save
```

## 特性

- 状态栏快速切换
  - 直观显示当前激活的 Global 和 Project Prompt
  - 一键切换不同的 prompt 配置
  - 快速编辑入口

- 智能 Prompt 管理
  - 自动扫描加载 TOML 格式的 prompts
  - 自动检测项目已有的 `.windsurfrules` 或 `.cursorrules`
  - 支持在编辑器中直接修改 prompt 文件

- 多平台同步
  - Windsurf Global Prompt 同步
  - Project Prompt 同步到 `.windsurfrules`
  - *(即将支持)* Cursor 配置同步

## 安装

在 VS Code 中搜索 "Oh My Prompt" 或访问 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=markshawn2020.oh-my-prompt) 安装。

## 使用方法

1. 在状态栏查看当前激活的 Global 和 Project Prompt
2. 点击状态栏项目打开 Quick Pick 菜单
3. 选择或编辑您想要的 prompt

## Prompt 文件格式

Prompts 存储在 `~/.neurora/oh-my-prompt/prompts/{type}` 目录下，使用 TOML 格式：

```toml
content = """
your prompt content here
"""

[meta]
type = "global" | "project"
id = "xxx"
name = "xxx"
description = "xxx"
author = "xxx"
version = "xxx"
date = "xxx"
license = "xxx"
```

## 开发

1. Clone 仓库
2. 运行 `pnpm install`
3. 在 VS Code 中打开项目
4. 按 F5 启动调试

## 贡献

欢迎提交 Issues 和 Pull Requests！

## 许可证

MIT

---

**Enjoy!**
