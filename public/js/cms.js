(function () {
    'use strict';

    var token = localStorage.getItem('cms-token');
    var currentEditElement = null;
    var currentImageSelector = null;

    // ── Inject CMS HTML ──────────────────────────────────────────

    function injectCmsHtml() {
        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'cms-toolbar';
        toolbar.id = 'cmsToolbar';
        toolbar.innerHTML =
            '<span>Editing Mode ON</span>' +
            '<button id="cmsSaveAllBtn">Save All</button>' +
            '<button id="cmsLogoutBtn">Logout</button>';

        // Status indicator
        var status = document.createElement('div');
        status.className = 'cms-status';
        status.id = 'cmsStatus';

        // Login modal
        var loginModal = document.createElement('div');
        loginModal.className = 'cms-modal';
        loginModal.id = 'loginModal';
        loginModal.innerHTML =
            '<div class="cms-modal-content">' +
                '<div id="loginView">' +
                    '<h2>Login</h2>' +
                    '<input type="email" id="loginEmail" placeholder="Enter your email" />' +
                    '<div class="cms-modal-buttons">' +
                        '<button class="cms-save" id="cmsLoginBtn">Login</button>' +
                    '</div>' +
                    '<p id="devLoginLink" class="dev-login-link hidden">' +
                        '<a href="/auth/dev-login">Dev Login (skip email)</a>' +
                    '</p>' +
                '</div>' +
                '<div id="loggedInView" class="hidden">' +
                    '<h2>Logged in as admin</h2>' +
                    '<div class="cms-modal-buttons">' +
                        '<button class="cms-cancel" id="cmsModalLogoutBtn">Logout</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        // Edit modal
        var editModal = document.createElement('div');
        editModal.className = 'cms-modal';
        editModal.id = 'editModal';
        editModal.innerHTML =
            '<div class="cms-modal-content">' +
                '<h2 id="editModalTitle">Edit Content</h2>' +
                '<textarea id="editContent"></textarea>' +
                '<div class="cms-modal-buttons">' +
                    '<button class="cms-cancel" id="cmsCloseEditModalBtn">Cancel</button>' +
                    '<button class="cms-save" id="cmsSaveContentBtn">Save</button>' +
                '</div>' +
            '</div>';

        // Image modal
        var imageModal = document.createElement('div');
        imageModal.className = 'cms-modal';
        imageModal.id = 'imageModal';
        imageModal.innerHTML =
            '<div class="cms-modal-content">' +
                '<h2>Upload Image</h2>' +
                '<input type="file" id="imageFile" accept="image/*" />' +
                '<div class="cms-modal-buttons">' +
                    '<button class="cms-cancel" id="cmsCloseImageModalBtn">Cancel</button>' +
                    '<button class="cms-save" id="cmsUploadImageBtn">Upload</button>' +
                '</div>' +
            '</div>';

        // User icon button
        var userIcon = document.createElement('button');
        userIcon.className = 'user-icon';
        userIcon.id = 'userIconBtn';
        userIcon.setAttribute('aria-label', 'Login');
        userIcon.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>' +
                '<circle cx="12" cy="7" r="4"></circle>' +
            '</svg>';

        // Insert into body
        document.body.appendChild(toolbar);
        document.body.appendChild(status);
        document.body.appendChild(loginModal);
        document.body.appendChild(editModal);
        document.body.appendChild(imageModal);
        document.body.appendChild(userIcon);
    }

    // ── Event listeners ──────────────────────────────────────────

    function setupEventListeners() {
        var saveAllBtn = document.getElementById('cmsSaveAllBtn');
        var logoutBtn = document.getElementById('cmsLogoutBtn');
        var loginBtn = document.getElementById('cmsLoginBtn');
        var closeEditBtn = document.getElementById('cmsCloseEditModalBtn');
        var saveContentBtn = document.getElementById('cmsSaveContentBtn');
        var closeImageBtn = document.getElementById('cmsCloseImageModalBtn');
        var uploadImageBtn = document.getElementById('cmsUploadImageBtn');
        var openImageBtns = document.querySelectorAll('.cms-open-image-btn');

        if (saveAllBtn) saveAllBtn.addEventListener('click', cmsSaveAll);
        if (logoutBtn) logoutBtn.addEventListener('click', cmsLogout);
        if (loginBtn) loginBtn.addEventListener('click', cmsLogin);
        if (closeEditBtn) closeEditBtn.addEventListener('click', cmsCloseEditModal);
        if (saveContentBtn) saveContentBtn.addEventListener('click', cmsSaveContent);
        if (closeImageBtn) closeImageBtn.addEventListener('click', cmsCloseImageModal);
        if (uploadImageBtn) uploadImageBtn.addEventListener('click', cmsUploadImage);

        openImageBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                cmsOpenImageModal(btn.getAttribute('data-selector'));
            });
        });
    }

    // ── CMS functions ────────────────────────────────────────────

    async function cmsLogin() {
        var email = document.getElementById('loginEmail').value.trim();
        if (!email) return alert('Please enter email');

        var response = await fetch('/api/auth/request-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        var result = await response.json();
        if (result.success) {
            alert('Login link sent to your email! Check your inbox.');
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginModal').classList.remove('active');
        } else if (result.authorized === false) {
            alert('This email is not on the access list. Contact the site owner to request access.');
        } else {
            alert(result.error || 'Failed to send login link');
        }
    }

    function cmsEnableEditing() {
        console.log('[CMS] Enabling editing mode');
        document.body.classList.add('cms-logged-in');
        var toolbar = document.getElementById('cmsToolbar');
        if (toolbar) toolbar.style.display = 'flex';

        var editables = document.querySelectorAll('.cms-editable');
        console.log('[CMS] Found', editables.length, 'editable elements');
        editables.forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (el.tagName === 'IMG') return;
                e.preventDefault();
                cmsOpenEditModal(el);
            });
        });
    }

    function cmsOpenEditModal(el) {
        currentEditElement = el;
        var selector = el.dataset.selector;
        document.getElementById('editModalTitle').textContent = 'Edit: ' + selector;
        document.getElementById('editContent').value = el.textContent;
        document.getElementById('editModal').classList.add('active');
        document.getElementById('editContent').focus();
    }

    function cmsCloseEditModal() {
        document.getElementById('editModal').classList.remove('active');
        currentEditElement = null;
    }

    async function cmsSaveContent() {
        if (!currentEditElement) return;

        var selector = currentEditElement.dataset.selector;
        var content = document.getElementById('editContent').value;

        var response = await fetch('/api/content/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ selector: selector, content: content })
        });

        if (response.ok) {
            var result = await response.json();
            currentEditElement.textContent = result.content;
            cmsShowStatus('Saved!');
            cmsCloseEditModal();
        } else {
            alert('Save failed');
        }
    }

    function cmsOpenImageModal(selector) {
        currentImageSelector = selector;
        document.getElementById('imageModal').classList.add('active');
        document.getElementById('imageFile').value = '';
    }

    function cmsCloseImageModal() {
        document.getElementById('imageModal').classList.remove('active');
        currentImageSelector = null;
    }

    async function cmsUploadImage() {
        var file = document.getElementById('imageFile').files[0];
        if (!file) return alert('Please select an image');

        var formData = new FormData();
        formData.append('image', file);

        var response = await fetch('/api/upload/image', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });

        if (response.ok) {
            var result = await response.json();
            var imgEl = document.querySelector('[data-selector="' + currentImageSelector + '"]');
            if (imgEl) imgEl.src = result.url;

            await fetch('/api/content/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    selector: currentImageSelector,
                    content: result.url
                })
            });

            cmsShowStatus('Image uploaded!');
            cmsCloseImageModal();
        } else {
            alert('Upload failed');
        }
    }

    async function cmsLoadContent() {
        var response = await fetch('/api/content');
        var content = await response.json();

        for (var selector in content) {
            if (!content.hasOwnProperty(selector)) continue;
            var el = document.querySelector('[data-selector="' + selector + '"]');
            if (el) {
                if (el.tagName === 'IMG') {
                    el.src = content[selector];
                } else {
                    el.textContent = content[selector];
                }
            }
        }
    }

    function cmsSaveAll() {
        cmsShowStatus('Saving...');
        setTimeout(function () { cmsShowStatus('All changes saved!'); }, 500);
    }

    async function cmsLogout() {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        localStorage.removeItem('cms-token');
        token = null;
        location.reload();
    }

    function cmsShowStatus(message) {
        var status = document.getElementById('cmsStatus');
        if (!status) return;
        status.textContent = message;
        status.classList.add('show');
        setTimeout(function () { status.classList.remove('show'); }, 3000);
    }

    // ── User icon auto-hide ──────────────────────────────────────

    function setupUserIconAutoHide() {
        var icon = document.getElementById('userIconBtn');
        if (!icon) return;
        var hideTimer = null;

        function startHideTimer() {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function () {
                icon.classList.add('hidden-offscreen');
            }, 10000);
        }

        startHideTimer();

        document.addEventListener('mousemove', function (e) {
            var nearBottom = e.clientY > window.innerHeight - 100;
            var nearRight = e.clientX > window.innerWidth - 100;
            if (nearBottom && nearRight) {
                icon.classList.remove('hidden-offscreen');
                startHideTimer();
            }
        });

        icon.addEventListener('click', function () {
            clearTimeout(hideTimer);
            icon.classList.remove('hidden-offscreen');
            startHideTimer();
        });
    }

    // ── Sidebar hamburger (index.html only) ──────────────────────

    function setupSidebarHamburger() {
        var hamburger = document.getElementById('navHamburger');
        var nav = document.getElementById('productNav');
        var overlay = document.getElementById('navOverlay');
        if (!hamburger || !nav || !overlay) return;

        function openNav() {
            nav.classList.add('open');
            overlay.classList.add('active');
        }

        function closeNav() {
            nav.classList.remove('open');
            overlay.classList.remove('active');
        }

        hamburger.addEventListener('click', function () {
            if (nav.classList.contains('open')) {
                closeNav();
            } else {
                openNav();
            }
        });

        overlay.addEventListener('click', closeNav);

        nav.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeNav);
        });
    }

    // ── User icon modal toggle ───────────────────────────────────

    function setupUserIconModal() {
        var icon = document.getElementById('userIconBtn');
        var modal = document.getElementById('loginModal');
        var loginView = document.getElementById('loginView');
        var loggedInView = document.getElementById('loggedInView');
        var modalLogoutBtn = document.getElementById('cmsModalLogoutBtn');
        if (!icon || !modal) return;

        icon.addEventListener('click', function () {
            if (token) {
                if (loginView) loginView.classList.add('hidden');
                if (loggedInView) loggedInView.classList.remove('hidden');
            } else {
                if (loginView) loginView.classList.remove('hidden');
                if (loggedInView) loggedInView.classList.add('hidden');
            }
            modal.classList.add('active');
        });

        if (modalLogoutBtn) {
            modalLogoutBtn.addEventListener('click', function () {
                modal.classList.remove('active');
                cmsLogout();
            });
        }

        window.addEventListener('click', function (event) {
            if (event.target === modal) {
                modal.classList.remove('active');
            }
        });
    }

    // ── Ctrl+Enter to save in edit modal ─────────────────────────

    function setupKeyboardShortcuts() {
        var editContent = document.getElementById('editContent');
        if (!editContent) return;
        editContent.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.key === 'Enter') cmsSaveContent();
        });
    }

    // ── Dev login link ───────────────────────────────────────────

    function checkDevMode() {
        fetch('/api/dev-mode').then(function (r) {
            if (r.ok) {
                var link = document.getElementById('devLoginLink');
                if (link) link.classList.remove('hidden');
            }
        }).catch(function () {});
    }

    // ── Init ─────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async function () {
        injectCmsHtml();
        setupEventListeners();
        setupUserIconAutoHide();
        setupSidebarHamburger();
        setupUserIconModal();
        setupKeyboardShortcuts();
        checkDevMode();

        console.log('[CMS] Token in localStorage:', token ? 'yes' : 'no');

        if (token) {
            var check = await fetch('/api/auth/check', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            var result = await check.json();
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
