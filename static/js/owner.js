const API_URL = "https://lasabistro-6.onrender.com";

/* -------------------- SIDEBAR -------------------- */
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggleSidebar");
document.body.classList.add("sidebar-active");

toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    if (sidebar.classList.contains("collapsed")) {
        document.body.classList.remove("sidebar-active");
        document.body.classList.add("sidebar-collapsed");
    } else {
        document.body.classList.add("sidebar-active");
        document.body.classList.remove("sidebar-collapsed");
    }
});

/* -------------------- SECTION NAVIGATION -------------------- */
function showSection(id) {
    document.querySelectorAll('main section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

/* -------------------- MODALS -------------------- */
function openModal() { checkIngredientsBeforeMenu(); }
function closeModal() { document.getElementById("modal").style.display = "none"; }
function openReservationModal() { document.getElementById("reservationModal").style.display = "flex"; }
function closeReservationModal() { document.getElementById("reservationModal").style.display = "none"; }
function closeEditMenuModal() { document.getElementById("editMenuModal").style.display = "none"; }
function closeInventoryModal() { document.getElementById("inventoryModal").style.display = "none"; }



const darkModeBtn = document.getElementById('darkModeBtn');

darkModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');

    if (document.body.classList.contains('dark-mode')) {
        darkModeBtn.textContent = "☀️";
    } else {
        darkModeBtn.textContent = "🌙";
    }
});

/* -------------------- MENU -------------------- */
let currentEditMenuItem = null;


async function openMenuModal() {
    const form = document.getElementById('menuForm');
    form.reset();
    document.getElementById('ingredientList').innerHTML = '';
    document.getElementById('menuModal').style.display = 'flex';

    await loadIngredientsForMenu();   // <--- THIS FIXES THE SAVE BUTTON
}

function closeMenuModal() {
    document.getElementById('menuModal').style.display = 'none';
}

async function loadMenu() {
    const res = await fetch(`${API_URL}/menu`);
    let data = await res.json();

    // Sorting logic
    if (currentSort.column) {
        data.sort((a, b) => {
            let valA = a[currentSort.column];
            let valB = b[currentSort.column];

            if (currentSort.column === 'price') {
                valA = parseFloat(valA);
                valB = parseFloat(valB);
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            return currentSort.order === 'asc'
                ? (valA > valB ? 1 : -1)
                : (valA < valB ? 1 : -1);
        });
    }

    const tbody = document.querySelector('#menuTable tbody');
    tbody.innerHTML = '';

    data.forEach(item => {
        const ingredientsText = item.ingredients
            ? item.ingredients.map(i => `${i.name} (${i.qty} ${i.unit || ''})`).join(', ')
            : '';

        // 🔥 PRICE DISPLAY LOGIC (NORMAL vs DISCOUNTED)
        let original = parseFloat(item.original_price).toFixed(2);
        let display = parseFloat(item.display_price).toFixed(2);

        let priceHTML = '';
        if (item.discount && item.discount > 0) {  // <-- always check discount > 0
            priceHTML = `
            <span style="text-decoration:line-through;color:#888;">
                ₱${original}
            </span><br>
            <span style="color:red;font-weight:bold;">
                ₱${display}
            </span>
        `;
        } else {
            priceHTML = `₱${original}`;
        }

        tbody.innerHTML += `
        <tr>
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td>${priceHTML}</td>
            <td>${item.image ? `<img src="${API_URL}${item.image}" width="60">` : ''}</td>
            <td>${ingredientsText}</td>
            <td>
                <button onclick="openEditMenuModal(${item.id}, '${item.name}', '${item.category}', ${item.price}, '${item.image}')">✏️ Edit</button>
                <button style="background:#e84118;" onclick="deleteMenu(${item.id})">🗑️ Delete</button>
            </td>
        </tr>`;
    });

}


// Sorting
let currentSort = { column: null, order: 'asc' };
function sortTable(column) {
    if (currentSort.column === column) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    else { currentSort.column = column; currentSort.order = 'asc'; }
    loadMenu();
}

// Add/Edit Menu Ingredients
async function loadIngredientsForMenu(
    selectedCategory = null,
    containerId = 'ingredientList',
    currentIngredients = []
) {
    const res = await fetch(`${API_URL}/inventory`);
    const data = await res.json();

    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Determine if this is the EDIT modal
    const isEdit = containerId === 'editIngredientList';

    // Choose class names based on mode
    const checkboxClass = isEdit ? 'menu-ingredient-edit' : 'menu-ingredient';
    const qtyClass = isEdit ? 'ing-qty-edit' : 'ing-qty';

    const category = selectedCategory || document.getElementById('category')?.value;
    if (!category) return;

    const filteredIngredients = data.filter(ing => {
        const categories = (ing.dish_category || '').split(',').map(c => c.trim());
        return categories.includes(category);
    });

    filteredIngredients.forEach(ing => {
        const menuIng = currentIngredients.find(mi => mi.id === ing.id);
        const checkedAttr = menuIng ? 'checked' : '';
        const qtyValue = menuIng ? menuIng.qty : '';

        container.innerHTML += `
        <div>
            <input type="checkbox" class="${checkboxClass}" data-id="${ing.id}" ${checkedAttr}>
            ${ing.name} (${ing.quantity} ${ing.unit || ''})
            Quantity per portion:
            <input type="number" class="${qtyClass}" data-id="${ing.id}" step="0.01" value="${qtyValue}">
        </div>
        `;
    });

    // Save button detection (dynamic)
    const saveBtn = document.querySelector(
        isEdit
            ? '#editForm button[type="submit"]'
            : '#menuForm button[type="submit"]'
    );

    // Enable save only if at least one ingredient is valid
    container.addEventListener('input', () => {
        const checkboxes = container.querySelectorAll(`.${checkboxClass}:checked`);

        const valid = Array.from(checkboxes).some(cb => {
            const qty = container.querySelector(`input.${qtyClass}[data-id='${cb.dataset.id}']`).value;
            return qty && qty > 0;
        });

        saveBtn.disabled = !valid;
    });
}



// Add Menuad
document.getElementById('menuForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(document.getElementById('menuForm'));

    const ingredients = [];
    document.querySelectorAll('.menu-ingredient:checked').forEach(cb => {
        const ing_id = cb.dataset.id;
        const qty = document.querySelector(`.ing-qty[data-id='${ing_id}']`).value;
        if (qty && qty > 0) ingredients.push({ id: ing_id, qty });
    });

    if (ingredients.length === 0) {
        alert("❌ Please select at least one ingredient and specify its quantity.");
        return;
    }

    formData.append('ingredients', JSON.stringify(ingredients));
    const res = await fetch(`${API_URL}/menu`, { method: 'POST', body: formData });
    const result = await res.json();
    alert(result.message);
    closeMenuModal();
    loadMenu();
});

