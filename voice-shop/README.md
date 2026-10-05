# Vaani Shop — a voice-first shopping app in Hindi

A complete small e-commerce app that you can run entirely by talking to it in
Hindi. It has a home page, search results, product pages, comparison, cart,
coupons, address, payment, order placement, order history, tracking,
cancel/return, and a wishlist. Every screen also works by touch.

Live (GitHub Pages): https://ishanmeesho.github.io/vaani/voice-shop/

## Running it

It's static HTML/JS with no build step. Open `voice-shop/index.html` from any
static server (`python3 -m http.server` at the repo root, then visit
`/voice-shop/`). Use **Chrome** (desktop or Android) for the free built-in
Hindi speech recognition.

1. Tap the mic. Vaani greets you and starts listening.
2. Talk normally: *"शादी के लिए कोई साड़ी दिखाओ"*, *"दूसरी वाली के बारे में बताओ"*,
   *"M साइज़ में कार्ट में डाल दो"*, *"घर वाले पते पर भेज दो, कैश ऑन डिलीवरी"*,
   *"मेरा पिछला ऑर्डर कहाँ है?"*, or just chat.
3. Tap the mic while Vaani is speaking to interrupt (barge-in). Tap ✕ to end
   the conversation. ⌨️ lets you type instead.

With no API key it runs in **demo mode**: a small rule-based brain that covers
search, opening items by number, cart, checkout and orders. To get real
conversation, open ⚙️ settings and plug in a model.

## Plugging in a model (the "brain")

| Provider | Default model | Notes |
|---|---|---|
| Anthropic Claude | `claude-opus-5-5` | Also `claude-sonnet-5-5` (faster), `claude-haiku-4-5` (fastest). "Thinking depth" maps to the API's effort setting and defaults to low for voice latency. Refusal fallback (`fallbacks: "default"`) is turned on for Opus/Sonnet 5.5. |
| OpenAI | `gpt-4.1-mini` | Any chat-completions model with tool calling. |
| Google Gemini | `gemini-2.5-flash` | Through Gemini's OpenAI-compatible endpoint. |
| Groq | `llama-3.3-70b-versatile` | Very low latency. |
| OpenRouter | — | One key, many models. |
| Custom | — | Anything with an OpenAI-style `/chat/completions` and tools (Sarvam, vLLM, Ollama, your own proxy). |

You can type any model name; the list is only a set of suggestions. There's
also a free-text field for extra persona instructions (dialect, tone, etc.).

## Voice

| | Browser (free) | Sarvam AI | OpenAI |
|---|---|---|---|
| Hearing (ASR) | Web Speech API, `hi-IN`, live partial text | `saaras:v4` speech-to-text | `gpt-4o-transcribe` |
| Speaking (TTS) | `speechSynthesis` Hindi voice | `bulbul:v3` (voices: priya, ritu, neha, kavya, aditya…) | `gpt-4o-mini-tts` |

Cloud ASR records with MediaRecorder and stops on its own after about 1.3 s of
silence. Replies **stream**: each sentence is sent to TTS as soon as the model
finishes it, and cloud audio for the next sentence is fetched while the
current one plays, so Vaani starts talking before the model has finished
writing. If cloud TTS fails, the browser voice takes over so the user never
gets silence.

## How it's built

```
catalog.js  36 demo products in 10 categories (Hindi + English names, sizes, colours, prices), coupons
store.js    all state and shopping actions (search, cart, address, payment, orders); persisted to localStorage
voice.js    ASR + TTS engines, sentence splitter, speech queue with barge-in
brain.js    LLM providers (Anthropic + OpenAI-compatible), tools, live screen context, agent loop, offline brain
ui.js       screen rendering
app.js      the conversation loop, taps, settings
```

**Shared actions.** Taps and the model's tools call the same `Store`
functions, so anything you can tap, Vaani can do, and the other way round.

**What the model can do (tools):** `search_products` (with category, price,
colour, size, rating and sort filters, shown as a numbered grid),
`open_product`, `get_product_details`, `compare_products`, `add_to_cart`
(refuses without a size for multi-size items), `update_cart_item`,
`apply_coupon`, `toggle_wishlist`, `navigate`, `save_address` (validates the
10-digit mobile number and 6-digit pincode), `select_address`,
`select_payment`, `place_order` (two-step: summary first, then
`confirmed=true` only after the user says yes), `order_action`
(track/cancel/return), and `remember_about_user`.

**How it stays in context.** Each user turn starts with an `[ऐप की स्थिति]`
block: the current screen, the numbered items visible on it, the product
open, the cart and totals, saved addresses, payment, what's still needed to
check out, recent orders and their status, recently viewed items, the user's
remembered facts, and anything they tapped since the last turn. The system
prompt carries the persona, the rules and the full catalog, and is cached
with prompt caching.

**Persona.** Vaani speaks warm, everyday Hindi in Devanagari, in short
sentences written to be heard, not read. She's free to chat about anything
(festivals, outfits for an occasion, gifts, family, life) and brings
shopping back in only where it fits. She fixes likely speech-recognition
errors from context and reads phone numbers, pincodes and UPI IDs back to
confirm them. She never asks for card numbers, OTPs or PINs.

**Memory.** Facts like "नाम: सुनीता" or "कुर्ती का साइज़ L" are saved in
localStorage, used in the greeting, and sent to the model on every turn.
Conversation history is append-only: Claude's thinking blocks are passed back
unchanged. Very long sessions start a new thread seeded with a text recap
instead of trimming old turns.

## Production notes

- **API keys live in the browser** (localStorage) and are sent straight to
  the provider. That's fine for a demo, but in production put a small proxy in
  front and point the Base URL at it. Claude calls set
  `anthropic-dangerous-direct-browser-access` so they work from the browser.
- Card and net banking are demo-only. UPI and COD go through the full flow
  but no real payment happens.
- Orders move through placed → packed → shipped → out for delivery →
  delivered based on how much of each product's delivery time has passed.
