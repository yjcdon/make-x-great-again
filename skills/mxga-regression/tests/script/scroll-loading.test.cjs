const assert = require('node:assert/strict');
const { test } = require('node:test');
const { browser, evaluate, waitFor, withPost } = require('./browser.cjs');

function readCards(exclude = [], minReady = 0) {
    const viewer = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.pathname.toLowerCase();
    const cards = [...document.querySelectorAll('[data-testid="primaryColumn"] article[data-testid="tweet"]')].flatMap(card => {
        const href = card.querySelector('[data-testid="User-Name"] a:has(time)')?.pathname;
        const author = href?.match(/^\/(\w+)\/status\/\d+$/)?.[1]?.toLowerCase();
        if (!author || '/' + author === viewer || exclude.includes(href)
            || !card.querySelector('button[data-testid="caret"]') || !card.querySelector('[data-testid="tweetText"]')) return [];
        const visibleButtons = selector => [...card.querySelectorAll(selector)].filter(button =>
            button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0 &&
            button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
        const blocks = visibleButtons('button.mxga-block');
        return [{
            href, author,
            copyCount: visibleButtons('button.mxga-card-copy').length,
            blockTargets: blocks.map(block => block.getAttribute('aria-label'))
        }];
    });
    if (!minReady) return cards;
    return cards.length >= minReady && cards.every(card => card.copyCount > 0 && card.blockTargets.length > 0);
}

test('[SCROLL-01] 滚动加载的新回复各显示一个复制按钮和正确的屏蔽目标', function test_SCROLL_01(t) {
    const url = 'https://x.com/OpenAI/status/2123191365983248653';
    withPost(t, url, () => {
        const thread = new URL(url).pathname;
        waitFor(readCards, [thread], 2);
        const before = evaluate(readCards, [thread]).map(card => card.href);
        const exclude = [...before, thread];
        const distance = String(Math.round(evaluate(() => window.innerHeight) * 1.5));
        const maxScrolls = 6;
        for (let step = 0; step < maxScrolls; step += 1) {
            browser('scroll', 'down', distance);
            const next = evaluate(readCards, exclude);
            if (new Set(next.map(card => card.href)).size >= 2) break;
        }

        waitFor(readCards, exclude, 2);
        const visible = evaluate(readCards, exclude);
        assert.ok(new Set(visible.map(card => card.href)).size >= 2, '滚动后至少挂载两条初始列表没有的回复');
        for (const card of visible) {
            assert.equal(card.copyCount, 1, card.href);
            assert.deepEqual(card.blockTargets, ['屏蔽 @' + card.author], card.href);
        }
        t.diagnostic('本轮核对新挂载回复 ' + new Set(visible.map(card => card.href)).size + ' 条');
    });
});
