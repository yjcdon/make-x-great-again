(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    delete window.__mxgaBootstrap;
    const actions = modules.createPostActions(scheduleRefresh);
    const links = modules.createDirectLinks();
    const translation = modules.createNativeTranslation(actions.isDiscussionPage);
    const extensionUiSelector = '.mxga-action-row, .mxga-article-metadata';
    const primarySelector = '[data-testid="primaryColumn"]';
    const articleSelector = '[data-testid="twitterArticleReadView"]';
    let refreshFrame = 0;

    /** 合并同一帧的主栏快捷操作与页面外链更新。 */
    function scheduleRefresh() {
        if (refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = 0;
            const primary = document.querySelector(primarySelector) ?? document;
            const mainPost = actions.refresh(primary);
            const article = mainPost?.querySelector(articleSelector);
            translation.refresh(primary);
            if (actions.isDiscussionPage()) {
                modules.refreshArticleMetadata(article ?? primary.querySelector(articleSelector));
            }
            links.refresh();
        });
    }

    function onPosts(posts) {
        let authorsChanged = false;
        for (const user of posts.authors) {
            if (actions.rememberPostAuthor(user)) authorsChanged = true;
        }
        const linksChanged = links.rememberPostLinks(posts);
        if (authorsChanged || linksChanged) scheduleRefresh();
    }

    /** 跳过页面无关变化和扩展自身的样式、按钮与链接更新。 */
    function affectsContent({ target, type, attributeName, addedNodes, removedNodes }) {
        if (target.nodeType !== Node.ELEMENT_NODE || target.closest(extensionUiSelector)) return false;
        if (type === 'attributes') {
            if (target.matches(actions.viewerSelector)) return true;
            if (attributeName === 'aria-selected') return target.matches('[role="tab"]');
            return links.matchesShortLink(target) || (attributeName === 'href'
                && target.closest(actions.tweetSelector) && target.querySelector('time'));
        }
        const inPrimary = target.closest(primarySelector);
        return [...addedNodes, ...removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE
            && !node.matches(extensionUiSelector)
            && (inPrimary || node.matches(primarySelector + ', ' + actions.viewerSelector)
                || node.querySelector(primarySelector + ', ' + actions.viewerSelector)))
            || [...addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && links.containsShortLink(node));
    }

    function start() {
        new MutationObserver(records => {
            if (records.some(affectsContent)) scheduleRefresh();
        }).observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['aria-selected', 'href', 'title', 'aria-label', 'data-expanded-url']
        });
        window.navigation?.addEventListener('navigatesuccess', scheduleRefresh);
        scheduleRefresh();
    }

    modules.observeXData({
        onPosts,
        onRelationship(data, request) {
            if (actions.rememberRelationship(data, request)) scheduleRefresh();
        }
    });
    window.addEventListener('click', links.openPostLink, true);
    window.addEventListener('auxclick', links.openPostLink, true);
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
