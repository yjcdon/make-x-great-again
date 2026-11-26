(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    const titleSelector = '[data-testid="twitter-article-title"]';
    const mounts = new WeakMap();

    function findPost(time) {
        const key = Object.keys(time).find(name => name.startsWith('__reactFiber$'));
        for (let fiber = time[key]; fiber; fiber = fiber.return) {
            const component = fiber.stateNode;
            if (component?.props?.isFocal && typeof component._renderFocalContent === 'function') return component;
        }
    }

    function findMetadata(element) {
        const props = element?.props;
        if (!props) return;
        if (typeof props.renderTimestamp === 'function' && typeof props.renderViewCount === 'function') return element;
        const children = Array.isArray(props.children) ? props.children : [props.children];
        for (const child of children) {
            const metadata = findMetadata(child);
            if (metadata) return metadata;
        }
    }

    /** 在文章标题下复用原帖的发布时间和查看次数。 */
    modules.refreshArticleMetadata = article => {
        const title = article?.querySelector(titleSelector);
        if (!title || title.nextElementSibling?.matches('.mxga-article-metadata')) return;

        const time = article.nextElementSibling?.querySelector('a > time');
        if (!time) return;
        const post = findPost(time);
        if (!post) return;
        let mount = mounts.get(post);
        if (!mount) {
            mount = document.createElement('div');
            mount.className = 'mxga-article-metadata mxga-article-stats';
            mounts.set(post, mount);

            const renderFocalContent = post._renderFocalContent;
            post._renderFocalContent = function (...args) {
                const content = renderFocalContent.apply(this, args);
                if (!mount.isConnected) return content;
                const metadata = findMetadata(content);
                if (!metadata || !Array.isArray(content.props.children)) return content;

                // Portal 让上方信息条继续使用原帖的 React 上下文和原生事件。
                const portal = {
                    $$typeof: Symbol.for('react.portal'),
                    key: 'mxga-article-metadata',
                    children: metadata,
                    containerInfo: mount,
                    implementation: null
                };
                return { ...content, props: { ...content.props, children: [...content.props.children, portal] } };
            };
        }
        title.after(mount);
        post.forceUpdate();
    };
})();
