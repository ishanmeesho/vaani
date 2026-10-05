// App state and every shopping action. Both the touch UI and the voice agent's
// tools go through these functions, so the two can never drift apart.
(function () {
  const { PRODUCTS, CATEGORIES, COUPONS } = window.CATALOG;
  const KEY = "vaani-shop-state-v1";
  const DAY = 86400000;

  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || id;
  const rupees = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  function seedOrders() {
    const now = Date.now();
    const addr = { id: "a1", name: "सुनीता शर्मा", phone: "9876543210", house: "मकान 12, गली 4", area: "शास्त्री नगर", city: "जयपुर", state: "राजस्थान", pincode: "302016", landmark: "शिव मंदिर के पास" };
    const mk = (id, pid, size, daysAgo, extra) => {
      const p = byId(pid);
      return Object.assign({
        id, items: [{ pid, qty: 1, size, color: p.colors[0], price: p.price, mrp: p.mrp }],
        address: addr, payment: { method: "cod" }, total: p.price, coupon: null,
        placedAt: now - daysAgo * DAY, status: null,
      }, extra || {});
    };
    return [
      mk("VS482913", "p06", "L", 1),
      mk("VS471205", "p19", "3 लीटर", 9),
      mk("VS455870", "p17", "Free Size", 20, { status: "cancelled", cancelledAt: now - 19 * DAY }),
    ];
  }

  function fresh() {
    return {
      route: { name: "home", params: {} },
      back: [],
      cart: [],
      wishlist: [],
      addresses: [{ id: "a1", name: "सुनीता शर्मा", phone: "9876543210", house: "मकान 12, गली 4", area: "शास्त्री नगर", city: "जयपुर", state: "राजस्थान", pincode: "302016", landmark: "शिव मंदिर के पास" }],
      selectedAddressId: "a1",
      payment: { method: null, upiId: "" },
      coupon: null,
      orders: seedOrders(),
      recent: [],
      results: { query: "", filters: {}, ids: [] },
      memory: [],
      compare: [],
      lastOrderId: null,
    };
  }

  let state = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.orders) state = Object.assign(fresh(), saved, { route: { name: "home", params: {} }, back: [] });
  } catch (e) { /* storage blocked — run from memory */ }

  const listeners = [];
  function emit() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    listeners.forEach((fn) => fn(state));
  }

  // ---------- navigation ----------
  function go(name, params, opts) {
    const same = state.route.name === name && JSON.stringify(state.route.params || {}) === JSON.stringify(params || {});
    if (!same && !(opts && opts.replace)) state.back.push(state.route);
    if (state.back.length > 30) state.back.shift();
    state.route = { name, params: params || {} };
    emit();
    return { ok: true, screen: name };
  }
  function goBack() {
    const prev = state.back.pop();
    state.route = prev || { name: "home", params: {} };
    emit();
    return { ok: true, screen: state.route.name };
  }

  // ---------- search ----------
  const HI_EN = {
    "साड़ी": "saree", "साडी": "saree", "सारी": "saree", "कुर्ती": "kurti", "कुर्ता": "kurta", "शर्ट": "shirt", "जीन्स": "jeans", "टी-शर्ट": "tshirt", "टीशर्ट": "tshirt",
    "जूते": "shoes", "जूता": "shoes", "शूज़": "shoes", "शूज": "shoes", "चप्पल": "chappal", "जूती": "jutti", "झुमके": "jhumka", "झुमका": "jhumka", "हार": "necklace",
    "चूड़ी": "bangles", "चूड़ियां": "bangles", "चूड़ियाँ": "bangles", "कड़ाही": "kadhai", "कढ़ाई": "kadhai", "कुकर": "cooker", "बर्तन": "bartan", "दीया": "diya", "दीये": "diya", "दिये": "diya",
    "बेडशीट": "bedsheet", "चादर": "bedsheet", "घड़ी": "clock", "लिपस्टिक": "lipstick", "ड्रायर": "dryer", "बच्चों": "kids", "बच्चे": "kids", "खिलौना": "toy", "टेडी": "teddy",
    "ईयरबड्स": "earbuds", "इयरफोन": "earbuds", "हेडफोन": "earbuds", "पावर": "power", "चार्जर": "charger", "वॉच": "watch", "स्टैंड": "stand", "लहंगा": "lehenga", "सेट": "set",
    "शादी": "wedding", "त्योहार": "festival", "दिवाली": "diwali", "पार्टी": "party", "ऑफिस": "office", "ऑफ़िस": "office", "गिफ्ट": "gift", "गिफ़्ट": "gift", "तोहफ़ा": "gift", "तोहफा": "gift",
    "पुरुष": "men", "मर्द": "men", "लड़कों": "men", "महिला": "women", "लेडीज़": "women", "किचन": "kitchen", "रसोई": "kitchen", "मसाला": "masala", "एलोवेरा": "aloe",
    "सिल्क": "silk", "कॉटन": "cotton", "सूती": "cotton", "बनारसी": "banarasi", "अनारकली": "anarkali", "तोरण": "toran", "पायजामा": "pyjama", "स्मार्ट": "smart",
  };
  const COLOR_WORDS = { "लाल": ["लाल", "मैरून"], red: ["लाल", "मैरून"], "नीला": ["नीला", "आसमानी", "गहरा नीला"], "नीली": ["नीला", "आसमानी"], blue: ["नीला", "आसमानी", "गहरा नीला"],
    "हरा": ["हरा"], "हरी": ["हरा"], green: ["हरा"], "पीला": ["पीला"], "पीली": ["पीला"], yellow: ["पीला"], "काला": ["काला"], "काली": ["काला"], black: ["काला"],
    "गुलाबी": ["गुलाबी"], pink: ["गुलाबी"], "सफ़ेद": ["सफ़ेद"], "सफेद": ["सफ़ेद"], white: ["सफ़ेद"], "मैरून": ["मैरून"], maroon: ["मैरून"], "बैंगनी": ["बैंगनी"], purple: ["बैंगनी"], "सुनहरा": ["सुनहरा"], golden: ["सुनहरा"] };
  const STOP = new Set(["दिखाओ", "दिखाइए", "दिखा", "दो", "चाहिए", "मुझे", "मेरे", "लिए", "के", "की", "का", "को", "में", "से", "कम", "वाली", "वाला", "वाले", "कोई", "कुछ", "अच्छी", "अच्छा", "एक", "और", "भी", "है", "हैं", "ढूंढो", "ढूंढिए", "खोजो", "show", "me", "want", "need", "the", "a", "for", "some", "please", "रुपये", "रुपए", "तक", "अंदर", "नीचे", "सस्ती", "सस्ता", "सस्ते"]);

  function tokenize(q) {
    return String(q || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
  }

  function search(opts) {
    opts = opts || {};
    const q = opts.query || "";
    let toks = tokenize(q).filter((t) => !STOP.has(t) && !/^\d+$/.test(t));
    let colors = [];
    if (opts.color) colors = COLOR_WORDS[String(opts.color).toLowerCase()] || [opts.color];
    toks = toks.filter((t) => { if (COLOR_WORDS[t]) { if (!opts.color) colors = COLOR_WORDS[t]; return false; } return true; });

    let list = PRODUCTS.slice();
    if (opts.category) {
      const c = CATEGORIES.find((x) => x.id === opts.category || x.name === opts.category || x.en.toLowerCase() === String(opts.category).toLowerCase());
      if (c) list = list.filter((p) => p.cat === c.id);
    }
    if (opts.max_price) list = list.filter((p) => p.price <= opts.max_price);
    if (opts.min_price) list = list.filter((p) => p.price >= opts.min_price);
    if (opts.min_rating) list = list.filter((p) => p.rating >= opts.min_rating);
    if (opts.size) list = list.filter((p) => p.sizes.some((s) => s.toLowerCase() === String(opts.size).toLowerCase()) || p.sizes[0] === "Free Size");
    if (colors.length) list = list.filter((p) => p.colors.some((c) => colors.includes(c)));

    let scored = list.map((p) => {
      if (!toks.length) return { p, s: 1 };
      const hay = (p.name + " " + p.en + " " + p.tags + " " + catName(p.cat) + " " + p.cat).toLowerCase();
      let s = 0;
      toks.forEach((t) => {
        const alt = HI_EN[t];
        if (hay.includes(t)) s += 2;
        else if (alt && hay.includes(alt)) s += 2;
        else if (t.length > 3 && hay.includes(t.slice(0, -1))) s += 1;
      });
      return { p, s };
    });
    if (toks.length) scored = scored.filter((x) => x.s > 0);
    const sort = opts.sort || "relevance";
    scored.sort((a, b) => {
      if (sort === "price_low") return a.p.price - b.p.price;
      if (sort === "price_high") return b.p.price - a.p.price;
      if (sort === "rating") return b.p.rating - a.p.rating;
      if (sort === "popular") return b.p.ratings - a.p.ratings;
      return b.s - a.s || b.p.ratings - a.p.ratings;
    });
    return scored.map((x) => x.p);
  }

  function runSearch(opts) {
    const found = search(opts);
    const filters = {};
    ["category", "max_price", "min_price", "color", "size", "min_rating", "sort"].forEach((k) => { if (opts[k]) filters[k] = opts[k]; });
    state.results = { query: opts.query || "", filters, ids: found.map((p) => p.id) };
    go("results", { q: opts.query || "", t: Date.now() });
    return found;
  }

  // ---------- product ----------
  function viewProduct(pid) {
    const p = byId(pid);
    if (!p) return { ok: false, error: "यह प्रोडक्ट नहीं मिला: " + pid };
    state.recent = [pid].concat(state.recent.filter((x) => x !== pid)).slice(0, 10);
    go("product", { id: pid });
    return { ok: true, product: p };
  }
  function similar(pid) {
    const p = byId(pid);
    return PRODUCTS.filter((x) => x.cat === p.cat && x.id !== pid).slice(0, 4);
  }

  // ---------- cart ----------
  function matchSize(p, size) {
    if (!size) return null;
    const s = String(size).trim().toLowerCase().replace(/^size\s*/, "");
    const alias = { "मीडियम": "m", "medium": "m", "स्मॉल": "s", "small": "s", "लार्ज": "l", "large": "l", "एक्स्ट्रा लार्ज": "xl", "एक्सएल": "xl", "डबल एक्सएल": "xxl" };
    const want = alias[s] || s;
    return p.sizes.find((x) => x.toLowerCase() === want) || p.sizes.find((x) => x.toLowerCase().startsWith(want)) || null;
  }
  function addToCart(pid, qty, size, color) {
    const p = byId(pid);
    if (!p) return { ok: false, error: "प्रोडक्ट नहीं मिला: " + pid };
    let sz = p.sizes.length === 1 ? p.sizes[0] : matchSize(p, size);
    if (!sz) return { ok: false, error: "size_required", message: "इस प्रोडक्ट के लिए साइज़ चुनना ज़रूरी है", available_sizes: p.sizes };
    const col = color && p.colors.find((c) => c.includes(color) || color.includes(c)) || p.colors[0];
    const line = state.cart.find((l) => l.pid === pid && l.size === sz);
    if (line) line.qty = Math.min(10, line.qty + (qty || 1));
    else state.cart.push({ pid, qty: Math.max(1, Math.min(10, qty || 1)), size: sz, color: col });
    emit();
    return { ok: true, added: p.name, size: sz, color: col, cart: cartSummary() };
  }
  function setQty(pid, qty, size) {
    const idx = state.cart.findIndex((l) => l.pid === pid && (!size || l.size === size));
    if (idx < 0) return { ok: false, error: "यह आइटम कार्ट में नहीं है" };
    if (qty <= 0) state.cart.splice(idx, 1);
    else state.cart[idx].qty = Math.min(10, qty);
    if (!state.cart.length) state.coupon = null;
    emit();
    return { ok: true, cart: cartSummary() };
  }
  function totals() {
    let sub = 0, mrp = 0, count = 0;
    state.cart.forEach((l) => { const p = byId(l.pid); sub += p.price * l.qty; mrp += p.mrp * l.qty; count += l.qty; });
    let coupon = 0;
    const c = state.coupon && COUPONS[state.coupon];
    if (c && sub >= c.min) coupon = c.flat || Math.min(c.cap, Math.round(sub * c.pct / 100));
    const delivery = sub === 0 || sub >= 299 ? 0 : 40;
    return { count, mrp, sub, productDiscount: mrp - sub, coupon, delivery, total: sub - coupon + delivery };
  }
  function cartSummary() {
    const t = totals();
    return {
      items: state.cart.map((l) => { const p = byId(l.pid); return { product_id: l.pid, name: p.name, size: l.size, color: l.color, qty: l.qty, price: p.price }; }),
      item_count: t.count, subtotal: t.sub, coupon: state.coupon, coupon_discount: t.coupon, delivery: t.delivery, total: t.total, savings_vs_mrp: t.productDiscount + t.coupon,
    };
  }
  function applyCoupon(code) {
    const c = COUPONS[String(code || "").toUpperCase().replace(/\s+/g, "")];
    if (!c) return { ok: false, error: "यह कूपन मान्य नहीं है", available: Object.values(COUPONS).map((x) => x.code + ": " + x.desc) };
    const t = totals();
    if (t.sub < c.min) return { ok: false, error: `यह कूपन ${c.min} रुपये से ऊपर के ऑर्डर पर लगता है`, subtotal: t.sub };
    state.coupon = c.code;
    emit();
    return { ok: true, coupon: c.code, cart: cartSummary() };
  }
  function toggleWishlist(pid) {
    if (!byId(pid)) return { ok: false, error: "प्रोडक्ट नहीं मिला" };
    const i = state.wishlist.indexOf(pid);
    if (i >= 0) state.wishlist.splice(i, 1); else state.wishlist.unshift(pid);
    emit();
    return { ok: true, in_wishlist: i < 0 };
  }

  // ---------- address ----------
  function saveAddress(a) {
    const need = ["name", "phone", "house", "area", "city", "state", "pincode"];
    const clean = {};
    need.concat(["landmark"]).forEach((k) => { if (a[k] != null) clean[k] = String(a[k]).trim(); });
    if (clean.phone) clean.phone = clean.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (clean.pincode) clean.pincode = clean.pincode.replace(/\D/g, "");
    const missing = need.filter((k) => !clean[k]);
    const problems = [];
    if (clean.phone && !/^[6-9]\d{9}$/.test(clean.phone)) problems.push("फ़ोन नंबर 10 अंकों का होना चाहिए और 6-9 से शुरू होना चाहिए");
    if (clean.pincode && !/^\d{6}$/.test(clean.pincode)) problems.push("पिनकोड 6 अंकों का होना चाहिए");
    if (missing.length || problems.length) return { ok: false, error: "address_incomplete", missing_fields: missing, problems };
    clean.id = "a" + Date.now().toString(36);
    state.addresses.push(clean);
    state.selectedAddressId = clean.id;
    emit();
    return { ok: true, address_id: clean.id, address: clean };
  }
  function selectAddress(id) {
    if (!state.addresses.find((a) => a.id === id)) return { ok: false, error: "यह पता नहीं मिला" };
    state.selectedAddressId = id;
    emit();
    return { ok: true };
  }
  function deleteAddress(id) {
    state.addresses = state.addresses.filter((a) => a.id !== id);
    if (state.selectedAddressId === id) state.selectedAddressId = state.addresses[0] ? state.addresses[0].id : null;
    emit();
    return { ok: true };
  }
  const selectedAddress = () => state.addresses.find((a) => a.id === state.selectedAddressId) || null;
  const addressLine = (a) => a ? [a.house, a.area, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(", ") : "";

  // ---------- payment ----------
  const PAY = { upi: "UPI", cod: "कैश ऑन डिलीवरी", card: "डेबिट/क्रेडिट कार्ड (डेमो)", netbanking: "नेट बैंकिंग (डेमो)" };
  function selectPayment(method, upiId) {
    if (!PAY[method]) return { ok: false, error: "यह पेमेंट तरीका उपलब्ध नहीं है", options: Object.keys(PAY) };
    state.payment.method = method;
    if (upiId != null) state.payment.upiId = String(upiId).trim().toLowerCase().replace(/\s+/g, "");
    if (method === "upi" && state.payment.upiId && !/^[\w.-]{2,}@[a-z]{2,}$/.test(state.payment.upiId))
      { emit(); return { ok: false, error: "UPI ID सही नहीं लग रही, जैसे: naam@okicici", upi_id: state.payment.upiId }; }
    emit();
    return { ok: true, method: PAY[method], upi_id: method === "upi" ? state.payment.upiId || null : undefined };
  }

  // ---------- orders ----------
  function eta(order) {
    const days = Math.max.apply(null, order.items.map((i) => (byId(i.pid) || { deliveryDays: 5 }).deliveryDays));
    return order.placedAt + days * DAY;
  }
  const STEPS = ["placed", "packed", "shipped", "out_for_delivery", "delivered"];
  const STEP_HI = { placed: "ऑर्डर हो गया", packed: "पैक हो गया", shipped: "रास्ते में है", out_for_delivery: "आज डिलीवरी होगी", delivered: "डिलीवर हो गया", cancelled: "कैंसल हो गया", return_requested: "रिटर्न का अनुरोध हुआ" };
  function orderStatus(o) {
    if (o.status === "cancelled" || o.status === "return_requested") return o.status;
    const total = eta(o) - o.placedAt;
    const frac = (Date.now() - o.placedAt) / total;
    if (frac >= 1) return "delivered";
    if (frac >= 0.85) return "out_for_delivery";
    if (frac >= 0.3) return "shipped";
    if (frac >= 0.1) return "packed";
    return "placed";
  }
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("hi-IN", { weekday: "long", day: "numeric", month: "long" });

  function orderInfo(o) {
    const st = orderStatus(o);
    return {
      order_id: o.id, status: st, status_hindi: STEP_HI[st], total: o.total,
      items: o.items.map((i) => { const p = byId(i.pid); return { name: p ? p.name : i.pid, size: i.size, qty: i.qty }; }),
      placed_on: fmtDate(o.placedAt), expected_delivery: st === "cancelled" ? null : fmtDate(eta(o)),
      payment: PAY[o.payment.method], city: o.address.city,
      can_cancel: ["placed", "packed", "shipped"].includes(st), can_return: st === "delivered" && o.items.every((i) => (byId(i.pid) || {}).returnDays > 0),
    };
  }

  function checkoutBlockers() {
    const b = [];
    if (!state.cart.length) b.push("कार्ट खाली है");
    if (!selectedAddress()) b.push("डिलीवरी का पता नहीं चुना गया");
    if (!state.payment.method) b.push("पेमेंट का तरीका नहीं चुना गया");
    if (state.payment.method === "upi" && !/^[\w.-]{2,}@[a-z]{2,}$/.test(state.payment.upiId || "")) b.push("UPI ID नहीं दी गई");
    return b;
  }
  function placeOrder() {
    const blockers = checkoutBlockers();
    if (blockers.length) return { ok: false, error: "checkout_incomplete", blockers };
    const t = totals();
    const o = {
      id: "VS" + String(Math.floor(100000 + Math.random() * 900000)),
      items: state.cart.map((l) => { const p = byId(l.pid); return { pid: l.pid, qty: l.qty, size: l.size, color: l.color, price: p.price, mrp: p.mrp }; }),
      address: Object.assign({}, selectedAddress()), payment: Object.assign({}, state.payment), total: t.total, coupon: state.coupon,
      placedAt: Date.now(), status: null,
    };
    state.orders.unshift(o);
    state.cart = [];
    state.coupon = null;
    state.lastOrderId = o.id;
    go("success", { id: o.id }, { replace: true });
    state.back = [{ name: "home", params: {} }];
    return { ok: true, order: orderInfo(o) };
  }
  function orderAction(id, action) {
    const o = state.orders.find((x) => x.id.toLowerCase() === String(id).toLowerCase().replace(/\s+/g, ""));
    if (!o) return { ok: false, error: "यह ऑर्डर नहीं मिला", your_orders: state.orders.map((x) => x.id) };
    const info = orderInfo(o);
    if (action === "cancel") {
      if (!info.can_cancel) return { ok: false, error: "यह ऑर्डर अब कैंसल नहीं हो सकता", order: info };
      o.status = "cancelled"; o.cancelledAt = Date.now();
    } else if (action === "return") {
      if (!info.can_return) return { ok: false, error: "इस ऑर्डर पर रिटर्न उपलब्ध नहीं है", order: info };
      o.status = "return_requested";
    }
    go("order", { id: o.id });
    return { ok: true, order: orderInfo(o) };
  }

  function remember(fact) {
    fact = String(fact || "").trim();
    if (!fact) return { ok: false };
    if (!state.memory.includes(fact)) state.memory.push(fact);
    if (state.memory.length > 25) state.memory.shift();
    emit();
    return { ok: true, remembered: fact };
  }

  function reset() { state = fresh(); emit(); }

  window.Store = {
    get state() { return state; },
    on: (fn) => listeners.push(fn), emit,
    byId, catName, rupees, fmtDate, PAY, STEPS, STEP_HI,
    go, goBack, search, runSearch, viewProduct, similar,
    addToCart, setQty, totals, cartSummary, applyCoupon, toggleWishlist,
    saveAddress, selectAddress, deleteAddress, selectedAddress, addressLine,
    selectPayment, checkoutBlockers, placeOrder, orderAction, orderInfo, orderStatus, eta,
    remember, reset,
  };
})();
