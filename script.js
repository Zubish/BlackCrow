const defaultTransactions = [
    {
        id: "BC-2401",
        buyer: "Kite Retail Group",
        seller: "Nova Supply Co.",
        buyerEmail: "buyer@kite.test",
        sellerEmail: "seller@nova.test",
        amount: 12800,
        status: "pending",
        condition: "Delivery confirmation",
        inspectionDays: 5,
        note: "Release after serial verification and signed handoff.",
        lifecycle: {
            buyerAccepted: false,
            sellerAccepted: false,
            paymentInitialized: false,
            paymentConfirmed: false,
            withdrawalRequested: false,
            funded: false,
            delivered: false,
            released: false,
            withdrawn: false
        },
        updatedAt: "2 hours ago"
    },
    {
        id: "BC-2398",
        buyer: "Atlas Commerce",
        seller: "Delta Freight Hub",
        buyerEmail: "buyer@atlas.test",
        sellerEmail: "seller@delta.test",
        amount: 4200,
        status: "review",
        condition: "Document verification",
        inspectionDays: 3,
        note: "Review customs documents before settlement.",
        lifecycle: {
            buyerAccepted: true,
            sellerAccepted: true,
            paymentInitialized: true,
            paymentConfirmed: true,
            withdrawalRequested: false,
            funded: true,
            delivered: false,
            released: false,
            withdrawn: false
        },
        updatedAt: "6 hours ago"
    },
    {
        id: "BC-2387",
        buyer: "Eastline Studio",
        seller: "Foundry Digital",
        buyerEmail: "buyer@eastline.test",
        sellerEmail: "seller@foundry.test",
        amount: 9600,
        status: "completed",
        condition: "Milestone approval",
        inspectionDays: 7,
        note: "Final release approved after source delivery.",
        lifecycle: {
            buyerAccepted: true,
            sellerAccepted: true,
            paymentInitialized: true,
            paymentConfirmed: true,
            withdrawalRequested: false,
            funded: true,
            delivered: true,
            released: true,
            withdrawn: false
        },
        updatedAt: "Yesterday"
    }
];

const API_BASE = window.BLACKCROW_API_BASE
    || (window.location.protocol === "file:" ? "http://127.0.0.1:5000/api" : "/api");

const state = {
    filter: "all",
    query: "",
    walletVisible: false,
    backendOnline: false,
    currentUser: loadAuthUser(),
    walletBalanceValue: null,
    activityEvents: [],
    trackingSession: null,
    transactions: loadTransactions()
};

const elements = {
    transactionsList: document.getElementById("transactions-list"),
    activityFeed: document.getElementById("activity-feed"),
    searchInput: document.getElementById("search-input"),
    filterButtons: Array.from(document.querySelectorAll(".filter-pill")),
    navButtons: Array.from(document.querySelectorAll(".nav-chip")),
    form: document.getElementById("escrow-form"),
    focusComposer: document.getElementById("focus-composer"),
    connectionPill: document.getElementById("connection-pill"),
    connectionLabel: document.getElementById("connection-label"),
    profileMenu: document.querySelector(".profile-menu"),
    profileTrigger: document.getElementById("profile-trigger"),
    sidebarLogout: document.querySelector(".sidebar-logout"),
    escrowLinkPanel: document.getElementById("escrow-link-panel"),
    escrowLinkInput: document.getElementById("escrow-link"),
    copyEscrowLink: document.getElementById("copy-escrow-link"),
    guestForm: document.getElementById("guest-escrow-form"),
    trackForm: document.getElementById("track-form"),
    trackEscrowId: document.getElementById("track-escrow-id"),
    trackEmail: document.getElementById("track-email"),
    trackCode: document.getElementById("track-code"),
    trackingPanel: document.getElementById("tracking-panel"),
    trackingSummary: document.getElementById("tracking-summary"),
    trackingActions: document.getElementById("tracking-actions"),
    walletBalance: document.getElementById("wallet-balance"),
    walletSectionBalance: document.getElementById("wallet-section-balance"),
    walletToggle: document.getElementById("wallet-toggle"),
    protectedVolume: document.getElementById("protected-volume"),
    completionRate: document.getElementById("completion-rate"),
    statTotal: document.getElementById("stat-total"),
    statPending: document.getElementById("stat-pending"),
    statReview: document.getElementById("stat-review"),
    statCompleted: document.getElementById("stat-completed"),
    loginForm: document.getElementById("login-form"),
    signupForm: document.getElementById("signup-form"),
    loginIdentifier: document.getElementById("login-identifier"),
    loginPassword: document.getElementById("login-password"),
    signupName: document.getElementById("signup-name"),
    signupEmail: document.getElementById("signup-email"),
    signupPassword: document.getElementById("signup-password"),
    signupConfirmPassword: document.getElementById("signup-confirm-password"),
    toast: document.getElementById("toast")
};

