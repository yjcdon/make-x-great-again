(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    const { resolveLinkUrl } = modules.directLinks;
    const headingSelector = 'h1, h2, h3, h4, h5, h6';
    const blockSelector = '[data-block="true"], ' + headingSelector + ', p, ul, ol, pre, blockquote, hr';

    function escapeText(text) {
        return text.replace(/[\\\x60*_[\]<>~#|]/g, '\\$&')
            .replace(/^([ \t]*(?:\d{1,9})?)([+.)-])(?=\s)/gm, '$1\\$2');
    }

    function wrapInline(text, format) {
        const content = text.trim();
        return content ? text.replace(content, () => format(content)) : text;
    }

    function markdownLink(label, url) {
        return '[' + label + '](' + url.replace(/[\\()]/g, '\\$&') + ')';
    }

    function codeFence(text, minimum) {
        const length = (text.match(/\x60+/g) ?? []).reduce((max, run) => Math.max(max, run.length + 1), minimum);
        return '`'.repeat(length);
    }

    function readInline(node) {
        if (node.nodeType === Node.TEXT_NODE) return escapeText(node.data);
        if (node.nodeType !== Node.ELEMENT_NODE || node.matches('button, img, svg, ul, ol, [hidden], [aria-hidden="true"]')) return '';
        if (node.localName === 'br') return '  \n';
        if (node.localName === 'code') {
            const value = node.textContent;
            const fence = codeFence(value, 1);
            return value ? fence + ' ' + value + ' ' + fence : '';
        }

        let text = Array.from(node.childNodes, readInline).join('');
        if (node.matches('a[href]')) {
            const url = resolveLinkUrl(node)?.href;
            return url ? wrapInline(text, label => markdownLink(label, url)) || markdownLink(escapeText(url), url) : text;
        }
        const { fontWeight, fontStyle, textDecorationLine } = node.style;
        if (node.matches('strong, b') || fontWeight === 'bold' || Number(fontWeight) >= 600) {
            text = wrapInline(text, value => '**' + value + '**');
        }
        if (node.matches('em, i') || fontStyle === 'italic') {
            text = wrapInline(text, value => '*' + value + '*');
        }
        if (node.matches('s, del, strike') || textDecorationLine.includes('line-through')) {
            text = wrapInline(text, value => '~~' + value + '~~');
        }
        return text;
    }

    function readList(list) {
        const ordered = list.localName === 'ol';
        const numbers = [list.start ?? 1];
        return Array.from(list.querySelectorAll(':scope > li'), item => {
            // X 的编辑器把部分嵌套层级表示为同一列表中的深度。
            const depth = Number(item.className.match(/public-DraftStyleDefault-depth(\d+)/)?.[1] ?? 0);
            const number = item.hasAttribute('value') ? item.value : (numbers[depth] ?? 1);
            numbers.length = depth + 1;
            numbers[depth] = number + 1;
            const indent = '    '.repeat(depth);
            const marker = ordered ? number + '. ' : '- ';
            const continuation = indent + ' '.repeat(marker.length);
            const value = readInline(item).trim().replace(/\n/g, '\n' + continuation);
            const nested = Array.from(item.querySelectorAll(':scope > ul, :scope > ol'), readList).join('\n');
            return indent + marker + value + (nested ? '\n' + continuation + nested.replace(/\n/g, '\n' + continuation) : '');
        }).join('\n');
    }

    function readCodeBlock(pre) {
        const code = pre.querySelector('code') ?? pre;
        const text = code.textContent.replace(/\n$/, '');
        const language = code.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1];
        const fence = codeFence(text, 3);
        return fence + (language && language !== 'plaintext' ? language : '') + '\n' + text + '\n' + fence;
    }

    function readBlock(block, headingOffset) {
        const tag = block.localName;
        if (block.matches('[hidden], [aria-hidden="true"]')) return '';
        if (tag === 'pre') return readCodeBlock(block);
        if (tag === 'section' && block.matches('[data-block="true"]')) {
            const code = block.querySelector('pre');
            if (code) return readCodeBlock(code);
            const post = block.querySelector('a[href]:has(time)');
            const url = post && resolveLinkUrl(post)?.href;
            return url ? markdownLink('引用的 X 帖子', url) : escapeText(block.innerText.trim());
        }
        if (tag === 'ul' || tag === 'ol') return readList(block);
        if (tag === 'hr') return '---';
        if (/^h[1-6]$/.test(tag)) return '#'.repeat(Math.min(6, Number(tag[1]) + headingOffset)) + ' ' + readInline(block).trim();
        if (tag === 'blockquote') return readInline(block).trim().split('\n').map(line => '> ' + line).join('\n');
        if (!block.matches('[data-block="true"], p') && block.querySelector(blockSelector)) {
            return Array.from(block.children, child => readBlock(child, headingOffset)).filter(Boolean).join('\n\n');
        }
        return readInline(block).trim();
    }

    /** 将 X 文章的正文结构和链接转换成剪贴板中的 Markdown。 */
    function readArticleMarkdown(title, body) {
        if (!body) return;
        const root = body.querySelector('[data-contents="true"]') ?? body;
        const headings = Array.from(root.querySelectorAll(headingSelector), node => Number(node.localName[1]));
        const text = readBlock(root, 2 - Math.min(6, ...headings));
        return text && '# ' + escapeText(title) + '\n\n' + text;
    }

    /** 文章的复制操作从当前阅读视图读取标题和正文。 */
    modules.createArticleCopyButton = article => modules.createCopyButton('mxga-card-copy', () => {
        const title = article.querySelector('[data-testid="twitter-article-title"]')?.innerText.trim();
        return title && readArticleMarkdown(title, article.querySelector('[data-testid="twitterArticleRichTextView"]'));
    });
})();
