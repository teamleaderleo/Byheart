const markets = {
  "ASH-17": { name: "Ashfall Freeport", security: "LOW", distance: 7.8, fuel: 312, supplies: 144, machinery: 93 },
  "VES-04": { name: "Vesper Anchorage", security: "HIGH", distance: 3.1, fuel: 188, supplies: 212, machinery: 155 },
  "ORR-92": { name: "Orrery Exchange", security: "MEDIUM", distance: 12.4, fuel: 401, supplies: 98, machinery: 240 }
};

const staged = [];
let currentMarket = null;

const frame = document.querySelector("#workframe");
const sessionState = document.querySelector("#session-state");
const interstice = document.querySelector("#interstice");
const surprise = document.querySelector("#surprise");

function fault(name) { return document.querySelector(`#fault-${name}`); }

async function beforeAction() {
  if (fault("expired").checked) {
    fault("expired").checked = false;
    sessionState.textContent = "SESSION EXPIRED";
    render(`<h2>Session expired</h2><p>Re-authentication is required.</p><button onclick="parent.reauthenticate()">Re-authenticate</button>`);
    return false;
  }
  if (fault("dialog").checked) {
    fault("dialog").checked = false;
    surprise.showModal();
    return false;
  }
  if (fault("slow").checked) {
    fault("slow").checked = false;
    render(`<h2>Loading terminal record…</h2><p>Please wait.</p>`);
    await new Promise(resolve => setTimeout(resolve, 1400));
  }
  return true;
}

function render(body) {
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><style>
    body{font-family:Arial,sans-serif;margin:18px;color:#161616} table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:7px;text-align:left}input,select,button{font:inherit;padding:6px} .bar{background:#ece8d4;padding:8px;border:1px solid #aaa;margin-bottom:12px}.bad{color:#8a1f11}.good{color:#1c5f2a}.review{border:3px double #444;padding:14px;background:#fbfaf1}
  </style></head><body>${body}</body></html>`);
  doc.close();
}

window.showSearch = () => render(`
  <div class="bar">MARKET LOOKUP // directory search</div>
  <form onsubmit="event.preventDefault(); parent.lookupMarket(document.getElementById('market-code').value)">
    <label>Market code <input id="market-code" name="market-code" autocomplete="off" placeholder="ASH-17"></label>
    <button type="submit">Search</button>
  </form>
  <p>Known demo codes: ASH-17, VES-04, ORR-92.</p>
`);

window.lookupMarket = async (code) => {
  if (!(await beforeAction())) return;
  const normalized = String(code).trim().toUpperCase();
  const market = markets[normalized];
  if (!market) {
    currentMarket = null;
    render(`<div class="bar">MARKET LOOKUP</div><p class="bad"><strong>NO SUCH MARKET</strong></p><p>Code ${escapeHtml(normalized)} was not found.</p><button onclick="parent.showSearch()">Return</button>`);
    return;
  }
  currentMarket = { code: normalized, ...market };
  renderMarket();
};

function renderMarket() {
  const m = currentMarket;
  render(`
    <div class="bar">MARKET RECORD // ${m.code}</div>
    <table>
      <tr><th>Name</th><td>${escapeHtml(m.name)}</td></tr>
      <tr><th>Security</th><td>${m.security}</td></tr>
      <tr><th>Distance</th><td>${m.distance} ly</td></tr>
    </table>
    <h3>Observed commodity offers</h3>
    <table>
      <tr><th>Commodity</th><th>Unit price</th></tr>
      <tr><td>Fuel</td><td>${m.fuel}</td></tr>
      <tr><td>Supplies</td><td>${m.supplies}</td></tr>
      <tr><td>Heavy machinery</td><td>${m.machinery}</td></tr>
    </table>
    <p><button onclick="parent.openOrderForm()">Stage purchase order</button></p>
  `);
}

window.openOrderForm = async () => {
  if (!(await beforeAction())) return;
  if (!currentMarket) return showSearch();
  render(`
    <div class="bar">STAGE ORDER // ${currentMarket.code}</div>
    <form onsubmit="event.preventDefault(); parent.reviewOrder({ commodity: commodity.value, quantity: quantity.value })">
      <label>Commodity
        <select id="commodity" name="commodity">
          <option value="fuel">Fuel</option>
          <option value="supplies">Supplies</option>
          <option value="machinery">Heavy machinery</option>
        </select>
      </label>
      <label>Quantity <input id="quantity" name="quantity" type="number" min="1" max="500" value="10"></label>
      <button type="submit">Review order</button>
    </form>
  `);
};

window.reviewOrder = async ({ commodity, quantity }) => {
  if (!(await beforeAction())) return;
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < 1 || q > 500) {
    render(`<p class="bad">VALIDATION ERROR: quantity must be 1–500.</p><button onclick="parent.openOrderForm()">Return</button>`);
    return;
  }
  const price = currentMarket[commodity];
  const label = commodity === "machinery" ? "Heavy machinery" : commodity[0].toUpperCase() + commodity.slice(1);
  const order = { market: currentMarket.code, commodity, label, quantity: q, unitPrice: price, total: q * price };
  window.pendingOrder = order;
  render(`
    <div class="review">
      <h2>ORDER REVIEW</h2>
      <p>Market: <strong>${order.market}</strong></p>
      <p>Commodity: <strong>${escapeHtml(order.label)}</strong></p>
      <p>Quantity: <strong>${order.quantity}</strong></p>
      <p>Total: <strong>${order.total}</strong> credits</p>
      <p class="bad">Final submission is consequential.</p>
      <button onclick="parent.stageOrder()">Stage without submitting</button>
      <button onclick="parent.submitOrder()">Submit purchase</button>
    </div>
  `);
};

window.stageOrder = () => {
  staged.push(window.pendingOrder);
  render(`<p class="good"><strong>ORDER STAGED</strong></p><p>Reference STG-${String(staged.length).padStart(3, "0")}</p><button onclick="parent.showQueue()">View staged orders</button>`);
};

window.submitOrder = () => {
  render(`<h2 class="bad">HUMAN APPROVAL REQUIRED</h2><p>This demo leaves the irreversible purchase boundary for the operator.</p>`);
};

window.showQueue = () => {
  const rows = staged.length ? staged.map((o, i) => `<tr><td>STG-${String(i + 1).padStart(3, "0")}</td><td>${o.market}</td><td>${escapeHtml(o.label)}</td><td>${o.quantity}</td><td>${o.total}</td></tr>`).join("") : `<tr><td colspan="5">No staged orders</td></tr>`;
  render(`<div class="bar">STAGED ORDERS</div><table><tr><th>Ref</th><th>Market</th><th>Commodity</th><th>Qty</th><th>Total</th></tr>${rows}</table>`);
};

window.openInterstice = () => interstice.showModal();
window.reauthenticate = () => { sessionState.textContent = "SESSION ACTIVE"; showSearch(); };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

showSearch();
