const assert = require('node:assert/strict');
const { test } = require('node:test');
const { copyText, evaluate, waitFor, withPost } = require('./browser.cjs');

test('[ARTICLE-01] 文章的标题复制为 Markdown 一级标题', function test_ARTICLE_01(t) {
    withPost(t, 'https://x.com/tison1096/status/2124849915172147242', post => {
        const titleSelector = post + ' [data-testid="twitter-article-title"]';
        waitFor(selector => Boolean(document.querySelector(selector)?.innerText.trim()), titleSelector);
        const title = evaluate(selector => document.querySelector(selector).innerText.trim(), titleSelector);
        assert.equal(copyText(post).split('\n')[0], '# ' + title);
    });
});

test('[ARTICLE-02] 文章的正文链接复制为具名 Markdown 链接', function test_ARTICLE_02(t) {
    withPost(t, 'https://x.com/tison1096/status/2124849915172147242', post => {
        assert.ok(copyText(post).includes('[F5Bot](https://f5bot.com/)'), '文章 Markdown 中缺少 F5Bot 链接');
    });
});

const articleUrl = 'https://x.com/tison1096/status/2124849915172147242';
const body = ' [data-testid="twitterArticleRichTextView"]';

function plainMarkdown(text) {
    return text.replace(/\\([\\`*_\[\]<>~#|+.)-])/g, '$1').trim();
}

test('[ARTICLE-03] 文章小标题保留相对层级和顺序', function test_ARTICLE_03(t) {
    withPost(t, articleUrl, post => {
        const headings = evaluate(selector => [...document.querySelector(selector).querySelectorAll('h1,h2,h3,h4,h5,h6')]
            .map(heading => ({ level: Number(heading.tagName[1]), text: heading.innerText.trim() })), post + body);
        assert.ok(headings.length >= 2, '样本需包含至少两个小标题');
        const firstLevel = Math.min(...headings.map(heading => heading.level));
        const lines = copyText(post).split('\n').map(plainMarkdown);
        let previous = 0;
        for (const { level, text } of headings) {
            const line = lines.indexOf('#'.repeat(Math.min(6, level - firstLevel + 2)) + ' ' + text, previous + 1);
            assert.ok(line > previous, '缺少顺序正确的文章小标题：' + text);
            previous = line;
        }
    });
});

test('[ARTICLE-04] 文章相邻段落之间保留 Markdown 空行', function test_ARTICLE_04(t) {
    withPost(t, articleUrl, post => {
        const pair = evaluate(selector => {
            const blocks = [...document.querySelector(selector).querySelectorAll('[data-block="true"]')];
            const plain = element => element?.matches('p,div') && element.innerText.trim().length > 12
                && !element.querySelector('a,strong,b,em,i,code,img,video,br,[style]');
            const index = blocks.findIndex((block, i) => plain(block) && plain(blocks[i + 1])
                && block.nextElementSibling === blocks[i + 1]);
            return index < 0 ? [] : blocks.slice(index, index + 2).map(block => block.innerText.trim());
        }, post + body);
        assert.equal(pair.length, 2, '样本需包含两个相邻的纯文本段落');
        assert.ok(plainMarkdown(copyText(post)).includes(pair.join('\n\n')), '真实文章段落之间缺少 Markdown 空行');
    });
});

test('[ARTICLE-05] 文章列表按原顺序复制', function test_ARTICLE_05(t) {
    withPost(t, articleUrl, post => {
        const items = evaluate(selector => {
            const list = [...document.querySelector(selector).querySelectorAll('ul,ol')].find(element => element.children.length >= 2);
            return [...list?.children ?? []].map(item => item.innerText.trim().slice(0, 18));
        }, post + body);
        assert.ok(items.length >= 2, '样本需包含至少两个列表项');
        const lines = plainMarkdown(copyText(post)).split('\n');
        let previous = -1;
        for (const item of items) {
            const line = lines.findIndex((text, index) => index > previous && /^\s*(?:- |\d+\. )/.test(text)
                && text.replace(/\*\*/g, '').includes(item));
            assert.ok(line > previous, '缺少顺序正确的 Markdown 列表项：' + item);
            previous = line;
        }
    });
});

test('[ARTICLE-06] 文章的封面和正文图保留在原位置', function test_ARTICLE_06(t) {
    withPost(t, 'https://x.com/addyosmani/status/2117512471930167377', post => {
        const images = evaluate(selector => {
            const article = document.querySelector(selector);
            const content = article.querySelector('[data-testid="twitterArticleRichTextView"]');
            const media = (image) => new URL(image.currentSrc || image.src).pathname;
            const cover = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')].find(image => !content.contains(image));
            const section = [...content.querySelectorAll('section')].find(block => block.querySelector('[data-testid="tweetPhoto"] img'));
            const illustration = section?.querySelector('[data-testid="tweetPhoto"] img');
            return {
                cover: cover && media(cover),
                illustration: illustration && media(illustration),
                precedingText: section?.previousElementSibling?.innerText.trim().slice(-36)
            };
        }, post);
        assert.ok(images.cover && images.illustration && images.precedingText, '样本需包含封面和位于正文后的配图');
        const markdown = copyText(post);
        const blocks = markdown.split('\n\n');
        assert.ok(blocks[1]?.startsWith('![') && blocks[1].includes(images.cover), '标题后应为封面');
        const index = blocks.findIndex(block => block.startsWith('![') && block.includes(images.illustration));
        assert.ok(index > 1, '正文图应出现在封面之后');
        assert.ok(plainMarkdown(blocks[index - 1]).replace(/\*\*/g, '').endsWith(images.precedingText),
            '正文图应紧随同一个原文段落');
    });
});

test('[ARTICLE-07] 文章视频在原段落位置复制为 MP4', function test_ARTICLE_07(t) {
    withPost(t, 'https://x.com/rork/status/2066986569953845754', post => {
        const sections = post + body + ' section';
        const player = 'video,[data-testid="videoPlayer"],[data-testid="previewInterstitial"]';
        waitFor((selector, player) => [...document.querySelectorAll(selector)].filter(section => section.querySelector(player)).length === 3,
            sections, player);
        const expected = evaluate((selector, player) => [...document.querySelectorAll(selector)]
            .filter(section => section.querySelector(player)).map(section => {
                const poster = section.querySelector('video')?.poster || section.querySelector('img')?.src;
                return {
                    id: poster?.match(/_video_thumb\/(\d+)\//)?.[1],
                    before: section.previousElementSibling?.innerText.trim().split('\n').at(-1),
                    after: section.nextElementSibling?.innerText.trim().split('\n')[0]
                };
            }), sections, player);
        if (expected.some(item => !item.id || !item.before || !item.after)) return t.skip('样本缺少视频标识或相邻文字');
        const blocks = copyText(post).split(/\n\s*\n/).map(plainMarkdown);
        const videos = blocks.map((block, index) => ({
            id: block.match(/^<video [^>]*src="https:\/\/video\.twimg\.com\/amplify_video\/(\d+)\/[^"]+\.mp4(?:\?[^"]*)?"[^>]*><\/video>$/)?.[1],
            index
        })).filter(video => video.id);
        assert.deepEqual(videos.map(video => video.id), expected.map(item => item.id), '视频标识和顺序');
        for (const [i, { index }] of videos.entries()) {
            const paragraph = block => block?.replace(/^#{1,6} /, '').replaceAll('**', '').trim();
            assert.ok(paragraph(blocks[index - 1])?.endsWith(expected[i].before), '视频前的段落 ' + (i + 1));
            assert.ok(paragraph(blocks[index + 1])?.startsWith(expected[i].after), '视频后的段落 ' + (i + 1));
        }
    });
});
