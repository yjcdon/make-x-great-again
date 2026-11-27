const assert = require('node:assert/strict');
const { test } = require('node:test');
const { browser, clickCentered, evaluate, waitFor, withPage, withPost } = require('./browser.cjs');

function withProfilePost(t, handle, own, check) {
    withPage(t, 'https://x.com/' + handle, () => {
        const profileLink = 'a[data-testid="AppTabBar_Profile_Link"]';
        waitFor(selector => Boolean(document.querySelector(selector)) || location.pathname.startsWith('/i/flow/login'), profileLink);
        const viewer = evaluate(selector => document.querySelector(selector)?.pathname.toLowerCase(), profileLink);
        if (!viewer || (viewer === '/' + handle) !== own) return t.skip('当前账号与主页样本的作者身份不符');
        const header = '[data-testid="User-Name"] a[href^="/' + handle + '/status/"]:has(time)';
        const posts = '[data-testid="primaryColumn"] article[data-testid="tweet"]';
        const firstAuthorPost = (selector, header) => {
            for (const card of document.querySelectorAll(selector)) {
                const link = card.querySelector('[data-testid="User-Name"]')?.querySelector('a:has(time)');
                if (link?.matches(header) && card.querySelector('[data-testid="tweetText"]')) return link.pathname;
            }
        };
        waitFor(firstAuthorPost, posts, header);
        const path = evaluate(firstAuthorPost, posts, header);
        t.diagnostic('主页卡片 ' + path);
        check(posts + ':has([data-testid="User-Name"] a[href="' + path + '"] time)');
    });
}

test('[AUTHOR-01] 他人主页的复制和屏蔽按钮同排', function test_AUTHOR_01(t) {
    withProfilePost(t, 'karpathy', false, post => {
        const row = post + ' .mxga-action-row:not([hidden])';
        waitFor(selector => Boolean(document.querySelector(selector + ' button.mxga-block:not([hidden])')), row);
        const layout = evaluate((selector, row) => {
            const buttons = document.querySelector(selector).querySelectorAll('button.mxga-card-copy');
            const copy = buttons[0]?.getBoundingClientRect();
            const block = document.querySelector(row + ' button.mxga-block').getBoundingClientRect();
            return { count: buttons.length, sameRow: Boolean(buttons[0]?.closest('.mxga-action-row') &&
                copy.width && block.width && Math.abs((copy.top + copy.bottom - block.top - block.bottom) / 2) < 2) };
        }, post, row);
        assert.deepEqual(layout, { count: 1, sameRow: true });
    });
});

test('[AUTHOR-02] 自己主页的复制按钮位于 Grok 旁', function test_AUTHOR_02(t) {
    withProfilePost(t, 'yjcdon', true, post => {
        const grok = post + ' button[aria-label*="Grok" i]';
        if (!evaluate(selector => Boolean(document.querySelector(selector)), grok)) return t.skip('主页样本缺少原生 Grok 按钮');
        waitFor(selector => Boolean(document.querySelector(selector + ' button.mxga-card-copy')), post);
        const layout = evaluate((selector, grokSelector) => {
            const card = document.querySelector(selector);
            const copies = card.querySelectorAll('button.mxga-card-copy');
            const next = copies[0].nextElementSibling;
            const row = card.querySelector('.mxga-action-row');
            return { count: copies.length, besideGrok: Boolean(copies[0].getClientRects().length &&
                next?.contains(document.querySelector(grokSelector))), rowHidden: !row?.getClientRects().length };
        }, post, grok);
        assert.deepEqual(layout, { count: 1, besideGrok: true, rowHidden: true });
    });
});

function readNativeRelation(post, handle) {
    const menuItem = '[role="menu"] [role="menuitem"]';
    const caret = post + ' button[data-testid="caret"]';
    clickCentered(caret);
    try {
        waitFor(selector => [...document.querySelectorAll(selector)].some(item => item.getClientRects().length), menuItem);
        return evaluate((selector, author) => {
            const actions = [...document.querySelectorAll(selector)]
                .filter(item => item.getClientRects().length)
                .map(item => item.innerText.trim().toLowerCase());
            const target = ' @' + author;
            if (['取消关注', '取消關注', '取消跟隨', 'unfollow'].some(label => actions.includes(label + target))) return 'unfollow';
            if (['关注', '關注', '跟隨', 'follow'].some(label => actions.includes(label + target))) return 'follow';
            return null;
        }, menuItem, handle);
    } finally {
        browser('press', 'Escape');
        waitFor(selector => ![...document.querySelectorAll(selector)].some(item => item.getClientRects().length), menuItem);
    }
}

function assertFollowShortcut(post, expected) {
    const follow = post + ' button.mxga-follow:not([hidden])';
    waitFor((selector, action) => document.querySelector(selector)?.dataset.action === action, follow, expected);
    assert.equal(evaluate(selector => document.querySelector(selector).innerText.trim(), follow), expected === 'follow' ? '关注' : '取关');
}

const relationSamples = [
    'https://x.com/arkuy99/status/2123724788434911274',
    'https://x.com/karpathy/status/2116979365242429721',
    'https://x.com/tison1096/status/2126195264109363454'
];

function checkRelationSamples(t, samples, expected) {
    for (const url of samples) {
        const handle = new URL(url).pathname.split('/')[1].toLowerCase();
        const matched = withPost(t, url, post => {
            const action = readNativeRelation(post, handle);
            if (action !== expected) return false;
            assertFollowShortcut(post, action);
            t.diagnostic('原生菜单样本 @' + handle);
            return true;
        }, { tryNextSample: true });
        if (matched !== false) return;
    }
    t.skip(expected === 'follow' ? '样本中暂无未关注作者' : '样本中暂无已关注作者');
}

test('[AUTHOR-03] 关注状态与 X 原生菜单一致', function test_AUTHOR_03(t) {
    return checkRelationSamples(t, relationSamples, 'follow');
});

test('[AUTHOR-04] 取关状态与 X 原生菜单一致', function test_AUTHOR_04(t) {
    return checkRelationSamples(t, [relationSamples[1], relationSamples[0], relationSamples[2]], 'unfollow');
});
