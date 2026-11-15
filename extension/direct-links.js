(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;

    modules.createDirectLinks = () => {
        const postLinkSelector = ':is([data-testid="tweetText"], [data-testid="twitterArticleRichTextView"], '
            + '[data-testid="primaryColumn"]) a[href]';
        const shortLinkSelector = postLinkSelector + ':is([href^="https://t.co/"], [href^="http://t.co/"])';
        const linkDestinations = new Map();
        const rewrittenLinks = new WeakMap();

        /** 只接受完整的网页地址，便于安全替换帖子中的短链接。 */
        function readWebUrl(value) {
            if (typeof value !== 'string' || !/^https?:\/\/[^\s]+$/i.test(value) || /(?:…|\.{3})$/.test(value)) return;
            try {
                const url = new URL(value);
                if (!url.username && !url.password) return url;
            } catch {
                // 无法解析的链接沿用 X 的原地址。
            }
        }

        /** 原文有时仍是短链，而实体中的 url 已经是完整地址。 */
        function rememberLinkEntities(entries, text) {
            if (!Array.isArray(entries)) return;
            const characters = typeof text === 'string' ? Array.from(text) : [];
            for (const entry of entries) {
                const target = readWebUrl(entry?.expanded_url);
                if (!target || target.hostname === 't.co') continue;

                let short = readWebUrl(entry.url);
                if (short?.href === target.href && Array.isArray(entry.indices)) {
                    const [start, end] = entry.indices;
                    if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= characters.length) {
                        const source = characters.slice(start, end).join('');
                        if (/^https?:\/\/t\.co\/[a-z\d]+$/i.test(source)) short = readWebUrl(source);
                    }
                }
                if (short?.hostname === 't.co') linkDestinations.set(short.pathname, target.href);
            }
        }

        /** 用卡片自己的链接字段补全预览图使用的短链。 */
        function rememberCardLink(card) {
            const values = card.legacy?.binding_values;
            if (!Array.isArray(values)) return;
            const preview = readWebUrl(values.find(binding => binding?.key === 'card_url')?.value?.string_value);
            if (!preview) return;

            const short = readWebUrl(card.legacy.url) ?? readWebUrl(card.rest_id);
            if (short?.hostname !== 't.co' || linkDestinations.has(short.pathname)) return;
            const destination = preview.hostname === 't.co' ? linkDestinations.get(preview.pathname) : preview.href;
            if (destination) linkDestinations.set(short.pathname, destination);
        }

        /** 先登记正文短链，供引用这些短链的预览卡片复用。 */
        function rememberPostLinks({ links, cards }) {
            for (const [entries, text] of links) rememberLinkEntities(entries, text);
            for (const card of cards) rememberCardLink(card);
            return Boolean(links.size || cards.length);
        }

        /** 原地更新 X 的短链接，供浏览器导航和复制链接使用。 */
        function rewritePostLink(link) {
            const short = readWebUrl(link.href);
            if (short?.hostname !== 't.co') return rewrittenLinks.get(link) === link.href;

            const candidates = [link.getAttribute('data-expanded-url'), link.title, link.getAttribute('aria-label')];
            const target = candidates.map(readWebUrl).find(url => url && url.hostname !== 't.co');
            const destination = linkDestinations.get(short.pathname) ?? target?.href;
            if (!destination) return false;

            link.href = destination;
            rewrittenLinks.set(link, link.href);
            return true;
        }

        /** 在 X 的点击处理器之前改写地址，由浏览器执行链接的默认动作。 */
        function openPostLink(event) {
            const link = event.target.closest?.(postLinkSelector);
            if (link && rewritePostLink(link)) event.stopImmediatePropagation();
        }

        function matchesShortLink(element) {
            return element.matches(shortLinkSelector);
        }

        function containsShortLink(element) {
            return matchesShortLink(element) || Boolean(element.querySelector(shortLinkSelector));
        }

        /** 在悬浮和复制之前，改写与点击监听覆盖范围一致的锚点。 */
        function refresh() {
            for (const link of document.querySelectorAll(shortLinkSelector)) rewritePostLink(link);
        }

        return { rememberPostLinks, rewritePostLink, openPostLink, matchesShortLink, containsShortLink, refresh };
    };
})();
