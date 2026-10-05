// The conversation brain.
//
// A pluggable LLM drives the whole app through tools: it searches, opens products,
// fills the cart, takes the address, picks payment and places orders, while
// holding a free-form Hindi conversation. Every user turn carries a fresh
// snapshot of what's on screen, so the model always talks about what the user
// is looking at. With no API key the app falls back to a small rule-based brain.
(function () {
  const S = () => Store.state;
  const { PRODUCTS, CATEGORIES, COUPONS } = window.CATALOG;

  // ---------------- tools ----------------
  const CAT_IDS = CATEGORIES.map((c) => c.id);
  const TOOLS = [
    { name: "search_products", description: "Search the catalog and SHOW the results on screen as a numbered grid. Use whenever the user wants to see/browse/find items, including filter or sort changes ('isse sasta', 'sirf laal wale'). Returns the numbered list the user now sees.",
      schema: { query: { type: "string", description: "What to look for, in Hindi or English, e.g. 'शादी के लिए साड़ी' or 'cotton kurti'. Can be empty when only filtering a category." },
        category: { type: "string", enum: CAT_IDS }, max_price: { type: "number" }, min_price: { type: "number" },
        color: { type: "string", description: "Colour in Hindi, e.g. लाल, नीला, हरा, काला, गुलाबी, पीला, सफ़ेद" },
        size: { type: "string" }, min_rating: { type: "number" },
        sort: { type: "string", enum: ["relevance", "price_low", "price_high", "rating", "popular"] } }, required: [] },
    { name: "open_product", description: "Open a product's detail page on screen. Use when the user picks an item ('pehla wala dikhao', 'number 3', 'woh laal saree').",
      schema: { product_id: { type: "string" } }, required: ["product_id"] },
    { name: "get_product_details", description: "Read full details (sizes, colours, material, delivery date, return policy, highlights, seller) of one or more products without changing the screen. Use to answer questions.",
      schema: { product_ids: { type: "array", items: { type: "string" } } }, required: ["product_ids"] },
    { name: "compare_products", description: "Show a side-by-side comparison of 2-3 products on screen.",
      schema: { product_ids: { type: "array", items: { type: "string" } } }, required: ["product_ids"] },
    { name: "add_to_cart", description: "Add a product to the cart. If the product has more than one size you MUST pass a size the user chose; if they haven't, ask first.",
      schema: { product_id: { type: "string" }, size: { type: "string" }, color: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 10 } }, required: ["product_id"] },
    { name: "update_cart_item", description: "Change the quantity of an item in the cart. quantity 0 removes it.",
      schema: { product_id: { type: "string" }, quantity: { type: "integer", minimum: 0, maximum: 10 }, size: { type: "string" } }, required: ["product_id", "quantity"] },
    { name: "apply_coupon", description: "Apply a coupon code to the cart.", schema: { code: { type: "string" } }, required: ["code"] },
    { name: "toggle_wishlist", description: "Add a product to the wishlist, or remove it if already there.", schema: { product_id: { type: "string" } }, required: ["product_id"] },
    { name: "navigate", description: "Open a screen: home, cart, wishlist, orders, address (choose/add delivery address), payment (choose payment + final review), or back.",
      schema: { screen: { type: "string", enum: ["home", "cart", "wishlist", "orders", "address", "payment", "back"] } }, required: ["screen"] },
    { name: "save_address", description: "Save a new delivery address and select it. Collect the fields by talking first; call only when you have them all. Returns missing fields if any.",
      schema: { name: { type: "string" }, phone: { type: "string", description: "10 digit mobile number" }, house: { type: "string", description: "House/flat number, street" },
        area: { type: "string", description: "Locality / colony / village" }, city: { type: "string" }, state: { type: "string" }, pincode: { type: "string", description: "6 digits" }, landmark: { type: "string" } },
      required: ["name", "phone", "house", "area", "city", "state", "pincode"] },
    { name: "select_address", description: "Choose one of the saved addresses for delivery.", schema: { address_id: { type: "string" } }, required: ["address_id"] },
    { name: "select_payment", description: "Choose the payment method. For UPI pass the UPI ID the user spoke (e.g. 'sunita@okicici').",
      schema: { method: { type: "string", enum: ["upi", "cod", "card", "netbanking"] }, upi_id: { type: "string" } }, required: ["method"] },
    { name: "place_order", description: "Place the order. First call with confirmed=false to get the final summary and any blockers, read it out (items, total, address, payment), ask for a clear yes, and only then call with confirmed=true.",
      schema: { confirmed: { type: "boolean", description: "true only after the user explicitly said yes to the read-out summary in their latest message" } }, required: ["confirmed"] },
    { name: "order_action", description: "Track, cancel or request a return for an existing order. Track opens the order's tracking page.",
      schema: { order_id: { type: "string" }, action: { type: "string", enum: ["track", "cancel", "return"] } }, required: ["order_id", "action"] },
    { name: "remember_about_user", description: "Save a durable fact about the user for future conversations: name, sizes, preferences, family members, upcoming occasions, budget. One short Hindi sentence, e.g. 'नाम: सुनीता' or 'कुर्ती का साइज़ L पहनती हैं'.",
      schema: { fact: { type: "string" } }, required: ["fact"] },
  ];

  const brief = (p, n) => ({ n, product_id: p.id, name: p.name, price: p.price, mrp: p.mrp, off_pct: Math.round((1 - p.price / p.mrp) * 100), rating: p.rating, colors: p.colors, sizes: p.sizes });
  const details = (p) => ({ product_id: p.id, name: p.name, english_name: p.en, category: Store.catName(p.cat), price: p.price, mrp: p.mrp, rating: p.rating, rating_count: p.ratings,
    sizes: p.sizes, colors: p.colors, material: p.material, description: p.desc, highlights: p.highlights, seller: p.seller,
    delivery_by: Store.fmtDate(Date.now() + p.deliveryDays * 86400000), return_policy: p.returnDays ? p.returnDays + " दिन में आसान रिटर्न" : "रिटर्न नहीं होता",
    free_delivery: "299 रुपये से ऊपर के ऑर्डर पर फ़्री डिलीवरी" });

  function runTool(name, a) {
    a = a || {};
    switch (name) {
      case "search_products": {
        const found = Store.runSearch(a);
        return { ok: true, total_found: found.length, showing_on_screen: found.slice(0, 10).map((p, i) => brief(p, i + 1)),
          note: found.length ? undefined : "कुछ नहीं मिला — फ़िल्टर ढीले करके या दूसरे शब्द से फिर ढूंढें" };
      }
      case "open_product": {
        const r = Store.viewProduct(a.product_id);
        return r.ok ? { ok: true, now_showing: details(r.product), similar: Store.similar(a.product_id).map((p) => brief(p)) } : r;
      }
      case "get_product_details":
        return { ok: true, products: (a.product_ids || []).map(Store.byId).filter(Boolean).map(details) };
      case "compare_products": {
        const ids = (a.product_ids || []).filter((id) => Store.byId(id)).slice(0, 3);
        if (ids.length < 2) return { ok: false, error: "तुलना के लिए कम से कम 2 प्रोडक्ट चाहिए" };
        S().compare = ids; Store.go("compare", { ids: ids.join(",") });
        return { ok: true, comparing: ids.map((id) => details(Store.byId(id))) };
      }
      case "add_to_cart": return Store.addToCart(a.product_id, a.quantity, a.size, a.color);
      case "update_cart_item": return Store.setQty(a.product_id, a.quantity, a.size);
      case "apply_coupon": return Store.applyCoupon(a.code);
      case "toggle_wishlist": return Store.toggleWishlist(a.product_id);
      case "navigate": {
        if (a.screen === "back") return Store.goBack();
        Store.go(a.screen);
        const out = { ok: true, screen: a.screen };
        if (a.screen === "cart") out.cart = Store.cartSummary();
        if (a.screen === "address") out.saved_addresses = S().addresses.map((x) => ({ address_id: x.id, name: x.name, address: Store.addressLine(x), selected: x.id === S().selectedAddressId }));
        if (a.screen === "payment") { out.cart = Store.cartSummary(); out.blockers = Store.checkoutBlockers(); }
        if (a.screen === "orders") out.orders = S().orders.slice(0, 6).map(Store.orderInfo);
        return out;
      }
      case "save_address": { const r = Store.saveAddress(a); if (r.ok && S().route.name !== "address") Store.go("address"); return r; }
      case "select_address": return Store.selectAddress(a.address_id);
      case "select_payment": { const r = Store.selectPayment(a.method, a.upi_id); if (S().route.name !== "payment") Store.go("payment"); return r; }
      case "place_order": {
        const blockers = Store.checkoutBlockers();
        if (!a.confirmed || blockers.length) {
          if (S().route.name !== "payment" && S().cart.length) Store.go("payment");
          const addr = Store.selectedAddress();
          return { ok: false, needs_confirmation: !blockers.length, blockers, summary: Store.cartSummary(),
            deliver_to: addr ? addr.name + ", " + Store.addressLine(addr) : null, payment: S().payment.method ? Store.PAY[S().payment.method] : null };
        }
        return Store.placeOrder();
      }
      case "order_action":
        if (a.action === "track") {
          const o = S().orders.find((x) => x.id.toLowerCase() === String(a.order_id).toLowerCase().replace(/\s+/g, ""));
          if (!o) return { ok: false, error: "यह ऑर्डर नहीं मिला", your_orders: S().orders.map((x) => x.id) };
          Store.go("order", { id: o.id });
          return { ok: true, order: Store.orderInfo(o) };
        }
        return Store.orderAction(a.order_id, a.action);
      case "remember_about_user": return Store.remember(a.fact);
    }
    return { ok: false, error: "unknown tool " + name };
  }

  const TOOL_LABEL = { search_products: "ढूंढ रही हूँ", open_product: "प्रोडक्ट खोल रही हूँ", get_product_details: "जानकारी देख रही हूँ", compare_products: "तुलना कर रही हूँ",
    add_to_cart: "कार्ट में डाल रही हूँ", update_cart_item: "कार्ट बदल रही हूँ", apply_coupon: "कूपन लगा रही हूँ", toggle_wishlist: "विशलिस्ट", navigate: "स्क्रीन बदल रही हूँ",
    save_address: "पता सेव कर रही हूँ", select_address: "पता चुन रही हूँ", select_payment: "पेमेंट चुन रही हूँ", place_order: "ऑर्डर", order_action: "ऑर्डर देख रही हूँ", remember_about_user: "याद रख रही हूँ" };

  // ---------------- prompts ----------------
  const catalogLines = PRODUCTS.map((p) => `${p.id} | ${Store.catName(p.cat)} | ${p.name} (${p.en}) | ₹${p.price} (MRP ₹${p.mrp}) | ★${p.rating} (${p.ratings}) | साइज़: ${p.sizes.join("/")} | रंग: ${p.colors.join("/")}`).join("\n");

  function systemPrompt(extra) {
    return `You are वाणी (Vaani), the voice of "वाणी शॉप", a voice-first shopping app for Indian users. The user talks to you only by voice, in Hindi (often Hinglish), and hears your replies through text-to-speech. You can see and operate the whole app through tools.

# How you talk
- Reply in natural, warm, everyday Hindi written in Devanagari. Common English shopping words are fine in Devanagari (साइज़, कलर, ऑर्डर, कार्ट, डिलीवरी). Speak as a woman (मैं दिखाती हूँ, मैंने ढूंढ लिया). Address the user with respect (आप, जी).
- Everything you write is spoken aloud. Keep each reply short: usually one to three spoken sentences. No markdown, lists, bullet points, emojis, URLs or product IDs in what you say. Say prices like "499 रुपये". Say 1-2 key facts, not everything; offer more if they want.
- You are a real companion, not a menu. Chat freely about anything the user brings up — their day, festivals, what suits an occasion, gift ideas, family, cooking, styling, even things unrelated to shopping. Be curious and personal, remember what they told you, and let the conversation breathe. Bring shopping back in only where it fits naturally, never pushy.
- End most turns with a light, specific question or suggestion that moves things forward ("लाल वाली दिखाऊँ या मैरून?"), but not every single time.
- Speech recognition makes mistakes. Read the transcript generously, guess the most likely meaning from context and the screen, and only ask to repeat when you truly can't tell. Numbers and names may be mis-heard: confirm phone numbers, pincodes and UPI IDs by reading them back.

# How you act
- Drive the screen with tools — don't just describe. If they want to see something, call search_products so it appears. If they pick one, open_product. Refer to items on screen by their position ("दूसरी वाली साड़ी").
- Each user message begins with a [ऐप की स्थिति] block: the live state of the screen, cart, address, payment, orders and what they recently tapped. Trust it over your memory of earlier turns; the user may have tapped around between turns.
- Only state product facts, prices, delivery dates and order statuses that come from the catalog, the state block or tool results. Never invent products or offers.
- Size: never add a multi-size item to the cart without a size the user chose. If you know their usual size from memory, suggest it and confirm.
- Checkout: cart → address → payment → confirm. Collect an address conversationally, a couple of fields at a time (name, 10-digit mobile, house/street, area, city, state, 6-digit pincode, optional landmark). If a saved address exists, offer it first.
- Payment: offer UPI or cash on delivery. Card and net banking are demo-only here — never ask for card numbers, CVV, OTP or PINs by voice.
- Placing an order is irreversible: call place_order with confirmed=false, read back the items, total, address city and payment method, ask for a clear हाँ, and call it with confirmed=true only when their latest message says yes.
- Use remember_about_user when you learn something worth keeping (name as "नाम: …", sizes, preferences, occasions, family). Use these memories naturally later.
- Coupons you may mention when relevant: ${Object.values(COUPONS).map((c) => c.code + " — " + c.desc).join("; ")}. Delivery is free above 299 रुपये, otherwise 40 रुपये.
- Be honest when something isn't available in this store and suggest the closest thing we have.
- Stay kind and respectful. Decline anything harmful briefly and steer back.

# Catalog (id | category | name | price | rating | sizes | colours)
${catalogLines}
${extra ? "\n# Extra instructions from the app owner\n" + extra : ""}`;
  }

  let taps = [];
  function noteTap(desc) { taps.push(desc); if (taps.length > 8) taps.shift(); }

  function snapshot() {
    const st = S();
    const L = [];
    L.push("[ऐप की स्थिति]");
    L.push("समय: " + new Date().toLocaleString("hi-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }));
    const r = st.route;
    if (r.name === "home") L.push("स्क्रीन: होम पेज (कैटेगरी और 'आपके लिए' प्रोडक्ट)");
    if (r.name === "results") {
      const ids = st.results.ids;
      L.push(`स्क्रीन: सर्च रिज़ल्ट — "${st.results.query}" ${JSON.stringify(st.results.filters)} — ${ids.length} प्रोडक्ट`);
      ids.slice(0, 10).forEach((id, i) => { const p = Store.byId(id); L.push(`  ${i + 1}. ${p.id} ${p.name} ₹${p.price} ★${p.rating} रंग:${p.colors.join("/")}`); });
    }
    if (r.name === "product") {
      const p = Store.byId(r.params.id);
      if (p) L.push(`स्क्रीन: प्रोडक्ट पेज — ${p.id} ${p.name}, ₹${p.price} (MRP ₹${p.mrp}), ★${p.rating}, साइज़ ${p.sizes.join("/")}, रंग ${p.colors.join("/")}, ${p.material}, डिलीवरी ${Store.fmtDate(Date.now() + p.deliveryDays * 86400000)} तक`);
    }
    if (r.name === "compare") L.push("स्क्रीन: तुलना — " + (st.compare || []).map((id) => id + " " + Store.byId(id).name).join(" बनाम "));
    if (r.name === "cart") L.push("स्क्रीन: कार्ट");
    if (r.name === "wishlist") L.push("स्क्रीन: विशलिस्ट — " + (st.wishlist.map((id) => id + " " + Store.byId(id).name).join(", ") || "खाली"));
    if (r.name === "address") L.push("स्क्रीन: डिलीवरी पता चुनें / नया पता जोड़ें");
    if (r.name === "payment") L.push("स्क्रीन: पेमेंट और ऑर्डर का आख़िरी रिव्यू");
    if (r.name === "success") L.push("स्क्रीन: ऑर्डर सफल — " + r.params.id);
    if (r.name === "orders") L.push("स्क्रीन: मेरे ऑर्डर");
    if (r.name === "order") { const o = st.orders.find((x) => x.id === r.params.id); if (o) L.push("स्क्रीन: ऑर्डर ट्रैकिंग — " + JSON.stringify(Store.orderInfo(o))); }

    const c = Store.cartSummary();
    L.push(c.items.length ? `कार्ट: ${c.items.map((i) => `${i.product_id} ${i.name} साइज़ ${i.size} ×${i.qty}`).join("; ")} | कुल ₹${c.total}${c.coupon ? " (कूपन " + c.coupon + ")" : ""}` : "कार्ट: खाली");
    const a = Store.selectedAddress();
    L.push("सेव पते: " + (st.addresses.map((x) => `${x.id}${x.id === st.selectedAddressId ? "(चुना हुआ)" : ""} ${x.name}, ${x.area}, ${x.city} ${x.pincode}`).join("; ") || "कोई नहीं"));
    L.push("पेमेंट: " + (st.payment.method ? Store.PAY[st.payment.method] + (st.payment.method === "upi" && st.payment.upiId ? " " + st.payment.upiId : "") : "नहीं चुना"));
    if (c.items.length) L.push("चेकआउट में बाक़ी: " + (Store.checkoutBlockers().join(", ") || "कुछ नहीं — ऑर्डर हो सकता है"));
    L.push("हाल के ऑर्डर: " + st.orders.slice(0, 3).map((o) => { const i = Store.orderInfo(o); return `${o.id} ${i.items.map((x) => x.name).join("+")} — ${i.status_hindi}`; }).join("; "));
    if (st.wishlist.length && r.name !== "wishlist") L.push("विशलिस्ट: " + st.wishlist.slice(0, 5).map((id) => Store.byId(id).name).join(", "));
    if (st.recent.length) L.push("हाल में देखे: " + st.recent.slice(0, 5).map((id) => id + " " + Store.byId(id).name).join(", "));
    L.push("यूज़र के बारे में याद: " + (st.memory.join("; ") || "अभी कुछ नहीं"));
    if (taps.length) L.push("पिछली बात के बाद यूज़र ने स्क्रीन पर टैप करके: " + taps.join("; "));
    return L.join("\n");
  }

  // ---------------- SSE ----------------
  async function* sse(resp, signal) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      if (signal && signal.aborted) { reader.cancel(); throw new DOMException("aborted", "AbortError"); }
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
        const data = chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (data) yield data;
      }
    }
  }

  async function httpError(r) {
    let t = "";
    try { t = await r.text(); } catch (e) {}
    let msg = t;
    try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) {}
    const e = new Error(`API ${r.status}: ${String(msg).slice(0, 300)}`);
    e.status = r.status;
    return e;
  }

  // ---------------- Anthropic (Claude) ----------------
  const anthropic = {
    init(cfg) { return { system: systemPrompt(cfg.persona), messages: [] }; },
    addUser(conv, text, preface) { conv.messages.push({ role: "user", content: [preface && { type: "text", text: preface }, { type: "text", text: snapshot() }, { type: "text", text: "यूज़र: " + text }].filter(Boolean) }); },
    async step(conv, cfg, onText, signal) {
      const model = cfg.model || "claude-opus-5-5";
      const base = (cfg.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
      const body = {
        model, max_tokens: 4096, stream: true,
        system: [{ type: "text", text: conv.system, cache_control: { type: "ephemeral" } }],
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: { type: "object", properties: t.schema, required: t.required } })),
        messages: conv.messages,
      };
      const headers = { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
      if (!/haiku/.test(model)) body.output_config = { effort: cfg.effort || "low" };
      // Server-side refusal fallback: if a safety classifier declines, the API retries on a fallback model.
      if (/^claude-(opus-5-5|sonnet-5-5)/.test(model) && /api\.anthropic\.com/.test(base)) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; }

      const r = await fetch(base + "/v1/messages", { method: "POST", headers, body: JSON.stringify(body), signal });
      if (!r.ok) throw await httpError(r);
      const blocks = [];
      let stop = null;
      for await (const data of sse(r, signal)) {
        let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
        if (ev.type === "content_block_start") {
          const b = Object.assign({}, ev.content_block);
          if (b.type === "tool_use") { b._json = ""; }
          blocks[ev.index] = b;
        } else if (ev.type === "content_block_delta") {
          const b = blocks[ev.index], d = ev.delta;
          if (!b) continue;
          if (d.type === "text_delta") { b.text = (b.text || "") + d.text; onText(d.text); }
          else if (d.type === "input_json_delta") b._json += d.partial_json;
          else if (d.type === "thinking_delta") b.thinking = (b.thinking || "") + d.thinking;
          else if (d.type === "signature_delta") b.signature = d.signature;
        } else if (ev.type === "content_block_stop") {
          const b = blocks[ev.index];
          if (b && b.type === "tool_use") { try { b.input = b._json ? JSON.parse(b._json) : {}; } catch (e) { b.input = {}; b._bad = true; } delete b._json; }
          if (b && b.type === "text") onText("\n");
        } else if (ev.type === "message_delta") {
          if (ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
        } else if (ev.type === "error") {
          throw new Error("API: " + ((ev.error && ev.error.message) || "stream error"));
        }
      }
      if (signal && signal.aborted) throw new DOMException("aborted", "AbortError");
      const content = blocks.filter(Boolean).map((b) => { const c = Object.assign({}, b); delete c._bad; return c; });
      // Append the assistant turn exactly as received (thinking blocks included).
      conv.messages.push({ role: "assistant", content });
      const calls = content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input, bad: blocks.find((x) => x && x.id === b.id)._bad }));
      return { stop: stop === "tool_use" && calls.length ? "tool_use" : stop, calls };
    },
    addResults(conv, results) {
      conv.messages.push({ role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.output), is_error: r.output && r.output.ok === false && !!r.output.error && r.output.error !== "size_required" ? true : undefined })) });
    },
    patchInterrupted(conv) {
      const last = conv.messages[conv.messages.length - 1];
      if (!last) return;
      if (last.role === "user") conv.messages.push({ role: "assistant", content: [{ type: "text", text: "(यूज़र ने बीच में टोक दिया)" }] });
      else if (last.role === "assistant") {
        const open = last.content.filter((b) => b.type === "tool_use");
        if (open.length) {
          conv.messages.push({ role: "user", content: open.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "यूज़र ने बीच में टोक दिया", is_error: true })) });
          conv.messages.push({ role: "assistant", content: [{ type: "text", text: "(रुक गई)" }] });
        }
      }
    },
    size(conv) { return conv.messages.length; },
  };

  // ---------------- OpenAI-compatible (OpenAI, Gemini, Groq, OpenRouter, Sarvam, local…) ----------------
  const openai = {
    init(cfg) { return { messages: [{ role: "system", content: systemPrompt(cfg.persona) }] }; },
    addUser(conv, text, preface) { conv.messages.push({ role: "user", content: (preface ? preface + "\n\n" : "") + snapshot() + "\n\nयूज़र: " + text }); },
    async step(conv, cfg, onText, signal) {
      const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const body = { model: cfg.model, stream: true, messages: conv.messages,
        tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", properties: t.schema, required: t.required } } })) };
      const headers = { "Content-Type": "application/json", Authorization: "Bearer " + cfg.apiKey };
      if (/openrouter/.test(base)) { headers["HTTP-Referer"] = location.origin; headers["X-Title"] = "Vaani Shop"; }
      const r = await fetch(base + "/chat/completions", { method: "POST", headers, body: JSON.stringify(body), signal });
      if (!r.ok) throw await httpError(r);
      let text = "", finish = null;
      const tcs = [];
      for await (const data of sse(r, signal)) {
        if (data === "[DONE]") break;
        let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
        if (ev.error) throw new Error("API: " + (ev.error.message || JSON.stringify(ev.error)));
        const ch = ev.choices && ev.choices[0];
        if (!ch) continue;
        const d = ch.delta || {};
        if (d.content) { text += d.content; onText(d.content); }
        (d.tool_calls || []).forEach((tc, k) => {
          let idx = tc.index;
          if (idx == null) { const f = tc.id ? tcs.findIndex((x) => x && x.id === tc.id) : -1; idx = f >= 0 ? f : tcs.length + k; }
          const cur = tcs[idx] || (tcs[idx] = { id: "", name: "", args: "" });
          if (tc.id) cur.id = tc.id;
          if (tc.function && tc.function.name) cur.name = tc.function.name;
          if (tc.function && tc.function.arguments) cur.args += tc.function.arguments;
        });
        if (ch.finish_reason) finish = ch.finish_reason;
      }
      if (signal && signal.aborted) throw new DOMException("aborted", "AbortError");
      onText("\n");
      const calls = tcs.filter(Boolean).map((t, i) => { let input = {}, bad = false; try { input = t.args ? JSON.parse(t.args) : {}; } catch (e) { bad = true; } return { id: t.id || "call_" + i + "_" + Date.now(), name: t.name, input, bad }; });
      const msg = { role: "assistant", content: text || null };
      if (calls.length) msg.tool_calls = calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } }));
      conv.messages.push(msg);
      return { stop: calls.length ? "tool_use" : finish, calls };
    },
    addResults(conv, results) { results.forEach((r) => conv.messages.push({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.output) })); },
    patchInterrupted(conv) {
      const last = conv.messages[conv.messages.length - 1];
      if (last.role === "user" || last.role === "tool") conv.messages.push({ role: "assistant", content: "(यूज़र ने बीच में टोक दिया)" });
      else if (last.role === "assistant" && last.tool_calls) {
        last.tool_calls.forEach((tc) => conv.messages.push({ role: "tool", tool_call_id: tc.id, content: "यूज़र ने बीच में टोक दिया" }));
        conv.messages.push({ role: "assistant", content: "(रुक गई)" });
      }
    },
    size(conv) { return conv.messages.length; },
  };

  // ---------------- offline fallback ----------------
  const ORD = { "पहला": 1, "पहली": 1, "पहले": 1, "first": 1, "एक": 1, "दूसरा": 2, "दूसरी": 2, "दूसरे": 2, "second": 2, "दो": 2, "तीसरा": 3, "तीसरी": 3, "तीसरे": 3, "तीन": 3, "चौथा": 4, "चौथी": 4, "चार": 4, "पांचवां": 5, "पाँचवीं": 5, "पांचवी": 5, "पांच": 5 };
  function localTurn(text) {
    const t = text.toLowerCase().trim();
    const st = S();
    const r = st.route;
    const has = (re) => re.test(t);
    const num = (t.match(/(\d{2,6})/) || [])[1];
    const nth = (() => { const m = t.match(/(?:नंबर|number|no\.?)\s*(\d)/); if (m) return +m[1]; for (const w in ORD) if (t.includes(w)) return ORD[w]; const d = t.match(/\b(\d)\b/); return d ? +d[1] : null; })();
    const SIZES = ["xxl", "xl", "s", "m", "l", "मीडियम", "लार्ज", "स्मॉल", "एक्सएल"];
    const sizeWord = (() => { for (const s of SIZES) if (new RegExp("(^|\\s)" + s + "($|\\s)", "i").test(t)) return s; const m = t.match(/साइज़?\s*(\S+)/); return m ? m[1] : null; })();

    if (has(/^(नमस्ते|नमस्कार|हेलो|हैलो|hello|hi|हाय)/)) return "नमस्ते जी! मैं वाणी हूँ। बताइए आज क्या ढूंढूँ — साड़ी, कुर्ती, किचन का सामान या कुछ और?";
    if (has(/वापस|पीछे|back/)) { Store.goBack(); return "ठीक है, वापस आ गए।"; }
    if (has(/होम|मुख्य पेज|home/)) { Store.go("home"); return "होम पेज पर आ गए।"; }
    if (has(/(ऑर्डर|order).*(कहाँ|कहां|ट्रैक|स्टेटस|दिखा|मेरे)|मेरे ऑर्डर/)) {
      Store.go("orders"); const o = st.orders[0];
      return o ? `आपका सबसे नया ऑर्डर ${Store.orderInfo(o).items[0].name} का है, जो ${Store.orderInfo(o).status_hindi}।` : "अभी कोई ऑर्डर नहीं है।";
    }
    if (has(/विशलिस्ट|wishlist|पसंद/)) { Store.go("wishlist"); return st.wishlist.length ? "ये रही आपकी विशलिस्ट।" : "विशलिस्ट अभी खाली है।"; }
    if (r.name === "payment" && has(/^(हाँ|हां|हा|जी|yes|ok|ठीक है|कर दो|ऑर्डर कर)/)) {
      const res = Store.placeOrder();
      return res.ok ? `बधाई हो! आपका ऑर्डर ${res.order.order_id} हो गया। ${res.order.expected_delivery} तक पहुँच जाएगा।` : "ऑर्डर से पहले ये बाक़ी है: " + res.blockers.join(", ") + "।";
    }
    if (has(/upi|यूपीआई/)) { const id = (text.match(/[\w.-]+@[a-z]+/i) || [])[0]; Store.selectPayment("upi", id || ""); return id ? `UPI ${id} चुन लिया। ऑर्डर कर दूँ? हाँ बोलिए।` : "UPI चुना। अपनी UPI ID स्क्रीन पर लिख दीजिए, या कैश ऑन डिलीवरी बोलिए।"; }
    if (has(/कैश|cod|सीओडी|नकद/)) { Store.selectPayment("cod"); const tot = Store.totals().total; return `कैश ऑन डिलीवरी चुन लिया। कुल ${tot} रुपये। ऑर्डर कर दूँ? हाँ बोलिए।`; }
    if (has(/पेमेंट|payment|भुगतान/)) { Store.go("payment"); return "UPI से देंगे या कैश ऑन डिलीवरी?"; }
    if (has(/पता|एड्रेस|address/)) { Store.go("address"); return "डिलीवरी का पता चुनिए या नया जोड़िए।"; }
    if (has(/(चेकआउट|checkout|आगे बढ़|खरीद|buy)/) && st.cart.length) { Store.go("address"); const a = Store.selectedAddress(); return a ? `${a.name} जी के ${a.city} वाले पते पर भेजूँ? फिर पेमेंट बोलिए।` : "पहले डिलीवरी का पता जोड़िए।"; }
    if (has(/(कार्ट|cart|बैग|टोकरी)/) && !has(/डाल|ऐड|add|जोड़/)) { Store.go("cart"); const c = Store.cartSummary(); return c.items.length ? `कार्ट में ${c.item_count} सामान है, कुल ${c.total} रुपये। आगे बढ़ें?` : "कार्ट अभी खाली है। कुछ ढूंढूँ?"; }
    if (has(/(डाल|ऐड|add|जोड़)/)) {
      const pid = r.name === "product" ? r.params.id : (r.name === "results" && nth ? st.results.ids[nth - 1] : null);
      if (!pid) return "कौन सा प्रोडक्ट डालूँ? पहले उसे खोलिए।";
      const res = Store.addToCart(pid, 1, sizeWord);
      if (!res.ok && res.error === "size_required") return `कौन सा साइज़? ${res.available_sizes.join(", ")} में मिलता है।`;
      return res.ok ? `${res.added}, साइज़ ${res.size}, कार्ट में डाल दिया। और कुछ देखें या चेकआउट करें?` : res.error;
    }
    if (sizeWord && r.name === "product") { const res = Store.addToCart(r.params.id, 1, sizeWord); if (res.ok) return `साइज़ ${res.size} में कार्ट में डाल दिया।`; }
    if (nth && r.name === "results" && st.results.ids[nth - 1] && has(/खोल|दिखा|देख|वाला|वाली|नंबर|open/)) {
      const p = Store.byId(st.results.ids[nth - 1]); Store.viewProduct(p.id);
      return `${p.name}, ${p.price} रुपये, रेटिंग ${p.rating}। ${p.highlights[0]}। कार्ट में डालूँ?`;
    }
    const opts = { query: text };
    const under = t.match(/(\d{2,6})\s*(रुपये|रुपए|rs|₹)?\s*(से|के)?\s*(कम|नीचे|अंदर|तक|under|below)/) || t.match(/(under|below)\s*(\d{2,6})/);
    if (under) opts.max_price = +(under[1].match(/\d/) ? under[1] : under[2]);
    else if (num && has(/कम|नीचे|अंदर|तक|बजट/)) opts.max_price = +num;
    if (has(/सस्त/)) opts.sort = "price_low";
    if (has(/बढ़िया|अच्छी रेटिंग|best|बेस्ट/)) opts.sort = "rating";
    const found = Store.search(opts);
    if (found.length) {
      Store.runSearch(opts);
      return `${found.length} चीज़ें मिलीं। पहली है ${found[0].name}, ${found[0].price} रुपये में। कोई नंबर बोलिए, मैं खोल दूँगी।`;
    }
    return "माफ़ कीजिए, समझ नहीं पाई। जैसे बोलिए: पाँच सौ से कम की कुर्ती दिखाओ। पूरी बातचीत के लिए सेटिंग में किसी मॉडल की API key डालिए।";
  }

  // ---------------- turn runner ----------------
  let conv = null, convKey = "";
  let abortCtl = null;
  let current = 0; // id of the turn that owns the conversation right now
  const log = []; // {role:'user'|'assistant'|'tool'|'error', text}

  function providerFor(cfg) { return cfg.provider === "anthropic" ? anthropic : openai; }
  function ensureConv(cfg) {
    const key = [cfg.provider, cfg.model, cfg.baseUrl, cfg.persona].join("|");
    const P = providerFor(cfg);
    // Long sessions: start a fresh thread seeded with a plain-text recap rather than
    // trimming old turns in place (old turns carry model-bound thinking blocks).
    if (!conv || key !== convKey || P.size(conv) > 120) {
      const recap = log.filter((l) => l.role === "user" || l.role === "assistant").slice(-16).map((l) => (l.role === "user" ? "यूज़र: " : "वाणी: ") + l.text).join("\n");
      conv = P.init(cfg); convKey = key;
      if (recap) conv.recap = "[अब तक की बातचीत का सार]\n" + recap;
    }
    return P;
  }

  async function turn(text, cfg, hooks) {
    hooks = hooks || {};
    const live = cfg.provider !== "offline" && cfg.apiKey && (cfg.provider === "anthropic" || cfg.model);
    // A new turn while one is in flight (barge-in): cancel it and close off its
    // half-finished exchange now, so history stays a valid user/assistant sequence.
    const me = ++current;
    if (abortCtl) { abortCtl.abort(); abortCtl = null; if (conv) providerFor(cfg).patchInterrupted(conv); }
    const P = live ? ensureConv(cfg) : null; // before logging, so a recap never repeats this message
    log.push({ role: "user", text });
    if (!live) {
      const reply = localTurn(text);
      taps = [];
      hooks.onText && hooks.onText(reply);
      hooks.onSentence && hooks.onSentence(reply);
      log.push({ role: "assistant", text: reply });
      return reply;
    }
    abortCtl = new AbortController();
    const signal = abortCtl.signal;
    P.addUser(conv, text, conv.recap);
    conv.recap = null;
    taps = [];
    let spoken = "";
    const splitter = new Voice.SentenceSplitter((s) => hooks.onSentence && hooks.onSentence(s));
    try {
      for (let i = 0; i < 8; i++) {
        const res = await P.step(conv, cfg, (d) => { spoken += d; splitter.push(d); hooks.onText && hooks.onText(spoken.trim()); }, signal);
        if (me !== current) return null;
        splitter.flush();
        if (res.stop === "refusal") {
          const msg = "माफ़ कीजिए, इस बारे में मैं मदद नहीं कर पाऊँगी। शॉपिंग में कुछ और देखें?";
          hooks.onSentence && hooks.onSentence(msg); spoken += msg;
          break;
        }
        if (res.stop !== "tool_use") break;
        const results = res.calls.map((c) => {
          hooks.onTool && hooks.onTool(c.name, TOOL_LABEL[c.name] || c.name, c.input);
          let output;
          try { output = c.bad ? { ok: false, error: "tool input was not valid JSON — try again" } : runTool(c.name, c.input); }
          catch (e) { output = { ok: false, error: String(e.message || e) }; }
          log.push({ role: "tool", text: `${c.name}(${JSON.stringify(c.input)}) → ${output.ok === false ? "✗ " + (output.error || "") : "✓"}` });
          return { id: c.id, output };
        });
        P.addResults(conv, results);
        if (signal.aborted) { P.patchInterrupted(conv); break; }
      }
    } catch (e) {
      if (me !== current) return null; // a newer turn already cleaned up
      P.patchInterrupted(conv);
      if (e.name === "AbortError") { log.push({ role: "assistant", text: spoken.trim() + " …" }); return null; }
      log.push({ role: "error", text: e.message });
      throw e;
    } finally { if (abortCtl && abortCtl.signal === signal) abortCtl = null; }
    const reply = spoken.trim();
    log.push({ role: "assistant", text: reply });
    return reply;
  }

  function abort() { if (abortCtl) abortCtl.abort(); }
  function resetConversation() { conv = null; log.length = 0; }

  function greeting() {
    const nameFact = S().memory.find((m) => /^नाम\s*[:：]/.test(m));
    const name = nameFact ? nameFact.split(/[:：]/)[1].trim() + " जी" : "जी";
    const hour = new Date().getHours();
    const hello = hour < 12 ? "सुप्रभात" : hour < 17 ? "नमस्ते" : "शुभ संध्या";
    const c = S().cart.length;
    if (c) return `${hello} ${name}! मैं वाणी। आपके कार्ट में ${c} चीज़ें रखी हैं। उन्हें ऑर्डर करें, या पहले कुछ और देखें?`;
    return `${hello} ${name}! मैं वाणी हूँ, आपकी शॉपिंग सहेली। बोलिए, आज क्या ढूंढें — या बस गपशप करें?`;
  }

  window.Brain = { turn, abort, resetConversation, greeting, noteTap, snapshot, runTool, TOOLS, log, systemPrompt };
})();