const currency = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
});

function loadTransactions() {
    try {
        const saved = window.localStorage.getItem("blackcrow-transactions");
        return saved ? JSON.parse(saved) : defaultTransactions;
    } catch (error) {
        return defaultTransactions;
    }
}

function saveTransactions() {
    window.localStorage.setItem("blackcrow-transactions", JSON.stringify(state.transactions));
}

function loadAuthUser() {
    try {
        const saved = window.localStorage.getItem("blackcrow-auth-user");
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        return null;
    }
}

function getAuthToken() {
    return window.localStorage.getItem("blackcrow-auth-token") || "";
}

function saveAuthSession(user, token) {
    window.localStorage.setItem("blackcrow-auth-user", JSON.stringify(user));
    window.localStorage.setItem("blackcrow-auth-token", token);
    state.currentUser = user;
}

function clearAuthSession() {
    window.localStorage.removeItem("blackcrow-auth-user");
    window.localStorage.removeItem("blackcrow-auth-token");
    state.currentUser = null;
}

function isDashboardPage() {
    return document.body.classList.contains("dashboard-page");
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
            "Content-Type": "application/json",
            ...(options.auth ? { Authorization: `Bearer ${getAuthToken()}` } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || "Backend request failed.");
    }
    return data;
}

function isNetworkError(error) {
    return error instanceof TypeError || error.message === "Failed to fetch";
}

function mapEscrow(escrow) {
    return {
        ...escrow,
        lifecycle: normalizeLifecycle(escrow.lifecycle),
        shareLink: createTrackingLink(escrow.id),
        updatedAt: formatTimestamp(escrow.updatedAt)
    };
}