// Edit Menu
async function openEditMenuModal(id, name, category, price, image) {
    document.getElementById("edit_id").value = id;
    document.getElementById("edit_name").value = name;
    document.getElementById("edit_category").value = category;
    document.getElementById("edit_price").value = price;
    document.getElementById("editMenuModal").style.display = "flex";

    const menuRes = await fetch(`${API_URL}/menu`);
    const menuData = await menuRes.json();
    currentEditMenuItem = menuData.find(m => m.id === id);

    await loadIngredientsForMenu(category, 'editIngredientList', currentEditMenuItem.ingredients || []);
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit_id').value;
    const formData = new FormData(document.getElementById('editForm'));

    const ingredients = [];
    document.querySelectorAll('.menu-ingredient-edit:checked').forEach(cb => {
        const ing_id = cb.dataset.id;
        const qty = document.querySelector(`.ing-qty-edit[data-id='${ing_id}']`).value;
        if (qty && qty > 0) ingredients.push({ id: ing_id, qty });
    });

    if (ingredients.length === 0) {
        alert("❌ Please select at least one ingredient and specify its quantity.");
        return;
    }

    formData.append('ingredients', JSON.stringify(ingredients));
    const res = await fetch(`${API_URL}/menu/${id}`, { method: 'PUT', body: formData });
    const result = await res.json();
    alert(result.message);
    closeEditMenuModal();
    loadMenu();
});

// Delete Menu
async function deleteMenu(id) {
    if (!confirm("Delete this menu item?")) return;
    const res = await fetch(`${API_URL}/menu/${id}`, { method: 'DELETE' });
    const result = await res.json();
    alert(result.message);
    loadMenu();
}

/* -------------------- RESERVATIONS -------------------- */
const tableSelect = document.getElementById('table_number');
const dateInput = document.getElementById('reservation_date');
const timeInput = document.getElementById('reservation_time');

async function updateAvailableTables() {
    const date = dateInput.value;
    const time = timeInput.value;
    if (!date || !time) return;

    const res = await fetch(`${API_URL}/available_tables?date=${date}&time=${time}`);
    const tables = await res.json();
    tableSelect.innerHTML = '<option value="">Whole Restaurant</option>';
    tables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `Table ${t}`;
        tableSelect.appendChild(opt);
    });
}
dateInput.addEventListener('change', updateAvailableTables);
timeInput.addEventListener('change', updateAvailableTables);

async function loadReservations() {
    const res = await fetch(`${API_URL}/reservations`);
    const data = await res.json();
    const tbody = document.querySelector('#reservationTable tbody');
    tbody.innerHTML = '';
    data.forEach(r => {
        tbody.innerHTML += `
        <tr>
            <td>${r.customer_name}</td>
            <td>${r.contact_number}</td>
            <td>${r.reservation_date}</td>
            <td>${r.reservation_time}</td>
            <td>${r.table_number || 'Whole Restaurant'}</td>
            <td>${r.num_guests}</td>
            <td>
                <button onclick="markDone(${r.id})">✅ Done</button>
                <button style="background:#e84118;" onclick="deleteReservation(${r.id})">🗑️ Delete</button>
            </td>
        </tr>`;
    });
}

async function markDone(id) {
    if (!confirm('Mark this reservation as done?')) return;
    const res = await fetch(`${API_URL}/reservations/done/${id}`, { method: 'POST' });
    const result = await res.json();
    alert(result.message);
    loadReservations();
}

document.getElementById('reservationForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const today = new Date();
    const resDate = new Date(dateInput.value + ' ' + timeInput.value);
    if (resDate < today) { alert("❌ Date and time cannot be in the past"); return; }

    const formData = new FormData(this);
    const res = await fetch(`${API_URL}/reservations`, { method: 'POST', body: formData });
    const result = await res.json();
    alert(result.message);
    closeReservationModal();
    loadReservations();
});

async function deleteReservation(id) {
    if (!confirm("Delete this reservation?")) return;
    const res = await fetch(`${API_URL}/reservations/${id}`, { method: 'DELETE' });
    const result = await res.json();
    alert(result.message);
    loadReservations();
}

