# Make X Great Again

Make X Great Again（MXGA）是一款面向 X（Twitter）网页版的 Chrome 扩展。在时间线和回复区使用 Grok 翻译，复制帖子全文与文章 Markdown，跳过 `t.co` 直开外链。也可以直接在帖子旁关注、取关或屏蔽作者。

[从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/make-x-great-again/hhnjogcifjdjdpjkhfkbhiechbhecpdl) · [从 GitHub 下载 ZIP](https://github.com/yjcdon/make-x-great-again/releases/latest) · [更新日志](CHANGELOG.md)

## 安装

需要 Chrome 111 或以上版本。

在 [Chrome 应用商店](https://chromewebstore.google.com/detail/make-x-great-again/hhnjogcifjdjdpjkhfkbhiechbhecpdl) 点击「添加至 Chrome」。扩展版本以商店详情页为准。

### 手动安装 GitHub 版本

1. 在 [GitHub Release](https://github.com/yjcdon/make-x-great-again/releases/latest) 的 **Assets** 中下载 `make-x-great-again-v*.zip` 并解压。
2. 打开 `chrome://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的文件夹。
4. 登录 `x.com`，刷新已打开的 X 网页。

从源码安装时，在第 3 步选择仓库里的 [`extension/`](extension/) 文件夹。

## Grok 翻译

在时间线、搜索结果等帖子列表，以及帖子和文章的回复区，扩展为 X 判定可翻译的内容补上原生「显示翻译」入口。点开即可在原位置看译文，随时切回原文。详情页主帖使用 X 自带的入口。

![Grok 翻译功能图，展示同一条回复的原文和中文译文](docs/screenshots/01-grok-translation.jpg)

## 复制帖子和文章

- **普通帖子。** 点击复制图标，复制当前显示的原文或译文。X 已加载长帖全文时，折叠状态下也能直接复制。完整外链、图片和视频随正文一起复制。
- **X 文章。** 复制为 Markdown，保留标题、段落、列表、引用、代码和链接。封面放在标题后，正文的图片和视频保留在原位置。文章标题下还显示原生的发布时间和查看次数。

图片以 Markdown 图片语法复制，视频使用 X 已提供的 MP4 地址。粘贴到 Typora 后可以直接查看图片、播放视频。复制成功后，图标会短暂显示勾。

![复制全文功能图，展示文章作者旁的复制图标、文章封面和标题](docs/screenshots/02-copy-full-content.jpg)

## 直开外链

正文、个人简介、相关用户和悬浮资料卡里的外链，在 X 已提供完整网址时可以直接打开。

![直开外链功能图，展示 X 个人主页上的网站链接](docs/screenshots/03-direct-links.jpg)

## 作者信息和关注

在主页、搜索、个人资料、书签和帖子详情等页面，作者名下显示正在关注和关注者人数，可以直接关注或取关。自己的普通帖在 Grok 旁显示复制图标。

![作者信息和关注功能图，展示关注、取关按钮和两种关注人数](docs/screenshots/04-author-actions.jpg)

## 屏蔽与帖子反馈

点击快捷按钮可打开 X 原生屏蔽确认。X 为当前帖子提供「不感兴趣」等选项时，帖子旁会显示对应的快捷入口。

![屏蔽与反馈功能图，展示帖子快捷图标和 X 的不感兴趣、屏蔽选项](docs/screenshots/05-post-feedback.jpg)
