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

    modules.createNativeTranslation = ({ canTranslate, tweetSelector }) => {
        const components = new WeakMap();
        const checked = new WeakMap();
        const patchedPosts = new WeakSet();

        /** 为列表和回复放开主帖限制，沿用 X 的语言和翻译资格判断。 */
        function enableTranslation(component, state) {
            const gate = component._shouldDisableTranslation;
            const source = Function.prototype.toString.call(gate);
            if (!source.includes('isFocal') || !source.includes('_getMemoizedDisableTranslation')) return;

            function listGate() {
                const props = component.props;
                if (props.isFocal || props.disableTranslation || props.isTranslatable !== true || !canTranslate(state.post)) {
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
            state.enabled = true;
            patchedPosts.add(state.post);
            component.forceUpdate();
        }

        /** 仅检查受影响卡片中的正文，沿用 X 已挂载的正文组件。 */
        function refresh(post) {
            const eligible = canTranslate(post);
            if (!eligible && !patchedPosts.has(post)) return;
            for (const text of post.querySelectorAll(tweetTextSelector)) {
                if (text.closest(tweetSelector) !== post) continue;
                let component = components.get(text);
                if (!component) {
                    if (!eligible) continue;
                    component = findTextComponent(text);
                    if (!component) continue;
                    components.set(text, component);
                }
                const props = component.props;
                const state = checked.get(component);
                if (state?.enabled) {
                    if (state.post !== post || state.eligible !== eligible) {
                        state.post = post;
                        state.eligible = eligible;
                        patchedPosts.add(post);
                        component.forceUpdate();
                    }
                } else if (eligible && state?.props !== props) {
                    const next = { props, post, eligible };
                    checked.set(component, next);
                    if (props?.isTranslatable === true && !props.disableTranslation) enableTranslation(component, next);
                }
            }
        }

        return { refresh };
    };
})();
