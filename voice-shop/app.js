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
    reflexes: true, duplex: false,
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
  let phase = "idle";        // idle | listening | waiting (patient listening) | thinking
  let session = false;       // a hands-free conversation is running
  let greeted = false;
  let turnSeq = 0;           // bumps whenever the floor changes hands; stale callbacks check it
  let silences = 0;          // empty listens in a row
  let holdStart = 0;         // when the user asked for time to think
  let lastBotEndAt = 0;      // when Vaani last finished speaking
  let speakerIdleSince = 0;
  // Things that happened that the model should hear about on the next turn.
  let pending = { interrupted: null, nods: [] };

  const isLive = (c) => c.provider !== "offline" && !!c.apiKey && (c.provider === "anthropic" || !!c.model);

  function setPhase(p) { phase = p; paint(); }
  function paint() {
    const speaking = speaker.busy;
    const s = phase === "listening" ? "listening" : phase === "waiting" ? "waiting" : speaking ? "speaking" : phase === "thinking" ? "thinking" : "idle";
    orb.dataset.state = s;
    document.body.dataset.voice = s;
    statusEl.textContent = {
      idle: session ? "माइक दबाकर बोलिए" : "बात करने के लिए दबाइए",
      listening: "सुन रही हूँ…",
      waiting: "आराम से सोचिए… मैं सुन रही हूँ",
      thinking: "सोच रही हूँ…",
      speaking: cfg.duplex ? "बोल रही हूँ… बीच में बोल सकते हैं" : "बोल रही हूँ… (टोकने के लिए दबाइए)",
    }[s];
    $("#endSession").hidden = !session;
  }
  speaker.onState = (busy) => { if (!busy) { speakerIdleSince = performance.now(); stopMonitor(); } paint(); };
  speaker.onStart = (item) => { if (item.kind === "reply") startMonitor(); };
  speaker.onError = (e) => { console.warn(e); toast("आवाज़ की दिक़्क़त: " + String(e.message || e).slice(0, 80) + " — ब्राउज़र आवाज़ इस्तेमाल हो रही है"); };

  // Say a short local line (acknowledgement, check-in…) and then optionally listen.
  function reflex(line, then) {
    const my = turnSeq;
    speaker.say(line, brainCfg(), "ack");
    botCap.textContent = line;
    Brain.log.push({ role: "ack", text: line });
    if (then) speaker.drain().then(() => { if (my === turnSeq) { lastBotEndAt = performance.now(); then(); } });
  }

  // The user takes the floor: stop talking, cancel the request, remember what they heard.
  function interrupt() {
    if (speaker.speakingReply || phase === "thinking") pending.interrupted = { heard: speaker.heard() };
    turnSeq++;
    speaker.stop(); Brain.abort(); stopMonitor();
  }

  // ---- duplex: hearing the user while Vaani speaks ----
  let mon = null, monSeen = new Set();
  function startMonitor() {
    if (mon || !cfg.duplex || !Voice.supported.browserASR || (cfg.asr && cfg.asr !== "browser") || !session) return;
    monSeen = new Set();
    mon = Voice.monitor(onOverlap);
  }
  function stopMonitor() { if (mon) { mon.stop(); mon = null; } }
  function onOverlap(key, text, isFinal) {
    if (monSeen.has(key)) return;
    const spoken = (speaker.current ? speaker.current.text + " " : "") + speaker.heard();
    const kind = Dynamics.duringSpeech(text, spoken);
    if (kind === "nod" && isFinal) {
      monSeen.add(key);
      pending.nods.push(text.trim());
      userCap.textContent = "(" + text.trim() + ")";
    } else if (kind === "stop") {
      monSeen.add(key);
      interrupt();
      userCap.textContent = text.trim();
      turnSeq++;
      reflex(Dynamics.stoppedLine(), () => listenTurn({ patient: true }));
    } else if (kind === "speech") {
      monSeen.add(key);
      interrupt();
      listenTurn({ prefix: text.trim() });
    }
  }

  // ---- listening ----
  async function listenTurn(opts) {
    opts = opts || {};
    stopMonitor(); speaker.stop(); Brain.abort();
    const my = ++turnSeq;
    setPhase(opts.patient ? "waiting" : "listening");
    userCap.textContent = opts.prefix || "…";
    let thinkMs = 0;
    let text = "";
    try {
      text = await Voice.listen(brainCfg(), {
        patient: opts.patient, prefix: opts.prefix,
        onInterim: (t) => { if (my === turnSeq) userCap.textContent = t; },
        onSpeechStart: (ms) => { thinkMs = lastBotEndAt ? performance.now() - lastBotEndAt : ms; },
      });
    } catch (e) {
      if (my !== turnSeq) return;
      setPhase("idle"); session = false; paint();
      botCap.textContent = e.message;
      toast(e.message);
      return;
    }
    if (my !== turnSeq) return;
    if (!text) return onSilence();
    silences = 0;
    onUserSaid(text, { thinkMs, continued: Dynamics.trailsOff(text) || /\s(और|तो|मतलब)\s/.test(text) });
  }

  // Nothing was said. A person checks in once, then lets you be.
  function onSilence() {
    userCap.textContent = "";
    if (!session) return setPhase("idle");
    silences++;
    if (silences === 1 && holdStart) {
      // They asked for time and are still thinking: one gentle, useful nudge.
      return runTurn("यूज़र ने सोचने का समय माँगा था और काफ़ी देर से चुप है। बिना दबाव के एक छोटी, मददगार बात कहो — एक सरल सुझाव, या बस इतना कि तुम इंतज़ार कर रही हो।", "event",
        { heldMs: performance.now() - holdStart }, { event: true, offlineReply: Dynamics.checkinLine(), patientAfter: true });
    }
    if (silences === 1) { turnSeq++; return reflex(Dynamics.checkinLine(), () => listenTurn({ patient: true })); }
    holdStart = 0; silences = 0;
    turnSeq++;
    reflex(Dynamics.goodbyeLine());
    session = false; setPhase("idle");
  }

  function onUserSaid(text, ctx) {
    const cls = Dynamics.classify(text);
    if (cls === "filler") {
      // Just "उम्म…" — they're thinking out loud. Keep quiet and keep listening.
      holdStart = holdStart || performance.now();
      return listenTurn({ patient: true });
    }
    if (cls === "hold") {
      userCap.textContent = text;
      Brain.log.push({ role: "user", text });
      holdStart = performance.now();
      turnSeq++;
      return reflex(Dynamics.holdLine(), () => listenTurn({ patient: true }));
    }
    const heldMs = holdStart ? performance.now() - holdStart : 0;
    holdStart = 0;
    if (cls === "bye") session = false;
    runTurn(text, cls, { thinkMs: ctx.thinkMs, heldMs, continued: ctx.continued });
  }

  // Typed text and tip buttons come in here.
  function handleUtterance(text) {
    if (speaker.busy || phase === "thinking") interrupt();
    Voice.abortListening();
    greeted = true;
    silences = 0;
    onUserSaid(text, { thinkMs: 0 });
  }

  // ---- one exchange with the brain ----
  async function runTurn(text, cls, ctx, meta) {
    meta = meta || {};
    stopMonitor();
    const my = ++turnSeq;
    const c = brainCfg();
    const live = isLive(c);
    if (!meta.event) userCap.textContent = text;
    botCap.textContent = ""; toolCap.textContent = "";

    // The instant murmur, so there's never dead air while the model thinks.
    const ack = live && cfg.reflexes && !meta.event ? Dynamics.ackFor(cls, text) : null;
    if (ack) { speaker.say(ack, c, "ack"); botCap.textContent = ack; }
    const signals = Dynamics.signals(text, cls, Object.assign({ ack, interrupted: pending.interrupted, nods: pending.nods }, ctx));
    pending = { interrupted: null, nods: [] };
    speaker.markTurn();
    if (!speaker.busy) speakerIdleSince = performance.now();
    setPhase("thinking");

    // If the reply is slow and nothing is audible, murmur once more ("देख रही हूँ…").
    let replyStarted = false, fillers = 0, lastTool = "_";
    const filler = () => {
      if (my !== turnSeq || replyStarted || fillers >= 2 || !live || !cfg.reflexes || speaker.busy) return;
      fillers++;
      speaker.say(Dynamics.progressFor(lastTool), c, "filler");
    };
    const waitTimer = setInterval(() => { if (!speaker.busy && performance.now() - speakerIdleSince > 1600 && fillers === 0) filler(); }, 250);

    let reply = null;
    try {
      reply = await Brain.turn(text, c, {
        onText: (t) => { if (my === turnSeq) botCap.textContent = (ack ? ack + " " : "") + t; },
        onSentence: (s) => { if (my !== turnSeq) return; replyStarted = true; speaker.say(s, c, "reply"); },
        onTool: (name, label, input, info) => {
          if (my !== turnSeq) return;
          lastTool = name;
          toolCap.textContent = "⚡ " + label;
          view.classList.remove("pulse"); void view.offsetWidth; view.classList.add("pulse");
          if (!info.spokeThisStep) { replyStarted = false; filler(); }
        },
      }, { signals, event: meta.event, offlineReply: meta.offlineReply, ackText: ack });
    } catch (e) {
      if (my !== turnSeq) { clearInterval(waitTimer); return; }
      const msg = e.status === 401 || e.status === 403 ? "API key सही नहीं लग रही। सेटिंग में जाँचिए।" : e.status === 429 ? "अभी बहुत सारे अनुरोध हो गए, थोड़ी देर में फिर कोशिश कीजिए।" : "माफ़ कीजिए, अभी मॉडल से जुड़ नहीं पा रही।";
      speaker.say(msg, c, "reply");
      botCap.textContent = msg;
      toolCap.textContent = "⚠ " + e.message;
      console.error(e);
    }
    clearInterval(waitTimer);
    if (my !== turnSeq) return;
    toolCap.textContent = toolCap.textContent.startsWith("⚠") ? toolCap.textContent : "";
    setPhase("idle");
    renderLog();
    await speaker.drain();
    if (my !== turnSeq) return;
    lastBotEndAt = performance.now();
    if (session && cfg.handsFree) listenTurn({ patient: meta.patientAfter });
  }

  orb.addEventListener("click", () => {
    if (!greeted) {
      greeted = true; session = true;
      const c = brainCfg();
      speaker.prewarm(Dynamics.allReflexLines(), c);
      const g = Brain.greeting();
      botCap.textContent = g; userCap.textContent = "";
      const my = ++turnSeq;
      speaker.say(g, c, "reply");
      Brain.log.push({ role: "assistant", text: g });
      paint();
      speaker.drain().then(() => { if (my === turnSeq && session) { lastBotEndAt = performance.now(); listenTurn(); } });
      return;
    }
    session = true;
    silences = 0;
    if (phase === "listening" || phase === "waiting") { Voice.stopListening(); return; }
    if (speaker.busy || phase === "thinking") interrupt(); // barge-in
    listenTurn();
  });
  $("#endSession").addEventListener("click", () => {
    session = false; holdStart = 0; turnSeq++; speaker.stop(); Brain.abort(); stopMonitor(); Voice.abortListening(); setPhase("idle");
  });
  $("#typeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const i = $("#typeInput"); const t = i.value.trim();
    if (!t) return;
    i.value = "";
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
    f.reflexes.checked = cfg.reflexes; f.duplex.checked = cfg.duplex;
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
      openaiAudioBase: f.openaiAudioBase.value.trim() || DEFAULTS.openaiAudioBase, asrModel: f.asrModel.value.trim(), ttsModel: f.ttsModel.value.trim(), ttsVoice: f.ttsVoice.value.trim(), rate: +f.rate.value || 1, handsFree: f.handsFree.checked,
      reflexes: f.reflexes.checked, duplex: f.duplex.checked });
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
