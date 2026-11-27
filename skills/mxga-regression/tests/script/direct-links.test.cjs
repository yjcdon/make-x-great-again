const assert = require('node:assert/strict');
const { browser, evaluate, waitFor, withPage, withPost } = require('./browser.cjs');
const { test } = require('node:test');

test('[LINK-01] 帖子中的外链指向完整网址', function test_LINK_01(t) {
    withPost(t, 'https://x.com/karpathy/status/2116979365242429721', post => {
        waitFor(selector => document.querySelector(selector)?.innerText.includes('alphaxiv.org'), post);
        const href = evaluate(selector => [...document.querySelector(selector).querySelectorAll('a[href]')]
            .find(link => link.innerText.includes('alphaxiv.org'))?.href, post);
        assert.equal(href, 'https://www.alphaxiv.org/');
    });
});

test('[LINK-02] 动态悬浮卡中的简介链接指向展开地址', function test_LINK_02(t) {
    withPage(t, 'https://x.com/tison1096', () => {
        const author = '[data-testid="User-Name"] a[href="/tison1096"]:not([aria-hidden="true"])';
        waitFor(selector => Boolean(document.querySelector(selector)), author);
        browser('hover', author);
        waitFor(() => [...document.querySelectorAll('[data-testid="HoverCard"] a[href]')]
            .some(link => link.innerText.replace(/\s/g, '').includes('github.com/tisonkun')));
        const href = evaluate(() => [...document.querySelectorAll('[data-testid="HoverCard"] a[href]')]
            .find(link => link.innerText.replace(/\s/g, '').includes('github.com/tisonkun')).href);
        assert.equal(href, 'https://github.com/tisonkun/');
    });
});
