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

const foodDetails = {
    1: { emoji: "🍕", description: "Classic cheese pizza" },
    2: { emoji: "🍔", description: "Juicy burger with cheese" },
    3: { emoji: "🍛", description: "Aromatic biryani with spices" },
    4: { emoji: "🍜", description: "Stir-fried noodles and vegetables" },
    5: { emoji: "🍰", description: "Rich chocolate dessert" },
    6: { emoji: "🍕", description: "Pizza loaded with vegetables" }
};

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
        const matchesCategory = selectedCategory === "All" || food.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    if (!filteredFoods.length) {
        foodList.innerHTML = '<p class="muted">No food items found.</p>';
        return;
    }

    foodList.innerHTML = filteredFoods.map(food => {
        const details = foodDetails[food.id] || { emoji: "🍽️", description: "Freshly prepared and delicious" };
        return `
            <article class="food-card">
                <div class="food-image" aria-hidden="true">${details.emoji}</div>
                <div class="food-details">
                    <p class="food-category">${escapeHtml(food.category)}</p>
                    <h3>${escapeHtml(food.name)}</h3>
                    <p class="food-description">${details.description}</p>
                    <div class="food-meta">
                        <span class="food-price">₹${money(food.price)}</span>
                        <span class="food-rating">★ ${escapeHtml(food.rating)}</span>
                    </div>
                    <button class="primary-btn add-cart-btn" data-id="${Number(food.id)}" type="button">Add to cart</button>
                </div>
            </article>`;
    }).join("");
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
    cartTotal.textContent = money(totalPrice);
    checkoutButton.disabled = totalItems === 0 || submittingOrder;

    if (!selectedFoods.length) {
        cartItems.innerHTML = '<p class="muted">Your cart is empty. Add something delicious!</p>';
        return;
    }

    cartItems.innerHTML = selectedFoods.map(food => `
        <div class="cart-item">
            <div class="cart-item-info">
                <strong>${escapeHtml(food.name)}</strong>
                <p>₹${money(food.price)} × ${cart[food.id]}</p>
            </div>
            <div class="cart-item-actions">
                <button class="quantity-btn" data-action="decrease" data-id="${Number(food.id)}" aria-label="Decrease ${escapeHtml(food.name)} quantity">−</button>
                <span class="quantity-value">${cart[food.id]}</span>
                <button class="quantity-btn" data-action="increase" data-id="${Number(food.id)}" aria-label="Increase ${escapeHtml(food.name)} quantity">+</button>
                <button class="text-btn remove-item-btn" data-id="${Number(food.id)}" type="button">Remove</button>
            </div>
        </div>`).join("");
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
                <td>${itemsText}</td>
                <td class="table-total">₹${money(order.total)}</td>
                <td>${timestamp}</td>
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
        renderOrders(groupOrders(rows));
        ordersMessage.textContent = `Loaded ${new Set(rows.map(row => row.order_id)).size} order(s).`;
    } catch (error) {
        console.error("Failed to load orders:", error);
        ordersMessage.className = "notice error-text";
        ordersMessage.textContent = `${error.message}. Check the backend connection.`;
        ordersBody.innerHTML = '<tr><td colspan="6" class="empty-cell">Could not load orders.</td></tr>';
    } finally {
        ordersLoading = false;
    }
}

document.getElementById("refresh-orders-btn").addEventListener("click", () => loadOrders());
statusFilter.addEventListener("change", () => loadOrders());

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

loadFoods();
loadOrders();
setInterval(() => loadOrders(true), 5000);

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
        reportSummary.innerHTML = `
            <article class="report-card"><span>Total orders</span><strong>${Number(report.total_orders)}</strong></article>
            <article class="report-card"><span>Total order value</span><strong>₹${money(report.total_value)}</strong></article>
            <article class="report-card"><span>Average order value</span><strong>₹${money(report.average_value)}</strong></article>
            <article class="report-card"><span>Placed</span><strong>${Number(report.placed_orders)}</strong></article>
            <article class="report-card"><span>Preparing</span><strong>${Number(report.preparing_orders)}</strong></article>
            <article class="report-card"><span>Ready</span><strong>${Number(report.ready_orders)}</strong></article>`;
        reportsMessage.textContent = "Report summary loaded.";
    } catch (error) {
        console.error("Failed to load order reports:", error);
        reportSummary.innerHTML = '<p class="muted">Report data is unavailable.</p>';
        reportsMessage.className = "notice error-text";
        reportsMessage.textContent = `${error.message}. Check the backend connection.`;
    }
}