function formatTimestamp(value) {
    if (!value) return "Just now";
    if (!Number.isNaN(Date.parse(value))) {
        return new Intl.DateTimeFormat("en-NG", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }
    return value;
}

async function refreshTransactionsFromBackend() {
    if (!isDashboardPage()) return;

    const data = await apiRequest("/account/escrows", { auth: true });
    state.transactions = data.escrows.map(mapEscrow);
    state.backendOnline = true;
    saveTransactions();
    renderAll();
}

async function verifySavedSession() {
    const token = getAuthToken();
    if (!token) return null;

    const data = await apiRequest("/auth/me", { auth: true });
    saveAuthSession(data.user, token);
    return data.user;
}

async function loadAccountWallet() {
    if (!isDashboardPage() || !getAuthToken()) return;

    const data = await apiRequest("/account/wallet", { auth: true });
    state.walletBalanceValue = Number(data.availableBalance || 0);
    renderStats();
}

async function loadAccountActivity() {
    if (!isDashboardPage() || !getAuthToken()) return;

    const data = await apiRequest("/account/activity", { auth: true });
    state.activityEvents = Array.isArray(data.events) ? data.events : [];
    renderActivity();
}

async function bootAuthState() {
    if (!isDashboardPage()) return true;

    const token = getAuthToken();
    if (!token) {
        window.location.href = "login.html";
        return false;
    }

    try {
        await verifySavedSession();
        hydrateUserFields();
        return true;
    } catch (error) {
        clearAuthSession();
        window.location.href = "login.html";
        return false;
    }
}

function hydrateUserFields() {
    const user = state.currentUser;
    if (!user) return;

    const initiatorEmail = document.getElementById("initiator-email");
    if (initiatorEmail && !initiatorEmail.value) {
        initiatorEmail.value = user.email;
    }

    const profileItems = Array.from(document.querySelectorAll(".profile-menu-list a"));
    const profileLink = profileItems.find((item) => item.textContent.trim().toLowerCase() === "profile");
    if (profileLink) {
        profileLink.textContent = user.fullName || user.email;
    }
}

async function createEscrowOnBackend(payload, options = {}) {
    const data = await apiRequest(options.auth ? "/account/escrows" : "/escrows", {
        method: "POST",
        auth: Boolean(options.auth),
        body: payload
    });
    const escrow = mapEscrow(data.escrow);
    state.transactions = [escrow, ...state.transactions.filter((item) => item.id !== escrow.id)];
    state.backendOnline = true;
    saveTransactions();
    return escrow;
}

function addLocalEscrow(payload) {
    const nextId = createEscrowId();
    const counterpartyRole = payload.initiatorRole === "seller" ? "buyer" : "seller";
    const transaction = {
        id: nextId,
        seller: payload.seller,
        buyer: payload.buyer,
        buyerEmail: payload.buyerEmail,
        sellerEmail: payload.sellerEmail,
        amount: Number(payload.amount),
        status: "pending",
        condition: payload.condition,
        inspectionDays: Number(payload.inspectionDays || 5),
        item: payload.item,
        note: `Awaiting ${counterpartyRole} acceptance and buyer funding.`,
        initiatorRole: payload.initiatorRole,
        lifecycle: {
            buyerAccepted: false,
            sellerAccepted: false,
            paymentInitialized: false,
            paymentConfirmed: false,
            withdrawalRequested: false,
            funded: false,
            delivered: false,
            released: false,
            withdrawn: false
        },
        shareLink: createTrackingLink(nextId),
        updatedAt: "Just now"
    };

    state.transactions.unshift(transaction);
    saveTransactions();
    return transaction;
}

function createTrackingLink(id) {
    const url = new URL("track-escrow.html", window.location.href);
    url.searchParams.set("id", id);
    return url.href;
}

function createEscrowId() {
    return `BC-${2400 + state.transactions.length + 1}`;
}

function normalizeLifecycle(lifecycle = {}) {
    return {
        buyerAccepted: Boolean(lifecycle.buyerAccepted || lifecycle.accepted),
        sellerAccepted: Boolean(lifecycle.sellerAccepted || lifecycle.accepted),
        paymentInitialized: Boolean(lifecycle.paymentInitialized),
        paymentConfirmed: Boolean(lifecycle.paymentConfirmed),
        withdrawalRequested: Boolean(lifecycle.withdrawalRequested),
        funded: Boolean(lifecycle.funded),
        delivered: Boolean(lifecycle.delivered),
        released: Boolean(lifecycle.released),
        withdrawn: Boolean(lifecycle.withdrawn)
    };
}

function getFilteredTransactions() {
    return state.transactions.filter((transaction) => {
        const matchesFilter = state.filter === "all" || transaction.status === state.filter;
        const haystack = `${transaction.id} ${transaction.buyer} ${transaction.seller} ${transaction.condition} ${transaction.item || ""}`.toLowerCase();
        const matchesQuery = haystack.includes(state.query.toLowerCase());
        return matchesFilter && matchesQuery;
    });
}

function renderStats() {
    const total = state.transactions.length;
    const pending = state.transactions.filter((item) => item.status === "pending").length;
    const review = state.transactions.filter((item) => item.status === "review").length;
    const completed = state.transactions.filter((item) => item.status === "completed").length;
    const volume = state.transactions.reduce((sum, item) => sum + item.amount, 0);
    const walletBalance = state.transactions
        .filter((item) => (
            item.status === "completed"
            && !item.lifecycle?.withdrawn
            && !item.lifecycle?.withdrawalRequested
        ))
        .reduce((sum, item) => sum + item.amount, 0);
    const displayWalletBalance = state.walletBalanceValue ?? walletBalance;
    const completion = total ? Math.round((completed / total) * 100) : 0;

    setText(elements.statTotal, total);
    setText(elements.statPending, pending);
    setText(elements.statReview, review);
    setText(elements.statCompleted, completed);
    setText(elements.protectedVolume, currency.format(volume));
    setText(elements.completionRate, `${completion}%`);
    setText(elements.walletSectionBalance, currency.format(displayWalletBalance));
    setText(elements.walletBalance, state.walletVisible ? currency.format(displayWalletBalance) : "₦--");
}

function renderTransactions() {
    if (!elements.transactionsList) return;

    const items = getFilteredTransactions();

    if (!items.length) {
        elements.transactionsList.innerHTML = `
            <div class="empty-state">
                No escrows match this filter yet.
            </div>
        `;
        return;
    }

    elements.transactionsList.innerHTML = items.map((transaction) => {
        const id = escapeHtml(transaction.id);
        const buyer = escapeHtml(transaction.buyer);
        const seller = escapeHtml(transaction.seller);
        const status = escapeHtml(transaction.status);
        const condition = escapeHtml(transaction.condition);
        const inspectionDays = escapeHtml(transaction.inspectionDays);
        const note = escapeHtml(transaction.note);
        const item = transaction.item
            ? `<span class="meta-chip">${escapeHtml(transaction.item)}</span>`
            : "";
        const action = transaction.status === "pending"
            ? `<button class="action-button" data-action="complete" data-id="${id}">Mark completed</button>`
            : "";

        return `
            <article class="transaction-card">
                <div class="transaction-head">
                    <div class="transaction-copy">
                        <span>${id}</span>
                        <strong>${buyer} -> ${seller}</strong>
                    </div>
                    <span class="status-badge ${status}">${capitalize(status)}</span>
                </div>
                <div class="transaction-meta">
                    <div class="meta-group">
                        <span class="meta-chip">${currency.format(transaction.amount)}</span>
                        ${item}
                        <span class="meta-chip">${condition}</span>
                        <span class="meta-chip">${inspectionDays} day inspection</span>
                    </div>
                    ${action}
                </div>
                <p>${note}</p>
                <span class="micro-copy">Updated ${escapeHtml(transaction.updatedAt)}</span>
            </article>
        `;
    }).join("");
}

function renderActivity() {
    if (!elements.activityFeed) return;

    if (state.activityEvents.length) {
        elements.activityFeed.innerHTML = state.activityEvents.slice(0, 5).map((event, index) => `
            <article class="activity-item">
                <div class="activity-mark">0${index + 1}</div>
                <div class="activity-copy">
                    <strong>${escapeHtml(event.escrowId)} ${escapeHtml(event.type.replace("escrow.", ""))}</strong>
                    <span>${escapeHtml(event.message)}</span>
                </div>
                <span class="micro-copy">${escapeHtml(formatTimestamp(event.createdAt))}</span>
            </article>
        `).join("");
        return;
    }

    const ordered = [...state.transactions].slice(0, 5);

    elements.activityFeed.innerHTML = ordered.map((transaction, index) => {
        const id = escapeHtml(transaction.id);
        const status = escapeHtml(transaction.status);
        const buyer = escapeHtml(transaction.buyer);
        const seller = escapeHtml(transaction.seller);
        const updatedAt = escapeHtml(transaction.updatedAt);

        return `
            <article class="activity-item">
                <div class="activity-mark">0${index + 1}</div>
                <div class="activity-copy">
                    <strong>${id} ${activityLabel(status)}</strong>
                    <span>${buyer} with ${seller}</span>
                </div>
                <span class="micro-copy">${updatedAt}</span>
            </article>
        `;
    }).join("");
}

function showToast(message) {
    if (!elements.toast) return;

    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
        elements.toast.classList.remove("is-visible");
    }, 2400);
}

