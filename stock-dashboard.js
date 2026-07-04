const products = [];
let activities = [];
let chartHistory = [];

const money = new Intl.NumberFormat("fr-TN", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 0
});

const els = {
  stockValue: document.querySelector("#stockValue"),
  stockUnits: document.querySelector("#stockUnits"),
  alertCount: document.querySelector("#alertCount"),
  categoryCount: document.querySelector("#categoryCount"),
  searchInput: document.querySelector("#searchInput"),
  inventoryTable: document.querySelector("#inventoryTable"),
  productForm: document.querySelector("#productForm"),
  productFormTitle: document.querySelector("#productFormTitle"),
  productId: document.querySelector("#productId"),
  productName: document.querySelector("#productName"),
  productCategory: document.querySelector("#productCategory"),
  productQty: document.querySelector("#productQty"),
  productThreshold: document.querySelector("#productThreshold"),
  productPrice: document.querySelector("#productPrice"),
  resetProductBtn: document.querySelector("#resetProductBtn"),
  movementForm: document.querySelector("#movementForm"),
  movementProduct: document.querySelector("#movementProduct"),
  movementType: document.querySelector("#movementType"),
  movementQty: document.querySelector("#movementQty"),
  activityFeed: document.querySelector("#activityFeed"),
  clearFlowBtn: document.querySelector("#clearFlowBtn"),
  chart: document.querySelector("#stockChart"),
  chartMode: document.querySelector("#chartMode")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

function totals() {
  return {
    value: products.reduce((sum, product) => sum + product.qty * product.price, 0),
    units: products.reduce((sum, product) => sum + product.qty, 0),
    alerts: products.filter((product) => product.qty <= product.threshold).length,
    categories: new Set(products.map((product) => product.category)).size
  };
}

function statusFor(product) {
  if (product.qty <= Math.ceil(product.threshold * 0.55)) return { label: "Critique", className: "critical" };
  if (product.qty <= product.threshold) return { label: "Bas", className: "low" };
  return { label: "OK", className: "good" };
}

function pushChartPoint() {
  const data = totals();
  chartHistory.push({
    value: data.value,
    units: data.units
  });

  if (chartHistory.length > 18) chartHistory.shift();
}

function drawChart() {
  const ctx = els.chart.getContext("2d");
  const width = els.chart.width;
  const height = els.chart.height;
  const pad = 42;
  const mode = els.chartMode.value;
  const values = chartHistory.map((point) => point[mode]);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fbfd";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#dce4ea";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  if (!values.length) {
    ctx.fillStyle = "#667085";
    ctx.font = "14px Segoe UI, Arial";
    ctx.fillText("La courbe apparaitra apres le premier mouvement.", pad, height / 2);
    return;
  }

  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const spread = Math.max(maxRaw - minRaw, 1);
  const min = minRaw - spread * 0.12;
  const max = maxRaw + spread * 0.12;

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + ((width - pad * 2) / (values.length - 1)) * index;
    const y = height - pad - ((value - min) / (max - min)) * (height - pad * 2);
    return { x, y, value };
  });

  const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
  gradient.addColorStop(0, "rgba(8, 127, 140, 0.24)");
  gradient.addColorStop(1, "rgba(8, 127, 140, 0)");

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(points.at(-1).x, height - pad);
  ctx.lineTo(points[0].x, height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#087f8c";
  ctx.lineWidth = 4;
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#087f8c";
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  const latest = points.at(-1).value;
  ctx.fillStyle = "#17212b";
  ctx.font = "700 15px Segoe UI, Arial";
  ctx.fillText(mode === "value" ? money.format(latest) : `${latest.toLocaleString("fr-FR")} unites`, pad, 24);
}

function renderKpis() {
  const data = totals();
  els.stockValue.textContent = money.format(data.value);
  els.stockUnits.textContent = data.units.toLocaleString("fr-FR");
  els.alertCount.textContent = data.alerts;
  els.categoryCount.textContent = data.categories;
}

function renderMovementOptions() {
  els.movementProduct.innerHTML = products.length
    ? products.map((product) => `<option value="${product.id}">${product.name} (${product.qty} u.)</option>`).join("")
    : `<option value="">Aucun produit</option>`;
}

