const state = {
    filter: "all",
    query: "",
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
    protectedVolume: document.getElementById("protected-volume"),
    completionRate: document.getElementById("completion-rate"),
    statTotal: document.getElementById("stat-total"),
    statPending: document.getElementById("stat-pending"),
    statReview: document.getElementById("stat-review"),
    statCompleted: document.getElementById("stat-completed"),
    toast: document.getElementById("toast")
};

const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
});

function getFilteredTransactions() {
    return state.transactions.filter((transaction) => {
        const matchesFilter = state.filter === "all" || transaction.status === state.filter;
        const haystack = `${transaction.id} ${transaction.buyer} ${transaction.seller} ${transaction.condition}`.toLowerCase();
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
    const completion = total ? Math.round((completed / total) * 100) : 0;

    elements.statTotal.textContent = total;
    elements.statPending.textContent = pending;
    elements.statReview.textContent = review;
    elements.statCompleted.textContent = completed;
    elements.protectedVolume.textContent = currency.format(volume);
    elements.completionRate.textContent = `${completion}%`;
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
        const action = transaction.status === "pending"
            ? `<button class="action-button" data-action="complete" data-id="${transaction.id}">Mark completed</button>`
            : "";

        return `
            <article class="transaction-card">
                <div class="transaction-head">
                    <div class="transaction-copy">
                        <span>${transaction.id}</span>
                        <strong>${transaction.buyer} -> ${transaction.seller}</strong>
                    </div>
                    <span class="status-badge ${transaction.status}">${capitalize(transaction.status)}</span>
                </div>
                <div class="transaction-meta">
                    <div class="meta-group">
                        <span class="meta-chip">${currency.format(transaction.amount)}</span>
                        <span class="meta-chip">${transaction.condition}</span>
                        <span class="meta-chip">${transaction.inspectionDays} day inspection</span>
                    </div>
                    ${action}
                </div>
                <p>${transaction.note}</p>
                <span class="micro-copy">Updated ${transaction.updatedAt}</span>
            </article>
        `;
    }).join("");
}

function renderActivity() {
    const ordered = [...state.transactions].slice(0, 5);

    elements.activityFeed.innerHTML = ordered.map((transaction, index) => `
        <article class="activity-item">
            <div class="activity-mark">0${index + 1}</div>
            <div class="activity-copy">
                <strong>${transaction.id} ${activityLabel(transaction.status)}</strong>
                <span>${transaction.buyer} with ${transaction.seller}</span>
            </div>
            <span class="micro-copy">${transaction.updatedAt}</span>
        </article>
    `).join("");
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
        elements.toast.classList.remove("is-visible");
    }, 2400);
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

    elements.focusComposer.addEventListener("click", () => {
        document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("seller-name")?.focus();
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

        state.transactions.unshift({
            id: nextId,
            seller: formData.get("sellerName").trim(),
            buyer: formData.get("buyerName").trim(),
            amount: Number(formData.get("amount")),
            status: "pending",
            condition: formData.get("releaseCondition"),
            inspectionDays: Number(formData.get("inspectionDays")),
            note: formData.get("dealNote").trim() || "Awaiting release condition details.",
            updatedAt: "Just now"
        });

        elements.form.reset();
        document.getElementById("inspection-days").value = 5;
        renderAll();
        showToast(`Escrow ${nextId} created.`);
        document.getElementById("transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

async function probeBackend() {
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
bindTransactionActions();
bindForm();
renderAll();
probeBackend();