// static/js/customer.js
const API_URL = "http://localhost:5001";
let allMenus = [];
let cart = [];
let currentItem = null;

// quick auth guard
if (!localStorage.getItem('username')) {
    window.location.href = "/customer_auth";
}
const username = localStorage.getItem('username') || 'Customer';
document.addEventListener('DOMContentLoaded', () => {
    // set username
    document.getElementById('greetingName').textContent = username;
    document.getElementById('profileUsername').textContent = username;

    // hook UI
    document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
    document.getElementById('closeSidebar').addEventListener('click', toggleSidebar);

    // search behavior
    document.getElementById('searchInput').addEventListener('input', (e) => {
        performSearch(e.target.value);
    });



    // category tabs
    document.querySelectorAll('.cat').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const currentQuery = document.getElementById('searchInput').value.trim().toLowerCase();
            renderMenuGrid(currentQuery, btn.dataset.cat);
        });
    });


    // load everything
    loadCustomerMenu();
    loadOngoingOrders()
    loadPastOrders()

    // periodic refresh for orders (optional)
    setInterval(() => {
        loadOngoingOrders()
        loadPastOrders()
        loadCustomerMenu()
    }, 1000);
});

// ---------------- Sidebar ----------------
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    const open = sb.classList.toggle('open');
    overlay.classList.toggle('visible', open);

    // SHIFT CONTENT
    document.body.classList.toggle('shifted', open);
}


// ---------------- Profile modal ----------------
function openProfileModal() {
    document.getElementById('profileUsername').textContent = username;
    document.getElementById('profileModalBg').classList.add('show');
}
function closeProfileModal() {
    document.getElementById('profileModalBg').classList.remove('show');
}

async function loadCustomerMenu() {
    try {
        const res = await fetch(`${API_URL}/customer_menu`);
        if (!res.ok) throw new Error('Failed to fetch menu');
        const menuData = await res.json();
        allMenus = [];
        Object.keys(menuData).forEach(cat => {
            menuData[cat].forEach(item => {
                allMenus.push({
                    ...item,
                    category: cat,
                    price: Number(item.display_price ?? item.original_price ?? item.price),
                    original_price: Number(item.original_price ?? item.price),
                    discount: Number(item.discount || 0)
                });
            });
        });
        const categoriesRow = document.getElementById('categoriesRow');
        categoriesRow.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'cat active';
        allBtn.dataset.cat = 'All';
        allBtn.textContent = 'All';
        categoriesRow.appendChild(allBtn);
        Object.keys(menuData).forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat';
            btn.dataset.cat = cat;
            btn.textContent = cat;
            categoriesRow.appendChild(btn);
        });
        document.querySelectorAll('.cat').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cat').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const currentQuery = document.getElementById('searchInput').value.trim().toLowerCase();
                renderMenuGrid(currentQuery, btn.dataset.cat);
            });
        });

        renderMenuGrid('', 'All');
    } catch (err) {
        console.error('loadCustomerMenu error', err);
        document.getElementById('menuGrid').innerHTML = '<div style="color:#c00">Failed to load menu</div>';
    }
}

function getActiveCategory() {
    const active = document.querySelector('.cat.active');
    return active ? active.dataset.cat : 'All';
}

function mapCategoryFromMenuField(cat) {
    cat = (cat || '').toLowerCase();
    if (cat.includes('appetizer')) return 'Appetizer';
    if (cat.includes('main')) return 'Main Dish';
    if (cat.includes('dessert')) return 'Dessert';
    if (cat.includes('drink') || cat.includes('beverage')) return 'Drinks';
    return cat.charAt(0).toUpperCase() + cat.slice(1) || 'Others';
}