function setText(element, value) {
    if (!element) return;
    element.textContent = value;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
    }[character]));
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function activityLabel(status) {
    if (status === "completed") return "settled";
    if (status === "review") return "entered review";
    return "awaits release";
}

function bindFilters() {
    elements.filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            state.filter = button.dataset.filter;
            elements.filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
            renderTransactions();
        });
    });
}

function bindSearch() {
    if (!elements.searchInput) return;

    elements.searchInput.addEventListener("input", (event) => {
        state.query = event.target.value.trim();
        renderTransactions();
    });
}

function bindNavigation() {
    elements.navButtons.forEach((button) => {
        if (!button.dataset.jump) return;

        button.addEventListener("click", () => {
            elements.navButtons.forEach((item) => item.classList.toggle("is-active", item === button));
            const target = document.getElementById(button.dataset.jump);
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });

    elements.focusComposer?.addEventListener("click", () => {
        document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("seller-name")?.focus();
    });
}

function bindProfileMenu() {
    if (!elements.profileMenu || !elements.profileTrigger) return;

    elements.profileTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = elements.profileMenu.classList.toggle("is-open");
        elements.profileTrigger.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("click", (event) => {
        if (elements.profileMenu.contains(event.target)) return;
        elements.profileMenu.classList.remove("is-open");
        elements.profileTrigger.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        elements.profileMenu.classList.remove("is-open");
        elements.profileTrigger.setAttribute("aria-expanded", "false");
    });

    const logout = () => {
        clearAuthSession();
        window.location.href = "landingpage.html";
    };

    elements.sidebarLogout?.addEventListener("click", logout);
    Array.from(document.querySelectorAll(".profile-menu-list a")).forEach((link) => {
        if (link.textContent.trim().toLowerCase() === "logout") {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                logout();
            });
        }
    });
}

function bindWalletBalance() {
    if (!elements.walletToggle || !elements.walletBalance) return;

    elements.walletToggle.classList.toggle("is-hidden", !state.walletVisible);

    elements.walletToggle.addEventListener("click", () => {
        state.walletVisible = !state.walletVisible;
        elements.walletToggle.classList.toggle("is-hidden", !state.walletVisible);
        elements.walletToggle.setAttribute("aria-pressed", String(state.walletVisible));
        elements.walletToggle.setAttribute(
            "aria-label",
            state.walletVisible ? "Hide wallet balance" : "Show wallet balance"
        );
        renderStats();
    });
}

