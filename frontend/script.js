const API_URL = "http://127.0.0.1:8080/api/foods";
const ORDER_API_URL = "http://127.0.0.1:8080/api/orders";
const STATUS_API_URL = "http://127.0.0.1:8080/api/orders/status";
const REPORTS_API_URL = "http://127.0.0.1:8080/api/reports/summary";

let foods = [];
const cart = {};
let selectedCategory = "All";
let submittingOrder = false;

const foodList = document.getElementById("food-list");
const searchInput = document.getElementById("searchInput");
const categoryButtons = document.querySelectorAll(".category-btn");
const cartItems = document.getElementById("cart-items");
const cartCount = document.getElementById("cart-count");
const cartTotal = document.getElementById("cart-total");
const clearCartButton = document.getElementById("clear-cart-btn");
const checkoutButton = document.getElementById("checkout-btn");
const checkoutMessage = document.getElementById("checkout-message");
const ordersBody = document.getElementById("orders-table-body");
const ordersMessage = document.getElementById("orders-message");
const statusFilter = document.getElementById("status-filter");
const reportsMessage = document.getElementById("reports-message");
const reportSummary = document.getElementById("report-summary");
const customerView = document.getElementById("customer-view");
const adminDashboard = document.getElementById("admin-dashboard");
const dashboardMessage = document.getElementById("dashboard-message");
const adminFoodSearch = document.getElementById("admin-food-search");
const adminFoodAvailability = document.getElementById("admin-food-availability");

let latestReport = null;
let adminFoodsLoaded = false;
let dashboardRefreshTimer = null;
let currentOrders = [];

const FOOD_PHOTO_PATH = "assets/food/";
const foodPhotoAssets = {
    pizza: "pizza-classic.jpg",
    vegetablePizza: "pizza-vegetable.jpg",
    burger: "burger-classic.jpg",
    grilledBurger: "burger-grilled.jpg",
    biryani: "biryani.jpg",
    riceBowl: "rice-bowl.jpg",
    noodles: "noodles.jpg",
    cake: "chocolate-cake.jpg",
    dessert: "dessert.jpg",
    meal: "hero-table.jpg"
};

function foodPhoto(food) {
    const item = `${food.name} ${food.category}`.toLowerCase();
    let asset = foodPhotoAssets.meal;
    if (/pizza/.test(item)) {
        asset = /vegetable|veggie|garden|margherita/.test(item)
            ? foodPhotoAssets.vegetablePizza
            : foodPhotoAssets.pizza;
    } else if (/burger/.test(item)) {
        asset = /grill|smok|bbq|chicken|crispy|double/.test(item)
            ? foodPhotoAssets.grilledBurger
            : foodPhotoAssets.burger;
    } else if (/biryani/.test(item)) {
        asset = foodPhotoAssets.biryani;
    } else if (/chinese|noodle|chow mein|chowmein|lo mein/.test(item)) {
        asset = /rice|fried rice/.test(item)
            ? foodPhotoAssets.riceBowl
            : foodPhotoAssets.noodles;
    } else if (/dessert|cake|chocolate|brownie|ice cream/.test(item)) {
        asset = /cake|chocolate|brownie/.test(item)
            ? foodPhotoAssets.cake
            : foodPhotoAssets.dessert;
    }
    return `${FOOD_PHOTO_PATH}${asset}`;
}

function bindImageFallbacks(container) {
    container.querySelectorAll("img[data-food-photo]").forEach(image => {
        const showFallback = () => {
            const foodMedia = image.closest(".food-media");
            const heroVisual = image.closest(".hero-visual");
            const categoryButton = image.closest(".category-btn");
            if (foodMedia) {
                foodMedia.classList.add("image-failed");
                image.remove();
            } else if (heroVisual) {
                heroVisual.classList.add("image-failed");
                image.remove();
            } else if (categoryButton) {
                const fallback = document.createElement("span");
                fallback.className = "category-art category-image-fallback";
                fallback.textContent = "No photo";
                image.replaceWith(fallback);
            } else if (image.classList.contains("admin-food-thumb")) {
                const fallback = document.createElement("span");
                fallback.className = "admin-food-thumb-fallback";
                fallback.textContent = "No photo";
                image.replaceWith(fallback);
            } else {
                image.remove();
            }
        };
        image.addEventListener("error", showFallback, { once: true });
        if (image.complete && !image.naturalWidth) showFallback();
    });
}