function renderMenuGrid(searchQuery = '', category = 'All') {
    const grid = document.getElementById('menuGrid');
    if (!grid) return;
    grid.innerHTML = '';

    let filtered = allMenus || [];

    if (category && category !== 'All') {
        filtered = filtered.filter(m => mapCategoryFromMenuField(m.category) === category);
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(m =>
            (m.name || '').toLowerCase().includes(q) ||
            (m.category || '').toLowerCase().includes(q)
        );
    }

    if (!filtered.length) {
        grid.innerHTML = '<div style="color:#777;padding:18px">No items found.</div>';
        return;
    }

    filtered.forEach(menu => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="img">
                ${menu.image ? `<img src="${menu.image}" alt="${escapeHtml(menu.name)}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}
            </div>
            <div class="meta">
                <h4>${escapeHtml(menu.name)}</h4>
                <p>${escapeHtml(menu.category || '')}</p>
                <div class="row">
                    <div class="price">
                        ${menu.discount > 0 ? `
                            <span style="text-decoration:line-through;color:#888;font-size:12px">
                                ₱${menu.original_price.toFixed(2)}
                            </span><br>
                            <span style="color:#e84118;font-weight:700">
                                ₱${menu.price.toFixed(2)}
                            </span>` : `₱${menu.price.toFixed(2)}`}
                    </div>
                    <button class="add-btn">+ Add</button>
                </div>
            </div>
        `;
        card.querySelector('.add-btn').addEventListener('click', () => {
            menu.price = menu.discount > 0
                ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
                : Number(menu.original_price);
            openMenuModal(menu);
        });

        grid.appendChild(card);
    });
}


// ---------------- Menu modal ----------------
function openMenuModal(menu) {
    // Always set menu.price to discounted price if any
    menu.price = menu.discount > 0
        ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
        : Number(menu.original_price);

    currentItem = menu;
    document.getElementById('modalItemImg').src = menu.image || 'https://via.placeholder.com/400x300?text=No+Image';
    document.getElementById('modalItemName').textContent = menu.name;

    const priceEl = document.getElementById('modalItemPrice');
    if (menu.discount > 0) {
        priceEl.innerHTML = `
            <span style="text-decoration:line-through;color:#888">
                ₱${menu.original_price.toFixed(2)}
            </span><br>
            <span style="color:#e84118;font-weight:700">
                ₱${menu.price.toFixed(2)}
            </span>
        `;
    } else {
        priceEl.textContent = `₱${menu.price.toFixed(2)}`;
    }

    document.getElementById('modalQuantity').value = 1;
    document.getElementById('menuModalBg').classList.add('show');
}

function closeMenuModal() {
    document.getElementById('menuModalBg').classList.remove('show');
}

// ---------------- Cart logic ----------------
function showCartNotif() {
    const n = document.getElementById('cartNotif');
    n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 1300);
}

function addMenuToCart(menu) {
    if (!menu) return;

    const qty = 1; // quick add

    const finalPrice = menu.discount > 0
        ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
        : Number(menu.original_price);

    const existing = cart.find(i => i.id === menu.id);
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({
            id: menu.id,
            name: menu.name,
            price: finalPrice,
            original_price: Number(menu.original_price),
            discount: Number(menu.discount || 0),
            image: menu.image || '',
            qty
        });
    }

    updateCartBadge();
    renderOrderList();
    showCartNotif();
}



function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? 'inline-block' : 'none';
}

function openCart() {
    renderCartModal();
    document.getElementById('cartModalBg').classList.add('show');
}
function closeCart() {
    document.getElementById('cartModalBg').classList.remove('show');
}