function bindAuthForms() {
    elements.loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = elements.loginIdentifier.value.trim().toLowerCase();
        const password = elements.loginPassword.value;

        try {
            const data = await apiRequest("/auth/login", {
                method: "POST",
                body: { email, password }
            });
            saveAuthSession(data.user, data.token);
            window.location.href = "overview.html";
        } catch (error) {
            showToast(error.message);
        }
    });

    elements.signupForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = elements.signupPassword.value;
        const confirmPassword = elements.signupConfirmPassword.value;
        if (password !== confirmPassword) {
            elements.signupConfirmPassword.setCustomValidity("Passwords must match.");
            elements.signupConfirmPassword.reportValidity();
            return;
        }

        elements.signupConfirmPassword.setCustomValidity("");

        try {
            const data = await apiRequest("/auth/signup", {
                method: "POST",
                body: {
                    fullName: elements.signupName.value.trim(),
                    email: elements.signupEmail.value.trim().toLowerCase(),
                    password
                }
            });
            saveAuthSession(data.user, data.token);
            window.location.href = "overview.html";
        } catch (error) {
            showToast(error.message);
        }
    });

    [elements.signupPassword, elements.signupConfirmPassword].forEach((input) => {
        input?.addEventListener("input", () => {
            elements.signupConfirmPassword?.setCustomValidity("");
        });
    });
}

function bindTransactionActions() {
    if (!elements.transactionsList) return;

    elements.transactionsList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action='complete']");
        if (!button) return;

        state.transactions = state.transactions.map((transaction) => (
            transaction.id === button.dataset.id
                ? {
                    ...transaction,
                    status: "completed",
                    lifecycle: { ...transaction.lifecycle, released: true },
                    updatedAt: "Just now"
                }
                : transaction
        ));

        saveTransactions();
        renderAll();
        showToast(`Escrow ${button.dataset.id} marked completed.`);
    });
}

function bindForm() {
    if (!elements.form) return;

    elements.form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(elements.form);
        const initiatorRole = formData.get("initiatorRole");
        const initiatorEmail = formData.get("initiatorEmail").trim().toLowerCase();
        const otherParty = formData.get("otherParty").trim();
        const otherPartyEmail = formData.get("otherPartyEmail").trim().toLowerCase();
        const itemDescription = formData.get("itemDescription").trim();
        const currentUserName = state.currentUser?.fullName || "You";
        const buyer = initiatorRole === "buyer" ? currentUserName : otherParty;
        const seller = initiatorRole === "seller" ? currentUserName : otherParty;
        const buyerEmail = initiatorRole === "buyer" ? initiatorEmail : otherPartyEmail;
        const sellerEmail = initiatorRole === "seller" ? initiatorEmail : otherPartyEmail;
        const payload = {
            buyer,
            seller,
            buyerEmail,
            sellerEmail,
            amount: Number(formData.get("amount")),
            condition: formData.get("releaseCondition"),
            inspectionDays: 5,
            item: itemDescription,
            initiatorRole
        };

        let transaction;
        try {
            transaction = await createEscrowOnBackend(payload, { auth: true });
        } catch (error) {
            state.backendOnline = false;
            if (!isNetworkError(error)) {
                showToast(error.message);
                return;
            }
            if (getAuthToken()) {
                showToast("Backend is offline. Account escrows need the backend.");
                return;
            }
            transaction = addLocalEscrow(payload);
        }

        saveTransactions();
        elements.form.reset();
        elements.form.querySelector("[name='initiatorRole'][value='seller']").checked = true;
        hydrateUserFields();
        if (elements.escrowLinkInput && elements.escrowLinkPanel) {
            elements.escrowLinkInput.value = transaction.shareLink;
            elements.escrowLinkPanel.hidden = false;
        }
        renderAll();
        showToast(`Escrow link ${transaction.id} created.`);
        document.getElementById("transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

}

function bindEscrowLinkCopy() {
    elements.copyEscrowLink?.addEventListener("click", async () => {
        if (!elements.escrowLinkInput?.value) return;

        try {
            await navigator.clipboard.writeText(elements.escrowLinkInput.value);
            showToast("Escrow link copied.");
        } catch (error) {
            elements.escrowLinkInput.select();
            showToast("Escrow link selected.");
        }
    });
}

function bindGuestEscrowForm() {
    if (!elements.guestForm) return;

    elements.guestForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(elements.guestForm);
        const initiatorRole = formData.get("initiatorRole");
        const initiatorName = formData.get("initiatorName").trim();
        const initiatorEmail = formData.get("initiatorEmail").trim().toLowerCase();
        const otherPartyName = formData.get("otherPartyName").trim();
        const otherPartyEmail = formData.get("otherPartyEmail").trim().toLowerCase();
        const buyer = initiatorRole === "buyer" ? initiatorName : otherPartyName;
        const seller = initiatorRole === "seller" ? initiatorName : otherPartyName;
        const buyerEmail = initiatorRole === "buyer" ? initiatorEmail : otherPartyEmail;
        const sellerEmail = initiatorRole === "seller" ? initiatorEmail : otherPartyEmail;
        const payload = {
            buyer,
            seller,
            buyerEmail,
            sellerEmail,
            amount: Number(formData.get("amount")),
            condition: formData.get("releaseCondition"),
            inspectionDays: 5,
            item: formData.get("itemDescription").trim(),
            initiatorRole
        };

        let transaction;
        try {
            transaction = await createEscrowOnBackend(payload);
        } catch (error) {
            state.backendOnline = false;
            if (!isNetworkError(error)) {
                showToast(error.message);
                return;
            }
            transaction = addLocalEscrow(payload);
        }

        saveTransactions();
        elements.guestForm.reset();
        elements.guestForm.querySelector("[name='initiatorRole'][value='seller']").checked = true;
        if (elements.escrowLinkInput && elements.escrowLinkPanel) {
            elements.escrowLinkInput.value = transaction.shareLink;
            elements.escrowLinkPanel.hidden = false;
        }
        renderAll();
        showToast(`One-off escrow ${transaction.id} created.`);
    });
}

