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

    modules.createNativeTranslation = (isDiscussionPage) => {
        const components = new WeakMap();
        const checked = new WeakMap();

        /** 仅为列表正文放开原生翻译的主帖限制，沿用 X 的语言和资格判断。 */
        function enableTranslation(component) {
            const gate = component._shouldDisableTranslation;
            const source = Function.prototype.toString.call(gate);
            if (!source.includes('isFocal') || !source.includes('_getMemoizedDisableTranslation')) return;

            function listGate() {
                const props = component.props;
                if (isDiscussionPage() || props.isFocal || props.isTranslatable !== true) return gate.call(component);

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

        /** 列表刷新时沿用 X 已挂载的正文组件，无需请求翻译。 */
        function refresh(root) {
            if (isDiscussionPage()) return;
            for (const text of root.querySelectorAll(tweetTextSelector)) {
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
                if (props?.isTranslatable === true && !props.disableTranslation) enableTranslation(component);
            }
        }

        return { refresh };
    };
})();