document.getElementById("refresh-reports-btn").addEventListener("click", loadReports);
loadReports();


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

async function loadAdminFoods() {
    adminFoodTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading menu…</td></tr>';
    try {
        const response = await fetch(ADMIN_FOODS_URL);
        adminFoods = await readJsonResponse(response);
        if (!adminFoods.length) {
            adminFoodTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No menu items found.</td></tr>';
            return;
        }
        adminFoodTableBody.innerHTML = adminFoods.map(food => `
            <tr>
                <td>${Number(food.id)}</td><td><strong>${escapeHtml(food.name)}</strong></td>
                <td>${escapeHtml(food.category)}</td><td>₹${money(food.price)}</td><td>★ ${money(food.rating)}</td>
                <td><span class="status-pill ${food.availability ? 'status-ready' : 'status-placed'}">${food.availability ? 'Available' : 'Hidden'}</span></td>
                <td><div class="admin-action"><button class="small-btn edit-food-btn" data-id="${Number(food.id)}" type="button">Edit</button><button class="small-btn toggle-food-btn" data-id="${Number(food.id)}" data-available="${food.availability ? 1 : 0}" type="button">${food.availability ? 'Hide' : 'Show'}</button></div></td>
            </tr>`).join('');
    } catch (error) {
        adminFoodTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Could not load admin menu.</td></tr>';
        setAdminMessage(`${error.message}. Check backend and run the SQL migration.`, true);
    }
}

adminFoodForm.addEventListener('submit', async event => {
    event.preventDefault();
    const id = adminFoodId.value.trim();
    const payload = { name: adminFoodName.value.trim(), category: adminFoodCategory.value.trim(), price: Number(adminFoodPrice.value), rating: Number(adminFoodRating.value) };
    if (!payload.name || !payload.category || !Number.isFinite(payload.price) || payload.price <= 0 || payload.price > 1000000 || !Number.isFinite(payload.rating) || payload.rating < 0 || payload.rating > 5) {
        setAdminMessage('Enter a name, category, positive price up to ₹10,00,000, and rating from 0 to 5.', true); return;
    }
    saveFoodButton.disabled = true;
    try {
        const response = await fetch(ADMIN_FOODS_URL, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id: Number(id), ...payload } : payload) });
        const result = await readJsonResponse(response);
        setAdminMessage(result.message || (id ? 'Menu item updated.' : 'Menu item added.'));
        resetAdminFoodForm();
        await Promise.all([loadAdminFoods(), loadFoods()]);
    } catch (error) { setAdminMessage(error.message, true); }
    finally { saveFoodButton.disabled = false; }
});

adminFoodTableBody.addEventListener('click', async event => {
    const editButton = event.target.closest('.edit-food-btn');
    const toggleButton = event.target.closest('.toggle-food-btn');
    if (editButton) {
        const food = adminFoods.find(item => Number(item.id) === Number(editButton.dataset.id));
        if (!food) return;
        adminFoodId.value = food.id; adminFoodName.value = food.name; adminFoodCategory.value = food.category;
        adminFoodPrice.value = food.price; adminFoodRating.value = food.rating;
        saveFoodButton.textContent = 'Save changes'; cancelFoodEditButton.hidden = false;
        adminFoodForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (toggleButton) {
        const id = Number(toggleButton.dataset.id);
        const availability = toggleButton.dataset.available !== '1';
        toggleButton.disabled = true;
        try {
            const response = await fetch(ADMIN_AVAILABILITY_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, availability }) });
            const result = await readJsonResponse(response); setAdminMessage(result.message || 'Availability updated.');
            await Promise.all([loadAdminFoods(), loadFoods()]);
        } catch (error) { setAdminMessage(error.message, true); }
        finally { toggleButton.disabled = false; }
    }
});

cancelFoodEditButton.addEventListener('click', resetAdminFoodForm);
document.getElementById('refresh-admin-menu-btn').addEventListener('click', loadAdminFoods);
loadAdminFoods();
