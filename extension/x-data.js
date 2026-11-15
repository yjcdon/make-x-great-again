(() => {
    'use strict';

    const modules = window.__mxgaBootstrap = {};

    const postDataPath = /^\/i\/api\/graphql\/[^/]+\/(?:Home(?:Latest)?Timeline|TweetDetail|TweetResultByRestId|ConversationTimelineV2|NotificationsTimeline|UserTweets(?:AndReplies)?|User(?:Originals|Replies|Reposts)Timeline)$/;
    const relationshipPath = /^\/i\/api\/1\.1\/friendships\/(?:create|destroy)\.json$/;

    /** 提取帖子响应中作者与链接所需的字段，共用一次遍历。 */
    function readPostData(data) {
        const profile = data?.user?.result;
        const root = data?.home ?? data?.threaded_conversation_with_injections_v2
            ?? data?.threaded_conversation_with_injections
            ?? data?.viewer_v2?.user_results?.result?.notification_timeline?.timeline
            ?? profile?.timeline_v2?.timeline ?? profile?.timeline?.timeline ?? data?.tweetResult?.result;
        if (!root) return;

        const authors = new Set();
        const links = new Map();
        const cards = [];
        const nodes = [root];
        while (nodes.length) {
            const node = nodes.pop();
            if (!node || typeof node !== 'object') continue;
            if (node.user_results?.result) authors.add(node.user_results.result);
            if (node.card?.legacy) cards.push(node.card);
            if (node.urls?.length && !links.has(node.urls)) links.set(node.urls, undefined);
            if (node.entities?.urls?.length) links.set(node.entities.urls, node.full_text);
            if (node.entity_set?.urls?.length) links.set(node.entity_set.urls, node.text);
            for (const value of Object.values(node)) {
                if (value && typeof value === 'object') nodes.push(value);
            }
        }
        return { authors, links, cards };
    }

    /** 观察 X 已发出的请求，共用同一份解析后的响应，并保留原始请求行为。 */
    modules.observeXData = ({ onPosts, onRelationship }) => {
        let relationshipRequest = 0;

        function receive(data, request) {
            if (request.number) {
                onRelationship(data, request);
                return;
            }
            const posts = readPostData(data?.data);
            if (posts) onPosts(posts);
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
                    receive(response.status === 204 ? {} : await response.clone().json(), request);
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
                        receive(data, request);
                    } catch (error) {
                        console.warn('MXGA 无法读取 X 的响应', error);
                    }
                }, { once: true });
            }
            return Reflect.apply(nativeSend, this, arguments);
        };
    };
})();
