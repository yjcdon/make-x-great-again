(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;

    modules.directLinks = (() => {
        const shortLinkSelector = 'a:is([href^="https://t.co/" i], [href^="http://t.co/" i], [href^="//t.co/" i])';
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
            let changed = false;
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
                if (short?.hostname === 't.co' && linkDestinations.get(short.pathname) !== target.href) {
                    linkDestinations.set(short.pathname, target.href);
                    changed = true;
                }
            }
            return changed;
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
            if (destination) {
                linkDestinations.set(short.pathname, destination);
                return true;
            }
        }

        /** 先登记正文短链，供引用这些短链的预览卡片复用。 */
        function rememberPostLinks({ links, cards }) {
            let changed = false;
            for (const [entries, text] of links) {
                if (rememberLinkEntities(entries, text)) changed = true;
            }
            for (const card of cards) {
                if (rememberCardLink(card)) changed = true;
            }
            return changed;
        }

        /** 从渲染该链接的 X 组件中读取同一短链对应的完整网址。 */
        function readRenderedDestination(link, short) {
            const key = Object.keys(link).find(name => name.startsWith('__reactFiber$'));
            for (let fiber = link[key]; fiber; fiber = fiber.return) {
                const props = fiber.memoizedProps;
                const entities = props?.entities ?? props?.user?.entities;
                if (!entities) continue;
                for (const urls of [entities.urls, entities.description?.urls, entities.url?.urls]) {
                    if (!Array.isArray(urls)) continue;
                    const entry = urls.find(item => item?.url === short.href);
                    const destination = readWebUrl(entry?.expanded_url);
                    if (destination && destination.hostname !== 't.co') return destination.href;
                }
            }
        }

        function resolveShortLink(short, link) {
            const known = linkDestinations.get(short.pathname);
            if (known || !link) return known;

            const candidates = [link.getAttribute('data-expanded-url'), link.title, link.getAttribute('aria-label')];
            const explicit = candidates.map(readWebUrl).find(url => url && url.hostname !== 't.co');
            if (explicit) return explicit.href;
            const destination = readRenderedDestination(link, short);
            if (destination) linkDestinations.set(short.pathname, destination);
            return destination;
        }

        /** 原地更新 X 的短链接，供浏览器导航和复制链接使用。 */
        function rewriteLink(link) {
            if (link.hostname !== 't.co') return rewrittenLinks.get(link) === link.href;
            const short = readWebUrl(link.href);
            if (!short) return false;

            const destination = resolveShortLink(short, link);
            if (!destination) return false;

            link.href = destination;
            rewrittenLinks.set(link, link.href);
            return true;
        }

        /** 折叠正文使用与点击相同的短链映射。 */
        function expandCopyLinks(text, entries) {
            if (!text) return text;
            rememberLinkEntities(entries, text);
            return text.replace(/https?:\/\/t\.co\/[a-z\d]+/gi, short => resolveShortLink(readWebUrl(short)) ?? short);
        }

        function resolveLinkUrl(link) {
            const url = readWebUrl(link.href);
            const destination = url?.hostname === 't.co' ? resolveShortLink(url, link) : undefined;
            return destination ? new URL(destination) : url;
        }

        function copyLinkText(link) {
            const url = resolveLinkUrl(link);
            if (!url || url.hostname === 't.co' || url.origin === location.origin) return;
            const destination = url.href;

            const displayText = link.innerText;
            const label = displayText.trim();
            const shown = label.replace(/\s/g, '').replace(/(?:…|\.{3})$/, '');
            const address = destination.replace(/^https?:\/\//i, '');
            const isAddress = /^(?:https?:\/\/|www\.)/i.test(shown) || (shown.includes('.') && address.startsWith(shown));
            const text = !shown || isAddress ? destination : label + ' (' + destination + ')';
            return label ? displayText.replace(label, () => text) : text;
        }

        /** 只复制文字和排版，不克隆媒体或站点组件。 */
        function appendCopyText(node, target, replacements) {
            if (node.nodeType === Node.TEXT_NODE) {
                target.append(node.data);
                return;
            }
            if (!(node instanceof HTMLElement)) return;
            const { display, visibility, whiteSpace, textTransform } = getComputedStyle(node);
            if (display === 'none' || visibility === 'hidden') return;

            const tag = /^(?:br|p|tr|td|th)$/.test(node.localName) ? node.localName : 'span';
            const line = document.createElement(tag);
            Object.assign(line.style, { display, whiteSpace, textTransform });
            if (replacements.has(node)) {
                line.style.textTransform = 'none';
                line.textContent = replacements.get(node);
            } else {
                for (const child of node.childNodes) appendCopyText(child, line, replacements);
            }
            target.append(line);
        }

        /** 在复制时补全外链，保留正文顺序和段落。 */
        function readCopyText(body) {
            if (!body) return;
            const replacements = new Map();
            for (const link of body.querySelectorAll('a[href]')) {
                const text = copyLinkText(link);
                if (text !== undefined) replacements.set(link, text);
            }
            if (!replacements.size) return expandCopyLinks(body.innerText.trim());

            const surface = document.createElement('div');
            surface.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none';
            surface.setAttribute('aria-hidden', 'true');
            const { whiteSpace, textTransform } = getComputedStyle(body);
            Object.assign(surface.style, { whiteSpace, textTransform });
            for (const child of body.childNodes) appendCopyText(child, surface, replacements);
            document.body.append(surface);
            try {
                return expandCopyLinks(surface.innerText.trim());
            } finally {
                surface.remove();
            }
        }

        /** 在 X 的点击处理器之前改写地址，由浏览器执行链接的默认动作。 */
        function openLink(event) {
            const link = event.target.closest?.('a[href]');
            if (link && rewriteLink(link)) event.stopImmediatePropagation();
        }

        function matchesShortLink(element) {
            return element.matches(shortLinkSelector);
        }

        function containsShortLink(element) {
            return matchesShortLink(element) || Boolean(element.querySelector(shortLinkSelector));
        }

        /** 在悬浮和复制之前，改写与点击监听覆盖范围一致的锚点。 */
        function refresh(root = document) {
            if (root.matches?.(shortLinkSelector)) rewriteLink(root);
            for (const link of root.querySelectorAll(shortLinkSelector)) rewriteLink(link);
        }

        return { rememberPostLinks, openLink, matchesShortLink, containsShortLink, refresh, readCopyText, expandCopyLinks, resolveLinkUrl };
    })();
})();
