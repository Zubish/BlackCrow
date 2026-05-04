const defaultTransactions = [
    {
        id: "BC-2401",
        buyer: "Kite Retail Group",
        seller: "Nova Supply Co.",
        amount: 12800,
        status: "pending",
        condition: "Delivery confirmation",
        inspectionDays: 5,
        note: "Release after serial verification and signed handoff.",
        updatedAt: "2 hours ago"
    },
    {
        id: "BC-2398",
        buyer: "Atlas Commerce",
        seller: "Delta Freight Hub",
        amount: 4200,
        status: "review",
        condition: "Document verification",
        inspectionDays: 3,
        note: "Review customs documents before settlement.",
        updatedAt: "6 hours ago"
    },
    {
        id: "BC-2387",
        buyer: "Eastline Studio",
        seller: "Foundry Digital",
        amount: 9600,
        status: "completed",
        condition: "Milestone approval",
        inspectionDays: 7,
        note: "Final release approved after source delivery.",
        updatedAt: "Yesterday"
    }
];

const state = {
    filter: "all",
    query: "",
    walletVisible: false,
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
        .filter((item) => item.status === "completed" && !item.lifecycle?.withdrawn)
        .reduce((sum, item) => sum + item.amount, 0);
    const completion = total ? Math.round((completed / total) * 100) : 0;

    setText(elements.statTotal, total);
    setText(elements.statPending, pending);
    setText(elements.statReview, review);
    setText(elements.statCompleted, completed);
    setText(elements.protectedVolume, currency.format(volume));
    setText(elements.completionRate, `${completion}%`);
    setText(elements.walletSectionBalance, currency.format(walletBalance));
    setText(elements.walletBalance, state.walletVisible ? currency.format(walletBalance) : "₦--");
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

    elements.sidebarLogout?.addEventListener("click", () => {
        window.location.href = "landingpage.html";
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

    elements.form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(elements.form);
        const nextId = createEscrowId();
        const initiatorRole = formData.get("initiatorRole");
        const initiatorEmail = formData.get("initiatorEmail").trim().toLowerCase();
        const otherParty = formData.get("otherParty").trim();
        const otherPartyEmail = formData.get("otherPartyEmail").trim().toLowerCase();
        const itemDescription = formData.get("itemDescription").trim();
        const buyer = initiatorRole === "buyer" ? "You" : otherParty;
        const seller = initiatorRole === "seller" ? "You" : otherParty;
        const buyerEmail = initiatorRole === "buyer" ? initiatorEmail : otherPartyEmail;
        const sellerEmail = initiatorRole === "seller" ? initiatorEmail : otherPartyEmail;
        const counterpartyRole = initiatorRole === "seller" ? "buyer" : "seller";
        const shareLink = createTrackingLink(nextId);

        state.transactions.unshift({
            id: nextId,
            seller,
            buyer,
            buyerEmail,
            sellerEmail,
            amount: Number(formData.get("amount")),
            status: "pending",
            condition: formData.get("releaseCondition"),
            inspectionDays: 5,
            item: itemDescription,
            note: `Awaiting ${counterpartyRole} acceptance and buyer funding.`,
            initiatorRole,
            lifecycle: {
                buyerAccepted: false,
                sellerAccepted: false,
                funded: false,
                delivered: false,
                released: false,
                withdrawn: false
            },
            shareLink,
            updatedAt: "Just now"
        });

        saveTransactions();
        elements.form.reset();
        elements.form.querySelector("[name='initiatorRole'][value='seller']").checked = true;
        if (elements.escrowLinkInput && elements.escrowLinkPanel) {
            elements.escrowLinkInput.value = shareLink;
            elements.escrowLinkPanel.hidden = false;
        }
        renderAll();
        showToast(`Escrow link ${nextId} created.`);
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

    elements.guestForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(elements.guestForm);
        const nextId = createEscrowId();
        const initiatorRole = formData.get("initiatorRole");
        const initiatorName = formData.get("initiatorName").trim();
        const initiatorEmail = formData.get("initiatorEmail").trim().toLowerCase();
        const otherPartyName = formData.get("otherPartyName").trim();
        const otherPartyEmail = formData.get("otherPartyEmail").trim().toLowerCase();
        const buyer = initiatorRole === "buyer" ? initiatorName : otherPartyName;
        const seller = initiatorRole === "seller" ? initiatorName : otherPartyName;
        const buyerEmail = initiatorRole === "buyer" ? initiatorEmail : otherPartyEmail;
        const sellerEmail = initiatorRole === "seller" ? initiatorEmail : otherPartyEmail;
        const shareLink = createTrackingLink(nextId);

        state.transactions.unshift({
            id: nextId,
            buyer,
            seller,
            buyerEmail,
            sellerEmail,
            amount: Number(formData.get("amount")),
            status: "pending",
            condition: formData.get("releaseCondition"),
            inspectionDays: 5,
            item: formData.get("itemDescription").trim(),
            note: "Awaiting counterparty acceptance and buyer funding.",
            initiatorRole,
            lifecycle: {
                buyerAccepted: false,
                sellerAccepted: false,
                funded: false,
                delivered: false,
                released: false,
                withdrawn: false
            },
            shareLink,
            updatedAt: "Just now"
        });

        saveTransactions();
        elements.guestForm.reset();
        elements.guestForm.querySelector("[name='initiatorRole'][value='seller']").checked = true;
        if (elements.escrowLinkInput && elements.escrowLinkPanel) {
            elements.escrowLinkInput.value = shareLink;
            elements.escrowLinkPanel.hidden = false;
        }
        renderAll();
        showToast(`One-off escrow ${nextId} created.`);
    });
}