/* -------------------- REVIEWS -------------------- */
async function loadReviews() {
    const res = await fetch(`${API_URL}/reviews`);
    const data = await res.json();
    const tbody = document.querySelector('#reviewTable tbody');
    tbody.innerHTML = '';
    data.forEach(r => {
        tbody.innerHTML += `
        <tr>
            <td>${r.customer_name}</td>
            <td>${r.rating}⭐</td>
            <td>${r.text}</td>
            <td>${r.review_time}</td>
        </tr>`;
    });
}

/* -------------------- INVENTORY -------------------- */
let currentInventory = [];

async function loadInventory() {
    const res = await fetch(`${API_URL}/inventory`);
    const data = await res.json();
    currentInventory = data;

    const tbody = document.querySelector('#inventoryTable tbody');
    tbody.innerHTML = '';
    data.forEach(ing => {
        tbody.innerHTML += `
        <tr>
    <td>${ing.name}</td>
    <td>${ing.ingredient_type || ''}</td>
    <td>${ing.quantity}</td>
    <td>${ing.unit}</td>
    <td>${ing.threshold || ''}</td>
    <td>${ing.dish_category || 'Others'}</td>
    <td>
        <button class="edit-btn" onclick="editIngredient(${ing.id})">✏️ Edit</button>
        <button class="delete-btn" onclick="deleteIngredient(${ing.id})">🗑️ Delete</button>
    </td>
        </tr>`;
    });
}

setInterval(loadInventory, 1000);

function openInventoryModal(addNew = true) {
    const form = document.getElementById('inventoryForm');
    if (addNew) {
        form.reset();
        document.getElementById('ing_id').value = '';
    }
    document.getElementById('inventoryModalTitle').innerText = addNew ? "Add Ingredient" : "Edit Ingredient";
    document.getElementById("inventoryModal").style.display = "flex";
}

