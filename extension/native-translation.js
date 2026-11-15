(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    const tweetTextSelector = '[data-testid="tweetText"][lang]';

    function findTextComponent(text) {
        const key = Object.keys(text).find(name => name.startsWith('__reactFiber$'));
        for (let fiber = text[key]; fiber; fiber = fiber.return) {
            const component = fiber.stateNode;
            if (typeof component?._shouldDisableTranslation === 'function') return component;
        }
    }

    modules.createNativeTranslation = ({ isDiscussionPage, tweetSelector }) => {
        const components = new WeakMap();
        const checked = new WeakMap();
        let articlePath;
        let discussionPost;

        function isArticleReply(post) {
            if (articlePath !== location.pathname || !post?.isConnected) return false;
            if (!discussionPost?.isConnected) return true;
            return Boolean(discussionPost.compareDocumentPosition(post) & Node.DOCUMENT_POSITION_FOLLOWING)
                && !discussionPost.contains(post);
        }

        /** 为列表和文章回复放开主帖限制，沿用 X 的语言和翻译资格判断。 */
        function enableTranslation(component, post) {
            const gate = component._shouldDisableTranslation;
            const source = Function.prototype.toString.call(gate);
            if (!source.includes('isFocal') || !source.includes('_getMemoizedDisableTranslation')) return;

            function listGate() {
                const props = component.props;
                if (props.isFocal || props.isTranslatable !== true || (isDiscussionPage() && !isArticleReply(post))) {
                    return gate.call(component);
                }

                // 只让翻译判断看到 isFocal，整张卡片的渲染仍使用原属性。
                component.props = { ...props, isFocal: true };
                try {
                    return gate.call(component);
                } finally {
                    component.props = props;
                }
            }

            if (!gate.call(component) || listGate()) return;
            component._shouldDisableTranslation = listGate;
            checked.set(component, null);
            component.forceUpdate();
        }

        /** 沿用 X 已挂载的正文组件，在文章滚出屏幕后继续处理回复。 */
        function refresh(root, mainPost, article) {
            const discussion = isDiscussionPage();
            discussionPost = mainPost;
            if (mainPost) {
                articlePath = article ? location.pathname : undefined;
            } else if (articlePath !== location.pathname) {
                articlePath = undefined;
            }
            if (discussion && !articlePath) return;

            for (const text of root.querySelectorAll(tweetTextSelector)) {
                const post = discussion ? text.closest(tweetSelector) : undefined;
                if (discussion && !isArticleReply(post)) continue;
                let component = components.get(text);
                if (!component) {
                    component = findTextComponent(text);
                    if (!component) continue;
                    components.set(text, component);
                }
                const props = component.props;
                const previous = checked.get(component);
                if (previous === null || previous === props) continue;
                // null 表示已启用，否则只在 X 更换组件属性后重新检查。
                checked.set(component, props);
                if (props?.isTranslatable === true && !props.disableTranslation) {
                    enableTranslation(component, post ?? text.closest(tweetSelector));
                }
            }
        }

        return { refresh };
    };
})();
