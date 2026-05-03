const state = {
    filter: "all",
    query: "",
    walletVisible: false,
    transactions: [
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
    ]
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
        .filter((item) => item.status === "completed")
        .reduce((sum, item) => sum + item.amount, 0);
    const completion = total ? Math.round((completed / total) * 100) : 0;

    elements.statTotal.textContent = total;
    elements.statPending.textContent = pending;
    elements.statReview.textContent = review;
    elements.statCompleted.textContent = completed;
    elements.protectedVolume.textContent = currency.format(volume);
    elements.completionRate.textContent = `${completion}%`;
    elements.walletSectionBalance.textContent = currency.format(walletBalance);
    elements.walletBalance.textContent = state.walletVisible ? currency.format(walletBalance) : "₦--";
}

function renderTransactions() {
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
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
        elements.toast.classList.remove("is-visible");
    }, 2400);
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
    elements.searchInput.addEventListener("input", (event) => {
        state.query = event.target.value.trim();
        renderTransactions();
    });
}

function bindNavigation() {
    elements.navButtons.forEach((button) => {
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
    elements.transactionsList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action='complete']");
        if (!button) return;

        state.transactions = state.transactions.map((transaction) => (
            transaction.id === button.dataset.id
                ? { ...transaction, status: "completed", updatedAt: "Just now" }
                : transaction
        ));

        renderAll();
        showToast(`Escrow ${button.dataset.id} marked completed.`);
    });
}

function bindForm() {
    elements.form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(elements.form);
        const nextId = `BC-${2400 + state.transactions.length + 1}`;
        const initiatorRole = formData.get("initiatorRole");
        const otherParty = formData.get("otherParty").trim();
        const itemDescription = formData.get("itemDescription").trim();
        const buyer = initiatorRole === "buyer" ? "You" : otherParty;
        const seller = initiatorRole === "seller" ? "You" : otherParty;
        const counterpartyRole = initiatorRole === "seller" ? "buyer" : "seller";
        const shareLink = `https://blackcrow.app/escrow/${nextId.toLowerCase()}`;

        state.transactions.unshift({
            id: nextId,
            seller,
            buyer,
            amount: Number(formData.get("amount")),
            status: "pending",
            condition: formData.get("releaseCondition"),
            inspectionDays: 5,
            item: itemDescription,
            note: `Awaiting ${counterpartyRole} acceptance and buyer funding.`,
            shareLink,
            updatedAt: "Just now"
        });

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

    elements.copyEscrowLink?.addEventListener("click", async () => {
        if (!elements.escrowLinkInput.value) return;

        try {
            await navigator.clipboard.writeText(elements.escrowLinkInput.value);
            showToast("Escrow link copied.");
        } catch (error) {
            elements.escrowLinkInput.select();
            showToast("Escrow link selected.");
        }
    });
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
renderAll();
probeBackend();
