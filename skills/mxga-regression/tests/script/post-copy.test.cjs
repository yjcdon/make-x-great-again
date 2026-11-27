const assert = require('node:assert/strict');
const { test } = require('node:test');
const { copyText, evaluate, waitFor, withPost } = require('./browser.cjs');

test('[COPY-01] 帖子复制完整外部网址', function test_COPY_01(t) {
    withPost(t, 'https://x.com/karpathy/status/2116979365242429721', post => {
        const copied = copyText(post);
        assert.ok(copied.includes('https://www.alphaxiv.org/'), '系统剪贴板中缺少完整网址');
        assert.ok(!copied.includes('https://t.co/'), '系统剪贴板中仍然有 t.co 短链');
    });
});

test('[COPY-02] 原文和译文均补入预览卡网址', function test_COPY_02(t) {
    withPost(t, 'https://x.com/gregosuri/status/2125641941903921380', post => {
        const expected = 'https://1password.com/blog/update-on-nov-2026-security-incident';
        for (const language of ['en', 'zh']) {
            const body = showLanguage(post, language);
            const text = evaluate(selector => document.querySelector(selector).innerText.trim(), body);
            assert.ok(!text.includes(expected), '样本正文应省略预览卡网址');
            waitFor(selector => document.querySelector(selector)?.getAttribute('aria-label') === '复制全文',
                post + ' button.mxga-card-copy');
            assert.equal(copyText(post), text + '\n\n' + expected, language + ' 正文及预览卡目标');
        }
    });
});

const foldedPost = 'https://x.com/karpathy/status/2125779541952246039';
const searchPage = 'https://x.com/search?q=from%3Akarpathy%20since%3A2026-11-26%20until%3A2026-11-27&f=live';

function showLanguage(post, language) {
    const toggleLabel = language === 'en' ? ['显示原文', 'Show original'] : ['显示翻译', 'Translate post', 'Show translation'];
    const body = post + ' [data-testid="tweetText"]';
    waitFor(selector => Boolean(document.querySelector(selector)?.lang), body);
    const current = evaluate(selector => document.querySelector(selector).lang, body);
    if (!current.startsWith(language)) {
        const switched = evaluate((selector, label) => {
            const toggle = [...document.querySelector(selector).querySelectorAll('button,[role="button"]')]
                .find(button => label.includes(button.innerText.trim()));
            toggle?.click();
            return Boolean(toggle);
        }, post, toggleLabel);
        assert.ok(switched, '样本没有当前语言所需的翻译入口');
    }
    waitFor((selector, lang) => document.querySelector(selector)?.lang.startsWith(lang), body, language);
    return body;
}

function compareFoldedCopy(t, language) {
    withPost(t, foldedPost, post => {
        const body = showLanguage(post, language);
        const showMore = post + ' [data-testid="tweet-text-show-more-link"]';
        waitFor(selector => Boolean(document.querySelector(selector)), showMore);
        // 在复制前从当前卡片读取 X 已加载的同一份正文，保留当次译文。
        const sample = evaluate((selector, id) => {
            const element = document.querySelector(selector);
            const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
            for (let fiber = element[key]; fiber; fiber = fiber.return) {
                const tweet = fiber.memoizedProps?.tweet ?? fiber.stateNode?.props?.tweet;
                if (tweet?.id_str !== id) continue;
                const translation = tweet.grok_translated_post;
                const text = element.lang === tweet.lang ? tweet.note_tweet?.text
                    : element.lang === translation?.destination_language ? translation.translation : undefined;
                if (text) return { full: text.trim(), preview: element.innerText.trim() };
            }
        }, body, new URL(foldedPost).pathname.split('/').at(-1));
        if (!sample) return t.skip('当前卡片缺少可独立比对的同语言全文');
        const shortUrl = 'https://t.co/QMhmafXMj5';
        assert.ok(sample.full.includes(shortUrl) && sample.full.length > sample.preview.length, '折叠样本须有预览之外的正文和已知链接');
        const expected = sample.full.replace(shortUrl, 'https://karpathy.ai/usaciv/');
        const copied = copyText(post).split('\n\n<video ')[0];
        assert.ok(evaluate(selector => Boolean(document.querySelector(selector)), showMore), '复制动作应保留折叠状态');
        assert.equal(copied, expected, '剪贴板应保留本次完整正文、换行及已知目标网址');
    }, { pageUrl: searchPage });
}

test('[COPY-03] 搜索卡片折叠时复制原文全文', function test_COPY_03(t) {
    compareFoldedCopy(t, 'en');
});

test('[COPY-04] 搜索卡片折叠时复制译文全文', function test_COPY_04(t) {
    compareFoldedCopy(t, 'zh');
});

test('[COPY-05] 三图帖按页面顺序复制 Markdown 图片', function test_COPY_05(t) {
    withPost(t, 'https://x.com/arkuy99/status/2123724788434911274', post => {
        const imageSelector = post + ' a[href*="/status/2123724788434911274/photo/"] [data-testid="tweetPhoto"] img';
        waitFor(selector => document.querySelectorAll(selector).length === 3, imageSelector);
        const expected = evaluate(selector => [...document.querySelectorAll(selector)]
            .map(img => new URL(img.currentSrc || img.src).pathname), imageSelector);
        const copied = [...copyText(post).matchAll(/!\[([^\]]+)]\((https:\/\/pbs\.twimg\.com\/media\/[^)]+)\)/g)];
        assert.deepEqual(copied.map(image => new URL(image[2]).pathname), expected);
        assert.deepEqual(copied.map(image => image[1]), ['picture', 'picture', 'picture']);
    });
});

test('[COPY-06] 引用帖的复制范围只包含主帖正文', function test_COPY_06(t) {
    withPost(t, 'https://x.com/tison1096/status/2126195264109363454', post => {
        const content = evaluate(selector => {
            const card = document.querySelector(selector);
            const quote = [...card.querySelectorAll('[data-testid="quoteTweet"],[role="link"]')]
                .find(element => element.querySelector('[data-testid="User-Name"]')
                    && element.querySelector('[data-testid="tweetText"]'));
            return {
                body: card.querySelector('[data-testid="tweetText"]')?.innerText.trim(),
                quote: quote?.querySelector('[data-testid="tweetText"]').innerText.trim()
            };
        }, post);
        assert.ok(content.body && content.quote && content.body !== content.quote, '样本应同时包含主帖和引用正文');
        assert.equal(copyText(post).trim(), content.body);
    });
});
