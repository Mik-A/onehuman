(() => {
    let token = localStorage.getItem('cms-token');
    let currentEditElement = null;
    let currentImageSelector = null;

    // ── Inject CMS HTML ──────────────────────────────────────────

    const injectCmsHtml = () => {
        const toolbar = document.createElement('div');
        toolbar.className = 'cms-toolbar';
        toolbar.id = 'cmsToolbar';
        toolbar.innerHTML = `
            <span>Editing Mode ON</span>
            <button id="cmsSaveAllBtn">Save All</button>
            <button id="cmsLogoutBtn">Logout</button>`;

        const status = document.createElement('div');
        status.className = 'cms-status';
        status.id = 'cmsStatus';

        const loginModal = document.createElement('div');
        loginModal.className = 'cms-modal';
        loginModal.id = 'loginModal';
        loginModal.innerHTML = `
            <div class="cms-modal-content">
                <div id="loginView">
                    <h2>Login</h2>
                    <input type="email" id="loginEmail" placeholder="Enter your email" />
                    <div class="cms-modal-buttons">
                        <button class="cms-save" id="cmsLoginBtn">Login</button>
                    </div>
                    <p id="devLoginLink" class="dev-login-link hidden">
                        <a href="/auth/dev-login">Dev Login (skip email)</a>
                    </p>
                </div>
                <div id="loggedInView" class="hidden">
                    <h2>Logged in as admin</h2>
                    <div class="cms-modal-buttons">
                        <button class="cms-cancel" id="cmsModalLogoutBtn">Logout</button>
                    </div>
                </div>
            </div>`;

        const editModal = document.createElement('div');
        editModal.className = 'cms-modal';
        editModal.id = 'editModal';
        editModal.innerHTML = `
            <div class="cms-modal-content">
                <h2 id="editModalTitle">Edit Content</h2>
                <textarea id="editContent"></textarea>
                <div class="cms-modal-buttons">
                    <button class="cms-cancel" id="cmsCloseEditModalBtn">Cancel</button>
                    <button class="cms-save" id="cmsSaveContentBtn">Save</button>
                </div>
            </div>`;

        const imageModal = document.createElement('div');
        imageModal.className = 'cms-modal';
        imageModal.id = 'imageModal';
        imageModal.innerHTML = `
            <div class="cms-modal-content">
                <h2>Upload Image</h2>
                <input type="file" id="imageFile" accept="image/*" />
                <div class="cms-modal-buttons">
                    <button class="cms-cancel" id="cmsCloseImageModalBtn">Cancel</button>
                    <button class="cms-save" id="cmsUploadImageBtn">Upload</button>
                </div>
            </div>`;

        const userIcon = document.createElement('button');
        userIcon.className = 'user-icon';
        userIcon.id = 'userIconBtn';
        userIcon.setAttribute('aria-label', 'Login');
        userIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>`;

        document.body.append(toolbar, status, loginModal, editModal, imageModal, userIcon);
    };

    // ── Event listeners ──────────────────────────────────────────

    const setupEventListeners = () => {
        const bindings = {
            cmsSaveAllBtn: cmsSaveAll,
            cmsLogoutBtn: cmsLogout,
            cmsLoginBtn: cmsLogin,
            cmsCloseEditModalBtn: cmsCloseEditModal,
            cmsSaveContentBtn: cmsSaveContent,
            cmsCloseImageModalBtn: cmsCloseImageModal,
            cmsUploadImageBtn: cmsUploadImage,
        };

        for (const [id, handler] of Object.entries(bindings)) {
            document.getElementById(id)?.addEventListener('click', handler);
        }

        document.querySelectorAll('.cms-open-image-btn').forEach(btn => {
            btn.addEventListener('click', () => cmsOpenImageModal(btn.dataset.selector));
        });
    };

    // ── CMS functions ────────────────────────────────────────────

    const cmsLogin = async () => {
        const email = document.getElementById('loginEmail').value.trim();
        if (!email) return alert('Please enter email');

        const response = await fetch('/api/auth/request-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const result = await response.json();
        if (result.success) {
            alert('Login link sent to your email! Check your inbox.');
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginModal').classList.remove('active');
        } else if (result.authorized === false) {
            alert('This email is not on the access list. Contact the site owner to request access.');
        } else {
            alert(result.error || 'Failed to send login link');
        }
    };

    const cmsEnableEditing = () => {
        console.log('[CMS] Enabling editing mode');
        document.body.classList.add('cms-logged-in');
        const toolbar = document.getElementById('cmsToolbar');
        if (toolbar) toolbar.style.display = 'flex';

        const editables = document.querySelectorAll('.cms-editable');
        console.log('[CMS] Found', editables.length, 'editable elements');
        editables.forEach(el => {
            el.addEventListener('click', e => {
                if (el.tagName === 'IMG') return;
                e.preventDefault();
                cmsOpenEditModal(el);
            });
        });
    };

    const cmsOpenEditModal = (el) => {
        currentEditElement = el;
        const { selector } = el.dataset;
        document.getElementById('editModalTitle').textContent = `Edit: ${selector}`;
        document.getElementById('editContent').value = el.textContent;
        document.getElementById('editModal').classList.add('active');
        document.getElementById('editContent').focus();
    };

    const cmsCloseEditModal = () => {
        document.getElementById('editModal').classList.remove('active');
        currentEditElement = null;
    };

    const cmsSaveContent = async () => {
        if (!currentEditElement) return;

        const { selector } = currentEditElement.dataset;
        const content = document.getElementById('editContent').value;

        const response = await fetch('/api/content/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ selector, content })
        });

        if (response.ok) {
            const result = await response.json();
            currentEditElement.textContent = result.content;
            cmsShowStatus('Saved!');
            cmsCloseEditModal();
        } else {
            alert('Save failed');
        }
    };

    const cmsOpenImageModal = (selector) => {
        currentImageSelector = selector;
        document.getElementById('imageModal').classList.add('active');
        document.getElementById('imageFile').value = '';
    };

    const cmsCloseImageModal = () => {
        document.getElementById('imageModal').classList.remove('active');
        currentImageSelector = null;
    };

    const cmsUploadImage = async () => {
        const file = document.getElementById('imageFile').files[0];
        if (!file) return alert('Please select an image');

        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/upload/image', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            const imgEl = document.querySelector(`[data-selector="${currentImageSelector}"]`);
            if (imgEl) imgEl.src = result.url;

            await fetch('/api/content/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ selector: currentImageSelector, content: result.url })
            });

            cmsShowStatus('Image uploaded!');
            cmsCloseImageModal();
        } else {
            alert('Upload failed');
        }
    };

    const cmsLoadContent = async () => {
        const response = await fetch('/api/content');
        const content = await response.json();

        for (const [selector, value] of Object.entries(content)) {
            const el = document.querySelector(`[data-selector="${selector}"]`);
            if (el) {
                el[el.tagName === 'IMG' ? 'src' : 'textContent'] = value;
            }
        }
    };

    const cmsSaveAll = () => {
        cmsShowStatus('Saving...');
        setTimeout(() => cmsShowStatus('All changes saved!'), 500);
    };

    const cmsLogout = async () => {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        localStorage.removeItem('cms-token');
        token = null;
        location.reload();
    };

    const cmsShowStatus = (message) => {
        const status = document.getElementById('cmsStatus');
        if (!status) return;
        status.textContent = message;
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 3000);
    };

    // ── User icon auto-hide ──────────────────────────────────────

    const setupUserIconAutoHide = () => {
        const icon = document.getElementById('userIconBtn');
        if (!icon) return;
        let hideTimer = null;

        const startHideTimer = () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => icon.classList.add('hidden-offscreen'), 10000);
        };

        startHideTimer();

        document.addEventListener('mousemove', (e) => {
            if (e.clientY > window.innerHeight - 100 && e.clientX > window.innerWidth - 100) {
                icon.classList.remove('hidden-offscreen');
                startHideTimer();
            }
        });

        icon.addEventListener('click', () => {
            clearTimeout(hideTimer);
            icon.classList.remove('hidden-offscreen');
            startHideTimer();
        });
    };

    // ── Sidebar hamburger ────────────────────────────────────────

    const setupSidebarHamburger = () => {
        const hamburger = document.getElementById('navHamburger');
        const nav = document.getElementById('productNav');
        const overlay = document.getElementById('navOverlay');
        if (!hamburger || !nav || !overlay) return;

        const openNav = () => { nav.classList.add('open'); overlay.classList.add('active'); };
        const closeNav = () => { nav.classList.remove('open'); overlay.classList.remove('active'); };

        hamburger.addEventListener('click', () => nav.classList.contains('open') ? closeNav() : openNav());
        overlay.addEventListener('click', closeNav);
        nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));
    };

    // ── User icon modal toggle ───────────────────────────────────

    const setupUserIconModal = () => {
        const icon = document.getElementById('userIconBtn');
        const modal = document.getElementById('loginModal');
        const loginView = document.getElementById('loginView');
        const loggedInView = document.getElementById('loggedInView');
        const modalLogoutBtn = document.getElementById('cmsModalLogoutBtn');
        if (!icon || !modal) return;

        icon.addEventListener('click', () => {
            if (token) {
                loginView?.classList.add('hidden');
                loggedInView?.classList.remove('hidden');
            } else {
                loginView?.classList.remove('hidden');
                loggedInView?.classList.add('hidden');
            }
            modal.classList.add('active');
        });

        modalLogoutBtn?.addEventListener('click', () => {
            modal.classList.remove('active');
            cmsLogout();
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    };

    // ── Keyboard shortcuts ───────────────────────────────────────

    const setupKeyboardShortcuts = () => {
        document.getElementById('editContent')?.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') cmsSaveContent();
        });
    };

    // ── Dev login link ───────────────────────────────────────────

    const checkDevMode = () => {
        fetch('/api/dev-mode')
            .then(r => { if (r.ok) document.getElementById('devLoginLink')?.classList.remove('hidden'); })
            .catch(() => {});
    };

    // ── Init ─────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        injectCmsHtml();
        setupEventListeners();
        setupUserIconAutoHide();
        setupSidebarHamburger();
        setupUserIconModal();
        setupKeyboardShortcuts();
        checkDevMode();

        console.log('[CMS] Token in localStorage:', token ? 'yes' : 'no');

        if (token) {
            const check = await fetch('/api/auth/check', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await check.json();
            console.log('[CMS] Auth check result:', result);

            if (result.logged) {
                cmsEnableEditing();
            } else {
                console.log('[CMS] Session invalid, clearing token');
                token = null;
                localStorage.removeItem('cms-token');
            }
        }

        await cmsLoadContent();
    });
})();
