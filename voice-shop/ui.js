// Screen rendering. Every screen is plain HTML from state; taps are wired up in
// app.js through data-act attributes, so the same actions are reachable by
// touch and by voice.
(function () {
  const { CATEGORIES, COUPONS } = window.CATALOG;
  const S = () => Store.state;
  const R = Store.rupees;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const off = (p) => Math.round((1 - p.price / p.mrp) * 100);

  const art = (p, cls) => `<div class="art ${cls || ""}" style="--h:${p.hue}"><span>${p.emoji}</span></div>`;
  const stars = (p) => `<span class="rating">${p.rating} ★</span><span class="dim small">(${p.ratings.toLocaleString("en-IN")})</span>`;

  function card(p, n) {
    const wish = S().wishlist.includes(p.id);
    return `<article class="card" data-act="open" data-id="${p.id}">
      ${n ? `<span class="num" aria-label="नंबर ${n}">${n}</span>` : ""}
      <button class="heart ${wish ? "on" : ""}" data-act="wish" data-id="${p.id}" aria-label="विशलिस्ट">${wish ? "♥" : "♡"}</button>
      ${art(p)}
      <div class="card-body">
        <div class="pname">${esc(p.name)}</div>
        <div class="price-row"><b>${R(p.price)}</b><s class="dim">${R(p.mrp)}</s><span class="off">${off(p)}% छूट</span></div>
        <div class="meta">${stars(p)}</div>
        ${p.price >= 299 ? `<div class="free small">फ़्री डिलीवरी</div>` : ""}
      </div>
    </article>`;
  }

  function home() {
    const st = S();
    const picks = ["p05", "p01", "p33", "p19", "p16", "p09", "p23", "p07", "p14", "p28"].map(Store.byId);
    const recent = st.recent.map(Store.byId).filter(Boolean);
    return `
      <section class="hero">
        <div class="hero-text">
          <div class="eyebrow">बोलकर खरीदें</div>
          <h2>नीचे माइक दबाइए और वाणी से बात कीजिए</h2>
          <div class="tips">
            ${["500 से कम की कुर्ती दिखाओ", "दिवाली पर घर सजाने के लिए क्या लूँ?", "मेरा ऑर्डर कहाँ पहुँचा?", "शादी में पहनने के लिए साड़ी बताओ"].map((t) => `<button class="tip" data-act="say" data-text="${esc(t)}">“${esc(t)}”</button>`).join("")}
          </div>
        </div>
      </section>
      <section>
        <h3 class="sec">कैटेगरी</h3>
        <div class="cats">${CATEGORIES.map((c) => `<button class="cat" data-act="cat" data-id="${c.id}"><span class="cat-ic" style="--h:${c.hue}">${c.emoji}</span><span>${esc(c.name)}</span></button>`).join("")}</div>
      </section>
      <section class="offer-strip">
        ${Object.values(COUPONS).map((c) => `<div class="offer"><b>${c.code}</b><span>${esc(c.desc)}</span></div>`).join("")}
      </section>
      ${recent.length ? `<section><h3 class="sec">हाल में देखे</h3><div class="hscroll">${recent.map((p) => `<div class="mini" data-act="open" data-id="${p.id}">${art(p, "sm")}<div class="small">${esc(p.name)}</div><b class="small">${R(p.price)}</b></div>`).join("")}</div></section>` : ""}
      <section><h3 class="sec">आपके लिए</h3><div class="grid">${picks.map((p) => card(p)).join("")}</div></section>`;
  }

  const SORTS = [["relevance", "सही मिलान"], ["price_low", "सस्ते पहले"], ["price_high", "महंगे पहले"], ["rating", "रेटिंग"], ["popular", "लोकप्रिय"]];
  function results() {
    const { query, filters, ids } = S().results;
    const list = ids.map(Store.byId);
    const chips = [];
    if (filters.category) chips.push(Store.catName(filters.category));
    if (filters.max_price) chips.push(R(filters.max_price) + " तक");
    if (filters.min_price) chips.push(R(filters.min_price) + " से ऊपर");
    if (filters.color) chips.push(filters.color);
    if (filters.size) chips.push("साइज़ " + filters.size);
    if (filters.min_rating) chips.push(filters.min_rating + "★+");
    return `
      <div class="res-head">
        <h2>${query ? `“${esc(query)}”` : esc(filters.category ? Store.catName(filters.category) : "सभी प्रोडक्ट")}</h2>
        <div class="dim small">${list.length} प्रोडक्ट मिले ${chips.length ? "· " + chips.map(esc).join(" · ") : ""}</div>
        <div class="sorts">${SORTS.map(([k, l]) => `<button class="chip ${(filters.sort || "relevance") === k ? "on" : ""}" data-act="sort" data-id="${k}">${l}</button>`).join("")}</div>
      </div>
      ${list.length ? `<div class="grid">${list.map((p, i) => card(p, i + 1)).join("")}</div>` :
        `<div class="empty"><div class="big">🔍</div><p>कुछ नहीं मिला। वाणी से कहिए कि दूसरा कुछ ढूंढे।</p></div>`}`;
  }

  function product(id) {
    const p = Store.byId(id);
    if (!p) return `<div class="empty"><p>प्रोडक्ट नहीं मिला</p></div>`;
    const inCart = S().cart.filter((l) => l.pid === id).reduce((a, l) => a + l.qty, 0);
    const wish = S().wishlist.includes(id);
    const sel = window.App && App.pdpSize[id];
    return `
      <div class="pdp">
        ${art(p, "lg")}
        <div class="pdp-body">
          <div class="dim small">${esc(Store.catName(p.cat))} · ${esc(p.seller)}</div>
          <h2>${esc(p.name)}</h2>
          <div class="price-row lg"><b>${R(p.price)}</b><s class="dim">${R(p.mrp)}</s><span class="off">${off(p)}% छूट</span></div>
          <div class="meta">${stars(p)}</div>
          <div class="block">
            <div class="label">साइज़ चुनें</div>
            <div class="sizes">${p.sizes.map((s) => `<button class="size ${sel === s || p.sizes.length === 1 ? "on" : ""}" data-act="size" data-id="${p.id}" data-size="${esc(s)}">${esc(s)}</button>`).join("")}</div>
          </div>
          <div class="block"><div class="label">रंग</div><div class="dim">${p.colors.map(esc).join(" · ")}</div></div>
          <div class="block">
            <div class="label">ख़ास बातें</div>
            <ul class="hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
            <p>${esc(p.desc)}</p>
            <div class="dim small">कपड़ा/मटीरियल: ${esc(p.material)}</div>
          </div>
          <div class="block info">
            <div>🚚 <b>${Store.fmtDate(Date.now() + p.deliveryDays * 86400000)}</b> तक डिलीवरी</div>
            <div>↩️ ${p.returnDays ? p.returnDays + " दिन में आसान रिटर्न" : "यह प्रोडक्ट रिटर्न नहीं होता"}</div>
            <div>💵 कैश ऑन डिलीवरी उपलब्ध</div>
          </div>
          <div class="block"><div class="label">मिलते-जुलते प्रोडक्ट</div>
            <div class="hscroll">${Store.similar(id).map((q) => `<div class="mini" data-act="open" data-id="${q.id}">${art(q, "sm")}<div class="small">${esc(q.name)}</div><b class="small">${R(q.price)}</b></div>`).join("")}</div>
          </div>
        </div>
      </div>
      <div class="buybar">
        <button class="btn ghost" data-act="wish" data-id="${id}">${wish ? "♥ सेव है" : "♡ विशलिस्ट"}</button>
        <button class="btn outline" data-act="add" data-id="${id}">${inCart ? `कार्ट में (${inCart}) +` : "कार्ट में डालें"}</button>
        <button class="btn primary" data-act="buy" data-id="${id}">अभी खरीदें</button>
      </div>`;
  }

  function compare() {
    const ps = (S().compare || []).map(Store.byId).filter(Boolean);
    const rows = [["कीमत", (p) => R(p.price)], ["MRP", (p) => R(p.mrp)], ["छूट", (p) => off(p) + "%"], ["रेटिंग", (p) => p.rating + " ★"], ["रिव्यू", (p) => p.ratings.toLocaleString("en-IN")],
      ["मटीरियल", (p) => esc(p.material)], ["साइज़", (p) => p.sizes.map(esc).join(", ")], ["रंग", (p) => p.colors.map(esc).join(", ")], ["डिलीवरी", (p) => p.deliveryDays + " दिन"], ["रिटर्न", (p) => (p.returnDays ? p.returnDays + " दिन" : "नहीं")]];
    return `<h2 class="pad">तुलना</h2>
      <div class="compare" style="--n:${ps.length}">
        <div class="ccell head"></div>${ps.map((p) => `<div class="ccell head" data-act="open" data-id="${p.id}">${art(p, "sm")}<div class="small"><b>${esc(p.name)}</b></div></div>`).join("")}
        ${rows.map(([l, f]) => `<div class="ccell lab">${l}</div>${ps.map((p) => `<div class="ccell">${f(p)}</div>`).join("")}`).join("")}
      </div>`;
  }

  function priceDetails() {
    const t = Store.totals();
    return `<div class="panel">
      <div class="label">कीमत का ब्योरा (${t.count} सामान)</div>
      <div class="row"><span>कुल MRP</span><span>${R(t.mrp)}</span></div>
      <div class="row good"><span>प्रोडक्ट पर छूट</span><span>− ${R(t.productDiscount)}</span></div>
      ${t.coupon ? `<div class="row good"><span>कूपन (${S().coupon})</span><span>− ${R(t.coupon)}</span></div>` : ""}
      <div class="row"><span>डिलीवरी</span><span>${t.delivery ? R(t.delivery) : '<span class="good">फ़्री</span>'}</span></div>
      <div class="row total"><span>कुल रकम</span><span>${R(t.total)}</span></div>
      <div class="save">आप इस ऑर्डर पर ${R(t.productDiscount + t.coupon)} बचा रहे हैं 🎉</div>
    </div>`;
  }

  function cart() {
    const st = S();
    if (!st.cart.length) return `<div class="empty"><div class="big">🛒</div><p>आपका कार्ट खाली है</p><button class="btn primary" data-act="nav" data-id="home">शॉपिंग शुरू करें</button></div>`;
    return `<h2 class="pad">मेरा कार्ट</h2>
      ${st.cart.map((l) => { const p = Store.byId(l.pid); return `<div class="line">
        <div data-act="open" data-id="${p.id}">${art(p, "sm")}</div>
        <div class="grow">
          <div class="pname">${esc(p.name)}</div>
          <div class="dim small">साइज़: ${esc(l.size)} · ${esc(l.color)}</div>
          <div class="price-row"><b>${R(p.price)}</b><s class="dim">${R(p.mrp)}</s></div>
          <div class="qty">
            <button data-act="qty" data-id="${p.id}" data-size="${esc(l.size)}" data-q="${l.qty - 1}" aria-label="कम करें">−</button><span>${l.qty}</span><button data-act="qty" data-id="${p.id}" data-size="${esc(l.size)}" data-q="${l.qty + 1}" aria-label="बढ़ाएँ">+</button>
            <button class="link" data-act="qty" data-id="${p.id}" data-size="${esc(l.size)}" data-q="0">हटाएँ</button>
          </div>
        </div></div>`; }).join("")}
      <div class="panel coupon">
        <div class="label">कूपन</div>
        ${st.coupon ? `<div class="row"><span><b>${st.coupon}</b> लगा है ✓</span><button class="link" data-act="uncoupon">हटाएँ</button></div>` :
          `<div class="coupons">${Object.values(COUPONS).map((c) => `<button class="chip" data-act="coupon" data-id="${c.code}"><b>${c.code}</b> · ${esc(c.desc)}</button>`).join("")}</div>`}
      </div>
      ${priceDetails()}
      <div class="buybar"><div class="grow"><b>${R(Store.totals().total)}</b><div class="dim small">कुल रकम</div></div><button class="btn primary" data-act="nav" data-id="address">आगे बढ़ें →</button></div>`;
  }

  const steps = (n) => `<div class="steps">${["कार्ट", "पता", "पेमेंट"].map((s, i) => `<span class="${i < n ? "done" : i === n ? "cur" : ""}">${i + 1}. ${s}</span>`).join("<i></i>")}</div>`;

  function address() {
    const st = S();
    const f = (window.App && App.addrDraft) || {};
    const field = (k, label, extra) => `<label class="fld"><span>${label}</span><input data-addr="${k}" value="${esc(f[k] || "")}" ${extra || ""}></label>`;
    return `${steps(1)}
      <h2 class="pad">डिलीवरी का पता</h2>
      ${st.addresses.map((a) => `<label class="addr ${a.id === st.selectedAddressId ? "on" : ""}" data-act="pickaddr" data-id="${a.id}">
        <input type="radio" name="addr" ${a.id === st.selectedAddressId ? "checked" : ""}>
        <div class="grow"><b>${esc(a.name)}</b> <span class="dim small">${esc(a.phone)}</span><div class="small">${esc(Store.addressLine(a))}</div></div>
        <button class="link" data-act="deladdr" data-id="${a.id}">हटाएँ</button>
      </label>`).join("") || `<p class="dim pad">अभी कोई पता सेव नहीं है।</p>`}
      <details class="panel" ${st.addresses.length ? "" : "open"} id="addrForm">
        <summary class="label">+ नया पता जोड़ें <span class="dim small">(या वाणी को बोलकर बताइए)</span></summary>
        <div class="form">
          ${field("name", "पूरा नाम")}${field("phone", "मोबाइल नंबर", 'inputmode="numeric" maxlength="10"')}
          ${field("house", "मकान नंबर, गली")}${field("area", "मोहल्ला / कॉलोनी / गाँव")}
          ${field("landmark", "पास में (लैंडमार्क)")}${field("city", "शहर")}
          ${field("state", "राज्य")}${field("pincode", "पिनकोड", 'inputmode="numeric" maxlength="6"')}
          <div class="err small" id="addrErr"></div>
          <button class="btn outline" data-act="saveaddr">पता सेव करें</button>
        </div>
      </details>
      <div class="buybar"><div class="grow"><b>${R(Store.totals().total)}</b><div class="dim small">${st.cart.length ? "कुल रकम" : "कार्ट खाली है"}</div></div>
        <button class="btn primary" data-act="nav" data-id="payment" ${Store.selectedAddress() && st.cart.length ? "" : "disabled"}>पेमेंट पर जाएँ →</button></div>`;
  }

  function payment() {
    const st = S();
    const a = Store.selectedAddress();
    const blockers = Store.checkoutBlockers();
    const opt = (k, label, sub) => `<label class="pay ${st.payment.method === k ? "on" : ""}" data-act="pay" data-id="${k}">
      <input type="radio" name="pay" ${st.payment.method === k ? "checked" : ""}><div class="grow"><b>${label}</b><div class="dim small">${sub}</div>
      ${k === "upi" && st.payment.method === "upi" ? `<input class="upi" data-upi placeholder="जैसे: naam@okicici" value="${esc(st.payment.upiId || "")}">` : ""}</div></label>`;
    return `${steps(2)}
      <h2 class="pad">पेमेंट</h2>
      ${opt("upi", "UPI", "Google Pay, PhonePe, Paytm — UPI ID से")}
      ${opt("cod", "कैश ऑन डिलीवरी", "सामान मिलने पर नकद या UPI से दें")}
      ${opt("card", "डेबिट / क्रेडिट कार्ड", "डेमो — असली कार्ड की जानकारी न डालें")}
      ${opt("netbanking", "नेट बैंकिंग", "डेमो")}
      <div class="panel">
        <div class="label">डिलीवरी</div>
        ${a ? `<div><b>${esc(a.name)}</b>, ${esc(Store.addressLine(a))}</div>` : `<div class="err">पता नहीं चुना — <button class="link" data-act="nav" data-id="address">पता चुनें</button></div>`}
      </div>
      <div class="panel">
        <div class="label">आपका ऑर्डर</div>
        ${st.cart.map((l) => { const p = Store.byId(l.pid); return `<div class="row"><span>${esc(p.name)} · ${esc(l.size)} × ${l.qty}</span><span>${R(p.price * l.qty)}</span></div>`; }).join("") || '<div class="dim">कार्ट खाली है</div>'}
      </div>
      ${priceDetails()}
      ${blockers.length ? `<div class="err pad small">बाक़ी: ${blockers.map(esc).join(", ")}</div>` : ""}
      <div class="buybar"><div class="grow"><b>${R(Store.totals().total)}</b><div class="dim small">कुल रकम</div></div>
        <button class="btn primary" data-act="place" ${blockers.length ? "disabled" : ""}>ऑर्डर करें ✓</button></div>`;
  }

  function success(id) {
    const o = S().orders.find((x) => x.id === id);
    if (!o) return "";
    const info = Store.orderInfo(o);
    return `<div class="success">
      <div class="tick">✓</div>
      <h2>ऑर्डर हो गया!</h2>
      <p>ऑर्डर नंबर <b>${o.id}</b></p>
      <p>${info.items.map((i) => esc(i.name)).join(", ")}</p>
      <p class="dim">${esc(info.expected_delivery)} तक ${esc(o.address.city)} पहुँचेगा · ${esc(info.payment)} · ${R(o.total)}</p>
      <div class="row-btns"><button class="btn outline" data-act="track" data-id="${o.id}">ऑर्डर ट्रैक करें</button><button class="btn primary" data-act="nav" data-id="home">शॉपिंग जारी रखें</button></div>
    </div>`;
  }

  function orders() {
    const list = S().orders;
    if (!list.length) return `<div class="empty"><div class="big">📦</div><p>अभी कोई ऑर्डर नहीं</p></div>`;
    return `<h2 class="pad">मेरे ऑर्डर</h2>${list.map((o) => {
      const info = Store.orderInfo(o); const p = Store.byId(o.items[0].pid);
      return `<div class="line" data-act="track" data-id="${o.id}">${art(p, "sm")}<div class="grow">
        <span class="status st-${info.status}">${info.status_hindi}</span>
        <div class="pname">${info.items.map((i) => esc(i.name)).join(", ")}</div>
        <div class="dim small">${o.id} · ${info.placed_on} · ${R(o.total)}</div>
        ${info.status !== "cancelled" && info.status !== "delivered" ? `<div class="small">${esc(info.expected_delivery)} तक पहुँचेगा</div>` : ""}
      </div><span class="chev">›</span></div>`; }).join("")}`;
  }

  function order(id) {
    const o = S().orders.find((x) => x.id === id);
    if (!o) return `<div class="empty"><p>ऑर्डर नहीं मिला</p></div>`;
    const info = Store.orderInfo(o);
    const cur = Store.STEPS.indexOf(info.status);
    return `<h2 class="pad">ऑर्डर ${o.id}</h2>
      <div class="panel">
        ${o.items.map((i) => { const p = Store.byId(i.pid); return `<div class="line flat">${art(p, "sm")}<div class="grow"><div class="pname">${esc(p.name)}</div><div class="dim small">साइज़ ${esc(i.size)} × ${i.qty} · ${R(i.price * i.qty)}</div></div></div>`; }).join("")}
      </div>
      <div class="panel">
        <div class="label">ट्रैकिंग</div>
        ${info.status === "cancelled" || info.status === "return_requested" ? `<div class="status st-${info.status}">${info.status_hindi}</div>` :
          `<ol class="track">${Store.STEPS.map((s, i) => `<li class="${i <= cur ? "done" : ""} ${i === cur ? "cur" : ""}">${Store.STEP_HI[s]}${i === Store.STEPS.length - 1 && i > cur ? ` <span class="dim small">(${esc(info.expected_delivery)} तक)</span>` : ""}</li>`).join("")}</ol>`}
      </div>
      <div class="panel"><div class="label">डिलीवरी पता</div><div><b>${esc(o.address.name)}</b>, ${esc(Store.addressLine(o.address))}</div><div class="dim small">पेमेंट: ${esc(info.payment)} · कुल ${R(o.total)}</div></div>
      <div class="row-btns pad">
        ${info.can_cancel ? `<button class="btn outline" data-act="cancel" data-id="${o.id}">ऑर्डर कैंसल करें</button>` : ""}
        ${info.can_return ? `<button class="btn outline" data-act="return" data-id="${o.id}">रिटर्न करें</button>` : ""}
        <button class="btn primary" data-act="nav" data-id="orders">सभी ऑर्डर</button>
      </div>`;
  }

  function wishlist() {
    const list = S().wishlist.map(Store.byId).filter(Boolean);
    if (!list.length) return `<div class="empty"><div class="big">♡</div><p>विशलिस्ट खाली है। पसंद की चीज़ पर दिल दबाइए, या वाणी से कहिए।</p></div>`;
    return `<h2 class="pad">विशलिस्ट</h2><div class="grid">${list.map((p) => card(p)).join("")}</div>`;
  }

  function render(route) {
    switch (route.name) {
      case "results": return results();
      case "product": return product(route.params.id);
      case "compare": return compare();
      case "cart": return cart();
      case "address": return address();
      case "payment": return payment();
      case "success": return success(route.params.id);
      case "orders": return orders();
      case "order": return order(route.params.id);
      case "wishlist": return wishlist();
      default: return home();
    }
  }

  window.UI = { render, esc };
})();
