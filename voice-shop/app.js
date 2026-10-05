// Glue: rendering, taps, settings and the voice conversation loop.
//
// Loop: tap the orb → listen (Hindi ASR) → Brain.turn streams the reply →
// each finished sentence goes to TTS while the model keeps writing → when
// speech ends, hands-free mode listens again. Tapping the orb at any point
// interrupts (barge-in): speech stops, the in-flight request is cancelled,
// and the mic opens.
(function () {
  const CFG_KEY = "vaani-shop-cfg-v1";
  const PRESETS = {
    offline: { label: "बिना API (डेमो नियम)", base: "", models: [] },
    anthropic: { label: "Anthropic Claude", base: "https://api.anthropic.com", models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"] },
    openai: { label: "OpenAI", base: "https://api.openai.com/v1", models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"] },
    gemini: { label: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
    groq: { label: "Groq", base: "https://api.groq.com/openai/v1", models: ["llama-3.3-70b-versatile"] },
    openrouter: { label: "OpenRouter", base: "https://openrouter.ai/api/v1", models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1-mini", "google/gemini-2.5-flash"] },
    custom: { label: "कोई भी OpenAI-compatible API", base: "", models: [] },
  };
  const DEFAULTS = {
    provider: "offline", keys: {}, models: {}, bases: {}, effort: "low", persona: "",
    asr: "browser", tts: "browser", sarvamKey: "", openaiAudioKey: "", openaiAudioBase: "https://api.openai.com/v1",
    asrModel: "", ttsModel: "", ttsVoice: "", rate: 1, handsFree: true,
  };
  let cfg = Object.assign({}, DEFAULTS);
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || "{}")); } catch (e) {}
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };

  function brainCfg() {
    const p = cfg.provider;
    return Object.assign({}, cfg, {
      apiKey: cfg.keys[p] || "",
      model: cfg.models[p] || (PRESETS[p] && PRESETS[p].models[0]) || "",
      baseUrl: cfg.bases[p] || (PRESETS[p] && PRESETS[p].base) || "",
    });
  }

  const $ = (s, el) => (el || document).querySelector(s);
  const view = $("#view");
  const App = { pdpSize: {}, addrDraft: {} };
  window.App = App;

  // ---------------- rendering ----------------
  let lastRouteKey = "";
  function render() {
    const st = Store.state;
    const key = st.route.name + JSON.stringify(st.route.params);
    const scroll = view.scrollTop;
    view.innerHTML = UI.render(st.route);
    view.scrollTop = key === lastRouteKey ? scroll : 0;
    lastRouteKey = key;
    const count = st.cart.reduce((a, l) => a + l.qty, 0);
    document.querySelectorAll("[data-cart-count]").forEach((b) => { b.textContent = count; b.hidden = !count; });
    document.querySelectorAll(".nav [data-act=nav]").forEach((b) => b.classList.toggle("on", b.dataset.id === st.route.name || (b.dataset.id === "orders" && st.route.name === "order")));
    $("#back").hidden = st.route.name === "home";
  }
  Store.on(render);

  // ---------------- taps ----------------
  const tapNames = { home: "होम", cart: "कार्ट", wishlist: "विशलिस्ट", orders: "ऑर्डर", address: "पता", payment: "पेमेंट" };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    const p = id && Store.byId(id);
    switch (act) {
      case "open": if (e.target.closest(".heart")) return; Store.viewProduct(id); Brain.noteTap("प्रोडक्ट खोला " + id + " " + p.name); break;
      case "wish": e.stopPropagation(); Store.toggleWishlist(id); Brain.noteTap("विशलिस्ट बदली " + p.name); break;
      case "cat": Store.runSearch({ category: id }); Brain.noteTap("कैटेगरी खोली " + Store.catName(id)); break;
      case "sort": Store.runSearch(Object.assign({}, Store.state.results.filters, { query: Store.state.results.query, sort: id })); Brain.noteTap("सॉर्ट बदला " + id); break;
      case "size": App.pdpSize[id] = el.dataset.size; Brain.noteTap("साइज़ चुना " + el.dataset.size + " (" + p.name + ")"); render(); break;
      case "add":
      case "buy": {
        const size = p.sizes.length === 1 ? p.sizes[0] : App.pdpSize[id];
        if (!size) { toast("पहले साइज़ चुनिए"); document.querySelector(".sizes") && document.querySelector(".sizes").classList.add("shake"); break; }
        Store.addToCart(id, 1, size);
        Brain.noteTap((act === "buy" ? "अभी खरीदें दबाया " : "कार्ट में डाला ") + p.name + " साइज़ " + size);
        if (act === "buy") Store.go("address"); else toast("कार्ट में डाल दिया ✓");
        break;
      }
      case "qty": Store.setQty(id, +el.dataset.q, el.dataset.size); Brain.noteTap("कार्ट में मात्रा बदली " + p.name + " → " + el.dataset.q); break;
      case "coupon": { const r = Store.applyCoupon(id); toast(r.ok ? id + " लग गया ✓" : r.error); Brain.noteTap("कूपन " + id); break; }
      case "uncoupon": Store.state.coupon = null; Store.emit(); break;
      case "nav": Store.go(id); Brain.noteTap((tapNames[id] || id) + " खोला"); break;
      case "back": Store.goBack(); break;
      case "pickaddr": if (e.target.closest("[data-act=deladdr]")) return; Store.selectAddress(id); Brain.noteTap("पता चुना " + id); break;
      case "deladdr": e.preventDefault(); Store.deleteAddress(id); break;
      case "saveaddr": {
        document.querySelectorAll("[data-addr]").forEach((i) => (App.addrDraft[i.dataset.addr] = i.value));
        const r = Store.saveAddress(App.addrDraft);
        if (r.ok) { App.addrDraft = {}; toast("पता सेव हो गया ✓"); Brain.noteTap("नया पता सेव किया"); }
        else { const err = $("#addrErr"); if (err) err.textContent = (r.missing_fields.length ? "भरना बाक़ी: " + r.missing_fields.join(", ") + " " : "") + r.problems.join("; "); }
        break;
      }
      case "pay": if (e.target.closest("input.upi")) return; Store.selectPayment(id); Brain.noteTap("पेमेंट चुना " + Store.PAY[id]); break;
      case "place": { const r = Store.placeOrder(); if (!r.ok) toast(r.blockers.join(", ")); else Brain.noteTap("ऑर्डर प्लेस किया " + r.order.order_id); break; }
      case "track": Store.go("order", { id }); Brain.noteTap("ऑर्डर ट्रैकिंग खोली " + id); break;
      case "cancel": if (confirm("यह ऑर्डर कैंसल करें?")) { Store.orderAction(id, "cancel"); Brain.noteTap("ऑर्डर कैंसल किया " + id); } break;
      case "return": Store.orderAction(id, "return"); Brain.noteTap("रिटर्न माँगा " + id); break;
      case "say": handleUtterance(el.dataset.text); break;
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.dataset.addr) App.addrDraft[e.target.dataset.addr] = e.target.value;
    if (e.target.hasAttribute("data-upi")) Store.state.payment.upiId = e.target.value;
  });
  document.addEventListener("change", (e) => {
    if (e.target.hasAttribute("data-upi")) { const r = Store.selectPayment("upi", e.target.value); if (!r.ok) toast(r.error); }
  });
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#searchInput").value.trim();
    if (q) { Store.runSearch({ query: q }); Brain.noteTap("सर्च बॉक्स में लिखा: " + q); $("#searchInput").blur(); }
  });

  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------------- voice loop ----------------
  const speaker = new Voice.Speaker();
  const orb = $("#orb"), statusEl = $("#vstatus"), userCap = $("#capUser"), botCap = $("#capBot"), toolCap = $("#capTool");
  let phase = "idle";       // idle | listening | thinking
  let session = false;      // a hands-free conversation is running
  let greeted = false;
  let turnSeq = 0;
  let emptyListens = 0;

  function setPhase(p) { phase = p; paint(); }
  function paint() {
    const speaking = speaker.busy;
    const s = phase === "listening" ? "listening" : speaking ? "speaking" : phase === "thinking" ? "thinking" : "idle";
    orb.dataset.state = s;
    document.body.dataset.voice = s;
    statusEl.textContent = { idle: session ? "माइक दबाकर बोलिए" : "बात करने के लिए दबाइए", listening: "सुन रही हूँ…", thinking: "सोच रही हूँ…", speaking: "बोल रही हूँ… (टोकने के लिए दबाइए)" }[s];
    $("#endSession").hidden = !session;
  }
  speaker.onState = paint;
  speaker.onError = (e) => { console.warn(e); toast("आवाज़ की दिक़्क़त: " + String(e.message || e).slice(0, 80) + " — ब्राउज़र आवाज़ इस्तेमाल हो रही है"); };

  async function startListening() {
    speaker.stop();
    Brain.abort();
    const my = ++turnSeq;
    setPhase("listening");
    userCap.textContent = "…";
    let text = "";
    try {
      text = await Voice.listen(brainCfg(), { onInterim: (t) => { if (my === turnSeq) userCap.textContent = t; } });
    } catch (e) {
      if (my !== turnSeq) return;
      setPhase("idle"); session = false; paint();
      botCap.textContent = e.message;
      toast(e.message);
      return;
    }
    if (my !== turnSeq) return;
    if (!text) {
      emptyListens++;
      userCap.textContent = "";
      setPhase("idle");
      if (session && emptyListens < 2) { botCap.textContent = "मैं यहीं हूँ, जब चाहें बोलिए।"; }
      if (emptyListens >= 2) { session = false; paint(); }
      return;
    }
    emptyListens = 0;
    handleUtterance(text, my);
  }

  async function handleUtterance(text, my) {
    if (my == null) { speaker.stop(); Brain.abort(); my = ++turnSeq; }
    if (/^(बस|बाय|bye|अलविदा|ठीक है बस|बंद करो)\b/i.test(text.trim())) session = false;
    userCap.textContent = text;
    botCap.textContent = "";
    toolCap.textContent = "";
    setPhase("thinking");
    const c = brainCfg();
    try {
      await Brain.turn(text, c, {
        onText: (t) => { if (my === turnSeq) botCap.textContent = t; },
        onSentence: (s) => { if (my === turnSeq) speaker.say(s, c); },
        onTool: (name, label) => { if (my !== turnSeq) return; toolCap.textContent = "⚡ " + label; view.classList.remove("pulse"); void view.offsetWidth; view.classList.add("pulse"); },
      });
    } catch (e) {
      if (my !== turnSeq) return;
      const msg = e.status === 401 || e.status === 403 ? "API key सही नहीं लग रही। सेटिंग में जाँचिए।" : e.status === 429 ? "अभी बहुत सारे अनुरोध हो गए, थोड़ी देर में फिर कोशिश कीजिए।" : "माफ़ कीजिए, अभी मॉडल से जुड़ नहीं पा रही।";
      speaker.say(msg, c);
      botCap.textContent = msg;
      toolCap.textContent = "⚠ " + e.message;
      console.error(e);
    }
    if (my !== turnSeq) return;
    toolCap.textContent = toolCap.textContent.startsWith("⚠") ? toolCap.textContent : "";
    setPhase("idle");
    await speaker.drain();
    if (my !== turnSeq) return;
    if (session && cfg.handsFree) startListening();
    renderLog();
  }

  orb.addEventListener("click", () => {
    if (!greeted) {
      greeted = true; session = true;
      const g = Brain.greeting();
      botCap.textContent = g; userCap.textContent = "";
      const my = ++turnSeq;
      speaker.say(g, brainCfg());
      Brain.log.push({ role: "assistant", text: g });
      paint();
      speaker.drain().then(() => { if (my === turnSeq && session) startListening(); });
      return;
    }
    session = true;
    if (phase === "listening") { Voice.stopListening(); return; }
    startListening(); // also barge-in while speaking or thinking
  });
  $("#endSession").addEventListener("click", () => {
    session = false; turnSeq++; speaker.stop(); Brain.abort(); Voice.abortListening(); setPhase("idle");
  });
  $("#typeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const i = $("#typeInput"); const t = i.value.trim();
    if (!t) return;
    i.value = ""; greeted = true;
    Voice.abortListening();
    handleUtterance(t);
  });
  $("#kbd").addEventListener("click", () => { $("#typeForm").classList.toggle("open"); $("#typeInput").focus(); });
  $("#capbox").addEventListener("click", () => { renderLog(); $("#logSheet").showModal(); });

  function renderLog() {
    const box = $("#logBody");
    if (!box) return;
    box.innerHTML = Brain.log.map((l) => `<div class="msg ${l.role}">${UI.esc(l.text)}</div>`).join("") || '<p class="dim">अभी कोई बातचीत नहीं।</p>';
    box.scrollTop = box.scrollHeight;
  }

  // ---------------- settings ----------------
  const sheet = $("#settings");
  function fillSettings() {
    const f = sheet;
    f.provider.innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
    f.provider.value = cfg.provider;
    syncProvider();
    f.effort.value = cfg.effort; f.persona.value = cfg.persona;
    f.asr.value = cfg.asr; f.tts.value = cfg.tts; f.sarvamKey.value = cfg.sarvamKey; f.openaiAudioKey.value = cfg.openaiAudioKey; f.openaiAudioBase.value = cfg.openaiAudioBase;
    f.asrModel.value = cfg.asrModel; f.ttsModel.value = cfg.ttsModel; f.ttsVoice.value = cfg.ttsVoice; f.rate.value = cfg.rate; f.handsFree.checked = cfg.handsFree;
    syncVoice();
    $("#voiceInfo").textContent = `ब्राउज़र ASR: ${Voice.supported.browserASR ? "✓" : "✗ (Chrome में चलाएँ)"} · ब्राउज़र हिंदी आवाज़: ${Voice.hindiVoiceName() || "नहीं मिली — Sarvam/OpenAI TTS चुनें"}`;
  }
  function syncProvider() {
    const f = sheet, p = f.provider.value, pre = PRESETS[p];
    $("#llmFields").hidden = p === "offline";
    f.apiKey.value = cfg.keys[p] || "";
    f.baseUrl.value = cfg.bases[p] || pre.base;
    f.model.value = cfg.models[p] || pre.models[0] || "";
    $("#modelList").innerHTML = pre.models.map((m) => `<option value="${m}">`).join("");
    $("#effortRow").hidden = p !== "anthropic";
    $("#keyHint").innerHTML = { anthropic: 'console.anthropic.com से key लें। Opus सबसे समझदार है, Haiku सबसे तेज़।', openai: "platform.openai.com से key", gemini: "aistudio.google.com से key", groq: "console.groq.com से key — बहुत तेज़", openrouter: "openrouter.ai से key — कई मॉडल एक key से", custom: "कोई भी /chat/completions वाला API (जैसे Sarvam, Ollama, vLLM)" }[p] || "";
  }
  function syncVoice() {
    const f = sheet;
    const needSarvam = f.asr.value === "sarvam" || f.tts.value === "sarvam";
    const needOpenAI = f.asr.value === "openai" || f.tts.value === "openai";
    $("#sarvamRow").hidden = !needSarvam;
    $("#oaRow").hidden = !needOpenAI;
    f.ttsVoice.placeholder = f.tts.value === "sarvam" ? "priya, ritu, neha, kavya, aditya, rahul…" : f.tts.value === "openai" ? "coral, nova, shimmer, alloy…" : "—";
    f.ttsModel.placeholder = f.tts.value === "sarvam" ? "bulbul:v3" : f.tts.value === "openai" ? "gpt-4o-mini-tts" : "—";
    f.asrModel.placeholder = f.asr.value === "sarvam" ? "saaras:v4" : f.asr.value === "openai" ? "gpt-4o-transcribe" : "—";
  }
  sheet.provider.addEventListener("change", syncProvider);
  sheet.asr.addEventListener("change", syncVoice);
  sheet.tts.addEventListener("change", syncVoice);
  $("#openSettings").addEventListener("click", () => { fillSettings(); sheet.closest("dialog").showModal(); });
  sheet.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = sheet, p = f.provider.value;
    cfg.provider = p;
    if (p !== "offline") { cfg.keys[p] = f.apiKey.value.trim(); cfg.models[p] = f.model.value.trim(); cfg.bases[p] = f.baseUrl.value.trim(); }
    Object.assign(cfg, { effort: f.effort.value, persona: f.persona.value.trim(), asr: f.asr.value, tts: f.tts.value, sarvamKey: f.sarvamKey.value.trim(), openaiAudioKey: f.openaiAudioKey.value.trim(),
      openaiAudioBase: f.openaiAudioBase.value.trim() || DEFAULTS.openaiAudioBase, asrModel: f.asrModel.value.trim(), ttsModel: f.ttsModel.value.trim(), ttsVoice: f.ttsVoice.value.trim(), rate: +f.rate.value || 1, handsFree: f.handsFree.checked });
    saveCfg();
    paintBrainBadge();
    sheet.closest("dialog").close();
    toast("सेटिंग सेव हो गई ✓");
  });
  $("#testVoice").addEventListener("click", () => {
    const f = sheet;
    const c = Object.assign(brainCfg(), { tts: f.tts.value, sarvamKey: f.sarvamKey.value.trim(), openaiAudioKey: f.openaiAudioKey.value.trim(), ttsModel: f.ttsModel.value.trim(), ttsVoice: f.ttsVoice.value.trim(), rate: +f.rate.value || 1, openaiAudioBase: f.openaiAudioBase.value.trim() || DEFAULTS.openaiAudioBase });
    speaker.stop();
    speaker.say("नमस्ते! मैं वाणी हूँ। यह साड़ी सिर्फ़ ₹899 में है।", c);
  });
  $("#resetData").addEventListener("click", () => {
    if (!confirm("कार्ट, ऑर्डर, पते और याद की गई बातें — सब मिटा दें?")) return;
    Store.reset(); Brain.resetConversation(); toast("सब कुछ रीसेट हो गया");
  });
  $("#newChat").addEventListener("click", () => { Brain.resetConversation(); renderLog(); toast("नई बातचीत शुरू"); });
  document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  function paintBrainBadge() {
    const b = brainCfg();
    const live = b.provider !== "offline" && b.apiKey;
    $("#brainBadge").textContent = live ? (b.model || PRESETS[b.provider].label) : "डेमो मोड";
    $("#brainBadge").classList.toggle("live", !!live);
  }

  // Release the mic and speech when the tab is hidden.
  document.addEventListener("visibilitychange", () => { if (document.hidden) { session = false; turnSeq++; speaker.stop(); Brain.abort(); Voice.abortListening(); setPhase("idle"); } });

  render();
  paint();
  paintBrainBadge();
})();
