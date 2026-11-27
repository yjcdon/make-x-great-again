const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');

const session = process.env.MXGA_CHROME_SESSION || 'my-chrome';

function browser(...args) {
    const output = spawnSync('agent-browser', ['--session', session, '--json', ...args], {
        encoding: 'utf8', timeout: 30000,
        env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '10000' }
    });
    if (output.error) throw output.error;
    if (!output.stdout) throw new Error(output.stderr || 'Chrome 命令未返回结果');
    const result = JSON.parse(output.stdout);
    if (!result.success) throw new Error(result.error);
    return result.data;
}

function evaluate(fn, ...args) {
    return browser('eval', expression(fn, ...args)).result;
}

function expression(fn, ...args) {
    return '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')';
}

function waitFor(fn, ...args) {
    browser('wait', '--fn', expression(fn, ...args));
}

function clickCentered(selector) {
    browser('wait', selector);
    evaluate(target => {
        document.querySelector(target).scrollIntoView({ block: 'center', behavior: 'instant' });
    }, selector);
    waitFor(target => {
        const element = document.querySelector(target);
        if (!element) return false;
        const { x, y, width, height } = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    }, selector);
    browser('click', selector);
}

function withTab(url, useTab) {
    const tab = browser('tab', 'new', url);
    try {
        return useTab();
    } finally {
        browser('tab', 'close', tab.tabId);
    }
}

const expectedSource = process.env.MXGA_TEST_SOURCE || 'UNPACKED';
assert.ok(['UNPACKED', 'FROM_STORE'].includes(expectedSource), 'MXGA_TEST_SOURCE 应为 UNPACKED 或 FROM_STORE');
const workspaceExtension = require('node:path').resolve(__dirname, '../../../../extension');
let enabledExtensions;

function withPage(t, url, run) {
    const sessions = execFileSync('agent-browser', ['session', 'list'], { encoding: 'utf8', timeout: 5000 });
    if (!sessions.split('\n').some(line => line.trim() === session)) return t.skip('Chrome 会话未连接：' + session);
    const originalTab = browser('tab', 'list').tabs.find(tab => tab.active);
    try {
        enabledExtensions ??= withTab('chrome://extensions/', () => {
            waitFor(() => Boolean(document.querySelector('extensions-manager')?.shadowRoot
                ?.querySelector('extensions-item-list')?.shadowRoot?.querySelector('extensions-item')));
            return evaluate(() => {
                const list = document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list');
                return [...list.shadowRoot.querySelectorAll('extensions-item')]
                    .filter(item => item.data.name === 'Make X Great Again' && item.data.state === 'ENABLED')
                    .map(item => ({ version: item.data.version, source: item.data.location, path: item.data.path }));
            });
        });
        const [extension] = enabledExtensions;
        if (enabledExtensions.length !== 1 || extension.source !== expectedSource) {
            const observed = enabledExtensions.map(item => item.source + ' ' + item.version).join(', ') || '无';
            return t.skip('无法单独验证 ' + expectedSource + '，当前启用 ' + observed);
        }
        if (expectedSource === 'UNPACKED' && extension.path !== workspaceExtension) {
            return t.skip('已加载的本地扩展目录与当前工作区不符');
        }
        t.diagnostic('Chrome 扩展 ' + extension.version + ' (' + extension.source + ')');

        return withTab(url, run);
    } finally {
        if (originalTab) browser('tab', originalTab.tabId);
    }
}

function withPost(t, url, run, { pageUrl = url, tryNextSample = false } = {}) {
    const id = new URL(url).pathname.split('/').at(-1);
    const post = `article[data-testid="tweet"]:has(a[href$="/status/${id}"] time)`;
    return withPage(t, pageUrl, () => {
        waitFor(selector => Boolean(document.querySelector(selector) || document.querySelector('[data-testid="error-detail"]'))
            || location.pathname.startsWith('/i/flow/login'), post);
        if (!evaluate(selector => Boolean(document.querySelector(selector)), post)) {
            if (evaluate(() => location.pathname.startsWith('/i/flow/login'))) return t.skip('X 要求登录');
            if (tryNextSample) {
                t.diagnostic('跳过不可用的样本 ' + url);
                return false;
            }
            return t.skip('X 提示样本不可用：' + url);
        }
        return run(post);
    });
}

function copyText(post) {
    const copy = post + ' button.mxga-card-copy';
    browser('wait', copy);
    assert.equal(evaluate(selector => document.querySelector(selector).getAttribute('aria-label'), copy), '复制全文');
    const focused = evaluate(selector => {
        const button = document.querySelector(selector);
        button.focus();
        return document.activeElement === button;
    }, copy);
    assert.ok(focused, 'Chrome 未聚焦当前帖子的复制按钮');
    browser('press', 'Space');
    const copied = evaluate(async selector => {
        const button = document.querySelector(selector);
        if (button.getAttribute('aria-label') !== '已复制' && navigator.userActivation.isActive) {
            button.click();
        }
        const deadline = performance.now() + 800;
        while (button.getAttribute('aria-label') !== '已复制' && performance.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        return button.getAttribute('aria-label') === '已复制';
    }, copy);
    assert.ok(copied, 'Chrome 未显示复制成功状态');
    return execFileSync('pbpaste', ['-Prefer', 'txt'], { encoding: 'utf8', timeout: 5000 });
}

module.exports = { browser, evaluate, waitFor, clickCentered, withPage, withPost, copyText };