function renderCartModal() {
    const tbody = document.getElementById('cartItems');
    tbody.innerHTML = '';
    if (cart.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">Your cart is empty</td></tr>`;
        document.getElementById('cartTotalText').textContent = '₱0.00';
        return;
    }
    let total = 0;
    cart.forEach((it, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td style="width:64px"><img src="${it.image || 'https://via.placeholder.com/64'}" style="width:56px;height:56px;object-fit:cover;border-radius:8px"></td>
      <td>${escapeHtml(it.name)}</td>
      <td style="text-align:center">
        <button class="qty-dec" data-idx="${idx}">-</button>
        <span style="padding:0 8px">${it.qty}</span>
        <button class="qty-inc" data-idx="${idx}">+</button>
      </td>
      <td style="text-align:right">
    ${it.discount > 0 ? `
        <div style="text-decoration:line-through;color:#aaa;font-size:12px">
            ₱${(it.original_price * it.qty).toFixed(2)}
        </div>
        <div style="color:#e84118;font-weight:700">
            ₱${(it.price * it.qty).toFixed(2)}
        </div>
    ` : `
        ₱${(it.price * it.qty).toFixed(2)}
    `}
</td>

    `;
        tbody.appendChild(tr);
        total += it.price * it.qty;
    });

    document.getElementById('cartTotalText').textContent = `₱${total.toFixed(2)}`;

    // bind quantity handlers
    tbody.querySelectorAll('.qty-inc').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            cart[idx].qty++;
            updateCartBadge();
            renderCartModal();
            renderOrderList();
        });
    });
    tbody.querySelectorAll('.qty-dec').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            if (cart[idx].qty > 1) cart[idx].qty--;
            else cart.splice(idx, 1);
            updateCartBadge();
            renderCartModal();
            renderOrderList();
        });
    });
}

// ---------------- Order panel render ----------------
function renderOrderList() {
    const list = document.getElementById('orderList');
    list.innerHTML = '';
    if (cart.length === 0) {
        list.innerHTML = '<li class="empty">No items yet — add something from the menu</li>';
        document.getElementById('orderTotal').textContent = '₱0.00';
        document.getElementById('orderCountText').textContent = '0 items';
        return;
    }
    let total = 0;
    let itemCount = 0;
    cart.forEach((it, idx) => {
        total += it.price * it.qty;
        itemCount += it.qty;
        const li = document.createElement('li');
        li.innerHTML = `
      <div class="meta">
        <img src="${it.image || 'https://via.placeholder.com/48'}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">
        <div>
          <div style="font-weight:600">${escapeHtml(it.name)}</div>
          <div style="font-size:12px;color:var(--muted)">
  ${it.discount > 0 ? `
    <span style="text-decoration:line-through;color:#aaa">
      ₱${it.original_price.toFixed(2)}
    </span>
    <span style="color:#e84118;font-weight:700">
      ₱${it.price.toFixed(2)}
    </span>
  ` : `
    ₱${it.price.toFixed(2)}
  `}
  • <span class="qty-badge">${it.qty}x</span>
</div>

        </div>
      </div>
      <div>
        <button onclick="removeCartItem(${idx})" style="background:transparent;border:0;cursor:pointer;color:#c33">✕</button>
      </div>
    `;
        list.appendChild(li);
    });
    document.getElementById('orderTotal').textContent = `₱${total.toFixed(2)}`;
    document.getElementById('orderCountText').textContent = `${itemCount} items`;
    updateCartBadge();
}

function removeCartItem(idx) {
    if (idx >= 0 && idx < cart.length) cart.splice(idx, 1);
    renderOrderList();
    renderCartModal();
    updateCartBadge();
}

// ---------------- Checkout ----------------
async function checkout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    try {
        const payload = {
            username,
            cart: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }))
        };
        const res = await fetch(`${API_URL}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'success') {
            alert(`Order placed! Order ID: ${data.order_id}`);
            cart = [];
            renderOrderList();
            updateCartBadge();
            closeCart();
            // refresh orders
            loadOngoingOrders()
            loadPastOrders()
        } else {
            alert('Failed to place order: ' + (data.message || JSON.stringify(data)));
        }
    } catch (err) {
        console.error('checkout error', err);
        alert('Error placing order.');
    }
}

