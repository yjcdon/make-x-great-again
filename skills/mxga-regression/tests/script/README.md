# 脚本用例

从[样本表](../../references/samples.md)选择入口。复制内容从系统剪贴板读取，图标反馈见[复制按钮位置与反馈](../text/post-copy.md#copy-feedback-01-复制按钮位置与反馈)。

| 编号 | 执行入口 | 操作与通过条件 |
| --- | --- | --- |
| `COPY-01` | `test_COPY_01` | 复制短帖，剪贴板含完整的 alphaxiv 地址，且无 t.co 链接。 |
| `COPY-02` | `test_COPY_02` | 英文原文和中文译文各复制一次。每次剪贴板等于该语言的正文、一个空段和完整的 1Password 预览卡网址。 |
| `COPY-03` | `test_COPY_03` | 在搜索卡片复制折叠原文，卡片仍折叠。对照复制前该卡片已加载的英文全文，核对末段、换行和已知目标网址。 |
| `COPY-04` | `test_COPY_04` | 在相同搜索入口复制折叠译文，卡片仍折叠。对照复制前该卡片已加载的本次中文译文，核对末段、换行和已知目标网址。 |
| `COPY-05` | `test_COPY_05` | 三张 Markdown 图片的媒体路径和顺序与页面一致，描述均为 `picture`。 |
| `COPY-06` | `test_COPY_06` | 选主帖和引用正文不同的卡片，剪贴板只含主帖正文。 |
| `ARTICLE-01` | `test_ARTICLE_01` | 剪贴板首行等于 `# ` 加文章标题。 |
| `ARTICLE-02` | `test_ARTICLE_02` | Markdown 含具名链接 `[F5Bot](https://f5bot.com/)`。 |
| `ARTICLE-03` | `test_ARTICLE_03` | 各小标题按页面顺序出现，最浅的小标题从二级开始，其余保留相对层级。 |
| `ARTICLE-04` | `test_ARTICLE_04` | 页面上的两个相邻纯文本段落在 Markdown 中间隔一个空行。 |
| `ARTICLE-05` | `test_ARTICLE_05` | 选至少有两项的列表，用各项开头的文字核对 Markdown 列表标记和顺序。 |
| `ARTICLE-06` | `test_ARTICLE_06` | 封面图片块紧跟标题，第一张正文配图紧随原文对应段落。 |
| `ARTICLE-07` | `test_ARTICLE_07` | 三个 MP4 的媒体 ID 按页面顺序对应。每个视频块前后都紧邻原文中该视频的相邻文字。 |
| `LINK-01` | `test_LINK_01` | 帖子中 alphaxiv 链接的 href 为 `https://www.alphaxiv.org/`。 |
| `LINK-02` | `test_LINK_02` | 从 tison 主页悬停作者名，浮层 GitHub 链接的 href 为 `https://github.com/tisonkun/`。 |
| `AUTHOR-01` | `test_AUTHOR_01` | 从他人主页选该作者的帖子，唯一复制按钮与屏蔽按钮在同一操作行对齐。 |
| `AUTHOR-02` | `test_AUTHOR_02` | 在本人主页选自己的帖子，唯一复制按钮紧邻 Grok 左侧，作者操作行隐藏。 |
| `AUTHOR-03` | `test_AUTHOR_03` | 未关注作者的快捷按钮与同帖原生菜单提供的「关注」操作一致。 |
| `AUTHOR-04` | `test_AUTHOR_04` | 已关注作者的快捷按钮与同帖原生菜单提供的「取关」操作一致。 |
| `BLOCK-01` | `test_BLOCK_01` | 打开屏蔽确认框核对作者账号，点取消后菜单收起，原帖与屏蔽按钮可见。 |
| `GROK-01` | `test_GROK_01` | 将纯文本回复切到译文，剪贴板与当次译文一致；切回后语言和正文恢复。 |
| `SCROLL-01` | `test_SCROLL_01` | 普通回复区滚动后至少出现两个新帖子 ID，每张受检的他人卡片各显示一个复制按钮和一个指向本作者的屏蔽按钮。 |

## Chrome 实测

| 功能脚本 | 相关扩展源码 |
| --- | --- |
| [帖子复制](post-copy.test.cjs) | [copy.js](../../../../extension/copy.js)、[direct-links.js](../../../../extension/direct-links.js) |
| [文章 Markdown](article-markdown.test.cjs) | [article-markdown.js](../../../../extension/articles/article-markdown.js)、[copy.js](../../../../extension/copy.js) |
| [外链](direct-links.test.cjs) | [direct-links.js](../../../../extension/direct-links.js) |
| [作者操作](author-actions.test.cjs) | [post-card-actions.js](../../../../extension/post-actions/post-card-actions.js)、[native-menu.js](../../../../extension/post-actions/native-menu.js) |
| [屏蔽确认和取消](block.test.cjs) | [native-menu.js](../../../../extension/post-actions/native-menu.js) |
| [Grok 回复翻译](reply-translation.test.cjs) | [native-translation.js](../../../../extension/native-translation.js)、[copy.js](../../../../extension/copy.js) |
| [滚动加载](scroll-loading.test.cjs) | [content.js](../../../../extension/content.js)、[post-card-actions.js](../../../../extension/post-actions/post-card-actions.js) |
