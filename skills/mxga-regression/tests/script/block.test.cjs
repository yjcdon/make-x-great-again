const assert = require('node:assert/strict');
const { test } = require('node:test');
const { browser, clickCentered, evaluate, waitFor, withPost } = require('./browser.cjs');

test('[BLOCK-01] 屏蔽确认框显示目标账号且取消后原帖可见', function test_BLOCK_01(t) {
    const sample = 'https://x.com/karpathy/status/2116979365242429721';
    const author = '@' + new URL(sample).pathname.split('/')[1].toLowerCase();
    withPost(t, sample, post => {
        const button = post + ' button.mxga-block:not([hidden])';
        const cancel = 'button[data-testid="confirmationSheetCancel"]';
        browser('wait', button);
        assert.equal(evaluate(selector => document.querySelector(selector).getAttribute('aria-label')?.toLowerCase(), button),
            '屏蔽 ' + author);
        clickCentered(button);
        browser('wait', cancel);
        try {
            const confirmation = evaluate(selector => {
                const dialog = document.querySelector(selector).closest('[role="dialog"],[role="alertdialog"]');
                return {
                    text: dialog?.innerText,
                    confirm: Boolean(dialog?.querySelector('[data-testid="confirmationSheetConfirm"]'))
                };
            }, cancel);
            assert.ok(confirmation.text?.toLowerCase().match(/@[a-z0-9_]+/g)?.includes(author), '确认框应列出样本作者');
            assert.equal(confirmation.confirm, true);
        } finally {
            browser('click', cancel);
        }
        waitFor((cancelSelector, blockSelector) => {
            const confirmation = document.querySelector(cancelSelector);
            const block = document.querySelector(blockSelector);
            const openMenu = [...document.querySelectorAll('[role="menu"]')].some(menu => menu.getClientRects().length);
            return !confirmation && !openMenu && block?.getClientRects().length
                && block.getAttribute('aria-disabled') !== 'true';
        }, cancel, button);
        assert.ok(evaluate(selector => document.querySelector(selector).getClientRects().length > 0, post));
    });
});