async function editIngredient(id) {
    try {
        const response = await fetch(`${API_URL}/inventory/${id}`);
        if (!response.ok) throw new Error('Ingredient not found');
        const ing = await response.json();
        document.getElementById("ing_id").value = ing.id;
        document.getElementById("ing_name").value = ing.name;
        document.getElementById("ing_quantity").value = ing.quantity;
        document.getElementById("ing_unit").value = ing.unit;
        document.getElementById("ing_threshold").value = ing.threshold || '';
        document.getElementById("ing_type").value = ing.ingredient_type || '';
        document.querySelectorAll('input[name="category"]').forEach(cb => cb.checked = false);
        if (ing.dish_category) {
            const categories = ing.dish_category.split(',');
            categories.forEach(cat => {
                const checkbox = document.querySelector(`input[name="category"][value="${cat.trim()}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }
        openInventoryModal(false);
    } catch (error) {
        console.error('Error fetching ingredient for edit:', error);
        alert('Failed to load ingredient data for editing');
    }
}

async function deleteIngredient(id) {
    if (!confirm("Delete this ingredient?")) return;
    const res = await fetch(`${API_URL}/inventory/${id}`, { method: 'DELETE' });
    const result = await res.json();
    alert(result.message);
    loadInventory();
}

document.getElementById('inventoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Form submitted');
    const id = document.getElementById('ing_id').value;
    const name = document.getElementById('ing_name').value;
    const quantity = document.getElementById('ing_quantity').value;
    const unit = document.getElementById('ing_unit').value;
    const threshold = document.getElementById('ing_threshold').value;
    const categories = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
    const type = document.getElementById('ing_type').value;
    const categoryStr = categories.join(',');
    console.log('Selected categories:', categoryStr);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('quantity', quantity);
    formData.append('unit', unit);
    formData.append('threshold', threshold);
    formData.append('dish_category', categoryStr);
    formData.append('ingredient_type', type);
    let url = `${API_URL}/inventory`;
    let method = "POST";
    if (id) { url = `${API_URL}/inventory/${id}`; method = "PUT"; }
    try {
        console.log('Sending request to:', url);
        const res = await fetch(url, { method, body: formData });
        console.log('Response status:', res.status);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const result = await res.json();
        console.log('Response:', result);
        alert(result.message);
        closeInventoryModal();
        loadInventory();
        loadIngredientsForMenu();
    } catch (error) {
        console.error('Error:', error);
        alert('Error saving ingredient: ' + error.message);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
    loadReservations();
    loadReviews();
    loadInventory();
});

document.getElementById('category')?.addEventListener('change', () => loadIngredientsForMenu());

async function loadStaff() {
    try {
        const res = await fetch(`${API_URL}/staff`);
        const staff = await res.json();
        const tableBody = document.querySelector("#staffTable tbody");
        tableBody.innerHTML = "";
        staff.forEach(s => {
            const row = document.createElement("tr");
            row.innerHTML = `
    <td>${s.name}</td>
    <td>${s.position}</td>
    <td>${s.contact || ''}</td>
    <td>${s.status}</td>
    <td>
        <img src="${API_URL}/static/qrcodes/${s.qr_code}" 
             width="80" height="80" 
             style="border:1px solid #ccc;">
    </td>
    <td>
        <button onclick="editStaff(${s.id})" class="edit-btn">Edit</button>
        <button onclick="deleteStaff(${s.id})" class="delete-btn">Delete</button>
    </td>
`;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error("Error loading staff:", err);
    }
}

async function addStaff(event) {
    event.preventDefault();
    const name = document.getElementById("staff_name").value;
    const position = document.getElementById("staff_position").value;
    const contact = document.getElementById("staff_contact").value;
    const status = document.getElementById("staff_status").value;

    try {
        const res = await fetch(`${API_URL}/staff`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, position, contact, status })
        });

        if (!res.ok) throw new Error("Network error");

        alert("Staff added successfully!");
        closeStaffModal();
        loadStaff();
    } catch (err) {
        console.error(err);
        alert("Failed to add staff");
    }
}

function openStaffModal() {
    const form = document.getElementById("staffForm");
    form.reset();
    document.getElementById("staff_id").value = '';
    document.getElementById("staffModalTitle").innerText = "Add Staff";
    document.getElementById("staffModal").style.display = "flex";
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', addStaff, { once: true });
}


function editStaff(id) {
    fetch(`${API_URL}/staff/${id}`)
        .then(res => res.json())
        .then(s => {
            document.getElementById("staffModalTitle").innerText = "Edit Staff";
            document.getElementById("staff_id").value = s.id;
            document.getElementById("staff_name").value = s.name;
            document.getElementById("staff_position").value = s.position;
            document.getElementById("staff_contact").value = s.contact;
            document.getElementById("staff_status").value = s.status;
            document.getElementById("staffModal").style.display = "flex";

            const form = document.getElementById("staffForm");
            form.onsubmit = null;
            form.addEventListener('submit', updateStaff, { once: true });
        })
        .catch(err => console.error(err));
}

async function updateStaff(event) {
    event.preventDefault();
    const id = document.getElementById("staff_id").value;
    const data = {
        name: document.getElementById("staff_name").value,
        position: document.getElementById("staff_position").value,
        contact: document.getElementById("staff_contact").value,
        status: document.getElementById("staff_status").value
    };

    try {
        const res = await fetch(`${API_URL}/staff/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error("Update failed");
        alert("Staff updated!");
        closeStaffModal();
        loadStaff();
    } catch (err) {
        console.error(err);
        alert("Error updating staff.");
    }
}

async function deleteStaff(id) {
    if (!confirm("Are you sure you want to delete this staff?")) return;
    try {
        const res = await fetch(`${API_URL}/staff/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        alert("Staff deleted.");
        loadStaff();
    } catch (err) {
        console.error(err);
        alert("Failed to delete staff.");
    }
}

function closeStaffModal() {
    document.getElementById("staffModal").style.display = "none";
}

window.onload = loadStaff;

let scanStream = null;
let scanAnimationFrame = null;
const video = document.getElementById('qr-video');
const canvas = document.getElementById('qr-canvas');
const ctx = canvas.getContext('2d');

function openScanModal() {
    document.getElementById('scanModal').style.display = 'flex';
    startScan();
}

function closeScanModal() {
    document.getElementById('scanModal').style.display = 'none';
    stopScan();
    document.getElementById('scanStatus').textContent = 'Camera is off.';
    document.getElementById('scanResult').textContent = '';
    document.getElementById('scanNotif').innerHTML = '';
}

async function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('scanStatus').textContent = 'Camera not supported in this browser.';
        return;
    }
    try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        video.srcObject = scanStream;
        await video.play();
        document.getElementById('scanStatus').textContent = 'Scanning... point camera at the QR code.';
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        scanFrameLoop();
    } catch (err) {
        console.error('Camera error', err);
        document.getElementById('scanStatus').textContent = 'Unable to access camera: ' + err.message;
    }
}

function stopScan() {
    if (scanAnimationFrame) {
        cancelAnimationFrame(scanAnimationFrame);
        scanAnimationFrame = null;
    }
    if (scanStream) {
        const tracks = scanStream.getTracks();
        tracks.forEach(t => t.stop());
        scanStream = null;
    }
}

function scanFrameLoop() {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanAnimationFrame = requestAnimationFrame(scanFrameLoop);
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (code) {
        console.log('QR detected:', code.data);
        document.getElementById('scanResult').textContent = `Scanned: ${code.data}`;
        document.getElementById('scanNotif').innerHTML = `<div style="color:green;font-weight:600;">Scanned: ${code.data}</div>`;
        stopScan();
        sendScanPayloadToServer(code.data);
        return;
    } else {
    }
    scanAnimationFrame = requestAnimationFrame(scanFrameLoop);
}

async function sendScanPayloadToServer(payload) {
    try {
        const res = await fetch(`${API_URL}/attendance/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('scanNotif').innerHTML =
                `<div style="color:red;">${data.error}</div>`;
            return;
        }
        document.getElementById('scanNotif').innerHTML =
            `<div style="color:green;">${data.message}</div>`;
        setTimeout(() => loadAttendance(), 300);
    } catch (err) {
        console.error(err);
        document.getElementById('scanNotif').innerHTML =
            `<div style="color:red;">Network error: ${err.message}</div>`;
    }
}

function formatDateHeader(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    const opts = { year: 'numeric', month: 'long', day: 'numeric' };
    return d.toLocaleDateString(undefined, opts);
}

async function populatePositions() {
    try {
        const res = await fetch(`${API_URL}/staff`);
        const list = await res.json();
        const positions = Array.from(new Set(list.map(s => s.position).filter(Boolean)));
        const sel = document.getElementById('attFilterPosition');
        sel.innerHTML = '<option value="">All positions</option>';
        positions.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            sel.appendChild(opt);
        });
    } catch (err) {
        console.error("Could not load positions:", err);
    }
}

function buildAttendanceQuery() {
    const name = document.getElementById('attSearchName').value.trim();
    const position = document.getElementById('attFilterPosition').value;
    const dateInput = document.getElementById('attFilterDate').value;
    const month = document.getElementById('attFilterMonth').value;
    const params = new URLSearchParams();
    let date = dateInput;
    if (!date && !month) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        date = `${yyyy}-${mm}-${dd}`;
    }
    if (month) params.append('month', month);
    if (date) params.append('date', date);
    if (name) params.append('name', name);
    if (position) params.append('position', position);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

async function loadAttendance() {
    try {
        const q = buildAttendanceQuery();
        const res = await fetch(`${API_URL}/get_attendance${q}`);
        if (!res.ok) throw new Error('Failed to fetch attendance');
        const data = await res.json();
        const groups = {};
        data.forEach(row => {
            const date = row.date_record || 'Unknown';
            if (!groups[date]) groups[date] = [];
            groups[date].push(row);
        });
        const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
        const tbody = document.querySelector('#attendanceTable tbody');
        tbody.innerHTML = '';
        if (dates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:12px;">No attendance records found.</td></tr>`;
            return;
        }
        dates.forEach(date => {
            const headerRow = document.createElement('tr');
            headerRow.className = 'date-header';
            headerRow.innerHTML = `<td colspan="5" style="padding:10px 8px; background:#eef2f7; font-weight:700;">📅 ${formatDateHeader(date)} &nbsp;&nbsp;<span style="font-weight:500;color:#666;">(${date})</span></td>`;
            tbody.appendChild(headerRow);
            groups[date].forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:8px; border-bottom:1px solid #eee;">${r.name || '—'}</td>
                    <td style="padding:8px; border-bottom:1px solid #eee;">${r.position || '—'}</td>
                    <td style="padding:8px; border-bottom:1px solid #eee;">${r.time_in || '-----'}</td>
                    <td style="padding:8px; border-bottom:1px solid #eee;">${r.time_out || '-----'}</td>
                    <td style="padding:8px; border-bottom:1px solid #eee;">${r.status || '—'}</td>
                `;
                tbody.appendChild(tr);
            });
        });
    } catch (err) {
        console.error("Failed to load attendance:", err);
        const tbody = document.querySelector('#attendanceTable tbody');
        tbody.innerHTML = `<tr><td colspan="5" style="padding:12px;color:red;">Error loading attendance</td></tr>`;
    }
}

function attachFilterListeners() {
    document.getElementById('attSearchName').addEventListener('input', debounce(() => loadAttendance(), 300));
    document.getElementById('attFilterPosition').addEventListener('change', loadAttendance);
    document.getElementById('attFilterDate').addEventListener('change', () => {
        document.getElementById('attFilterMonth').value = '';
        loadAttendance();
    });
    document.getElementById('attFilterMonth').addEventListener('change', () => {
        document.getElementById('attFilterDate').value = '';
        loadAttendance();
    });
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        document.getElementById('attSearchName').value = '';
        document.getElementById('attFilterPosition').value = '';
        document.getElementById('attFilterDate').value = '';
        document.getElementById('attFilterMonth').value = '';
        loadAttendance();
    });
}

function debounce(fn, wait) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

async function sendScanPayloadToServer(payload) {
    try {
        const res = await fetch(`${API_URL}/attendance/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('scanNotif').innerHTML =
                `<div style="color:red;">${data.error}</div>`;
            return;
        }
        document.getElementById('scanNotif').innerHTML =
            `<div style="color:green;">${data.message || 'Scanned'}</div>`;

        setTimeout(() => loadAttendance(), 300);
    } catch (err) {
        console.error(err);
        document.getElementById('scanNotif').innerHTML =
            `<div style="color:red;">Network error: ${err.message}</div>`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    populatePositions();
    attachFilterListeners();
    loadAttendance();
});

async function loadOrders() {
    try {
        const res = await fetch(`${API_URL}/orders`);
        const data = await res.json();

        const onlineTbody = document.querySelector('#onlineOrdersTable tbody');
        const walkinTbody = document.querySelector('#walkinOrdersMainTable tbody');

        onlineTbody.innerHTML = '';
        walkinTbody.innerHTML = '';

        data.forEach(order => {
            if (order.status === 'Completed') return;

            const itemsList = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
            const dateFormatted = new Date(order.date).toLocaleString();

            let statusOptions = [];
            if (order.type === 'Walkin') {
                statusOptions = ['Pending', 'Preparing', 'Completed', 'Cancelled'];
            } else {
                statusOptions = ['Pending', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled'];
            }

            const statusDropdown = statusOptions.map(status => {
                const selected = order.status === status ? 'selected' : '';
                return `<option value="${status}" ${selected}>${status}</option>`;
            }).join('');

            const row = document.createElement('tr');

            if (order.type === 'Walkin') {
                const tableDisplay = order.table_number ? order.table_number : 'N/A';
                const orderTypeDisplay = order.order_type ? order.order_type : '-';

                row.innerHTML = `
                    <td>${order.id}</td>
                    <td>${tableDisplay}</td>
                    <td>${orderTypeDisplay}</td>
                    <td>${itemsList}</td>
                    <td>₱${order.total.toFixed(2)}</td>
                    <td>
                        <select onchange="updateOrderStatus(${order.id}, this.value)">
                            ${statusDropdown}
                        </select>
                    </td>
                    <td>${dateFormatted}</td>
                    <td>
                        <button onclick="viewOrder(${order.id})">View</button>
                    </td>
                `;
                walkinTbody.appendChild(row);
            } else {
                row.innerHTML = `
                    <td>${order.id}</td>
                    <td>${order.username || 'Guest'}</td>
                    <td>${itemsList}</td>
                    <td>₱${order.total.toFixed(2)}</td>
                    <td>
                        <select onchange="updateOrderStatus(${order.id}, this.value)">
                            ${statusDropdown}
                        </select>
                    </td>
                    <td>${dateFormatted}</td>
                    <td>
                        <button onclick="viewOrder(${order.id})">View</button>
                    </td>
                `;
                onlineTbody.appendChild(row);
            }
        });

    } catch (err) {
        console.error(err);
        alert("Failed to load orders");
    }
}

const orderTypeSelect = document.getElementById('walkinOrderType');
const tableWrapper = document.getElementById('walkinTableWrapper');

orderTypeSelect.addEventListener('change', () => {
    if (orderTypeSelect.value === 'Dine-in') {
        tableWrapper.style.display = 'block';
    } else {
        tableWrapper.style.display = 'none';
    }
});

tableWrapper.style.display = orderTypeSelect.value === 'Dine-in' ? 'block' : 'none';

async function updateOrderStatus(orderId, status) {
    if (status === 'Cancelled' && !confirm("Are you sure you want to cancel this order?")) return;

    try {
        const res = await fetch(`${API_URL}/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.status === 'success') {
            loadOrders();
        } else {
            alert("Failed to update order status");
        }
    } catch (err) {
        console.error(err);
        alert("Error updating order");
    }
}

async function loadTransactions() {
    try {
        const res = await fetch(`${API_URL}/orders`);
        const data = await res.json();
        const tbody = document.querySelector('#transactionsTable tbody');
        tbody.innerHTML = '';

        const filterMonth = document.getElementById('monthFilter').value;

        data.filter(o => o.status === 'Completed')
            .filter(o => {
                if (!filterMonth) return true;
                const orderDate = new Date(o.date);
                const [year, month] = filterMonth.split('-');
                return orderDate.getFullYear() == year && (orderDate.getMonth() + 1) == month;
            })
            .forEach(order => {
                const itemsList = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${order.id}</td>
                    <td>${order.username || 'Guest'}</td>
                    <td>${itemsList}</td>
                    <td>₱${order.total}</td>
                    <td>${new Date(order.date).toLocaleString()}</td>
                `;
                tbody.appendChild(row);
            });
    } catch (err) {
        console.error(err);
        alert("Failed to load transactions");
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadOrders();
    loadTransactions();
});

async function viewOrder(orderId) {
    try {
        const res = await fetch(`${API_URL}/orders`);
        const data = await res.json();
        const order = data.find(o => o.id === orderId);
        if (!order) return;

        const detailsDiv = document.getElementById('orderDetails');
        detailsDiv.innerHTML = '';
        order.items.forEach(i => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.marginBottom = '5px';
            div.textContent = `${i.name} x${i.qty} - ₱${i.price * i.qty}`;
            detailsDiv.appendChild(div);
        });
        document.getElementById('orderTotal').textContent = order.total;
        document.getElementById('orderModalBg').style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert("Failed to load order details");
    }
}

function closeOrderModal() {
    document.getElementById('orderModalBg').style.display = 'none';
}

window.addEventListener('DOMContentLoaded', loadOrders);
let walkinCart = [];
let walkinMenuItems = [];

async function loadWalkinMenu() {
    try {
        const res = await fetch(`${API_URL}/menu`);
        walkinMenuItems = await res.json();
        renderCategoryFilter(walkinMenuItems);
        renderWalkinMenu('All');
    } catch (err) { console.error(err); }
}

function renderWalkinMenu(category) {
    const container = document.getElementById('walkinMenuContainer');
    container.innerHTML = '';

    const filtered = category === 'All'
        ? walkinMenuItems
        : walkinMenuItems.filter(m => m.category === category);
    filtered.forEach(menu => {
        const original = parseFloat(menu.original_price).toFixed(2);
        const display = parseFloat(menu.display_price).toFixed(2);
        let priceHTML = '';
        if (menu.discount && menu.discount > 0) {
            priceHTML = `
            <span style="text-decoration:line-through;color:#888;font-size:12px;">
                ₱${original}
            </span><br>
            <span style="color:#e84118;font-weight:700;">
                ₱${display}
            </span>
        `;
        } else {
            priceHTML = `<span style="font-weight:700;">₱${original}</span>`;
        }
        const div = document.createElement('div');
        div.className = 'walkin-menu-card';
        div.style.cssText = `
        border:1px solid #ddd; border-radius:6px; padding:6px;
        width:100px; text-align:center; cursor:pointer; font-size:14px;
    `;
        div.innerHTML = `
        <img src="${menu.image || 'https://via.placeholder.com/100'}"
             style="width:100%; border-radius:4px;">
        <div style="margin-top:4px;">${menu.name}</div>
        <div>${priceHTML}</div>
    `;
        div.onclick = () => addToWalkinCart(menu);
        container.appendChild(div);
    });

}

function renderCategoryFilter(menu) {
    const filter = document.getElementById('walkinCategoryFilter');
    const categories = [...new Set(menu.map(m => m.category))];
    filter.innerHTML = `<option value="All">All Categories</option>`;
    categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        filter.appendChild(opt);
    });

    filter.addEventListener('change', () => {
        renderWalkinMenu(filter.value);
    });
}