// ---------------- Orders / Transactions from backend ----------------
// Load ongoing orders (Pending / In Progress)
async function loadOngoingOrders() {
    try {
        const res = await fetch(`${API_URL}/my_orders/${encodeURIComponent(username)}`);
        const orders = await res.json();
        const tbody = document.querySelector('#ongoingOrdersTable tbody');
        tbody.innerHTML = '';

        const activeOrders = orders.filter(o => ['pending', 'in progress'].includes((o.status || '').toLowerCase()));
        if (activeOrders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">No ongoing orders</td></tr>`;
            return;
        }

        activeOrders.forEach(o => {
            const items = (o.items || []).map(i => `${i.name} x${i.qty}`).join(', ');
            const orderTime = new Date(o.created_at).toLocaleString();
            const diffMinutes = (new Date() - new Date(o.created_at)) / 1000 / 60;
            const canCancel = diffMinutes <= 3 && o.status.toLowerCase() === 'pending';

            // Calculate total amount per order
            const totalAmount = (o.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${o.order_id}</td>
        <td>${items}</td>
        <td>₱${totalAmount.toFixed(2)}</td>
        <td>${o.status}</td>
        <td>${orderTime}</td>
        <td>${canCancel ? `<button onclick="cancelOrder(${o.order_id})">Cancel</button>` : '-'}</td>
    `;
            tbody.appendChild(tr);
        });

    } catch (err) { console.error(err); }
}

async function loadPastOrders() {
    try {
        const res = await fetch(`${API_URL}/my_orders/${encodeURIComponent(username)}`);
        const orders = await res.json();
        const tbody = document.querySelector('#transactionsTable tbody');
        tbody.innerHTML = '';

        const pastOrders = orders.filter(o => !['pending', 'in progress'].includes((o.status || '').toLowerCase()));
        if (pastOrders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">No past orders</td></tr>`;
            return;
        }

        pastOrders.forEach(o => {
            const items = (o.items || []).map(i => `${i.name} x${i.qty}`).join(', ');
            const orderTime = new Date(o.created_at).toLocaleString();
            const totalAmount = (o.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);

            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${o.order_id}</td>
        <td>${items}</td>
        <td>₱${totalAmount.toFixed(2)}</td>
        <td>${o.status}</td>
        <td>${orderTime}</td>
    `;
            tbody.appendChild(tr);
        });

    } catch (err) { console.error(err); }
}


loadOngoingOrders();
loadPastOrders();

// refresh periodically
setInterval(() => {
    loadOngoingOrders();
    loadPastOrders();
}, 30000);


async function cancelOrder(orderId) {
    if (!confirm('Cancel this order?')) return;
    try {
        const res = await fetch(`${API_URL}/cancel_order/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.status === 'success') {
            alert('Order cancelled');
            loadOngoingOrders()
            loadPastOrders()
        } else {
            alert('Failed to cancel: ' + (data.message || JSON.stringify(data)));
        }
    } catch (err) {
        console.error('cancelOrder', err);
        alert('Error cancelling order.');
    }
}

// ---------------- small helpers ----------------
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, (c) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
}

// ---------------- navigation showContent (existing pages) ----------------
function showContent(section) {
    // hide all sections
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');

    // show requested section
    const el = document.getElementById(section);
    if (el) el.style.display = 'block';

    // if showing orders or transactions, reload data
    if (section === 'myOrders') loadOngoingOrders();
    if (section === 'transactions') loadPastOrders();

    // close sidebar on small screens
    toggleSidebar(false);
}

// optional: allow toggleSidebar to force close
function toggleSidebar(forceClose) {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    const open = sb.classList.contains('open');
    if (forceClose === true && open) {
        sb.classList.remove('open');
        overlay.classList.remove('visible');
        document.body.classList.remove('shifted');
        return;
    }

    const newState = sb.classList.toggle('open');
    overlay.classList.toggle('visible', newState);
    document.body.classList.toggle('shifted', newState);
}


// ensure order-panel updates when cart changes
window.addEventListener('load', () => {
    renderOrderList();
    updateCartBadge();
});

function renderHomePopular() {
    const grid = document.getElementById('homeMenuGrid');
    grid.innerHTML = '';

    if (!allMenus || allMenus.length === 0) {
        grid.innerHTML = '<div style="color:#777;padding:18px">No items found.</div>';
        return;
    }

    const popular = allMenus.slice(0, 3); // for now first 3
    popular.forEach(menu => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="img">
                ${menu.image ? `<img src="${menu.image}" alt="${escapeHtml(menu.name)}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}
            </div>
            <div class="meta">
                <h4>${escapeHtml(menu.name)}</h4>
                <p>${escapeHtml(menu.category || '')}</p>
                <div class="row">
                    <div class="price">
  ${menu.discount > 0 ? `
    <span style="text-decoration:line-through;color:#888;font-size:12px">
      ₱${menu.original_price.toFixed(2)}
    </span><br>
    <span style="color:#e84118;font-weight:700">
      ₱${menu.display_price.toFixed(2)}
    </span>
  ` : `
    ₱${menu.original_price.toFixed(2)}
  `}
</div>


                    <button class="add-btn">+ Add</button>
                </div>
            </div>
        `;
        card.querySelector('.add-btn').addEventListener('click', () => {
            // make sure menu.price is set before opening modal
            menu.price = menu.discount > 0
                ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
                : Number(menu.original_price);
            openMenuModal(menu);
        });

        grid.appendChild(card);
    });
}

function renderMenuFull() {
    const tabsContainer = document.getElementById('menuCategoryTabs');
    tabsContainer.innerHTML = '';

    const categories = ['All', ...new Set(allMenus.map(m => mapCategoryFromMenuField(m.category)))];

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.textContent = cat;
        btn.dataset.cat = cat;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenuGridFull(cat);
        });
        tabsContainer.appendChild(btn);
    });

    // activate first tab
    tabsContainer.querySelector('button').classList.add('active');
    renderMenuGridFull('All');
}

