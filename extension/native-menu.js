(() => {
    'use strict';

    const modules = window.__mxgaBootstrap;

    modules.createNativeMenu = (postSelector, caretSelector) => {
        const expandedCaretSelector = postSelector + ' ' + caretSelector + '[aria-expanded="true"]';
        const dropdownSelector = '[role="menu"] [data-testid="Dropdown"]';
        const confirmationSelector = '[data-testid="confirmationSheetCancel"], [data-testid="confirmationSheetConfirm"]';
        const menuLabels = {
            follow: /^(?:关注|關注|跟隨|Follow)\s+@([\w]+)$/i,
            unfollow: /^(?:取消关注|取消關注|取消跟隨|Unfollow)\s+@([\w]+)$/i,
            block: /^(?:屏蔽|封鎖|Block)\s+@([\w]+)$/i,
            feedback: /^(?:对此帖子不感兴趣|對此貼文不感興趣|對此帖子不感興趣|Not interested in this post|Show less often)$/i
        };
        let openingMenu = false;

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
        async function invoke(post, canAct, ownsPost, action) {
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
                if (!handedOff && menu && ownsPost() && soleOpenMenu(post.caret) === menu) {
                    post.caret.click();
                    await waitForDom(() => !menu.isConnected || !menu.getClientRects().length);
                }
                menu?.classList.remove('mxga-shortcut-menu');
                openingMenu = false;
            }
        }

        return { invoke };
    };
})();