function bindTracking() {
    if (!elements.trackForm) return;

    const idFromUrl = new URLSearchParams(window.location.search).get("id");
    if (idFromUrl && elements.trackEscrowId) {
        elements.trackEscrowId.value = idFromUrl.toUpperCase();
    }

    elements.trackForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await openTrackedEscrow();
    });

    elements.trackingActions?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-track-action]");
        if (!button) return;

        await updateTrackedEscrow(button.dataset.trackAction);
    });
}

async function openTrackedEscrow() {
    const id = elements.trackEscrowId.value.trim().toUpperCase();
    const email = elements.trackEmail.value.trim().toLowerCase();
    const code = elements.trackCode?.value.trim();

    if (!id || !email) return;

    try {
        if (!code) {
            const data = await apiRequest(`/escrows/${encodeURIComponent(id)}/otp`, {
                method: "POST",
                body: { email }
            });
            state.backendOnline = true;
            if (elements.trackCode && data.devCode) {
                elements.trackCode.value = data.devCode;
            }
            showToast(data.devCode ? `Access code generated: ${data.devCode}` : "Access code sent.");
            return;
        }

        const data = await apiRequest(`/escrows/${encodeURIComponent(id)}/otp/verify`, {
            method: "POST",
            body: { email, code }
        });
        const transaction = mapEscrow(data.escrow);
        state.trackingSession = {
            id: transaction.id,
            email,
            role: data.role,
            token: data.token
        };
        state.transactions = [transaction, ...state.transactions.filter((item) => item.id !== transaction.id)];
        state.backendOnline = true;
        saveTransactions();
        renderAll();
        renderTracking();
        showToast("Escrow access verified.");
    } catch (error) {
        state.backendOnline = false;
        state.trackingSession = null;
        if (isNetworkError(error)) {
            renderTracking();
        } else {
            renderTracking(error.message);
        }
    }
}

function getTrackedContext() {
    const id = elements.trackEscrowId.value.trim().toUpperCase();
    const email = elements.trackEmail.value.trim().toLowerCase();
    const transaction = state.transactions.find((item) => item.id.toUpperCase() === id);

    if (!transaction) return { error: "No escrow found for that ID." };

    if (state.trackingSession?.id === transaction.id && state.trackingSession.email === email) {
        return {
            transaction,
            role: state.trackingSession.role,
            token: state.trackingSession.token
        };
    }

    const role = email === transaction.buyerEmail ? "buyer" : email === transaction.sellerEmail ? "seller" : "";
    if (!role) return { error: "Use the buyer or seller email attached to this escrow." };

    return { transaction, role };
}