function money(value) {
    return Number(value || 0).toFixed(2);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

async function readJsonResponse(response) {
    let data;
    try {
        data = await response.json();
    } catch {
        data = {};
    }
    if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed (${response.status})`);
    }
    return data;
}

async function loadFoods() {
    foodList.innerHTML = '<p class="muted">Loading food items...</p>';
    try {
        const response = await fetch(API_URL);
        foods = await readJsonResponse(response);
        displayFoods();
        updateCart();
    } catch (error) {
        console.error("Failed to load food items:", error);
        foodList.innerHTML = `<p class="error-text">${escapeHtml(error.message)}. Check that the backend and MySQL are running.</p>`;
    }
}

function displayFoods() {
    const searchText = searchInput.value.toLowerCase().trim();
    const filteredFoods = foods.filter(food => {
        const matchesSearch = food.name.toLowerCase().includes(searchText) ||
            food.category.toLowerCase().includes(searchText);
        const category = food.category.toLowerCase().replace(/s$/, "");
        const selected = selectedCategory.toLowerCase().replace(/s$/, "");
        const matchesCategory = selectedCategory === "All" || category === selected;
        return matchesSearch && matchesCategory;
    });

    if (!filteredFoods.length) {
        foodList.innerHTML = '<p class="muted">No food items found.</p>';
        return;
    }

    foodList.innerHTML = filteredFoods.map(food => {
        return `
            <article class="food-card">
                <div class="food-media">
                    <img class="food-photo" data-food-photo src="${foodPhoto(food)}" alt="${escapeHtml(food.name)}" loading="lazy">
                    <span class="food-availability">Available now</span>
                </div>
                <div class="food-details">
                    <p class="food-category">${escapeHtml(food.category)}</p>
                    <h3>${escapeHtml(food.name)}</h3>
                    <div class="food-meta">
                        <span class="food-price">₹${money(food.price)}</span>
                        ${Number.isFinite(Number(food.rating)) ? `<span class="food-rating" aria-label="Rated ${escapeHtml(food.rating)} out of 5">★ ${escapeHtml(food.rating)}</span>` : ""}
                    </div>
                    <button class="primary-btn add-cart-btn" data-id="${Number(food.id)}" type="button">Add to cart</button>
                </div>
            </article>`;
    }).join("");
    bindImageFallbacks(foodList);
}

function addToCart(foodId) {
    cart[foodId] = (cart[foodId] || 0) + 1;
    checkoutMessage.textContent = "";
    updateCart();
}

function updateCart() {
    let totalItems = 0;
    let totalPrice = 0;
    const selectedFoods = foods.filter(food => (cart[food.id] || 0) > 0);

    selectedFoods.forEach(food => {
        totalItems += cart[food.id];
        totalPrice += Number(food.price) * cart[food.id];
    });

    cartCount.textContent = totalItems;
    document.getElementById("scroll-cart-btn").setAttribute(
        "aria-label",
        `View cart, ${totalItems} ${totalItems === 1 ? "item" : "items"}`
    );
    cartTotal.textContent = money(totalPrice);
    checkoutButton.disabled = totalItems === 0 || submittingOrder;

    if (!selectedFoods.length) {
        cartItems.innerHTML = '<p class="muted">Your cart is empty. Add something delicious!</p>';
        return;
    }

    cartItems.innerHTML = selectedFoods.map(food => `
        <div class="cart-item">
            <div class="cart-item-info">
                <img class="cart-item-thumb" data-food-photo src="${foodPhoto(food)}" alt="" loading="lazy">
                <div><strong>${escapeHtml(food.name)}</strong><p>₹${money(food.price)} each</p></div>
            </div>
            <div class="cart-item-actions">
                <div class="quantity-control">
                    <button class="quantity-btn" data-action="decrease" data-id="${Number(food.id)}" aria-label="Decrease ${escapeHtml(food.name)} quantity">−</button>
                    <span class="quantity-value">${cart[food.id]}</span>
                    <button class="quantity-btn" data-action="increase" data-id="${Number(food.id)}" aria-label="Increase ${escapeHtml(food.name)} quantity">+</button>
                </div>
                <strong class="cart-item-line-total">₹${money(Number(food.price) * cart[food.id])}</strong>
                <button class="text-btn remove-item-btn" data-id="${Number(food.id)}" type="button">Remove</button>
            </div>
        </div>`).join("");
    bindImageFallbacks(cartItems);
}

document.addEventListener("click", event => {
    const addButton = event.target.closest(".add-cart-btn");
    const removeButton = event.target.closest(".remove-item-btn");
    const quantityButton = event.target.closest(".quantity-btn");

    if (addButton) addToCart(Number(addButton.dataset.id));

    if (removeButton) {
        delete cart[Number(removeButton.dataset.id)];
        checkoutMessage.textContent = "";
        updateCart();
    }

    if (quantityButton) {
        const id = Number(quantityButton.dataset.id);
        if (quantityButton.dataset.action === "increase") cart[id] = (cart[id] || 0) + 1;
        else if (cart[id] > 1) cart[id] -= 1;
        else delete cart[id];
        checkoutMessage.textContent = "";
        updateCart();
    }
});

searchInput.addEventListener("input", displayFoods);
categoryButtons.forEach(button => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;
        categoryButtons.forEach(btn => btn.classList.toggle("active", btn === button));
        displayFoods();
    });
});

clearCartButton.addEventListener("click", () => {
    Object.keys(cart).forEach(id => delete cart[id]);
    checkoutMessage.textContent = "";
    updateCart();
});

document.getElementById("scroll-cart-btn").addEventListener("click", () => {
    document.getElementById("cart-section").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("reload-foods-btn").addEventListener("click", loadFoods);
document.getElementById("refresh-customer-orders-btn").addEventListener(
    "click",
    () => loadOrders()
);

checkoutButton.addEventListener("click", async () => {
    const items = foods.filter(food => (cart[food.id] || 0) > 0).map(food => ({
        food_id: Number(food.id),
        quantity: Number(cart[food.id])
    }));

    if (!items.length || submittingOrder) {
        checkoutMessage.textContent = "Add at least one item before placing an order.";
        return;
    }

    submittingOrder = true;
    updateCart();
    checkoutMessage.className = "notice";
    checkoutMessage.textContent = "Placing your order…";

    try {
        const response = await fetch(ORDER_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items })
        });
        const result = await readJsonResponse(response);

        Object.keys(cart).forEach(id => delete cart[id]);
        updateCart();
        checkoutMessage.className = "notice success-text";
        checkoutMessage.textContent =
            `Order #${result.order_id} placed successfully! Total: ₹${money(result.total_amount)}.`;
        await loadOrders();
    } catch (error) {
        console.error("Checkout failed:", error);
        checkoutMessage.className = "notice error-text";
        checkoutMessage.textContent = error.message || "Order failed. Please try again.";
    } finally {
        submittingOrder = false;
        updateCart();
    }
});