function renderMenuGrid(searchQuery = '', category = 'All', gridId = 'menuGridFull') {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    let filtered = allMenus || [];
    if (category && category !== 'All') {
        filtered = filtered.filter(m => mapCategoryFromMenuField(m.category) === category);
    }
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(m => (m.name || '').toLowerCase().includes(q) || (m.category || '').toLowerCase().includes(q));
    }

    if (!filtered.length) {
        grid.innerHTML = '<div style="color:#777;padding:18px">No items found.</div>';
        return;
    }

    filtered.forEach(menu => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="img">
            ${menu.image ? `<img src="${menu.image}" alt="${escapeHtml(menu.name)}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}
          </div>
          <div class="meta">
            <h4>${escapeHtml(menu.name)}</h4>
            <p>${escapeHtml(menu.category || '')}</p>
            <div class="row">
              <div class="price">
  ${menu.discount > 0 ? `
    <span style="text-decoration:line-through;color:#888;font-size:12px">
      ₱${menu.original_price.toFixed(2)}
    </span><br>
    <span style="color:#e84118;font-weight:700">
      ₱${menu.price.toFixed(2)}
    </span>
  ` : `
    ₱${menu.price.toFixed(2)}
  `}
</div>

              <button class="add-btn">+ Add</button>
            </div>
          </div>
        `;
        card.querySelector('.add-btn').addEventListener('click', () => {
            addMenuToCart(menu);
            // make sure menu.price is set before opening modal
            menu.price = menu.discount > 0
                ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
                : Number(menu.original_price);
            openMenuModal(menu);
        });

        grid.appendChild(card);
    });
}

async function loadPopularDishes() {
    const popularGrid = document.getElementById('homePopularGrid');
    popularGrid.innerHTML = '';

    try {
        const res = await fetch(`${API_URL}/popular_menu`);
        const data = await res.json();

        if (!data.length) {
            popularGrid.innerHTML = '<div style="color:#777;padding:18px">No popular dishes yet.</div>';
            return;
        }

        data.forEach(menu => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="img" style="position:relative">
                    ${menu.image ? `<img src="${menu.image}" alt="${menu.name}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}
                    <span style="position:absolute;top:8px;left:8px;background:#e84118;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px;font-weight:600">Popular</span>
                </div>
                <div class="meta">
                    <h4>${menu.name}</h4>
                    <p>${menu.category}</p>
                    <small style="color:#555">Ordered ${menu.total_ordered || 0} times</small>
                    <div class="row">
                        <div class="price">₱${menu.price.toFixed(2)}</div>
                        <button class="add-btn">+ Add</button>
                    </div>
                </div>
            `;
            card.querySelector('.add-btn').addEventListener('click', () => {
                addMenuToCart(menu);
                // make sure menu.price is set before opening modal
                menu.price = menu.discount > 0
                    ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
                    : Number(menu.original_price);
                openMenuModal(menu);
            });

            popularGrid.appendChild(card);
        });

    } catch (err) {
        console.error('Error loading popular dishes:', err);
        popularGrid.innerHTML = '<div style="color:#c00">Failed to load popular dishes</div>';
    }
}


