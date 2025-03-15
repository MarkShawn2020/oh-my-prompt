  
![image.png](https://poketto.oss-cn-hangzhou.aliyuncs.com/20250112094743.png)


## 背景


以 cursor / windsurf 为代表的 AI IDE 越来越火，成为大模型新时代程序员必须掌握的开发工具，它们都提供了配置 system prompt 的功能，并且还包括 global、project 两个层级。

![image.png](https://poketto.oss-cn-hangzhou.aliyuncs.com/20250112092404.png)

cursor 率先支持这一特性，windsurf 后续也做了跟进（2024-12-12）：

![image.png](https://poketto.oss-cn-hangzhou.aliyuncs.com/20250112092108.png)

  
![windsurf-cascade-rules.png](https://poketto.oss-cn-hangzhou.aliyuncs.com/windsurf-cascade-rules.png)

  
但实际使用下来，有一些不便的地方：

1. 只允许单一配置，不方便 prompt 专业户在多套 prompt 中对比测试与调整
2. 入口较深，不方便随时修改
3. 不同项目之间的 prompt 往往可以复用，或作简单修改，因此 prompt 应该与项目解耦，就像一个程序依赖包一样，应该支持跨程序查看与选用
4. \* 可能需要一个 web 端可以查看与候选 prompt，并一键导入
5. \* 可能需要一个地方可以交流 prompt 的实际体感


关于 1，用户真地需要多套 global prompt 吗？我一开始想不通，就好比一个人就应该只有一个底色一样。但后来转念一想，有时候我们就是想换个风格，比如从神秘的蒂芙尼蓝转向性感的基佬紫，等等。因此，更换 global prompt 的实际需求确实是存在的，尽管当我们撸起袖子加油干的时候，老板对我们的期待往往是：“你已经想清楚了”，也就是说“你不应该再更换 prompt 了”。但，听我说，谢谢你。

基于上述问题，本项目旨在提供一种简单易用的多 prompt 管理系统，方便开发者灵活管理不同项目的 prompt，目前优先实现了一款 vscode 插件，它支持在状态栏独立切换 global 和 project prompt，同步分发在 vscode / open-vsx 插件市场。

  

## 产品设计

  

### v1.0

  

第一版的设计目标有两种，一种是专注于呈现尽可能多的 prompt，便利用户复制粘贴；还有一种是专注于切换不同的 prompt，用户需要自行寻找 prompt 源。

  

考虑到 prompt 网站已经有了，而且很多， UI、筛选功能也不错，随手一搜如下：

- PatrickJS/awesome-cursorrules: 📄 A curated list of awesome .cursorrules files, 
  https://github.com/PatrickJS/awesome-cursorrules
- .CursorRules, 
  https://dotcursorrules.com/
- WindsurfPrompts, 
  https://www.windsurfprompts.com/explore
- ……


所以第一阶段我判断最好 focus 在与 IDE 的内部集成上（但不意味着不需要维护一个独立的 prompt 仓库，并分发一个独立的前端，因为多多少少还是有些不太顺手的地方，但尽量多合作，少造重复的轮子）。


我们应该在状态栏上设置两个按钮，分别显示用户当前所采用的 global、project prompt，点击后应该弹出一个 picker，picker 里应该允许用户编辑或者切换 prompt。

  
用户点击 item 触发 prompt 切换：

- windsurf global：写入 `~/.codeium/windsurf/memories/global_rules.md`
- windsurf project：写入 `$/.windsurfrules`
- cursor global：复制，并跳转打开 cursor settings （暂未找到程序化操控 cursor global prompt 的办法，如果你知道，请务必告诉我，感谢！）
- cursor project：写入 `~/.cursorrules`
- ……


值得注意的是：当用户打开一个新的 project 的时候，有可能已经存在 `.windsurfrules` 或者 `.cursorrules` 文件，这个文件应该自动加载到我们的 prompt 管理系统，这样用户就可以在其他的项目中也能选配使用。（实际推进中，AI 告诉我不该这么做，而是做了一套同步系统，AI 真地很强，它的关键的想法很关键）

![image.png](https://poketto.oss-cn-hangzhou.aliyuncs.com/20250112093658.png)


  
因此，我们的 prompt 管理系统应该支持多个 prompt，由于 vscode 插件的用户配置里字符串显示只能一行，所以 prompt 不适合在用户配置里直接配置，应该采用文件形式进行组织，例如存放在 `~/.oh-my-prompt/prompts/{type}` 文件夹下，文件名为 `xxx.toml`，大致格式为：


```toml

content = """

prompt...

"""

  

meta = {

type = "global" | "project",

id = "xxx",

name = "xxx",

description = "xxx",

author = "xxx",

version = "xxx",

date = "xxx",

license = "xxx",

}

  

```

  

所以在 IDE 里，要有个地方点击后就能跳转到目标文件，编辑，然后保存。保存的时候，应该要有一个 post-hook，允许进行一些格式化检查、配置同步等。不确定 vscode 系统是否能够在文件保存的时候执行 post-hook，即便不可以，基于稳健性目标考虑，我们也应该在 IDE 中提供一个入口，能让用户手动执行。

  

#### Features

  

##### 1. 状态栏功能

- [ ] 在状态栏显示产品 Logo

- [x] 显示当前激活的 Global Prompt 名称（使用特定颜色标识）

- [x] 显示当前激活的 Workspace Prompt 名称（使用特定颜色标识）

- [x] 点击状态栏项目时显示 Quick Pick 菜单

  

##### 2. Prompt 管理

- [x] 自动扫描并加载 `~/.oh-my-prompt/prompts/{type}` 下的所有 TOML 格式 prompt

- [x] 自动检测并加载项目中已存在的 `.windsurfrules` 或 `.cursorrules`

- [x] 支持通过 Quick Pick 菜单切换不同的 prompt

- [x] 提供编辑当前 prompt 的快捷入口

- [x] 支持在编辑器中直接修改 prompt 文件

  

##### 3. 配置同步

- [x] 支持将选中的 Global Prompt 同步到 Windsurf (`~/.codeium/windsurf/memories/global_rules.md`)

- [x] 支持将选中的 Global Prompt 同步到 Cursor settings

- [x] 支持将选中的 Project Prompt 同步到 `.windsurfrules`

- [x] 支持将选中的 Project Prompt 同步到 `.cursorrules`

  

##### 4. Prompt 文件管理

- [x] 支持 TOML 格式的 prompt 文件，包含 meta 信息和 content

- [x] 提供 post-save hook 进行格式检查

- [x] [DEPRECATED] 提供手动触发配置同步的命令

  

##### 5. 用户体验

- [x] 提供清晰的错误提示

- [ ] 支持快捷键操作

- [x] [DEPRECATED] 状态栏图标根据同步状态显示不同状态

  

##### 6. 开发者友好

- [ ] 提供详细的文档说明

- [x] 支持调试日志输出

- [x] 提供示例 prompt 模板

  

### v2.0 (To be continued)

  
目前已经实现了基本的多 prompt 切换，需要思考要不要进一步实现在项目层级上独立绑定global prompt，这样每个项目打开后，可以无需关心 global prompt 是哪一套。但很可惜，在 cursor 的 global prompt 不能自动同步之前，这个需求，做起来就很不开心。

除了层级上的依赖倒转设计之外，还有一些其他方向可以尝试，比如组件级的原子组合、自定义 prompt 上传同步等，但对我自己来说，目前基本已经够了，很希望能听到大家的优秀想法。

## 产品研发

在第一版 prd 出来之后，花了一天时间敲定了选用的框架，然后又花了一天时间基于 windsurf 实现了我们的 V1.0，成果如下：

![Screen Recording 2025-01-12 at 08.43.38.gif](https://poketto.oss-cn-hangzhou.aliyuncs.com/Screen%20Recording%202025-01-12%20at%2008.43.38.gif)

使用办法：Search for "Oh My Prompt" in your IDE's extension marketplace and install to get started.

- VScode, e.g. Cursor, 
  https://marketplace.visualstudio.com/items?itemName=markshawn2020.oh-my-prompt

- Open Visx, e.g. Windsurf, 
  https://open-vsx.org/extension/markshawn2020/oh-my-prompt

- Releases (manually download and install), 
  https://github.com/markshawn2020/oh-my-prompt/releases
  
- Source Code: 
  https://github.com/MarkShawn2020/oh-my-prompt?tab=readme-ov-file

## prompt 分享

除了上述插件之外，分享一下自己连续用了几个月的 prompt，我还在不断迭代它，这个 prompt 通俗易懂，对我很有帮助，特别适合独立开发。

```toml
content = """ 

## 顶级原则

  

每当我提出一个问题时，请您：

  

1. 这个问题是什么意思

2. 为什么会发生这个问题

3. 你打算怎么解决这个问题，置信度多少

4. 需要我怎么帮助你，能进一步提高你解决这个问题的信心

  

## 工程原则

  

- 始终遵循企业级最佳实践，比如：

    - 始终遵循单一职责原则，比如每个类只做一件事

    - 尽量使用依赖注入技术，减少代码耦合与回环

    - 每个文件不超过 200 行

- 禁止删除三斜线 (`///`) 的相关注释

  

## 技术栈偏好

  

- js

    - 包管理器：【pnpm】

    - 技能栈： typecript + react + vite + electron + nextjs

    - 状态管理： jotai > zustand > valtio > redux

    - api: react-query + trpc + axios

- css

    - tailwindcss + shadcn-ui

- 编译

    - tsc + vite + webpack + tsup

- py

    - 【poetry】 + pydantic + fastapi

- 数据库： prisma + supabase + postgresql

  

## 特殊场景

  

- 如果我问的是生成 logo、短文案等场景，请每次不要原文修改，而是新生成一份，并基于版本号进行管理

  

## 特殊指令（需要我显式触发）

  

你将基于会话历史，特殊响应如下指令：

  

- `gam (title)`: 调用 git add 目前改动的文件，生成 convetional format message，提交

- `issue (title)`: 分析待解决的棘手问题，自动生成 github issue

- `source | 出处 | 溯源`：给出关键参考资料来源，尤其是网址

- `沉淀`: 将有价值的过程、最佳实践整理到项目中合适的位置（例如 readme、docs等）

- `执行`: 执行当前命令，比如 `pnpm install`

- `选型`: todo: 调用更好的 prompt 实现综合对比效果（例如 react diff view 用哪个库更好）"""

  

[meta]

type = "global"

id = "_2025-01-11_180350"

name = "不能飞的猪那就只能是一头猪而已"

description = "windsurf global Rules - Created 1/12/2025, 2:03:50 AM"

author = "markshawn2020"

version = "0.3.0"

date = "2025-01-11T18:03:50.026Z"

license = "MIT"

notes = """

## TODO

  

- 清晰的条件树

  

"""
```

除了这款 prompt 之外，下一期我还会再发一套 ai log 控制系统，也是前两个沉淀出来非常有意思的玩意，敬请期待！

## Product Wall

如果感兴趣，请持续关注我用 AI 开发软件的奥德赛之旅，目前已发布的几个产品如下，后续将不断更新~