function groupOrders(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const id = Number(row.order_id);
        if (!grouped.has(id)) {
            grouped.set(id, {
                id,
                total: Number(row.total_amount || 0),
                status: row.status || "PLACED",
                createdAt: row.created_at || "",
                items: []
            });
        }
        const order = grouped.get(id);
        if (row.food_id !== undefined && row.food_id !== null) {
            order.items.push({
                name: row.food_name || `Food #${row.food_id}`,
                quantity: Number(row.quantity || 0),
                price: Number(row.price || 0)
            });
        }
    }
    return [...grouped.values()].sort((a, b) => b.id - a.id);
}

function statusClass(status) {
    return `status-${String(status).toLowerCase()}`;
}

function renderOrders(orders) {
    const filter = statusFilter.value;
    const visibleOrders = orders.filter(order => filter === "ALL" || order.status === filter);

    if (!visibleOrders.length) {
        ordersBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No orders match this filter.</td></tr>';
        return;
    }

    ordersBody.innerHTML = visibleOrders.map(order => {
        const itemsText = order.items.length
            ? order.items.map(item => `${escapeHtml(item.name)} × ${item.quantity}`).join("<br>")
            : "No item details";
        const timestamp = order.createdAt ? escapeHtml(order.createdAt) : "—";
        return `
            <tr>
                <td><strong>#${order.id}</strong></td>
                <td>${timestamp}</td>
                <td>${itemsText}</td>
                <td class="table-total">₹${money(order.total)}</td>
                <td><span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td>
                <td>
                    <div class="admin-action">
                        <select class="order-status-select" data-id="${order.id}" aria-label="New status for order ${order.id}">
                            <option value="PLACED" ${order.status === "PLACED" ? "selected" : ""}>Placed</option>
                            <option value="PREPARING" ${order.status === "PREPARING" ? "selected" : ""}>Preparing</option>
                            <option value="READY" ${order.status === "READY" ? "selected" : ""}>Ready</option>
                        </select>
                        <button class="small-btn update-status-btn" data-id="${order.id}" type="button">Update</button>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

function renderProcessingMonitor(orders) {
    const monitor = document.getElementById("processing-orders");
    const latestOrders = orders.slice(0, 5);
    if (!latestOrders.length) {
        monitor.innerHTML = '<p class="muted">No orders have been placed yet.</p>';
        return;
    }

    monitor.innerHTML = latestOrders.map(order => {
        const items = order.items.length
            ? order.items.map(item => `${escapeHtml(item.name)} × ${item.quantity}`).join(", ")
            : "No item details";
        return `<div class="processing-order">
            <strong>Order #${order.id}</strong>
            <span class="processing-order-items">${items}</span>
            <span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span>
        </div>`;
    }).join("");
}

function renderCustomerOrders(orders) {
    const list = document.getElementById("customer-orders-list");
    const message = document.getElementById("customer-orders-message");
    const latestOrders = orders.slice(0, 3);

    if (!latestOrders.length) {
        list.innerHTML = '<p class="muted">Your next favourite meal is only a few clicks away.</p>';
        message.textContent = "";
        return;
    }

    list.innerHTML = latestOrders.map(order => {
        const items = order.items.length
            ? order.items.map(item => `${escapeHtml(item.name)} × ${item.quantity}`).join(" · ")
            : "Order details unavailable";
        return `<article class="customer-order-card">
            <div class="customer-order-top">
                <div><strong>Order #${order.id}</strong><span class="customer-order-date">${order.createdAt ? escapeHtml(order.createdAt) : "Recently placed"}</span></div>
                <span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span>
            </div>
            <p class="customer-order-items">${items}</p>
            <div class="customer-order-bottom"><span>Order total</span><strong>₹${money(order.total)}</strong></div>
        </article>`;
    }).join("");
    message.textContent = `Showing your ${latestOrders.length} most recent order(s).`;
}

let ordersLoading = false;
async function loadOrders(quiet = false) {
    if (ordersLoading) return;
    ordersLoading = true;
    if (!quiet) {
        ordersMessage.className = "notice";
        ordersMessage.textContent = "Loading orders…";
    }
    try {
        const response = await fetch(ORDER_API_URL);
        const rows = await readJsonResponse(response);
        currentOrders = groupOrders(rows);
        renderOrders(currentOrders);
        renderProcessingMonitor(currentOrders);
        renderCustomerOrders(currentOrders);
        ordersMessage.textContent = `Loaded ${new Set(rows.map(row => row.order_id)).size} order(s).`;
    } catch (error) {
        console.error("Failed to load orders:", error);
        ordersMessage.className = "notice error-text";
        ordersMessage.textContent = `${error.message}. Check the backend connection.`;
        ordersBody.innerHTML = '<tr><td colspan="6" class="empty-cell">Could not load orders.</td></tr>';
        document.getElementById("processing-orders").innerHTML =
            '<p class="error-text">Could not load processing data.</p>';
        document.getElementById("customer-orders-list").innerHTML =
            '<p class="error-text">Could not load recent orders. Please try again.</p>';
        document.getElementById("customer-orders-message").textContent = "";
    } finally {
        ordersLoading = false;
    }
}

document.getElementById("refresh-orders-btn").addEventListener("click", () => loadOrders());
statusFilter.addEventListener("change", () => renderOrders(currentOrders));

ordersBody.addEventListener("click", async event => {
    const button = event.target.closest(".update-status-btn");
    if (!button) return;

    const id = Number(button.dataset.id);
    const select = ordersBody.querySelector(`.order-status-select[data-id="${id}"]`);
    if (!select) return;

    button.disabled = true;
    ordersMessage.className = "notice";
    ordersMessage.textContent = `Updating order #${id}…`;

    try {
        const response = await fetch(STATUS_API_URL, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: id, status: select.value })
        });
        const result = await readJsonResponse(response);
        ordersMessage.className = "notice success-text";
        ordersMessage.textContent = result.message || `Order #${id} status updated.`;
        await loadOrders();
    } catch (error) {
        ordersMessage.className = "notice error-text";
        ordersMessage.textContent = error.message || "Could not update status.";
    } finally {
        button.disabled = false;
    }
});

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        const showAdmin = button.dataset.view === "admin";
        customerView.hidden = showAdmin;
        adminDashboard.hidden = !showAdmin;
        document.body.classList.toggle("admin-mode", showAdmin);

        document.querySelectorAll(".view-switch").forEach(switchButton => {
            const active = switchButton.dataset.view === button.dataset.view;
            switchButton.classList.toggle("active", active);
            switchButton.setAttribute("aria-pressed", String(active));
        });

        if (dashboardRefreshTimer) {
            clearInterval(dashboardRefreshTimer);
            dashboardRefreshTimer = null;
        }
        if (showAdmin) {
            dashboardMessage.textContent =
                "Summary values appear when the menu and reports APIs respond.";
            Promise.all([loadAdminFoods(), loadOrders(), loadReports()]);
            dashboardRefreshTimer = setInterval(() => {
                if (!adminDashboard.hidden) loadOrders(true);
            }, 15000);
        }
    });
});

