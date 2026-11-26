(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;

    modules.createPostActions = (schedulePost) => {
        const tweetSelector = 'article[data-testid="tweet"]';
        const postScopeSelector = tweetSelector + ', [data-testid="quoteTweet"]';
        const authorSelector = '[data-testid="User-Name"]';
        const caretSelector = 'button[data-testid="caret"]';
        const profilePath = /^\/([\w]+)\/?$/;
        const postPath = /^\/([\w]+)\/status\/(\d+)$/;
        const discussionPath = /^\/(?:[\w]+|i\/web)\/status\/(\d+)\/?$/;
        const quotesPath = /^\/(?:[\w]+|i\/web)\/status\/\d+\/quotes\/?$/;
        const notificationsPath = /^\/notifications(?:\/(?:verified|priority|mentions))?\/?$/;
        const searchPath = /^\/search\/?$/;
        const historyPath = /^\/i\/(?:history(?:\/likes)?|bookmarks)\/?$/;
        const profileFeedPath = /^\/[\w]+(?:\/(?:with_replies|reposts|media|articles))?\/?$/;
        const listPath = /^\/i\/lists\/\d+\/?$/;
        const communityPath = /^\/(?:[\w]+\/communities(?:\/explore)?|i\/communities\/\d+)\/?$/;
        const feedbackIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13.6c1.64-.013 3.278.76 4.284 2.02.114.14.218.282.317.43l-1.202.9c-.088-.102-.177-.197-.272-.289-.844-.823-1.98-1.264-3.125-1.26-1.146-.002-2.282.441-3.129 1.263-.095.092-.185.186-.273.287l-1.2-.902c.1-.149.205-.29.319-.429C8.728 14.364 10.36 13.59 12 13.6zM9.25 8c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9zm5.5 0c.828 0 1.5.796 1.5 1.9 0 1.105-.672 1.85-1.5 1.85s-1.5-.745-1.5-1.85c0-1.104.672-1.9 1.5-1.9z"/><path fill-rule="evenodd" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8z"/></svg>';
        const relationships = new Map();
        const accountsById = new Map();
        const countFormat = new Intl.NumberFormat('en');
        const blockIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m5.6 5.6 12.8 12.8" stroke="currentColor" stroke-width="2"/></svg>';
        const cards = new WeakMap();
        const authorCards = new Map();
        const replyParents = new Map();
        const viewerSelector = 'a[data-testid="AppTabBar_Profile_Link"]';
        let context;
        let mainAuthor;
        const { invoke, readFeedbackLabel } = modules.createNativeMenu(tweetSelector, caretSelector);

        /** 合并关注人数和关系状态，保留 X 已确认的关注状态。 */
        function rememberPostAuthor(user) {
            const id = user.rest_id ?? user.id_str;
            const name = user.core?.screen_name ?? user.legacy?.screen_name ?? user.screen_name;
            const requested = user.relationship_perspectives?.follow_request_sent ?? user.legacy?.follow_request_sent ?? user.follow_request_sent;
            const following = user.relationship_perspectives?.following ?? user.legacy?.following ?? user.following;
            if (typeof id !== 'string' || typeof name !== 'string') return;

            const handle = name.toLowerCase();
            accountsById.set(id, handle);
            const previous = relationships.get(handle);
            const hasRelationship = typeof following === 'boolean';
            // 页面快照仍可补充计数，关注状态以成功的操作响应为准。
            const next = {
                following: hasRelationship ? following : previous?.following,
                requested: typeof requested === 'boolean' ? requested : !hasRelationship && previous?.requested === true,
                protected: (user.privacy?.protected ?? user.legacy?.protected ?? user.protected ?? previous?.protected) === true,
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
            if (!link?.hasAttribute('href') || link.origin !== location.origin) return;
            return profilePath.exec(link.pathname)?.[1].toLowerCase();
        }

        /** 主帖的发布时间或查看次数可确定归属，引用卡片的链接不参与。 */
        function hasMainPostLink(article, discussionId) {
            for (const link of article.querySelectorAll(`a:has(time), a[href$="/status/${discussionId}/analytics"]`)) {
                const path = link.pathname.replace(/\/analytics$/, '');
                if (link.origin === location.origin && discussionPath.exec(path)?.[1] === discussionId
                    && link.closest(postScopeSelector) === article) return true;
            }
            return false;
        }

        function readPostIdentity(article) {
            const author = article.querySelector(authorSelector);
            if (!author || author.closest(postScopeSelector) !== article) return;
            const link = author.querySelector('a:has(time)') ?? author.querySelector('a[href*="/status/"]');
            const match = postPath.exec(link?.pathname ?? '');
            if (match && link.origin === location.origin) {
                return { author, handle: match[1].toLowerCase(), id: match[2] };
            }

            const id = context?.discussionId;
            if (!id || !hasMainPostLink(article, id)) return;
            for (const profile of author.querySelectorAll('a[href]')) {
                const handle = profilePath.exec(profile.pathname)?.[1].toLowerCase();
                if (handle && profile.origin === location.origin) return { author, handle, id };
            }
        }

        function readPost(article, identity = readPostIdentity(article)) {
            if (!identity) return null;
            const { author } = identity;
            const caret = article.querySelector(caretSelector);
            const authorHeader = author.parentElement === article ? author : author.parentElement;
            if (caret?.closest(postScopeSelector) === article) {
                let header = authorHeader;
                while (header !== article && !header.contains(caret)) header = header.parentElement;
                if (header !== article) return { ...identity, caret, header };
            }
            return { ...identity, header: authorHeader };
        }

        function selectedHomeTab() {
            return document.querySelector('[role="tab"][aria-selected="true"]');
        }

        function ownsPost(article, post) {
            if (!article.isConnected) return false;
            const current = readPost(article);
            return current?.id === post.id && current.handle === post.handle && current.caret === post.caret;
        }

        function matchesMainPost(article, identity, discussionId) {
            return identity ? identity.id === discussionId : hasMainPostLink(article, discussionId);
        }

        function isReply(article, id) {
            const { main, discussionId, replies } = context;
            if (!discussionId || id === discussionId || article === main) return false;
            if (main?.isConnected) {
                return Boolean(main.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING)
                    && !main.contains(article);
            }
            if (replies.has(id)) return true;
            // X 可回收主帖 DOM。使用响应里的回复链识别随后挂载的卡片。
            let parent = replyParents.get(id);
            if (!parent) return false;
            const visited = new Set();
            for (; parent && !visited.has(parent); parent = replyParents.get(parent)) {
                if (parent === discussionId || replies.has(parent)) return true;
                visited.add(parent);
            }
            return false;
        }

        /** 渲染和点击共用同一套页面、作者和主帖判断。 */
        function availablePost(page, article, post, reply) {
            if (!post?.caret || !page?.viewer || post.handle === page.viewer) return false;
            return page.timeline || article === page.main || (reply ?? isReply(article, post.id));
        }

        async function activate(article, post, action, button, event) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.isTrusted || button.getAttribute('aria-disabled') === 'true') return;

            const page = context;
            if (!availablePost(page, article, post) || (action === 'feedback' && !readFeedbackLabel(post.caret))) return;
            const tab = page.home ? selectedHomeTab() : null;
            const canAct = () => location.pathname === page.path && (!page.home || selectedHomeTab() === tab)
                && (page.searchQuery === undefined || location.search === page.searchQuery)
                && button.isConnected && readViewerHandle() === page.viewer && ownsPost(article, post)
                && availablePost(context, article, post);
            button.setAttribute('aria-disabled', 'true');
            try {
                const result = await invoke(post, canAct, () => ownsPost(article, post), action);
                if (result === false && action === 'block') {
                    const entry = cards.get(article);
                    if (entry?.block === button) {
                        entry.blockUnavailable = true;
                        schedulePost(article);
                    }
                }
            } finally {
                button.removeAttribute('aria-disabled');
            }
        }

        function addButton(article, post, kind, label) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mxga-' + kind;
            if (kind !== 'follow') {
                button.classList.add('mxga-icon');
                button.setAttribute('aria-label', label);
                button.innerHTML = kind === 'block' ? blockIcon : feedbackIcon;
            }
            button.addEventListener('click', (event) => {
                void activate(article, post, kind === 'follow' ? button.dataset.action : kind, button, event);
            });
            return button;
        }

        function createActionRow(article, post, feedbackLabel) {
            const row = document.createElement('div');
            row.className = 'mxga-action-row';
            const authorActions = document.createElement('div');
            authorActions.className = 'mxga-author-actions';
            authorActions.hidden = true;
            const icons = document.createElement('div');
            icons.className = 'mxga-icons';
            const follow = addButton(article, post, 'follow');
            const block = addButton(article, post, 'block', '屏蔽 @' + post.handle);
            const feedback = feedbackLabel ? addButton(article, post, 'feedback', feedbackLabel) : null;
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
            if (entry.authorState === state) return;
            entry.authorState = state;
            const showFollow = typeof state?.following === 'boolean' && !state.requested;
            entry.follow.hidden = !showFollow;
            if (showFollow) {
                const label = state.following ? '取关' : '关注';
                if (entry.follow.textContent !== label) entry.follow.textContent = label;
                entry.follow.dataset.action = state.following ? 'unfollow' : 'follow';
            }

            const counts = state?.requested ? '' : [
                [state?.followingCount, '正在关注'],
                [state?.followersCount, '关注者']
            ].filter(([count]) => Number.isSafeInteger(count) && count >= 0)
                .map(([count, label]) => countFormat.format(count) + ' ' + label)
                .join(' / ');
            if (entry.counts.textContent !== counts) entry.counts.textContent = counts;
            entry.counts.hidden = !counts;
            entry.authorActions.hidden = !showFollow && !counts;
        }

        /** 只调整详情页主帖的作者名和账号布局，沿用原生节点。 */
        function layoutMainAuthor(author) {
            if (author === mainAuthor) return;
            mainAuthor?.removeAttribute('data-mxga-inline-author');
            mainAuthor = author;
            mainAuthor?.setAttribute('data-mxga-inline-author', '');
        }

        /** 初始化页面范围和身份。调用方只在页面、主栏或身份入口变化时调用。 */
        function updatePage(root, viewerChanged) {
            const path = location.pathname;
            const search = location.search;
            if (context?.root === root && context.path === path && context.search === search) {
                if (!viewerChanged) return false;
                const viewer = readViewerHandle();
                if (context.viewer === viewer) return false;
                context.viewer = viewer;
                return true;
            }
            layoutMainAuthor();
            const home = path === '/home';
            const searchQuery = searchPath.test(path) ? search : undefined;
            const timeline = home || searchQuery !== undefined || notificationsPath.test(path) || historyPath.test(path)
                || listPath.test(path) || communityPath.test(path) || quotesPath.test(path) || profileFeedPath.test(path);
            const discussionId = discussionPath.exec(path)?.[1];
            context = {
                root, path, search, viewer: readViewerHandle(), home, timeline, searchQuery, discussionId,
                main: undefined, replies: new Set(), replyCards: new WeakSet(), waiting: new Set()
            };
            return true;
        }

        function removePost(article) {
            if (context?.main === article) {
                context.main = undefined;
                layoutMainAuthor();
            }
            context?.waiting.delete(article);
            context?.replyCards.delete(article);
            removeActionRow(article);
        }

        function removeActionRow(article) {
            const entry = cards.get(article);
            if (!entry) return;
            entry.row.remove();
            cards.delete(article);
            const authorPosts = authorCards.get(entry.handle);
            authorPosts.delete(article);
            if (!authorPosts.size) authorCards.delete(entry.handle);
        }

        function retryWaitingReplies() {
            for (const article of context.waiting) schedulePost(article);
            context.waiting.clear();
        }

        /** 合并 X 已返回的回复关系，只重试尚未确认归属的卡片。 */
        function rememberReplies(parents) {
            let changed = false;
            for (const [id, parent] of parents) {
                if (replyParents.get(id) === parent) continue;
                replyParents.set(id, parent);
                changed = true;
            }
            if (changed && context?.waiting.size) retryWaitingReplies();
        }

        function refreshAuthor(handle) {
            for (const article of authorCards.get(handle) ?? []) schedulePost(article);
        }

        /** 更新单张卡片，主帖和作者关系可在卡片挂载后补齐。 */
        function refreshPost(article) {
            const { discussionId } = context;
            const identity = readPostIdentity(article);
            if (discussionId && (!context.main?.isConnected || context.main === article)) {
                if (matchesMainPost(article, identity, discussionId)) {
                    layoutMainAuthor(identity?.author);
                    if (context.main !== article) {
                        context.main = article;
                        retryWaitingReplies();
                    }
                } else if (context.main === article) {
                    context.main = undefined;
                    layoutMainAuthor();
                }
            }

            const reply = isReply(article, identity?.id);
            if (reply) {
                context.replyCards.add(article);
                if (identity) context.replies.add(identity.id);
            } else {
                context.replyCards.delete(article);
            }
            if (discussionId && !reply && !context.main?.isConnected) context.waiting.add(article);
            else context.waiting.delete(article);

            const post = identity ? readPost(article, identity) : null;
            const show = availablePost(context, article, post, reply);
            const feedbackLabel = show ? readFeedbackLabel(post.caret) : undefined;
            let entry = cards.get(article);
            if (entry && (!show || entry.id !== post.id || entry.author !== post.author
                || entry.caret !== post.caret || entry.header !== post.header
                || entry.feedback?.getAttribute('aria-label') !== feedbackLabel || !entry.row.isConnected)) {
                removeActionRow(article);
                entry = null;
            }
            if (show) {
                if (!entry) {
                    entry = createActionRow(article, post, feedbackLabel);
                    cards.set(article, entry);
                    if (!authorCards.has(post.handle)) authorCards.set(post.handle, new Set());
                    authorCards.get(post.handle).add(article);
                }
                updateAuthorActions(entry, relationships.get(post.handle));
                entry.block.hidden = Boolean(entry.blockUnavailable);
                entry.row.hidden = entry.authorActions.hidden && entry.block.hidden && !entry.feedback;
            }
            return article === context.main;
        }

        return {
            tweetSelector, viewerSelector, rememberPostAuthor, rememberRelationship, rememberReplies,
            refreshAuthor, updatePage, refreshPost, removePost,
            canTranslate: article => context?.path === location.pathname
                && context.root.contains(article) && (!context.discussionId || context.replyCards.has(article)),
            isCurrentPage: () => context?.path === location.pathname && context.search === location.search,
            isDiscussionPage: () => discussionPath.test(location.pathname)
        };
    };
})();