function renderInventory() {
  const term = els.searchInput.value.trim().toLowerCase();
  const rows = products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(term));

  els.inventoryTable.innerHTML = rows
    .map((product) => {
      const status = statusFor(product);
      return `
        <tr>
          <td><strong>${product.name}</strong></td>
          <td>${product.category}</td>
          <td>${product.qty}</td>
          <td>${product.threshold}</td>
          <td>${money.format(product.price)}</td>
          <td>${money.format(product.qty * product.price)}</td>
          <td><span class="status ${status.className}">${status.label}</span></td>
          <td>
            <div class="actions">
              <button class="icon-btn" type="button" data-action="edit" data-id="${product.id}">Modifier</button>
              <button class="icon-btn danger" type="button" data-action="delete" data-id="${product.id}">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderFeed() {
  els.activityFeed.classList.toggle("empty", activities.length === 0);
  els.activityFeed.innerHTML = activities
    .map(
      (activity) => `
        <div class="activity">
          <span class="activity-icon ${activity.type}">${iconFor(activity.type)}</span>
          <div>
            <strong>${activity.title}</strong>
            <small>${activity.detail} | ${new Date(activity.createdAt).toLocaleTimeString("fr-FR")}</small>
          </div>
          <small>${labelFor(activity.type)}</small>
        </div>
      `
    )
    .join("");
}

function iconFor(type) {
  if (type === "in" || type === "add") return "+";
  if (type === "out" || type === "delete") return "-";
  return "~";
}

function labelFor(type) {
  const labels = {
    add: "Ajout",
    update: "Modif.",
    delete: "Suppr.",
    in: "Entree",
    out: "Sortie"
  };
  return labels[type] || "Flux";
}

function renderAll() {
  renderKpis();
  renderInventory();
  renderMovementOptions();
  drawChart();
}

function resetProductForm() {
  els.productForm.reset();
  els.productId.value = "";
  els.productQty.value = 0;
  els.productThreshold.value = 10;
  els.productPrice.value = 100;
  els.productFormTitle.textContent = "Ajouter un produit";
}

function fillProductForm(product) {
  els.productId.value = product.id;
  els.productName.value = product.name;
  els.productCategory.value = product.category;
  els.productQty.value = product.qty;
  els.productThreshold.value = product.threshold;
  els.productPrice.value = product.price;
  els.productFormTitle.textContent = "Modifier le produit";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function replaceProducts(nextProducts) {
  products.splice(0, products.length, ...nextProducts);
}

async function refreshData({ recordChart = false } = {}) {
  const [nextProducts, nextActivities] = await Promise.all([
    api("/api/products"),
    api("/api/activities")
  ]);
  replaceProducts(nextProducts);
  activities = nextActivities;
  if (recordChart) pushChartPoint();
  renderAll();
  renderFeed();
}

async function saveProduct(event) {
  event.preventDefault();

  const id = Number(els.productId.value);
  const data = {
    name: els.productName.value.trim(),
    category: els.productCategory.value,
    qty: Number(els.productQty.value),
    threshold: Number(els.productThreshold.value),
    price: Number(els.productPrice.value)
  };

  if (!data.name) return;

  await api(id ? `/api/products/${id}` : "/api/products", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(data)
  });

  resetProductForm();
  await refreshData({ recordChart: true });
}

async function deleteProduct(id) {
  await api(`/api/products/${id}`, { method: "DELETE" });
  resetProductForm();
  await refreshData({ recordChart: true });
}

async function applyMovement(event) {
  event.preventDefault();

  const productId = Number(els.movementProduct.value);
  const qty = Number(els.movementQty.value);
  const type = els.movementType.value;

  if (!productId || qty <= 0) return;

  await api("/api/movements", {
    method: "POST",
    body: JSON.stringify({ productId, qty, type })
  });

  els.movementQty.value = 1;
  await refreshData({ recordChart: true });
}

els.productForm.addEventListener("submit", (event) => {
  saveProduct(event).catch(showError);
});
els.resetProductBtn.addEventListener("click", resetProductForm);
els.movementForm.addEventListener("submit", (event) => {
  applyMovement(event).catch(showError);
});
els.searchInput.addEventListener("input", renderInventory);
els.chartMode.addEventListener("change", drawChart);
els.clearFlowBtn.addEventListener("click", () => {
  activities = [];
  renderFeed();
});

els.inventoryTable.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const product = products.find((item) => item.id === id);

  if (button.dataset.action === "edit" && product) {
    fillProductForm(product);
  }

  if (button.dataset.action === "delete") {
    deleteProduct(id).catch(showError);
  }
});

function showError(error) {
  const message = (error && error.message) || String(error) || 'Erreur inconnue';
  alert(`Erreur: ${message}`);
  console.error('Detailed error:', error);
}

refreshData({ recordChart: true }).catch(showError);
