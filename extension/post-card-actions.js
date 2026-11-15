(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;

    modules.createPostActions = (scheduleRefresh) => {
        const tweetSelector = 'article[data-testid="tweet"]';
        const authorSelector = '[data-testid="User-Name"]';
        const caretSelector = 'button[data-testid="caret"]';
        const postPath = /^\/([\w]+)\/status\/(\d+)$/;
        const discussionPath = /^\/(?:[\w]+|i\/web)\/status\/(\d+)\/?$/;
        const notificationsPath = /^\/notifications(?:\/(?:verified|mentions))?\/?$/;
        const feedbackIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13.6c1.64-.013 3.278.76 4.284 2.02.114.14.218.282.317.43l-1.202.9c-.088-.102-.177-.197-.272-.289-.844-.823-1.98-1.264-3.125-1.26-1.146-.002-2.282.441-3.129 1.263-.095.092-.185.186-.273.287l-1.2-.902c.1-.149.205-.29.319-.429C8.728 14.364 10.36 13.59 12 13.6zM9.25 8c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9zm5.5 0c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9z"/><path fill-rule="evenodd" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z"/></svg>';
        const relationships = new Map();
        const accountsById = new Map();
        const countFormat = new Intl.NumberFormat('en');
        const blockIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m5.6 5.6 12.8 12.8" stroke="currentColor" stroke-width="2"/></svg>';
        const cards = new WeakMap();
        const viewerSelector = 'a[data-testid="AppTabBar_Profile_Link"][href]';
        let context;
        const { invoke } = modules.createNativeMenu(tweetSelector, caretSelector);

        /** 合并作者快照，保留 X 已确认的关注状态。 */
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
            const next = {
                following,
                requested: requested === true,
                protected: (user.privacy?.protected ?? user.legacy?.protected ?? user.protected) === true,
                confirmedRequest: 0,
                ...(previous?.confirmedRequest ? previous : {}),
                followingCount: user.relationship_counts?.following
                    ?? user.legacy?.friends_count ?? user.friends_count ?? previous?.followingCount,
                followersCount: user.relationship_counts?.followers
                    ?? user.legacy?.followers_count ?? user.followers_count ?? previous?.followersCount
            };
            if (previous && Object.keys(next).every(key => previous[key] === next[key])) return;
            relationships.set(handle, next);
            return handle;
        }

        /** 仅在 X 确认成功后变更该账号的关注状态。 */
        function rememberRelationship(data, request) {
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
            return handle;
        }

        /** 从 X 的个人资料导航识别当前登录账号。 */
        function readViewerHandle() {
            const link = document.querySelector(viewerSelector);
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

        function locateMainPost(root, discussionId) {
            for (const link of root.querySelectorAll(tweetSelector + ' a:has(time)')) {
                if (link.origin === location.origin && discussionPath.exec(link.pathname)?.[1] === discussionId) {
                    return link.closest(tweetSelector);
                }
            }
        }

        /** 渲染和点击共用同一套页面、作者和主帖判断。 */
        function availablePost(page, article, post) {
            if (!post || !page?.viewer || post.handle === page.viewer) return false;
            if (page.home || page.notifications) return true;
            if (page.main?.isConnected) {
                return page.main !== article && Boolean(page.main.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING);
            }
            return page.replies.has(post.id);
        }

        async function activate(article, post, action, button, event) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.isTrusted || button.getAttribute('aria-disabled') === 'true') return;

            const page = context;
            if (!availablePost(page, article, post) || (action === 'feedback' && !page.home)) return;
            const tab = page.home ? selectedHomeTab() : null;
            const canAct = () => location.pathname === page.path && (!page.home || selectedHomeTab() === tab)
                && button.isConnected && readViewerHandle() === page.viewer && ownsPost(article, post)
                && availablePost(context, article, post);
            button.setAttribute('aria-disabled', 'true');
            try {
                const result = await invoke(post, canAct, () => ownsPost(article, post), action);
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

        /** 同步主栏已挂载的帖子，刷新时及时清理失效的快捷行。 */
        function refresh(root) {
            const path = location.pathname;
            const viewer = readViewerHandle();
            const home = path === '/home';
            const notifications = notificationsPath.test(path);
            const discussionId = discussionPath.exec(path)?.[1];
            const main = discussionId ? locateMainPost(root, discussionId) : undefined;
            // 主帖被滚动回收时，只保留这条讨论中已经确认的回复。
            const replies = discussionId && context?.discussionId === discussionId ? context.replies : new Set();
            context = { path, viewer, home, notifications, main, discussionId, replies };

            for (const article of root.querySelectorAll(tweetSelector)) {
                const post = viewer && (home || notifications || discussionId) ? readPost(article) : null;
                const show = availablePost(context, article, post);
                if (show && main) replies.add(post.id);
                let entry = cards.get(article);
                if (entry && (!show || entry.id !== post.id || entry.author !== post.author
                    || entry.caret !== post.caret || entry.header !== post.header
                    || Boolean(entry.feedback) !== home || !entry.row.isConnected)) {
                    entry.row.remove();
                    cards.delete(article);
                    entry = null;
                }
                if (!show) continue;
                if (!entry) {
                    entry = createActionRow(article, post, home);
                    cards.set(article, entry);
                }
                updateAuthorActions(entry, relationships.get(post.handle));
                entry.block.hidden = Boolean(entry.blockUnavailable);
                entry.row.hidden = entry.authorActions.hidden && entry.block.hidden && !entry.feedback;
            }
            return main;
        }

        return {
            tweetSelector, viewerSelector, rememberPostAuthor, rememberRelationship, refresh,
            isDiscussionPage: () => discussionPath.test(location.pathname)
        };
    };
})();