function renderTracking(errorMessage = "") {
    const context = getTrackedContext();

    if (errorMessage || context.error) {
        elements.trackingPanel.hidden = false;
        elements.trackingSummary.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage || context.error)}</div>`;
        elements.trackingActions.innerHTML = "";
        return;
    }

    const { transaction, role } = context;
    const lifecycle = normalizeLifecycle(transaction.lifecycle);
    const steps = [
        ["Buyer accepted", lifecycle.buyerAccepted],
        ["Seller accepted", lifecycle.sellerAccepted],
        ["Payment initialized", lifecycle.paymentInitialized],
        ["Funding confirmed", lifecycle.paymentConfirmed],
        ["Seller delivered", lifecycle.delivered],
        ["Buyer released", lifecycle.released],
        ["Withdrawal requested", lifecycle.withdrawalRequested],
        ["Seller withdrawn", lifecycle.withdrawn]
    ];

    elements.trackingPanel.hidden = false;
    elements.trackingSummary.innerHTML = `
        <article class="transaction-summary">
            <span>${escapeHtml(transaction.id)} - ${capitalize(role)} access</span>
            <strong>${escapeHtml(transaction.buyer)} -> ${escapeHtml(transaction.seller)}</strong>
            <p>${escapeHtml(transaction.item || "Protected transaction")} - ${currency.format(transaction.amount)}</p>
            <p>${escapeHtml(transaction.condition)}</p>
            <div class="status-list">
                ${steps.map(([label, isDone]) => `
                    <span class="${isDone ? "is-done" : ""}">${escapeHtml(label)}</span>
                `).join("")}
            </div>
        </article>
    `;
    elements.trackingActions.innerHTML = getTrackingActions(transaction, role);
}

function getTrackingActions(transaction, role) {
    const lifecycle = normalizeLifecycle(transaction.lifecycle);
    const buyerAndSellerAccepted = lifecycle.buyerAccepted && lifecycle.sellerAccepted;
    const roleHasAccepted = role === "buyer" ? lifecycle.buyerAccepted : lifecycle.sellerAccepted;

    if (!roleHasAccepted) {
        return `<button class="primary-button" type="button" data-track-action="accept">Accept escrow terms</button>`;
    }

    if (!buyerAndSellerAccepted) {
        return `<div class="empty-state">Waiting for the other party to accept the escrow terms.</div>`;
    }

    if (role === "buyer" && !lifecycle.paymentInitialized) {
        return `<button class="primary-button" type="button" data-track-action="initialize-payment">Initialize simulated payment</button>`;
    }

    if (role === "buyer" && lifecycle.paymentInitialized && !lifecycle.funded) {
        return `<button class="primary-button" type="button" data-track-action="confirm-funding">Confirm simulated funding</button>`;
    }

    if (role === "seller" && !lifecycle.funded) {
        return `<div class="empty-state">Waiting for buyer to initialize and confirm payment.</div>`;
    }

    if (role === "seller" && lifecycle.funded && !lifecycle.delivered) {
        return `<button class="primary-button" type="button" data-track-action="deliver">Mark product delivered</button>`;
    }

    if (role === "buyer" && lifecycle.delivered && !lifecycle.released) {
        return `<button class="primary-button" type="button" data-track-action="release">Release funds to seller wallet</button>`;
    }

    if (role === "seller" && lifecycle.released && !lifecycle.withdrawalRequested && !lifecycle.withdrawn) {
        return `
            <form class="composer-form compact-action-form" id="withdrawal-form">
                <label>
                    Bank name
                    <input type="text" id="withdraw-bank-name" placeholder="Bank name" required>
                </label>
                <label>
                    Account name
                    <input type="text" id="withdraw-account-name" placeholder="Account holder name" required>
                </label>
                <label>
                    Account number
                    <input type="text" id="withdraw-account-number" inputmode="numeric" placeholder="Account number" required>
                </label>
                <button class="primary-button" type="button" data-track-action="request-withdrawal">Request withdrawal</button>
            </form>
        `;
    }

    if (role === "seller" && lifecycle.withdrawalRequested && !lifecycle.withdrawn) {
        return `<div class="empty-state">Withdrawal request received. BlackCrow will mark it paid after bank payout is completed.</div>`;
    }

    return `<div class="empty-state">No action is needed from you right now.</div>`;
}

function getWithdrawalDestination() {
    return {
        bankName: document.getElementById("withdraw-bank-name")?.value.trim() || "",
        accountName: document.getElementById("withdraw-account-name")?.value.trim() || "",
        accountNumber: document.getElementById("withdraw-account-number")?.value.replace(/\D/g, "") || ""
    };
}

function hasValidWithdrawalDestination(destination) {
    return destination.bankName && destination.accountName && destination.accountNumber.length >= 8;
}

async function updateTrackedEscrow(action) {
    const context = getTrackedContext();
    if (context.error) return;

    if (context.token) {
        try {
            let data;
            if (action === "initialize-payment") {
                data = await apiRequest(`/escrows/${encodeURIComponent(context.transaction.id)}/payments/initialize`, {
                    method: "POST",
                    body: { token: context.token }
                });
            } else if (action === "confirm-funding") {
                data = await apiRequest(`/escrows/${encodeURIComponent(context.transaction.id)}/payments/verify`, {
                    method: "POST",
                    body: { token: context.token }
                });
            } else if (action === "request-withdrawal") {
                const payoutDestination = getWithdrawalDestination();
                if (!hasValidWithdrawalDestination(payoutDestination)) {
                    showToast("Add valid bank details before requesting withdrawal.");
                    return;
                }
                data = await apiRequest(`/escrows/${encodeURIComponent(context.transaction.id)}/withdrawals`, {
                    method: "POST",
                    body: {
                        token: context.token,
                        payoutDestination
                    }
                });
            } else {
                data = await apiRequest(`/escrows/${encodeURIComponent(context.transaction.id)}/actions`, {
                    method: "PATCH",
                    body: {
                        token: context.token,
                        action
                    }
                });
            }
            const transaction = mapEscrow(data.escrow);
            state.transactions = [transaction, ...state.transactions.filter((item) => item.id !== transaction.id)];
            state.trackingSession = {
                ...state.trackingSession,
                role: data.role || state.trackingSession.role
            };
            state.backendOnline = true;
            saveTransactions();
            renderAll();
            renderTracking();
            showToast("Escrow updated.");
            return;
        } catch (error) {
            renderTracking(error.message);
            return;
        }
    }

    state.transactions = state.transactions.map((transaction) => {
        if (transaction.id !== context.transaction.id) return transaction;

        const lifecycle = normalizeLifecycle(transaction.lifecycle);
        let status = transaction.status;
        let note = transaction.note;

        if (action === "accept") {
            if (context.role === "buyer") {
                lifecycle.buyerAccepted = true;
            } else {
                lifecycle.sellerAccepted = true;
            }
            note = lifecycle.buyerAccepted && lifecycle.sellerAccepted
                ? "Both parties accepted. Waiting for buyer funding."
                : "Terms accepted. Waiting for the other party.";
        }
        if (action === "initialize-payment") {
            lifecycle.paymentInitialized = true;
            note = "Simulated payment initialized. Waiting for funding confirmation.";
        }
        if (action === "confirm-funding") {
            lifecycle.paymentInitialized = true;
            lifecycle.paymentConfirmed = true;
            lifecycle.funded = true;
            status = "review";
            note = "Buyer funding confirmed. Waiting for seller delivery.";
        }
        if (action === "deliver") {
            lifecycle.delivered = true;
            status = "review";
            note = "Seller marked delivery complete. Waiting for buyer release.";
        }
        if (action === "release") {
            lifecycle.released = true;
            status = "completed";
            note = "Buyer released funds to seller wallet.";
        }
        if (action === "request-withdrawal") {
            const destination = getWithdrawalDestination();
            if (!hasValidWithdrawalDestination(destination)) {
                showToast("Add valid bank details before requesting withdrawal.");
                return transaction;
            }
            lifecycle.withdrawalRequested = true;
            status = "completed";
            note = "Seller requested payout to local bank. Withdrawal is pending.";
        }

        return { ...transaction, lifecycle, status, note, updatedAt: "Just now" };
    });

    saveTransactions();
    renderAll();
    renderTracking();
    showToast("Escrow updated.");
}

async function probeBackend() {
    if (!elements.connectionPill || !elements.connectionLabel) return;

    try {
        await apiRequest("/health");
        await refreshTransactionsFromBackend();
        await loadAccountWallet();
        await loadAccountActivity();
        state.backendOnline = true;
        elements.connectionPill.classList.add("online");
        elements.connectionLabel.textContent = "Backend reachable";
    } catch (error) {
        state.backendOnline = false;
        elements.connectionPill.classList.remove("online");
        elements.connectionLabel.textContent = "Frontend-only mode";
    }
}

function renderAll() {
    renderStats();
    renderTransactions();
    renderActivity();
}

async function initializeApp() {
    const canContinue = await bootAuthState();
    if (!canContinue) return;
    bindFilters();
    bindSearch();
    bindNavigation();
    bindProfileMenu();
    bindWalletBalance();
    bindAuthForms();
    bindTransactionActions();
    bindForm();
    bindGuestEscrowForm();
    bindEscrowLinkCopy();
    bindTracking();
    hydrateUserFields();
    renderAll();
    probeBackend();
}

initializeApp();
