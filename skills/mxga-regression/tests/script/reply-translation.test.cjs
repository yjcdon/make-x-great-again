const assert = require('node:assert/strict');
const { test } = require('node:test');
const { copyText, evaluate, waitFor, withPost } = require('./browser.cjs');

const originalLabels = ['显示原文', '顯示原文', 'Show original'];
const translateLabels = ['显示翻译', '顯示翻譯', 'Translate post', 'Show translation'];

function findReply(thread, labels, preferredId) {
    const main = document.querySelector(thread);
    const cards = [...document.querySelectorAll('[data-testid="primaryColumn"] article[data-testid="tweet"]')];
    const threadIndex = cards.indexOf(main);
    if (threadIndex < 0) return null;
    const candidates = cards.slice(threadIndex + 1).flatMap(card => {
        const text = card.querySelector('[data-testid="tweetText"]');
        if (!text?.lang || text.innerText.trim().length < 10 || text.querySelector('a')
            || card.querySelector('[data-testid="tweet-text-show-more-link"],[data-testid="card.wrapper"],[data-testid="tweetPhoto"],video')) return [];
        const id = card.querySelector('[data-testid="User-Name"] a:has(time)')?.pathname.match(/\/status\/(\d+)$/)?.[1];
        if (!id) return [];
        const controls = [...card.querySelectorAll('button,[role="button"]')];
        return [{ id, hasTranslation: controls.some(control => labels.includes(control.innerText.trim())) }];
    });
    // 保留仍在页面里的指定回复，翻译按钮消失时让该样本暴露回归。
    return candidates.find(card => card.id === preferredId)?.id ?? candidates.find(card => card.hasTranslation)?.id ?? null;
}

function hasAction(selector, labels) {
    return [...document.querySelector(selector)?.querySelectorAll('button,[role="button"]') ?? []]
        .some(control => labels.includes(control.innerText.trim()));
}

function switchTranslation(reply, labels) {
    const clicked = evaluate((selector, options) => {
        const controls = document.querySelector(selector).querySelectorAll('button,[role="button"]');
        const toggle = [...controls].find(control => options.includes(control.innerText.trim()));
        if (!toggle) return false;
        toggle.click();
        return true;
    }, reply, labels);
    assert.ok(clicked, '样本回复应提供相应的翻译入口');
}

test('[GROK-01] Grok 回复能翻译、复制译文并切回原文', function test_GROK_01(t) {
    withPost(t, 'https://x.com/OpenAI/status/2123191365983248653', thread => {
        const labels = [...originalLabels, ...translateLabels];
        const preferredId = '2123198831647187242';
        waitFor(findReply, thread, labels, preferredId);
        const id = evaluate(findReply, thread, labels, preferredId);
        const reply = `article[data-testid="tweet"]:has([data-testid="User-Name"] a[href$="/status/${id}"] time)`;
        const body = reply + ' [data-testid="tweetText"]';
        waitFor(hasAction, reply, labels);
        if (evaluate(hasAction, reply, originalLabels)) switchTranslation(reply, originalLabels);
        waitFor(hasAction, reply, translateLabels);
        const original = evaluate(selector => {
            const text = document.querySelector(selector);
            return { text: text.innerText.trim(), language: text.lang };
        }, body);
        assert.ok(original.text && original.language, '样本回复应包含原文及其语言');

        switchTranslation(reply, translateLabels);
        waitFor((selector, source) => {
            const text = document.querySelector(selector);
            return Boolean(text?.lang && text.lang.toLowerCase() !== source.language.toLowerCase()
                && text.innerText.trim() && text.innerText.trim() !== source.text);
        }, body, original);
        const translated = evaluate(selector => document.querySelector(selector).innerText.trim(), body);
        assert.equal(copyText(reply).trim(), translated);

        switchTranslation(reply, originalLabels);
        waitFor((selector, source) => {
            const text = document.querySelector(selector);
            return text?.lang === source.language && text.innerText.trim() === source.text;
        }, body, original);
        t.diagnostic('回复样本 ' + id + '，原文语言 ' + original.language);
    });
});