document.querySelectorAll("[data-admin-section]").forEach(button => {
    button.addEventListener("click", () => {
        const section = document.getElementById(button.dataset.adminSection);
        if (!section) return;
        document.querySelectorAll(".sidebar-link").forEach(link => {
            link.classList.toggle("active", link.dataset.adminSection === button.dataset.adminSection);
        });
        section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

bindImageFallbacks(customerView);
loadFoods();
loadOrders();

async function loadReports() {
    reportsMessage.className = "notice";
    reportsMessage.textContent = "Loading reports…";
    try {
        const response = await fetch(REPORTS_API_URL);
        const report = await readJsonResponse(response);
        const fields = ["total_orders", "total_value", "average_value",
            "placed_orders", "preparing_orders", "ready_orders"];
        if (!report || fields.some(field => !Number.isFinite(Number(report[field])))) {
            throw new Error("The reports API returned an invalid response.");
        }
        latestReport = report;
        reportSummary.innerHTML = `
            <article class="report-card"><span>Total orders</span><strong>${Number(report.total_orders)}</strong></article>
            <article class="report-card"><span>Total order value</span><strong>₹${money(report.total_value)}</strong></article>
            <article class="report-card"><span>Average order value</span><strong>₹${money(report.average_value)}</strong></article>
            <article class="report-card"><span>Placed</span><strong>${Number(report.placed_orders)}</strong></article>
            <article class="report-card"><span>Preparing</span><strong>${Number(report.preparing_orders)}</strong></article>
            <article class="report-card"><span>Ready</span><strong>${Number(report.ready_orders)}</strong></article>`;
        renderStatusChart(report);
        updateDashboardStats();
        reportsMessage.textContent = "Report summary loaded.";
    } catch (error) {
        console.error("Failed to load order reports:", error);
        reportSummary.innerHTML = '<p class="muted">Report data is unavailable.</p>';
        document.getElementById("status-chart").innerHTML =
            '<p class="muted">Status data is unavailable.</p>';
        reportsMessage.className = "notice error-text";
        reportsMessage.textContent = `${error.message}. Check the backend connection.`;
    }
}

function updateDashboardStats() {
    document.getElementById("metric-total-orders").textContent =
        latestReport ? Number(latestReport.total_orders).toLocaleString() : "—";
    document.getElementById("metric-revenue").textContent =
        latestReport ? `₹${money(latestReport.total_value)}` : "—";
    document.getElementById("metric-pending-orders").textContent =
        latestReport
            ? Number(latestReport.placed_orders) + Number(latestReport.preparing_orders)
            : "—";
    document.getElementById("metric-completed-orders").textContent =
        latestReport ? Number(latestReport.ready_orders) : "—";
    document.getElementById("metric-foods").textContent =
        adminFoodsLoaded ? adminFoods.length.toLocaleString() : "—";
    document.getElementById("metric-available-foods").textContent =
        adminFoodsLoaded
            ? adminFoods.filter(food => food.availability).length.toLocaleString()
            : "—";
}

function renderStatusChart(report) {
    const statuses = [
        ["PLACED", Number(report.placed_orders)],
        ["PREPARING", Number(report.preparing_orders)],
        ["READY", Number(report.ready_orders)]
    ];
    const maximum = Math.max(...statuses.map(([, count]) => count));
    document.getElementById("status-chart").innerHTML = statuses.map(([status, count]) => {
        const width = maximum ? (count / maximum) * 100 : 0;
        return `<div class="chart-row">
            <span>${status}</span>
            <div class="chart-track" role="img" aria-label="${status}: ${count} orders">
                <div class="chart-bar" style="width:${width}%"></div>
            </div>
            <strong>${count}</strong>
        </div>`;
    }).join("");
}

document.getElementById("refresh-reports-btn").addEventListener("click", loadReports);


// Admin menu management. These endpoints use prepared statements in the C++ API.
const ADMIN_FOODS_URL = "http://127.0.0.1:8080/api/admin/foods";
const ADMIN_AVAILABILITY_URL = "http://127.0.0.1:8080/api/admin/foods/availability";
const adminFoodTableBody = document.getElementById("admin-food-table-body");
const adminMenuMessage = document.getElementById("admin-menu-message");
const adminFoodForm = document.getElementById("food-admin-form");
const adminFoodId = document.getElementById("admin-food-id");
const adminFoodName = document.getElementById("admin-food-name");
const adminFoodCategory = document.getElementById("admin-food-category");
const adminFoodPrice = document.getElementById("admin-food-price");
const adminFoodRating = document.getElementById("admin-food-rating");
const saveFoodButton = document.getElementById("save-food-btn");
const cancelFoodEditButton = document.getElementById("cancel-food-edit-btn");
let adminFoods = [];

function setAdminMessage(message, isError = false) {
    adminMenuMessage.className = `notice ${isError ? "error-text" : "success-text"}`;
    adminMenuMessage.textContent = message;
}

function resetAdminFoodForm() {
    adminFoodForm.reset();
    adminFoodId.value = "";
    adminFoodRating.value = "4.0";
    saveFoodButton.textContent = "Add food item";
    cancelFoodEditButton.hidden = true;
}

function renderAdminFoods() {
    const searchText = adminFoodSearch.value.trim().toLowerCase();
    const availability = adminFoodAvailability.value;
    const visibleFoods = adminFoods.filter(food => {
        const matchesSearch = food.name.toLowerCase().includes(searchText) ||
            food.category.toLowerCase().includes(searchText);
        const matchesAvailability = availability === "ALL" ||
            (availability === "AVAILABLE" && food.availability) ||
            (availability === "HIDDEN" && !food.availability);
        return matchesSearch && matchesAvailability;
    });

    if (!visibleFoods.length) {
        adminFoodTableBody.innerHTML =
            `<tr><td colspan="6" class="empty-cell">${adminFoods.length ? "No food items match your search." : "No menu items found."}</td></tr>`;
        return;
    }

    adminFoodTableBody.innerHTML = visibleFoods.map(food => {
        const id = Number(food.id);
        const availabilityClass = food.availability
            ? "status-ready"
            : "status-placed";
        const availabilityText = food.availability ? "Available" : "Hidden";
        const toggleText = food.availability ? "Hide" : "Show";
        const availableValue = food.availability ? 1 : 0;

        return `
            <tr>
                <td>${id}</td>
                <td><div class="admin-food-name-cell"><img class="admin-food-thumb" data-food-photo src="${foodPhoto(food)}" alt="" loading="lazy"><strong>${escapeHtml(food.name)}</strong></div></td>
                <td>${escapeHtml(food.category)}</td>
                <td>₹${money(food.price)}</td>
                <td>
                    <span class="status-pill ${availabilityClass}">${availabilityText}</span>
                </td>
                <td>
                    <div class="admin-action">
                        <button class="small-btn edit-food-btn"
                                data-id="${id}" type="button">Edit</button>
                        <button class="small-btn toggle-food-btn"
                                data-id="${id}"
                                data-available="${availableValue}"
                                type="button">${toggleText}</button>
                    </div>
                </td>
            </tr>`;
    }).join("");
    bindImageFallbacks(adminFoodTableBody);
}

async function loadAdminFoods() {
    adminFoodTableBody.innerHTML =
        '<tr><td colspan="6" class="empty-cell">Loading menu…</td></tr>';
    try {
        const response = await fetch(ADMIN_FOODS_URL);
        adminFoods = await readJsonResponse(response);
        if (!Array.isArray(adminFoods)) {
            throw new Error("The admin foods API returned an invalid response.");
        }
        adminFoodsLoaded = true;
        renderAdminFoods();
        updateDashboardStats();
    } catch (error) {
        adminFoodTableBody.innerHTML =
            '<tr><td colspan="6" class="empty-cell">Could not load admin menu.</td></tr>';
        setAdminMessage(
            `${error.message}. Check backend and run the SQL migration.`,
            true
        );
    }
}

function getAdminFoodFormValues() {
    return {
        name: adminFoodName.value.trim(),
        category: adminFoodCategory.value.trim(),
        price: Number(adminFoodPrice.value),
        rating: Number(adminFoodRating.value)
    };
}

function isValidAdminFood(food) {
    return food.name &&
        food.category &&
        Number.isFinite(food.price) &&
        food.price > 0 &&
        food.price <= 1000000 &&
        Number.isFinite(food.rating) &&
        food.rating >= 0 &&
        food.rating <= 5;
}

async function saveAdminFood(event) {
    event.preventDefault();
    const id = adminFoodId.value.trim();
    const food = getAdminFoodFormValues();
    if (!isValidAdminFood(food)) {
        setAdminMessage(
            'Enter a name, category, positive price up to ₹10,00,000, and rating from 0 to 5.',
            true
        );
        return;
    }

    saveFoodButton.disabled = true;
    try {
        const response = await fetch(ADMIN_FOODS_URL, {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(id ? { id: Number(id), ...food } : food)
        });
        const result = await readJsonResponse(response);
        setAdminMessage(
            result.message || (id ? "Menu item updated." : "Menu item added.")
        );
        resetAdminFoodForm();
        await Promise.all([loadAdminFoods(), loadFoods()]);
    } catch (error) {
        setAdminMessage(error.message, true);
    } finally {
        saveFoodButton.disabled = false;
    }
}

function editAdminFood(button) {
    const food = adminFoods.find(
        item => Number(item.id) === Number(button.dataset.id)
    );
    if (!food) return;

    adminFoodId.value = food.id;
    adminFoodName.value = food.name;
    adminFoodCategory.value = food.category;
    adminFoodPrice.value = food.price;
    adminFoodRating.value = food.rating;
    saveFoodButton.textContent = "Save changes";
    cancelFoodEditButton.hidden = false;
    adminFoodForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function toggleAdminFoodAvailability(button) {
    const id = Number(button.dataset.id);
    const availability = button.dataset.available !== "1";
    button.disabled = true;

    try {
        const response = await fetch(ADMIN_AVAILABILITY_URL, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, availability })
        });
        const result = await readJsonResponse(response);
        setAdminMessage(result.message || "Availability updated.");
        await Promise.all([loadAdminFoods(), loadFoods()]);
    } catch (error) {
        setAdminMessage(error.message, true);
    } finally {
        button.disabled = false;
    }
}

adminFoodForm.addEventListener("submit", saveAdminFood);

adminFoodTableBody.addEventListener("click", async event => {
    const editButton = event.target.closest(".edit-food-btn");
    const toggleButton = event.target.closest(".toggle-food-btn");

    if (editButton) {
        editAdminFood(editButton);
    }

    if (toggleButton) {
        await toggleAdminFoodAvailability(toggleButton);
    }
});

cancelFoodEditButton.addEventListener("click", resetAdminFoodForm);
document.getElementById("refresh-admin-menu-btn").addEventListener(
    "click",
    loadAdminFoods
);
adminFoodSearch.addEventListener("input", renderAdminFoods);
adminFoodAvailability.addEventListener("change", renderAdminFoods);