function bindTracking() {
    if (!elements.trackForm) return;

    const idFromUrl = new URLSearchParams(window.location.search).get("id");
    if (idFromUrl && elements.trackEscrowId) {
        elements.trackEscrowId.value = idFromUrl.toUpperCase();
    }

    elements.trackForm.addEventListener("submit", (event) => {
        event.preventDefault();
        renderTracking();
    });

    elements.trackingActions?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-track-action]");
        if (!button) return;

        updateTrackedEscrow(button.dataset.trackAction);
    });
}

function getTrackedContext() {
    const id = elements.trackEscrowId.value.trim().toUpperCase();
    const email = elements.trackEmail.value.trim().toLowerCase();
    const transaction = state.transactions.find((item) => item.id.toUpperCase() === id);

    if (!transaction) return { error: "No escrow found for that ID." };

    const role = email === transaction.buyerEmail ? "buyer" : email === transaction.sellerEmail ? "seller" : "";
    if (!role) return { error: "Use the buyer or seller email attached to this escrow." };

    return { transaction, role };
}

function renderTracking() {
    const context = getTrackedContext();

    if (context.error) {
        elements.trackingPanel.hidden = false;
        elements.trackingSummary.innerHTML = `<div class="empty-state">${escapeHtml(context.error)}</div>`;
        elements.trackingActions.innerHTML = "";
        return;
    }

    const { transaction, role } = context;
    const lifecycle = normalizeLifecycle(transaction.lifecycle);
    const steps = [
        ["Buyer accepted", lifecycle.buyerAccepted],
        ["Seller accepted", lifecycle.sellerAccepted],
        ["Buyer funded", lifecycle.funded],
        ["Seller delivered", lifecycle.delivered],
        ["Buyer released", lifecycle.released],
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

    if (role === "buyer" && !lifecycle.funded) {
        return `<button class="primary-button" type="button" data-track-action="fund">Mark payment funded</button>`;
    }

    if (role === "seller" && lifecycle.funded && !lifecycle.delivered) {
        return `<button class="primary-button" type="button" data-track-action="deliver">Mark product delivered</button>`;
    }

    if (role === "buyer" && lifecycle.delivered && !lifecycle.released) {
        return `<button class="primary-button" type="button" data-track-action="release">Release funds to seller wallet</button>`;
    }

    if (role === "seller" && lifecycle.released && !lifecycle.withdrawn) {
        return `<button class="primary-button" type="button" data-track-action="withdraw">Withdraw to local bank</button>`;
    }

    return `<div class="empty-state">No action is needed from you right now.</div>`;
}

function updateTrackedEscrow(action) {
    const context = getTrackedContext();
    if (context.error) return;

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
        if (action === "fund") {
            lifecycle.funded = true;
            status = "review";
            note = "Buyer funded escrow. Waiting for seller delivery.";
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
        if (action === "withdraw") {
            lifecycle.withdrawn = true;
            status = "completed";
            note = "Seller withdrew released funds to local bank.";
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
        await fetch("http://127.0.0.1:5000", { method: "GET" });
        elements.connectionPill.classList.add("online");
        elements.connectionLabel.textContent = "Backend reachable";
    } catch (error) {
        elements.connectionPill.classList.remove("online");
        elements.connectionLabel.textContent = "Frontend-only mode";
    }
}

function renderAll() {
    renderStats();
    renderTransactions();
    renderActivity();
}

bindFilters();
bindSearch();
bindNavigation();
bindProfileMenu();
bindWalletBalance();
bindTransactionActions();
bindForm();
bindGuestEscrowForm();
bindEscrowLinkCopy();
bindTracking();
renderAll();
probeBackend();
