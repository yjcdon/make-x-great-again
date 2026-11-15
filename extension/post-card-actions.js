(() => {
    'use strict';

    const tweetSelector = 'article[data-testid="tweet"]';
    const authorSelector = '[data-testid="User-Name"]';
    const caretSelector = 'button[data-testid="caret"]';
    const expandedCaretSelector = tweetSelector + ' ' + caretSelector + '[aria-expanded="true"]';
    const dropdownSelector = '[role="menu"] [data-testid="Dropdown"]';
    const confirmationSelector = '[data-testid="confirmationSheetCancel"], [data-testid="confirmationSheetConfirm"]';
    const postLinkSelector = ':is([data-testid="tweetText"], [data-testid="twitterArticleRichTextView"], '
        + '[data-testid="primaryColumn"]) a[href]';
    const shortLinkSelector = ':is(a[href^="https://t.co/"], a[href^="http://t.co/"])';
    const postDataPath = /^\/i\/api\/graphql\/[^/]+\/(?:Home(?:Latest)?Timeline|TweetDetail|TweetResultByRestId|ConversationTimelineV2|NotificationsTimeline|UserTweets(?:AndReplies)?|User(?:Originals|Replies|Reposts)Timeline)$/;
    const postPath = /^\/([\w]+)\/status\/(\d+)$/;
    const discussionPath = /^\/(?:[\w]+|i\/web)\/status\/(\d+)\/?$/;
    const notificationsPath = /^\/notifications(?:\/(?:verified|mentions))?\/?$/;
    const relationshipPath = /^\/i\/api\/1\.1\/friendships\/(?:create|destroy)\.json$/;
    const menuLabels = {
        follow: /^(?:关注|關注|跟隨|Follow)\s+@([\w]+)$/i,
        unfollow: /^(?:取消关注|取消關注|取消跟隨|Unfollow)\s+@([\w]+)$/i,
        block: /^(?:屏蔽|封鎖|Block)\s+@([\w]+)$/i,
        feedback: /^(?:对此帖子不感兴趣|對此貼文不感興趣|對此帖子不感興趣|Not interested in this post|Show less often)$/i
    };
    const feedbackIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13.6c1.64-.013 3.278.76 4.284 2.02.114.14.218.282.317.43l-1.202.9c-.088-.102-.177-.197-.272-.289-.844-.823-1.98-1.264-3.125-1.26-1.146-.002-2.282.441-3.129 1.263-.095.092-.185.186-.273.287l-1.2-.902c.1-.149.205-.29.319-.429C8.728 14.364 10.36 13.59 12 13.6zM9.25 8c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9zm5.5 0c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9z"/><path fill-rule="evenodd" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z"/></svg>';
    const relationships = new Map();
    const accountsById = new Map();
    const linkDestinations = new Map();
    const rewrittenLinks = new WeakMap();
    const countFormat = new Intl.NumberFormat('en');
    const blockIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m5.6 5.6 12.8 12.8" stroke="currentColor" stroke-width="2"/></svg>';
    const cards = new WeakMap();
    let relationshipRequest = 0;
    let refreshFrame = 0;
    let openingMenu = false;

    function rememberPostAuthor(user) {
        const id = user.rest_id ?? user.id_str;
        const name = user.core?.screen_name ?? user.legacy?.screen_name ?? user.screen_name;
        const requested = user.relationship_perspectives?.follow_request_sent ?? user.legacy?.follow_request_sent ?? user.follow_request_sent;
        const following = user.relationship_perspectives?.following ?? user.legacy?.following ?? user.following;
        if (typeof id !== 'string' || typeof name !== 'string' || typeof following !== 'boolean') return;

        const handle = name.toLowerCase();
        accountsById.set(id, handle);
        const previous = relationships.get(handle);
        // 页面快照仍可补充计数，关注状态以成功的操作响应为准。
        relationships.set(handle, {
            following,
            requested: requested === true,
            protected: (user.privacy?.protected ?? user.legacy?.protected ?? user.protected) === true,
            confirmedRequest: 0,
            ...(previous?.confirmedRequest ? previous : {}),
            followingCount: user.relationship_counts?.following
                ?? user.legacy?.friends_count ?? user.friends_count ?? previous?.followingCount,
            followersCount: user.relationship_counts?.followers
                ?? user.legacy?.followers_count ?? user.followers_count ?? previous?.followersCount
        });
    }

    /** 只接受完整的网页地址，便于安全替换帖子中的短链接。 */
    function readWebUrl(value) {
        if (typeof value !== 'string' || !/^https?:\/\/[^\s]+$/i.test(value) || /(?:…|\.{3})$/.test(value)) return;
        try {
            const url = new URL(value);
            if (!url.username && !url.password) return url;
        } catch {
            // 无法解析的链接沿用 X 的原地址。
        }
    }

    /** 原文有时仍是短链，而实体中的 url 已经是完整地址。 */
    function rememberLinkEntities(entries, text) {
        if (!Array.isArray(entries)) return;
        const characters = typeof text === 'string' ? Array.from(text) : [];
        for (const entry of entries) {
            const target = readWebUrl(entry?.expanded_url);
            if (!target || target.hostname === 't.co') continue;

            let short = readWebUrl(entry.url);
            if (short?.href === target.href && Array.isArray(entry.indices)) {
                const [start, end] = entry.indices;
                if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= characters.length) {
                    const source = characters.slice(start, end).join('');
                    if (/^https?:\/\/t\.co\/[a-z\d]+$/i.test(source)) short = readWebUrl(source);
                }
            }
            if (short?.hostname === 't.co') linkDestinations.set(short.pathname, target.href);
        }
    }

    /** 用卡片自己的链接字段补全预览图使用的短链。 */
    function rememberCardLink(card) {
        const values = card.legacy?.binding_values;
        if (!Array.isArray(values)) return;
        const preview = readWebUrl(values.find(binding => binding?.key === 'card_url')?.value?.string_value);
        if (!preview) return;

        const short = readWebUrl(card.legacy.url) ?? readWebUrl(card.rest_id);
        if (short?.hostname !== 't.co' || linkDestinations.has(short.pathname)) return;
        const destination = preview.hostname === 't.co' ? linkDestinations.get(preview.pathname) : preview.href;
        if (destination) linkDestinations.set(short.pathname, destination);
    }

    /** 复用 X 已加载的帖子数据读取作者与短链接的目标地址。 */
    function rememberPosts(posts) {
        if (!posts) return;
        const nodes = [posts];
        const linkCards = [];
        while (nodes.length) {
            const node = nodes.pop();
            if (!node || typeof node !== 'object') continue;
            if (node.user_results?.result) rememberPostAuthor(node.user_results.result);
            rememberLinkEntities(node.urls);
            rememberLinkEntities(node.entities?.urls, node.full_text);
            if (node.card?.legacy) linkCards.push(node.card);
            for (const value of Object.values(node)) {
                if (value && typeof value === 'object') nodes.push(value);
            }
        }
        for (const card of linkCards) rememberCardLink(card);
    }

    /** 从 X 已加载的帖子或关注操作响应同步扩展数据。 */
    function rememberResponse(data, request) {
        if (!request.number) {
            const posts = data?.data;
            const profile = posts?.user?.result;
            rememberPosts(posts?.home ?? posts?.threaded_conversation_with_injections_v2
                ?? posts?.threaded_conversation_with_injections
                ?? posts?.viewer_v2?.user_results?.result?.notification_timeline?.timeline
                ?? profile?.timeline_v2?.timeline ?? profile?.timeline?.timeline ?? posts?.tweetResult?.result);
        } else {
            if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || data.errors?.length) return;
            const id = data.id_str ?? data.rest_id ?? request.userId;
            if (typeof id !== 'string' || (request.userId && request.userId !== id)) return;
            const handle = accountsById.get(id);
            const previous = relationships.get(handle);
            if (!previous || previous.confirmedRequest > request.number) return;

            const protectedAccount = data.protected ?? previous.protected;
            const requested = request.following && data.follow_request_sent === true;
            if (request.following && protectedAccount && !requested && data.following !== true) return;
            relationships.set(handle, {
                ...previous,
                following: request.following && !requested,
                requested,
                protected: protectedAccount,
                confirmedRequest: request.number
            });
        }
        scheduleRefresh();
    }

    // 只读取 X 已经发起的帖子和关注请求。
    function observedRequest(url, method) {
        try {
            const target = new URL(url, location.href);
            const { pathname } = target;
            if (target.origin !== location.origin) return;
            if (postDataPath.test(pathname)) return { number: 0 };
            if (method.toUpperCase() === 'POST' && relationshipPath.test(pathname)) {
                return { following: pathname.endsWith('/create.json'), userId: target.searchParams.get('user_id') };
            }
        } catch {
            // 由 X 的原生请求处理无效 URL。
        }
    }

    function startObserving(request, body) {
        if (request.number === 0) return request;
        const params = typeof body === 'string' ? new URLSearchParams(body) : body;
        const userId = params instanceof URLSearchParams ? params.get('user_id') : null;
        return { ...request, userId: userId ?? request.userId, number: ++relationshipRequest };
    }

    const nativeFetch = window.fetch;
    window.fetch = function (input, options) {
        const pending = Reflect.apply(nativeFetch, this, arguments);
        const url = input instanceof Request ? input.url : input;
        if (typeof url === 'string' || url instanceof URL) {
            const observed = observedRequest(url, options?.method ?? (input instanceof Request ? input.method : 'GET'));
            if (!observed) return pending;
            const request = startObserving(observed, options?.body);
            void pending.then(async (response) => {
                if (!response.ok) return;
                rememberResponse(response.status === 204 ? {} : await response.clone().json(), request);
            }).catch(() => { /* X 仍处理原始请求结果。 */ });
        }
        return pending;
    };

    const xhrRequests = new WeakMap();
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        const result = Reflect.apply(nativeOpen, this, arguments);
        const observed = typeof url === 'string' || url instanceof URL ? observedRequest(url, method) : undefined;
        if (observed) {
            xhrRequests.set(this, observed);
        } else {
            xhrRequests.delete(this);
        }
        return result;
    };
    XMLHttpRequest.prototype.send = function (body) {
        const observed = xhrRequests.get(this);
        if (observed) {
            const request = startObserving(observed, body);
            this.addEventListener('loadend', () => {
                if (this.status < 200 || this.status >= 300) return;
                try {
                    const data = this.status === 204 ? {}
                        : this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                    rememberResponse(data, request);
                } catch (error) {
                    console.warn('MXGA 无法读取 X 的关注状态', error);
                }
            }, { once: true });
        }
        return Reflect.apply(nativeSend, this, arguments);
    };

    /** 从 X 的个人资料导航识别当前登录账号。 */
    function readViewerHandle() {
        const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"][href]');
        if (link?.origin !== location.origin) return;
        return /^\/([\w]+)\/?$/.exec(link.pathname)?.[1].toLowerCase();
    }

    function readPost(article) {
        const author = article.querySelector(authorSelector);
        const link = author?.querySelector('a:has(time)');
        const match = postPath.exec(link?.pathname ?? '');
        const caret = article.querySelector(caretSelector);
        if (!match || !caret || !author.parentElement || link.origin !== location.origin) return null;
        let header = author.parentElement;
        while (header !== article && !header.contains(caret)) header = header.parentElement;
        if (header === article) return null;
        return { author, handle: match[1].toLowerCase(), id: match[2], caret, header };
    }

    function selectedHomeTab() {
        return document.querySelector('[role="tab"][aria-selected="true"]');
    }

    function ownsPost(article, post) {
        if (!article.isConnected) return false;
        const current = readPost(article);
        return current?.id === post.id && current.handle === post.handle && current.caret === post.caret;
    }

    function visibleMenus() {
        return [...document.querySelectorAll(dropdownSelector)].filter(menu => menu.getClientRects().length > 0);
    }

    function soleOpenMenu(caret) {
        const expanded = document.querySelectorAll(expandedCaretSelector);
        if (expanded.length !== 1 || expanded[0] !== caret) return null;
        const menus = visibleMenus();
        return menus.length === 1 ? menus[0] : null;
    }

    function waitForDom(check, timeoutMs = 1200) {
        const ready = check();
        if (ready) return Promise.resolve(ready);
        return new Promise((resolve) => {
            const watcher = new MutationObserver(() => {
                const value = check();
                if (value) finish(value);
            });
            const timeout = timeoutMs ? setTimeout(() => finish(null), timeoutMs) : undefined;
            function finish(value) {
                clearTimeout(timeout);
                watcher.disconnect();
                resolve(value);
            }
            watcher.observe(document.body, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['aria-expanded', 'aria-hidden', 'hidden']
            });
        });
    }

    function blockConfirmation() {
        return [...document.querySelectorAll(confirmationSelector)].some(control =>
            control.getClientRects().length && !control.closest('[aria-hidden="true"], [hidden]'));
    }

    /** 屏蔽确认结束后收起 X 恢复的原下拉菜单，手动打开菜单时交还控制。 */
    async function finishBlockMenu(post, canAct) {
        let manualMenu = false;
        const noteManualMenu = (event) => {
            if (event.isTrusted && event.target.closest?.(caretSelector)) manualMenu = true;
        };
        document.addEventListener('click', noteManualMenu, true);
        try {
            if (await waitForDom(() => !canAct() || blockConfirmation())) {
                await waitForDom(() => !canAct() || !blockConfirmation(), 0);
            }
            // X 可能在确认框卸载之后才恢复三点菜单。
            const menu = await waitForDom(() => manualMenu || !canAct() || soleOpenMenu(post.caret));
            if (!menu || menu === true || manualMenu || !canAct() || soleOpenMenu(post.caret) !== menu) return;

            menu.classList.add('mxga-shortcut-menu');
            try {
                post.caret.click();
                await waitForDom(() => !menu.isConnected || !menu.getClientRects().length);
            } finally {
                menu.classList.remove('mxga-shortcut-menu');
            }
        } finally {
            document.removeEventListener('click', noteManualMenu, true);
        }
    }

    function matchingItem(menu, action, handle) {
        const items = [...menu.querySelectorAll('[role="menuitem"]')].filter((item) => {
            const match = menuLabels[action].exec(item.textContent.trim());
            return action === 'feedback' ? Boolean(match) : match?.[1].toLowerCase() === handle;
        });
        return items.length === 1 ? items[0] : null;
    }

    function menuAvailable() {
        return !openingMenu && !document.querySelector(expandedCaretSelector) && !visibleMenus().length;
    }

    /** 调用原生菜单项，屏蔽确认结束后收起仍属于该帖的下拉菜单。 */
    async function withShortcutMenu(article, post, canAct, action) {
        if (!canAct() || !menuAvailable()) return;
        openingMenu = true;
        let menu;
        let handedOff = false;
        try {
            post.caret.click();
            const item = await waitForDom(() => {
                if (!canAct()) return true;
                const candidate = soleOpenMenu(post.caret);
                if (!candidate || (menu && menu !== candidate)) return false;
                menu = candidate;
                menu.classList.add('mxga-shortcut-menu');
                return matchingItem(menu, action, post.handle);
            });
            if (item === true || !menu || !canAct() || soleOpenMenu(post.caret) !== menu) return;
            if (!item) return menu.querySelector('[role="menuitem"]') ? false : undefined;

            handedOff = true;
            item.click();
            if (action === 'block') {
                await finishBlockMenu(post, canAct);
            } else {
                menu.classList.remove('mxga-shortcut-menu');
                await waitForDom(() => !menu.isConnected || !menu.getClientRects().length);
            }
        } finally {
            if (!handedOff && menu && ownsPost(article, post) && soleOpenMenu(post.caret) === menu) {
                post.caret.click();
                await waitForDom(() => !menu.isConnected || !menu.getClientRects().length);
            }
            menu?.classList.remove('mxga-shortcut-menu');
            openingMenu = false;
        }
    }

    async function activate(article, post, action, button, event) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.isTrusted || button.getAttribute('aria-disabled') === 'true') return;

        const page = location.pathname;
        const onHome = page === '/home';
        if (!onHome && !discussionPath.test(page) && !notificationsPath.test(page)) return;
        if (action === 'feedback' && !onHome) return;
        const viewer = readViewerHandle();
        if (!viewer || post.handle === viewer) return;
        const tab = onHome ? selectedHomeTab() : null;
        const canAct = () => location.pathname === page && (!onHome || selectedHomeTab() === tab)
            && button.isConnected && readViewerHandle() === viewer && ownsPost(article, post);
        button.setAttribute('aria-disabled', 'true');
        try {
            const result = await withShortcutMenu(article, post, canAct, action);
            if (result === false && action === 'block') {
                const entry = cards.get(article);
                if (entry?.block === button) {
                    entry.blockUnavailable = true;
                    scheduleRefresh();
                }
            }
        } finally {
            button.removeAttribute('aria-disabled');
        }
    }

    function addButton(article, post, kind) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mxga-' + kind;
        if (kind !== 'follow') {
            button.classList.add('mxga-icon');
            button.setAttribute('aria-label', kind === 'block' ? '屏蔽 @' + post.handle : '对此帖子不感兴趣');
            button.innerHTML = kind === 'block' ? blockIcon : feedbackIcon;
        }
        button.addEventListener('click', (event) => {
            void activate(article, post, kind === 'follow' ? button.dataset.action : kind, button, event);
        });
        return button;
    }

    function createActionRow(article, post, onHome) {
        const row = document.createElement('div');
        row.className = 'mxga-action-row';
        const authorActions = document.createElement('div');
        authorActions.className = 'mxga-author-actions';
        const icons = document.createElement('div');
        icons.className = 'mxga-icons';
        const follow = addButton(article, post, 'follow');
        const block = addButton(article, post, 'block');
        const feedback = onHome ? addButton(article, post, 'feedback') : null;
        const counts = document.createElement('span');
        counts.className = 'mxga-counts';
        counts.lang = 'zh-CN';
        authorActions.append(follow, counts);
        icons.append(block);
        if (feedback) icons.append(feedback);
        row.append(authorActions, icons);
        post.header.after(row);
        return { ...post, row, authorActions, follow, block, feedback, counts };
    }

    function updateAuthorActions(entry, state) {
        entry.authorActions.hidden = !state || state.requested;
        if (entry.authorActions.hidden) return;
        const label = state.following ? '取关' : '关注';
        if (entry.follow.textContent !== label) entry.follow.textContent = label;
        entry.follow.dataset.action = state.following ? 'unfollow' : 'follow';

        const counts = [
            [state.followingCount, '正在关注'],
            [state.followersCount, '关注者']
        ].filter(([count]) => Number.isSafeInteger(count) && count >= 0)
            .map(([count, label]) => countFormat.format(count) + ' ' + label)
            .join(' / ');
        if (entry.counts.textContent !== counts) entry.counts.textContent = counts;
        entry.counts.hidden = !counts;
    }

    /** 为首页、帖子回复和通知中的其他作者同步快捷操作。 */
    function refreshCards() {
        const page = location.pathname;
        const onHome = page === '/home';
        const onNotifications = notificationsPath.test(page);
        const discussionId = discussionPath.exec(page)?.[1];
        const viewer = readViewerHandle();
        const articles = [...document.querySelectorAll(tweetSelector)];
        const focalIndex = discussionId ? articles.findIndex(article =>
            [...article.querySelectorAll('a:has(time)')].some(link =>
                link.origin === location.origin && discussionPath.exec(link.pathname)?.[1] === discussionId)
        ) : -1;
        for (const [index, article] of articles.entries()) {
            const isReply = discussionId && index > focalIndex;
            const post = viewer && (onHome || onNotifications || isReply) ? readPost(article) : null;
            const showActions = post && post.handle !== viewer;
            let entry = cards.get(article);
            if (entry && (!showActions || entry.id !== post.id || entry.author !== post.author
                || entry.caret !== post.caret || entry.header !== post.header
                || Boolean(entry.feedback) !== onHome || !entry.row.isConnected)) {
                entry.row.remove();
                cards.delete(article);
                entry = null;
            }
            if (!showActions) continue;
            if (!entry) {
                entry = createActionRow(article, post, onHome);
                cards.set(article, entry);
            }
            updateAuthorActions(entry, relationships.get(post.handle));
            entry.block.hidden = Boolean(entry.blockUnavailable);
            entry.row.hidden = entry.authorActions.hidden && entry.block.hidden && !entry.feedback;
        }
    }

    /** 原地更新 X 的短链接，供浏览器导航和复制链接使用。 */
    function rewritePostLink(link) {
        const short = readWebUrl(link.href);
        if (short?.hostname !== 't.co') return rewrittenLinks.get(link) === link.href;

        const candidates = [link.getAttribute('data-expanded-url'), link.title, link.getAttribute('aria-label')];
        const target = candidates.map(readWebUrl).find(url => url && url.hostname !== 't.co');
        const destination = linkDestinations.get(short.pathname) ?? target?.href;
        if (!destination) return false;

        link.href = destination;
        rewrittenLinks.set(link, link.href);
        return true;
    }

    /** 在 X 的点击处理器之前改写地址，由浏览器执行链接的默认动作。 */
    function openPostLink(event) {
        const link = event.target.closest?.(postLinkSelector);
        if (link && rewritePostLink(link)) event.stopImmediatePropagation();
    }

    function refreshPostLinks() {
        for (const link of document.querySelectorAll(postLinkSelector + shortLinkSelector)) {
            rewritePostLink(link);
        }
    }

    function scheduleRefresh() {
        if (refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = 0;
            refreshCards();
            refreshPostLinks();
        });
    }

    function start() {
        new MutationObserver(scheduleRefresh).observe(document.body, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ['aria-selected', 'href', 'title', 'aria-label', 'data-expanded-url']
        });
        window.navigation?.addEventListener('navigatesuccess', scheduleRefresh);
        scheduleRefresh();
    }

    window.addEventListener('click', openPostLink, true);
    window.addEventListener('auxclick', openPostLink, true);
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
