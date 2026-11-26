(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    const { readCopyText, expandCopyLinks, resolveLinkUrl } = modules.directLinks;
    const postBodySelector = '[data-testid="tweetText"]';
    const showMoreSelector = '[data-testid="tweet-text-show-more-link"]';
    const photoImageSelector = '[data-testid="tweetPhoto"] img';
    const previewLinkSelector = '[data-testid="card.wrapper"] a[href]';
    const maxNoteTexts = 128;
    const noteTexts = new Map();
    const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    const copiedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /** 点击时读取当前内容，并把纯文本写入剪贴板。 */
    function createCopyButton(readText) {
        const label = '复制全文';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mxga-icon mxga-card-copy';
        button.lang = 'zh-CN';
        button.setAttribute('aria-live', 'polite');
        let resetLabel;

        function showStatus(text) {
            button.title = text;
            button.setAttribute('aria-label', text);
            button.innerHTML = text === '已复制' ? copiedIcon : copyIcon;
        }

        showStatus(label);
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const text = readText();
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                return;
            }
            clearTimeout(resetLabel);
            showStatus('已复制');
            resetLabel = setTimeout(() => showStatus(label), 1000);
        });
        return button;
    }

    modules.createCopyButton = createCopyButton;
    modules.photoImageSelector = photoImageSelector;
    modules.previewLinkSelector = previewLinkSelector;

    function escapeText(text) {
        return text.replace(/[\\\x60*_[\]<>~#|]/g, '\\$&')
            .replace(/^([ \t]*(?:\d{1,9})?)([+.)-])(?=\s)/gm, '$1\\$2');
    }

    function markdownLink(label, url) {
        return '[' + label + '](' + url.replace(/[\\()]/g, '\\$&') + ')';
    }

    /** 帖子和文章都用 X 已渲染的图片地址生成 Markdown。 */
    function readPhotoMarkdown(image) {
        const url = image.currentSrc || image.src;
        if (!url.startsWith('https://pbs.twimg.com/media/')) return '';
        const alt = image.alt.trim();
        const label = /^(?:image|图像|圖像)?$/i.test(alt) ? 'picture' : alt;
        return '!' + markdownLink(escapeText(label), url);
    }

    function ownPostElement(post, selector) {
        const element = post.querySelector(selector);
        const quote = element?.parentElement.closest('[role="link"], [data-testid="quoteTweet"]');
        return quote && quote !== post && post.contains(quote) ? null : element;
    }

    function postPhotoSelector(id) {
        return `a[href*="/status/${id}/photo/"] ${photoImageSelector}`;
    }

    function ownPreviewLink(post) {
        const link = ownPostElement(post, previewLinkSelector);
        return link && link.origin !== location.origin ? link : null;
    }

    modules.hasOrdinaryPostContent = (post, id) => !post.querySelector('[data-testid="twitterArticleReadView"]')
        && Boolean(ownPostElement(post, postBodySelector) || post.querySelector(postPhotoSelector(id))
            || ownPreviewLink(post));

    /** 仅在标签页内存保留最近收到的长帖正文，供折叠卡片复制。 */
    modules.rememberNoteTexts = texts => {
        for (const [id, text] of texts) {
            noteTexts.delete(id);
            noteTexts.set(id, text);
            if (noteTexts.size > maxNoteTexts) noteTexts.delete(noteTexts.keys().next().value);
        }
    };

    /** 从正文组件向上查找同一帖子的已加载数据。 */
    function findTweet(body, id) {
        const key = Object.keys(body).find(name => name.startsWith('__reactFiber$'));
        for (let fiber = body[key]; fiber; fiber = fiber.return) {
            const tweet = fiber.stateNode?.props?.tweet ?? fiber.memoizedProps?.tweet;
            if (tweet?.id_str === id) return tweet;
        }
    }

    /** 复制当前显示的语言，折叠时从 X 已加载的数据取该版本全文。 */
    function readFoldedText(body, id, tweet) {
        const translated = tweet?.grok_translated_post;
        const noteLinks = tweet?.note_tweet?.entity_set?.urls;
        if (body.lang && translated?.destination_language === body.lang) {
            const translatedLinks = translated.entities?.urls;
            return expandCopyLinks(translated.translation?.trim(), translatedLinks?.length ? translatedLinks : noteLinks);
        }
        if (tweet?.lang && body.lang && tweet.lang !== body.lang) return;
        const note = tweet?.note_tweet?.text?.trim() || noteTexts.get(id)?.trim();
        const visibleText = body.innerText.trim();
        if (tweet || (visibleText && note?.startsWith(visibleText))) {
            return expandCopyLinks(note, noteLinks);
        }
    }

    modules.markdown = { escapeText, markdownLink, readPhotoMarkdown };

    modules.createCardCopyButton = (post, readId) => createCopyButton(() => {
        const id = readId();
        if (!id) return;
        const body = ownPostElement(post, postBodySelector);
        const folded = body && ownPostElement(post, showMoreSelector);
        const tweet = folded && findTweet(body, id);
        let text = '';
        if (body) text = folded ? readFoldedText(body, id, tweet) : readCopyText(body);
        if (text === undefined) return;

        const preview = ownPreviewLink(post);
        const destination = preview && resolveLinkUrl(preview);
        const previewUrl = destination && destination.origin !== location.origin && !text.includes(destination.href)
            ? destination.href : '';
        const photos = new Set(Array.from(post.querySelectorAll(postPhotoSelector(id)), readPhotoMarkdown));
        return [text, previewUrl, ...photos].filter(Boolean).join('\n\n');
    });
})();
