(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;
    const titleSelector = '[data-testid="twitter-article-title"]';
    const bodySelector = '[data-testid="twitterArticleRichTextView"]';
    const mounts = new WeakMap();

    /** 点击时读取当前文章的标题和正文，并把纯文本写入剪贴板。 */
    function createCopyButton(article) {
        const label = '复制全文';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mxga-copy-article';
        button.lang = 'zh-CN';
        button.textContent = label;
        button.setAttribute('aria-live', 'polite');
        let resetLabel;

        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearTimeout(resetLabel);
            try {
                const body = article.querySelector(bodySelector)?.innerText.trim();
                if (!body) {
                    button.textContent = '正文加载中';
                    return;
                }
                const title = article.querySelector(titleSelector).innerText.trim();
                await navigator.clipboard.writeText(title + '\n\n' + body);
                button.textContent = '已复制';
            } catch {
                button.textContent = '复制失败';
            } finally {
                resetLabel = setTimeout(() => { button.textContent = label; }, 2000);
            }
        });
        return button;
    }

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

    /** 在文章标题下显示复制操作，并在原帖信息可用时复用时间和查看次数。 */
    modules.refreshArticleMetadata = article => {
        const title = article?.querySelector(titleSelector);
        if (!title) return;
        let row = title.nextElementSibling;
        if (!row?.matches('.mxga-article-metadata')) {
            row = document.createElement('div');
            row.className = 'mxga-article-metadata';
            row.append(createCopyButton(article));
            title.after(row);
        }
        if (row.firstElementChild.matches('.mxga-article-stats')) return;

        const time = article.nextElementSibling?.querySelector('a > time');
        if (!time) return;
        const post = findPost(time);
        if (!post) return;
        let mount = mounts.get(post);
        if (!mount) {
            mount = document.createElement('div');
            mount.className = 'mxga-article-stats';
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
        row.prepend(mount);
        post.forceUpdate();
    };
})();