function addToWalkinCart(item) {
    const existing = walkinCart.find(i => i.id === item.id);
    if (existing) existing.qty += 1;
    else walkinCart.push({
        id: item.id,
        name: item.name,
        price: item.display_price,
        qty: 1
    });

    renderWalkinCart();
}

function renderWalkinCart() {
    const cartDiv = document.querySelector('#walkinCartItems');
    const totalSpan = document.querySelector('#walkinCartTotal');
    cartDiv.innerHTML = '';
    let total = 0;
    walkinCart.forEach((item, index) => {
        total += item.price * item.qty;
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.marginBottom = '6px';
        div.innerHTML = `
            <span>${item.name} x${item.qty}</span>
            <span>₱${(item.price * item.qty).toFixed(2)} <button onclick="removeFromWalkinCart(${index})" style="background:red;color:white;border:none;border-radius:4px;padding:0 4px;">x</button></span>
        `;
        cartDiv.appendChild(div);
    });
    totalSpan.textContent = total.toFixed(2);
}

function removeFromWalkinCart(index) {
    walkinCart.splice(index, 1);
    renderWalkinCart();
}

function clearWalkinCart() {
    walkinCart = [];
    renderWalkinCart();
}
function submitWalkinOrder() {
    if (walkinCart.length === 0) {
        alert("Cart is empty!");
        return;
    }
    const orderType = orderTypeSelect.value;
    const tableNumber = orderType === 'Dine-in' ? document.querySelector('#walkinTableNumber').value || null : null;
    const itemsToSend = walkinCart.map(i => ({
        id: i.id || null,
        name: i.name || null,
        qty: Number(i.qty),
        price: Number(i.price)
    }));
    const orderData = {
        type: 'Walkin',
        order_type: orderType,
        table_number: tableNumber,
        items: itemsToSend
    };
    fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
    })
        .then(async res => {
            const data = await res.json();
            console.log("Server response:", data);
            if (data.status === 'success') {
                alert("Walk-in order placed!");
                clearWalkinCart();
                document.querySelector('#walkinTableNumber').value = '';
                loadOrders();
            } else {
                alert("Failed to place order: " + (data.message || 'Unknown error'));
            }
        })
        .catch(err => {
            console.error("Fetch error:", err);
            alert("Error placing order");
        });
}