async function loadAnnouncements() {
    try {
        const res = await fetch(`${API_URL}/customer_announcements`);
        if (!res.ok) throw new Error("Failed to fetch announcements");

        const announcements = await res.json();
        const bar = document.getElementById('announcementBar');

        if (!announcements.length) {
            bar.style.display = 'none';
            return;
        }

        // Show latest announcement title only
        const latest = announcements[announcements.length - 1];
        let html = `<span class="announcement-title"><strong>${latest.title}</strong>`;

        if (latest.type === 'sale') {
            let targetText = '';
            if (latest.menu_id) targetText = latest.menu_name || 'Item-specific sale';
            else if (latest.target && latest.target.startsWith('cat:')) targetText = `Category: ${latest.target.slice(4)}`;
            else if (latest.target === 'all') targetText = 'Site-wide sale';
            html += ` <span class="type-sale">[${targetText}]</span>`;

            if (latest.discount && latest.discount > 0) {
                html += ` <span class="discount">💰 ${latest.discount}% OFF</span>`;
            }
        }

        html += `</span> <button class="view-all-btn" onclick="openAnnouncements()">View All</button>`;
        bar.innerHTML = html;
        bar.style.display = 'flex';
        bar.style.justifyContent = 'space-between';
        bar.style.alignItems = 'center';

        // Populate modal list
        const list = document.getElementById('announcementsList');
        list.innerHTML = announcements.map(ann => {
            let itemHtml = `<strong>${ann.title}</strong>`;
            if (ann.type === 'sale') {
                let targetText = '';
                if (ann.menu_id) targetText = ann.menu_name || 'Item-specific sale';
                else if (ann.target && ann.target.startsWith('cat:')) targetText = `Category: ${ann.target.slice(4)}`;
                else if (ann.target === 'all') targetText = 'Site-wide sale';
                itemHtml += ` <span class="type-sale">[${targetText}]</span>`;

                if (ann.discount && ann.discount > 0) {
                    itemHtml += ` <span class="discount">💰 ${ann.discount}% OFF</span>`;
                }
            }
            return `<li>${itemHtml}</li>`;
        }).join('');

    } catch (err) {
        console.error("Failed to load announcements", err);
        document.getElementById('announcementBar').style.display = 'none';
    }
}
async function loadHomeSections() {
    try {
        if (!allMenus || allMenus.length === 0) {
            const res = await fetch(`${API_URL}/customer_menu`);
            const menuData = await res.json();
            allMenus = [];
            Object.keys(menuData).forEach(cat => {
                (menuData[cat] || []).forEach(item => {
                    allMenus.push({
                        ...item,
                        category: cat,
                        price: Number(item.display_price ?? item.original_price ?? item.price ?? 0),
                        original_price: Number(item.original_price ?? item.price ?? 0),
                        discount: Number(item.discount || 0),
                        orders_count: Number(item.orders_count || 0),
                        popular: item.popular || false,
                        start_date: item.start_date, // for deals
                        end_date: item.end_date      // for deals
                    });
                });
            });
        }

        // ---------- Today's Deals with Duration ----------
        const dealsGrid = document.getElementById('homeDealsGrid');
        dealsGrid.innerHTML = '';
        const deals = allMenus.filter(m => m.discount > 0);
        if (!deals.length) {
            dealsGrid.innerHTML = '<div style="color:#777;padding:18px">No deals today.</div>';
        } else {
            deals.forEach(menu => {
                let durationText = '';
                if (menu.start_date && menu.end_date) {
                    const start = new Date(menu.start_date).toLocaleDateString();
                    const end = new Date(menu.end_date).toLocaleDateString();
                    durationText = `<small style="color:#555">Valid: ${start} - ${end}</small>`;
                }

                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="img">
                        ${menu.image ? `<img src="${menu.image}" alt="${escapeHtml(menu.name)}">`
                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}
                    </div>
                    <div class="meta">
                        <h4>${escapeHtml(menu.name)}</h4>
                        <p>${escapeHtml(menu.category)}</p>
                        ${durationText}
                        <div class="row">
                            <div class="price">
                                <span style="text-decoration:line-through;color:#888;font-size:12px">
                                    ₱${menu.original_price.toFixed(2)}
                                </span><br>
                                <span style="color:#e84118;font-weight:700">
                                    ₱${menu.price.toFixed(2)}
                                </span>
                            </div>
                            <button class="add-btn">+ Add</button>
                        </div>
                    </div>
                `;
                card.querySelector('.add-btn').addEventListener('click', () => {
                    addMenuToCart(menu);
                    // make sure menu.price is set before opening modal
                    menu.price = menu.discount > 0
                        ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
                        : Number(menu.original_price);
                    openMenuModal(menu);
                });

                dealsGrid.appendChild(card);
            });
        }

        // ---------- Popular Dishes (most ordered) ----------
        const popularGrid = document.getElementById('homePopularGrid');
        popularGrid.innerHTML = '';
        const popularMenus = allMenus
            .filter(m => m.orders_count > 0)
            .sort((a, b) => b.orders_count - a.orders_count)
            .slice(0, 5);

        if (!popularMenus.length) {
            popularGrid.innerHTML = '<div style="color:#777;padding:18px">No popular dishes yet.</div>';
        } else {
            popularMenus.forEach(menu => {
                const discounted = menu.discount > 0;
                const displayPrice = discounted ? menu.price : menu.price;
                const originalPrice = discounted ? menu.original_price : menu.price;

                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="img" style="position:relative">
                        ${menu.image ? `<img src="${menu.image}" alt="${escapeHtml(menu.name)}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}
                        <span style="position:absolute;top:8px;left:8px;background:#e84118;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px;font-weight:600">Popular</span>
                    </div>
                    <div class="meta">
                        <h4>${escapeHtml(menu.name)}</h4>
                        <p>${escapeHtml(menu.category)}</p>
                        <small style="color:#555">Ordered ${menu.orders_count} times</small>
                        <div class="row">
                            <div class="price">
                                ${discounted ? `
                                <span style="text-decoration:line-through;color:#888;font-size:12px">
                                    ₱${originalPrice.toFixed(2)}
                                </span><br>
                                <span style="color:#e84118;font-weight:700">
                                    ₱${displayPrice.toFixed(2)}
                                </span>` : `₱${displayPrice.toFixed(2)}`}
                            </div>
                            <button class="add-btn">+ Add</button>
                        </div>
                    </div>
                `;
                card.querySelector('.add-btn').addEventListener('click', () => {
                    addMenuToCart(menu);
                    // make sure menu.price is set before opening modal
                    menu.price = menu.discount > 0
                        ? Number(menu.original_price) * (1 - Number(menu.discount) / 100)
                        : Number(menu.original_price);
                    openMenuModal(menu);
                });

                popularGrid.appendChild(card);
            });
        }

    } catch (err) {
        console.error('Error loading home sections:', err);
        document.getElementById('homeDealsGrid').innerHTML = '<div style="color:#c00">Failed to load deals</div>';
        document.getElementById('homePopularGrid').innerHTML = '<div style="color:#c00">Failed to load popular dishes</div>';
    }
}



// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    loadHomeSections();
    // Auto-refresh every 60s
    setInterval(loadHomeSections, 60000);
});


// Modal controls
function openAnnouncements() {
    document.getElementById('announcementsModalBg').style.display = 'block';
}

function closeAnnouncements() {
    document.getElementById('announcementsModalBg').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    loadAnnouncements();
});
function performSearch(query) {
    const activeSection = document.querySelector('.content-section:not([style*="display: none"])');
    const q = query.trim().toLowerCase();

    if (!activeSection) return;

    const id = activeSection.id;

    if (id === 'menu') {
        renderMenuGrid(q, getActiveCategory());
    } else if (id === 'home') {
        // filter home deals & popular
        filterHomeSection(q);
    }
}

function filterHomeSection(query = '') {
    const dealsGrid = document.getElementById('homeDealsGrid');
    const popularGrid = document.getElementById('homePopularGrid');

    // Filter deals
    dealsGrid.innerHTML = '';
    const deals = allMenus.filter(m => m.discount > 0 &&
        (m.name.toLowerCase().includes(query) || (m.category || '').toLowerCase().includes(query))
    );
    if (!deals.length) dealsGrid.innerHTML = '<div style="color:#777;padding:18px">No deals found.</div>';
    else deals.forEach(menu => renderHomeCard(menu, dealsGrid, true));

    // Filter popular
    popularGrid.innerHTML = '';
    const popularMenus = allMenus
        .filter(m => m.orders_count > 0 &&
            (m.name.toLowerCase().includes(query) || (m.category || '').toLowerCase().includes(query))
        )
        .sort((a, b) => b.orders_count - a.orders_count)
        .slice(0, 5);

    if (!popularMenus.length) popularGrid.innerHTML = '<div style="color:#777;padding:18px">No popular dishes found.</div>';
    else popularMenus.forEach(menu => renderHomeCard(menu, popularGrid, false));
}

function renderHomeCard(menu, grid, isDeal = false) {
    const card = document.createElement('div');
    card.className = 'card';
    const priceHtml = menu.discount > 0
        ? `<span style="text-decoration:line-through;color:#888;font-size:12px">₱${menu.original_price.toFixed(2)}</span><br><span style="color:#e84118;font-weight:700">₱${menu.price.toFixed(2)}</span>`
        : `₱${menu.price.toFixed(2)}`;

    const durationText = isDeal && menu.start_date && menu.end_date
        ? `<small style="color:#555">Valid: ${new Date(menu.start_date).toLocaleDateString()} - ${new Date(menu.end_date).toLocaleDateString()}</small>`
        : '';

    card.innerHTML = `
        <div class="img">${menu.image ? `<img src="${menu.image}" alt="${escapeHtml(menu.name)}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">No image</div>`}</div>
        <div class="meta">
            <h4>${escapeHtml(menu.name)}</h4>
            <p>${escapeHtml(menu.category)}</p>
            ${durationText}
            <div class="row">
                <div class="price">${priceHtml}</div>
                <button class="add-btn">+ Add</button>
            </div>
        </div>
    `;
    card.querySelector('.add-btn').addEventListener('click', () => {
        addMenuToCart(menu);
        menu.price = menu.discount > 0 ? Number(menu.original_price) * (1 - Number(menu.discount) / 100) : Number(menu.original_price);
        openMenuModal(menu);
    });
    grid.appendChild(card);
}

// Open Profile modal when avatar clicked
// Open small profile modal
function openProfileModal() {
    document.getElementById('profileModalBg').classList.add('show');

    // Show username dynamically from localStorage
    const username = localStorage.getItem('username') || 'Customer';
    document.getElementById('profileUsername').textContent = username;
}

// Close small profile modal
function closeProfileModal() {
    document.getElementById('profileModalBg').classList.remove('show');
}

// Logout function
function logout() {
    localStorage.removeItem('username');
    window.location.href = '/customer_auth';
}

// Open Profile Details Modal and fetch user info from backend
async function viewProfileDetails() {
    const username = localStorage.getItem('username');
    if (!username) return alert("Not logged in");

    try {
        // Use a dedicated endpoint to get current user info
        const res = await fetch(`/get_user?username=${encodeURIComponent(username)}`);
        const data = await res.json();

        if (data.status === "success" && data.user) {
            const user = data.user;

            // Populate the profile details modal
            document.getElementById('detailUsername').textContent = user.username;
            document.getElementById('detailAddress').textContent = user.address || '-';
            document.getElementById('detailContact').textContent = user.contact || '-';

            // Show the profile details modal
            document.getElementById('profileDetailsModalBg').classList.add('show');
        } else {
            alert("Failed to load profile info.");
        }
    } catch (err) {
        console.error(err);
        alert("Error fetching profile info.");
    }
}

// Close Profile Details Modal
function closeProfileDetailsModal() {
    document.getElementById('profileDetailsModalBg').classList.remove('show');
}

// Attach View Profile button inside small profile modal
document.addEventListener("DOMContentLoaded", () => {
    const viewBtn = document.querySelector("#profileModalBg .modal-profile .btn");
    if (viewBtn) {
        viewBtn.addEventListener("click", () => {
            closeProfileModal();
            viewProfileDetails();
        });
    }
});
