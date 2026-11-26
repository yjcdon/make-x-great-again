(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    delete window.__mxgaBootstrap;
    const actions = modules.createPostActions(queuePost);
    const links = modules.directLinks;
    const translation = modules.createNativeTranslation(actions);
    const extensionUiSelector = '.mxga-action-row, .mxga-article-metadata, .mxga-card-copy-inline';
    const primarySelector = '[data-testid="primaryColumn"]';
    const articleSelector = '[data-testid="twitterArticleReadView"]';
    const articleTitleSelector = '[data-testid="twitter-article-title"]';
    const articleFooterSelector = articleSelector + ' + *';
    const authorSelector = '[data-testid="User-Name"]';
    const textSelector = '[data-testid="tweetText"]';
    const analyticsSelector = 'a[href$="/analytics"]';
    const postPartSelector = [authorSelector, textSelector, 'button[data-testid="caret"]', actions.grokSelector, 'time', articleSelector,
        articleTitleSelector, analyticsSelector, modules.previewLinkSelector].join(', ');
    const postTestIds = new Set(['tweet', 'User-Name', 'tweetText', 'card.wrapper', 'caret',
        'twitterArticleReadView', 'twitter-article-title']);
    const scopeSelector = primarySelector + ', ' + actions.viewerSelector;
    const pendingPosts = new Set();
    const frameBudget = 4;
    const beforePaintBudget = 1.5;
    let primary;
    let frame = 0;
    let beforePaintWork = 0;
    let pageChanged = true;
    let viewerChanged = true;
    let pendingMetadata;

    function scheduleFrame() {
        if (!frame && document.body) frame = requestAnimationFrame(refresh);
    }

    function queuePost(post) {
        pendingPosts.add(post);
        scheduleFrame();
    }

    function refreshPosts(deadline) {
        for (const post of pendingPosts) {
            if (performance.now() >= deadline) break;
            pendingPosts.delete(post);
            if (primary.contains(post) && post.matches(actions.tweetSelector)) {
                const main = actions.refreshPost(post);
                translation.refresh(post);
                if (main) modules.refreshArticleMetadata(post.querySelector(articleSelector));
            } else {
                actions.removePost(post);
            }
        }
    }

    /** 合并同一帧的更新，长列表分帧补齐。只有页面范围或账号变化时才重扫主栏。 */
    function refresh() {
        const deadline = performance.now() + Math.max(0, frameBudget - beforePaintWork);
        beforePaintWork = 0;
        if (pageChanged || viewerChanged) {
            if (pageChanged) primary = document.querySelector(primarySelector) ?? document;
            if (actions.updatePage(primary, viewerChanged)) {
                for (const post of primary.querySelectorAll(actions.tweetSelector)) pendingPosts.add(post);
                if (pageChanged && actions.isDiscussionPage()) {
                    pendingMetadata = primary.querySelector(articleSelector);
                }
            }
            pageChanged = viewerChanged = false;
        }

        refreshPosts(deadline);

        if (pendingMetadata && performance.now() < deadline) {
            if (actions.isDiscussionPage() && primary.contains(pendingMetadata)) {
                modules.refreshArticleMetadata(pendingMetadata);
            }
            pendingMetadata = undefined;
        }

        links.refresh(deadline);

        frame = 0;
        if (pendingPosts.size || links.hasPendingWork() || pendingMetadata) scheduleFrame();
    }

    function refreshAuthor(handle) {
        if (handle) actions.refreshAuthor(handle);
    }

    function onPosts(posts) {
        for (const user of posts.authors) refreshAuthor(actions.rememberPostAuthor(user));
        actions.rememberReplies(posts.replyParents);
        modules.rememberNoteTexts(posts.noteTexts);
        links.rememberPostLinks(posts);
        if (links.hasPendingWork()) scheduleFrame();
    }

    function saveAttributeChange({ target, attributeName, oldValue }) {
        if (attributeName === 'data-testid') {
            const testId = target.getAttribute('data-testid');
            if (testId === 'primaryColumn' || oldValue === 'primaryColumn') pageChanged = true;
            if (testId === 'AppTabBar_Profile_Link' || oldValue === 'AppTabBar_Profile_Link') viewerChanged = true;
            if (postTestIds.has(testId) || postTestIds.has(oldValue)) {
                const post = (testId === 'tweet' || oldValue === 'tweet') && target.localName === 'article'
                    ? target : target.closest(actions.tweetSelector);
                if (post && primary?.contains(post)) pendingPosts.add(post);
            }
        } else if (attributeName === 'href' && target.matches(actions.viewerSelector)) {
            viewerChanged = true;
        } else if ((attributeName === 'lang' && target.matches(textSelector))
            || (attributeName === 'aria-label' && target.matches(actions.grokSelector)) || (attributeName === 'href'
            && target.matches('a') && (target.matches(analyticsSelector) || target.matches(modules.previewLinkSelector)
                || target.querySelector('time') || target.closest(authorSelector)))) {
            const post = target.closest(actions.tweetSelector);
            if (post && primary?.contains(post)) pendingPosts.add(post);
        }
        if (target.localName === 'a') links.queueLink(target);
    }

    function saveChildChanges({ target, addedNodes, removedNodes }) {
        const inPrimary = primary?.contains(target);
        const post = inPrimary && target.closest(actions.tweetSelector);
        if (post && target.closest(textSelector)) pendingPosts.add(post);
        const outsideDiscussionCard = inPrimary && !post && actions.isDiscussionPage();
        if (outsideDiscussionCard) {
            const view = target.closest(articleSelector) ?? target.closest(articleFooterSelector)?.previousElementSibling;
            if (view) pendingMetadata = view;
        }
        for (const node of [...addedNodes, ...removedNodes]) {
            if (node.nodeType !== Node.ELEMENT_NODE || node.matches(extensionUiSelector)) continue;
            if (!inPrimary || primary === document) {
                if (node.matches(scopeSelector) || node.querySelector(scopeSelector)) {
                    pageChanged ||= node.matches(primarySelector) || Boolean(node.querySelector(primarySelector));
                    viewerChanged ||= node.matches(actions.viewerSelector) || Boolean(node.querySelector(actions.viewerSelector));
                }
            }
            if (inPrimary || (primary && node.contains(primary))) {
                if (node.matches(actions.tweetSelector)) pendingPosts.add(node);
                for (const card of node.querySelectorAll(actions.tweetSelector)) pendingPosts.add(card);
                if (post && (node.matches(postPartSelector) || node.querySelector(postPartSelector))) pendingPosts.add(post);
            }
        }
        for (const node of addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !node.matches(extensionUiSelector)) links.queueRoot(node);
            if (outsideDiscussionCard && node.nodeType === Node.ELEMENT_NODE) {
                const view = node.matches(articleSelector) ? node
                    : node.matches(articleFooterSelector) ? node.previousElementSibling : node.querySelector(articleSelector);
                if (view) pendingMetadata = view;
            }
        }
        for (const node of removedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            links.retryUnresolved();
            break;
        }
    }

    function start() {
        new MutationObserver(records => {
            for (const record of records) {
                const { target } = record;
                if (target.nodeType !== Node.ELEMENT_NODE || target.closest(extensionUiSelector)) continue;
                if (record.type === 'attributes') saveAttributeChange(record);
                else saveChildChanges(record);
            }
            if (pageChanged || viewerChanged || pendingPosts.size || links.hasPendingWork() || pendingMetadata) scheduleFrame();
            if (!pageChanged && !viewerChanged && pendingPosts.size && beforePaintWork < beforePaintBudget
                && actions.isCurrentPage()) {
                // X 在滚动中挂载卡片时，先在本次绘制前补齐少量卡片。其耗时计入同一帧的预算。
                const start = performance.now();
                refreshPosts(start + beforePaintBudget - beforePaintWork);
                beforePaintWork += performance.now() - start;
            }
        }).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeOldValue: true,
            attributeFilter: ['data-testid', 'lang', 'href', 'title', 'aria-label', 'data-expanded-url']
        });
        window.navigation?.addEventListener('navigatesuccess', () => {
            pageChanged = true;
            links.queueUnresolved();
            scheduleFrame();
        });
        scheduleFrame();
    }

    modules.observeXData({
        onPosts,
        onRelationship(data, request) {
            refreshAuthor(actions.rememberRelationship(data, request));
        }
    });
    window.addEventListener('click', links.openLink, true);
    window.addEventListener('auxclick', links.openLink, true);
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