window.addEventListener('DOMContentLoaded', loadWalkinMenu);

function showSection(sectionId) {
    document.querySelectorAll("main section").forEach(sec => {
        sec.style.display = "none";
    });
    document.getElementById(sectionId).style.display = "block";
}

let peakChartInstance = null;
let orderTypeChartInstance = null;
let revenueChartInstance = null;

function formatAMPM(hour) {
    if (hour === 0) return "12 AM";
    else if (hour < 12) return `${hour} AM`;
    else if (hour === 12) return "12 PM";
    else return `${hour - 12} PM`;
}

async function loadDashboard() {
    try {
        const res = await fetch(`${API_URL}/dashboard_stats`);
        const data = await res.json();
        document.getElementById('totalSales').textContent =
            `₱${data.total_sales.toFixed(2)} (${data.month_name})`;
        const peakCtx = document.getElementById('peakChart').getContext('2d');
        if (peakChartInstance) peakChartInstance.destroy();
        peakChartInstance = new Chart(peakCtx, {
            type: 'line',
            data: {
                labels: data.peak_hours.map(h => formatAMPM(h.hour)),
                datasets: [{
                    label: `Revenue per Hour (${data.month_name})`,
                    data: data.peak_hours.map(h => h.revenue),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true }
        });

        const popularList = document.getElementById('popularDishes');
        popularList.innerHTML = '';
        data.popular_dishes.forEach(d => {
            const li = document.createElement('li');
            li.textContent = `${d.name} ×${d.qty}`;
            popularList.appendChild(li);
        });

        const orderCtx = document.getElementById('orderTypeChart').getContext('2d');
        if (!orderTypeChartInstance) {
            orderTypeChartInstance = new Chart(orderCtx, {
                type: 'pie',
                data: {
                    labels: ['Online', 'Dine-In', 'Takeout'],
                    datasets: [{
                        data: [
                            data.order_type_counts.online,
                            data.order_type_counts.dinein,
                            data.order_type_counts.takeout
                        ],
                        backgroundColor: [
                            'rgba(54, 162, 235, 0.7)',
                            'rgba(255, 206, 86, 0.7)',
                            'rgba(75, 192, 192, 0.7)'
                        ]
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        } else {
            // Just update data and redraw
            orderTypeChartInstance.data.datasets[0].data = [
                data.order_type_counts.online,
                data.order_type_counts.dinein,
                data.order_type_counts.takeout
            ];
            orderTypeChartInstance.update();
        }


        const revCtx = document.getElementById('revenueChart').getContext('2d');
        if (revenueChartInstance) revenueChartInstance.destroy();

        const months = data.revenue_trend.map(r => {
            const [year, month] = r.month.split('-');
            return new Date(year, month - 1).toLocaleString('default', { month: 'short' });
        });
        const year = new Date(data.revenue_trend[0].month + '-01').getFullYear();

        revenueChartInstance = new Chart(revCtx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: `Revenue Trend (${year})`,
                    data: data.revenue_trend.map(r => r.revenue),
                    fill: true,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Revenue Trend for ${year}`,
                        font: { size: 16 }
                    }
                }
            }
        });

        const reviewEl = document.getElementById("reviewMajority");

        if (data.reviews.majority_rating) {
            const stars = "⭐".repeat(data.reviews.majority_rating);
            reviewEl.textContent = `${stars} (${data.reviews.majority_rating}/5 Majority)`;
        } else {
            reviewEl.textContent = "No reviews yet";
        }

        document.getElementById("onlineUsers").textContent = data.online_users;

    } catch (err) {
        console.error("Failed to load dashboard:", err);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    setInterval(loadDashboard, 1000);
});

window.addEventListener('DOMContentLoaded', loadDashboard);

const openModalBtn = document.getElementById("openAnnouncementModal");
const closeModalBtn = document.getElementById("closeAnnouncementModal");
const modal = document.getElementById("announcementModal");

openModalBtn.addEventListener("click", () => modal.style.display = "flex");
closeModalBtn.addEventListener("click", () => modal.style.display = "none");
window.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });


function populateMenuItems() {
    fetch(`${API_URL}/customer/menu`)
        .then(res => res.json())
        .then(data => {
            const menuItemOptions = document.getElementById("menuItemOptions");
            menuItemOptions.innerHTML = '';
            data.forEach(item => {
                const opt = document.createElement('option');
                opt.value = "item:" + item.id;
                opt.textContent = item.name;
                menuItemOptions.appendChild(opt);
            });
        });
}
window.addEventListener('DOMContentLoaded', populateMenuItems);

const announcementForm = document.getElementById("announcementForm");
announcementForm.addEventListener("submit", function (e) {
    e.preventDefault();
    addAnnouncement();
});

function addAnnouncement() {
    const discountValue = document.getElementById("announcementDiscount").value;
    const data = {
        title: document.getElementById("announcementTitle").value,
        target: document.getElementById("announcementTarget").value,
        discount: discountValue ? parseInt(discountValue) : 0,
        start: document.getElementById("announcementStart").value,
        end: document.getElementById("announcementEnd").value,
        type: document.getElementById("announcementType").value
    };
    fetch(`${API_URL}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(() => {
            loadAnnouncements();
            announcementForm.reset();
            modal.style.display = "none";
        })
        .catch(err => console.error(err));
}

function loadAnnouncements() {
    fetch(`${API_URL}/announcements`)
        .then(res => res.json())
        .then(data => {
            const tbody = document.querySelector("#announcementTable tbody");
            tbody.innerHTML = "";
            const groupedCategories = {};
            data.forEach(a => {
                if (a.target && a.target.startsWith("cat:")) {
                    const cat = a.target.replace('cat:', '');
                    if (!groupedCategories[cat]) groupedCategories[cat] = a;
                }
            });
            data.forEach(a => {
                const isCategory = a.target && a.target.startsWith("cat:");
                const type = a.type.charAt(0).toUpperCase() + a.type.slice(1);

                if (isCategory) {
                    const category = a.target.replace("cat:", "");
                    if (groupedCategories[category] !== a) return;
                    tbody.innerHTML += `
                        <tr ${a.is_active ? 'style="background:#e0ffe0"' : ''}>
                            <td>${a.title}</td>
                            <td>${type}</td>
                            <td>${category}</td>
                            <td>-</td>
                            <td>-</td>
                            <td>${a.start_time ? a.start_time.split(" ")[0] : '-'}</td>
                            <td>${a.end_time ? a.end_time.split(" ")[0] : '-'}</td>
                            <td>
                                <button onclick="viewCategoryItems('${category}', ${a.discount})">View Items</button>
                                <button onclick="deleteAnnouncement(${a.id})" class="delete-btn">Delete</button>
                            </td>
                        </tr>
                    `;
                } else {
                    tbody.innerHTML += `
                        <tr ${a.is_active ? 'style="background:#e0ffe0"' : ''}>
                            <td>${a.title}</td>
                            <td>${type}</td>
                            <td>${a.menu_name || a.target}</td>
                            <td>₱${a.original_price}</td>
                            <td style="color:red;font-weight:bold;">₱${a.new_price}</td>
                            <td>${a.start_time ? a.start_time.split(" ")[0] : '-'}</td>
                            <td>${a.end_time ? a.end_time.split(" ")[0] : '-'}</td>
                            <td>
                                <button onclick="deleteAnnouncement(${a.id})" class="delete-btn">Delete</button>
                            </td>
                        </tr>
                    `;
                }
            });
        });
}

const categoryModal = document.getElementById("categoryItemsModal");
const closeCategoryModalBtn = document.getElementById("closeCategoryItemsModal");
closeCategoryModalBtn.addEventListener("click", () => categoryModal.style.display = "none");
window.addEventListener("click", (e) => { if (e.target === categoryModal) categoryModal.style.display = "none"; });

function viewCategoryItems(category, discount) {
    fetch(`${API_URL}/customer/menu`)
        .then(res => res.json())
        .then(menu => {
            const filtered = menu.filter(i => i.category === category);
            const tbody = document.querySelector("#categoryItemsTable tbody");
            tbody.innerHTML = '';

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No items currently.</td></tr>`;
            } else {
                filtered.forEach(item => {
                    const discounted = discount ? (item.original_price * (100 - discount) / 100).toFixed(2) : item.original_price;
                    tbody.innerHTML += `
                        <tr>
                            <td>${item.name}</td>
                            <td>₱${item.original_price}</td>
                            <td style="color:red;font-weight:bold;">₱${discounted}</td>
                        </tr>
                    `;
                });
            }
            categoryModal.style.display = "flex";
        });
}
loadAnnouncements();
setInterval(loadAnnouncements, 1000);

async function deleteAnnouncement(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
        const res = await fetch(`${API_URL}/announcements/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') loadAnnouncements();
        else alert('Failed to delete: ' + data.message);
    } catch (err) {
        console.error(err);
        alert('Error deleting announcement');
    }
}

// Animate online users bar
function updateOnlineUsersProgress(count, max = 50) {
    const fill = document.querySelector(".progress-fill");
    let percentage = Math.min((count / max) * 100, 100);
    fill.style.width = percentage + "%";
}

// Example usage:
updateOnlineUsersProgress(18);
