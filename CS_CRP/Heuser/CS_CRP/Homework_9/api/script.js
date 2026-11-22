/* ══════════════════════════════════════════════════════════════
   POKÉ-DEX HOLOCRON — script.js
   PokéAPI Fetching · Holographic Card Tracking · Battle Sim
   ══════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Constants & State ──────────────────────────────────────
  const API_BASE       = "https://pokeapi.co/api/v2/pokemon/";
  const SPECIES_BASE   = "https://pokeapi.co/api/v2/pokemon-species/";
  const ARTWORK_BASE   = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";
  const FALLBACK_IMG   = "/static/pokedex/sample_pokemon.svg";
  const TOTAL_COUNT    = 151;                 // Gen I classic mode

  let currentId        = 25;                  // Pikachu on first load
  let currentTypes     = [];                  // Types of the loaded Pokémon
  let isLoading        = false;

  // ── DOM References ─────────────────────────────────────────
  const $              = (sel) => document.querySelector(sel);
  const card           = $("#card-container");
  const cardWrapper    = $("#card-wrapper") || $(".card-wrapper");
  const searchInput    = $("#pokemon-search-input");
  const habitatSelect  = $("#habitat-select");
  const prevBtn        = $("#prev-btn");
  const nextBtn        = $("#next-btn");
  const randomBtn      = $("#random-btn");
  const searchBtn      = $("#search-btn");
  const loadingOverlay = $("#loading-overlay");
  const statusLed      = $("#status-led");
  const statusText     = $("#status-text");
  const offlineTag     = $("#offline-indicator");
  const battleBtn      = $("#battle-btn");
  const opponentType   = $("#opponent-type");
  const battleResult   = $("#battle-result");
  const powerGauge     = $("#power-gauge");
  const gaugeValue     = $("#gauge-value");

  // ── Type Effectiveness Chart (attacking → defending) ───────
  // 0 = immune, 0.5 = not very effective, 1 = neutral, 2 = super effective
  const TYPE_CHART = {
    normal:   { rock: .5, ghost: 0, steel: .5 },
    fire:     { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 },
    water:    { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
    electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
    grass:    { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
    ice:      { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
    fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
    poison:   { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
    ground:   { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
    flying:   { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 },
    psychic:  { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
    bug:      { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
    rock:     { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
    ghost:    { normal: 0, psychic: 2, ghost: 2, dark: .5 },
    dragon:   { dragon: 2, steel: .5, fairy: 0 },
    dark:     { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
    steel:    { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
    fairy:    { fire: .5, poison: .5, fighting: 2, dragon: 2, dark: 2, steel: .5 }
  };

  // ══════════════════════════════════════════════════════════
  //  CORE: Fetch & Render a Pokémon
  // ══════════════════════════════════════════════════════════
  async function loadPokemon(idOrName) {
    if (isLoading) return;
    isLoading = true;
    showLoading(true);
    setStatus("FETCHING DATA…", false);

    try {
      let res;
      try {
        // Fetch directly from PokéAPI
        res = await fetch(`${API_BASE}${String(idOrName).toLowerCase()}`);
      } catch (directErr) {
        // Fallback to server endpoint if direct client-side fetch is blocked/offline
        res = await fetch(`/api/pokemon/${String(idOrName).toLowerCase()}`);
      }
      if (!res || !res.ok) {
        // If direct returned error status, try server proxy
        res = await fetch(`/api/pokemon/${String(idOrName).toLowerCase()}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      renderCard(data);
      currentId = data.id;
      setStatus("SYSTEM READY", false);
    } catch (err) {
      console.error("loadPokemon error:", err);
      renderFallback();
      setStatus("FETCH FAILED — USING CACHE", true);
    } finally {
      isLoading = false;
      showLoading(false);
    }
  }

  // ── Render card from API data ──────────────────────────────
  function renderCard(d) {
    // Image — prefer official artwork, then dream world, then default sprite
    const artworkUrl = `${ARTWORK_BASE}${d.id}.png`;
    const imgEl      = $("#pk-img");
    imgEl.src        = artworkUrl;
    imgEl.onerror    = () => { imgEl.src = FALLBACK_IMG; };

    // Text fields
    $("#pk-id").textContent     = `#${String(d.id).padStart(3, "0")}`;
    $("#pk-name").textContent   = d.name.toUpperCase();
    $("#pk-height").textContent = `${(d.height / 10).toFixed(1)} m`;
    $("#pk-weight").textContent = `${(d.weight / 10).toFixed(1)} kg`;
    $("#pk-xp").textContent     = d.base_experience ?? "—";

    // Types
    currentTypes = d.types.map((t) => t.type.name);
    const typesEl = $("#pk-types");
    typesEl.innerHTML = currentTypes
      .map((t) => `<span class="type-pill type-${t}">${t}</span>`)
      .join("");

    // Stats
    const statMap = {
      hp:                "hp",
      attack:            "atk",
      defense:           "def",
      speed:             "spd",
      "special-attack":  "satk",
      "special-defense": "sdef"
    };
    let totalPower = 0;
    d.stats.forEach((s) => {
      const key = statMap[s.stat.name];
      if (!key) return;
      const val = s.base_stat;
      totalPower += val;
      const pct = Math.min((val / 255) * 100, 100);
      const bar = $(`#bar-${key}`);
      const num = $(`#num-${key}`);
      if (bar) bar.style.width = `${pct}%`;
      if (num) num.textContent = val;
    });

    // Power gauge
    powerGauge.value          = totalPower;
    powerGauge.max            = 255 * 6;        // theoretical max across 6 stats
    gaugeValue.textContent    = totalPower;

    // Abilities
    const abilList = $("#ability-list");
    abilList.innerHTML = d.abilities
      .map(
        (a) =>
          `<li>${a.ability.name.replace("-", " ")}${a.is_hidden ? " ✦" : ""}</li>`
      )
      .join("");

    // Reset battle result
    battleResult.textContent = "";
    battleResult.className   = "battle-result";
  }

  // ── Fallback render (offline / error) ──────────────────────
  function renderFallback() {
    $("#pk-img").src          = FALLBACK_IMG;
    $("#pk-name").textContent = "UNKNOWN";
    $("#pk-id").textContent   = "#???";
  }

  // ══════════════════════════════════════════════════════════
  //  HOLOGRAPHIC MOUSE TRACKING
  // ══════════════════════════════════════════════════════════
  if (card) {
    card.addEventListener("mousemove", (e) => {
      const rect  = card.getBoundingClientRect();
      const x     = e.clientX - rect.left;
      const y     = e.clientY - rect.top;
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;

      // Rotation: ±15 degrees
      const rotY  = ((x - halfW) / halfW) * 15;
      const rotX  = ((halfH - y) / halfH) * 15;

      card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;

      // Holographic sheen position (CSS custom props)
      const percX = (x / rect.width) * 100;
      const percY = (y / rect.height) * 100;
      card.style.setProperty("--mouse-x", percX);
      card.style.setProperty("--mouse-y", percY);
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "rotateX(0) rotateY(0)";
      card.style.setProperty("--mouse-x", 50);
      card.style.setProperty("--mouse-y", 50);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  NAVIGATION & EVENTS
  // ══════════════════════════════════════════════════════════
  function goNext() {
    currentId = currentId >= TOTAL_COUNT ? 1 : currentId + 1;
    loadPokemon(currentId);
  }
  function goPrev() {
    currentId = currentId <= 1 ? TOTAL_COUNT : currentId - 1;
    loadPokemon(currentId);
  }
  function goRandom() {
    let rng;
    do { rng = Math.floor(Math.random() * TOTAL_COUNT) + 1; } while (rng === currentId);
    loadPokemon(rng);
  }
  function doSearch() {
    const q = searchInput.value.trim();
    if (q) loadPokemon(q);
  }

  nextBtn.addEventListener("click", goNext);
  prevBtn.addEventListener("click", goPrev);
  randomBtn.addEventListener("click", goRandom);
  searchBtn.addEventListener("click", doSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  // ── Habitat filter ─────────────────────────────────────────
  habitatSelect.addEventListener("change", async () => {
    const habitat = habitatSelect.value;
    if (!habitat) return;

    showLoading(true);
    setStatus("FILTERING BY HABITAT…", false);

    try {
      let res;
      try {
        res = await fetch(`https://pokeapi.co/api/v2/pokemon-habitat/${habitat}/`);
      } catch (e) {
        res = await fetch(`/api/habitat/${habitat}`);
      }
      if (!res || !res.ok) {
        res = await fetch(`/api/habitat/${habitat}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Pick a random species from that habitat within Gen I
      const gen1Species = data.pokemon_species.filter((s) => {
        const idPart = parseInt(s.url.split("/").filter(Boolean).pop(), 10);
        return idPart <= TOTAL_COUNT;
      });

      if (gen1Species.length === 0) {
        setStatus("NO GEN I SPECIMENS IN HABITAT", true);
        showLoading(false);
        return;
      }

      const pick = gen1Species[Math.floor(Math.random() * gen1Species.length)];
      const id   = parseInt(pick.url.split("/").filter(Boolean).pop(), 10);
      await loadPokemon(id);
    } catch (err) {
      console.error("Habitat filter error:", err);
      setStatus("HABITAT QUERY FAILED", true);
      showLoading(false);
    }
  });

  // ══════════════════════════════════════════════════════════
  //  BATTLE SIMULATOR (Type Match-Up Synergy)
  // ══════════════════════════════════════════════════════════
  battleBtn.addEventListener("click", () => {
    const defender = opponentType.value;
    if (!defender || currentTypes.length === 0) {
      battleResult.textContent = "Select an opponent type first.";
      battleResult.className   = "battle-result";
      return;
    }

    // Calculate combined effectiveness of attacker types vs defender
    let combined = 1;
    const breakdown = [];

    currentTypes.forEach((atkType) => {
      const chart      = TYPE_CHART[atkType] || {};
      const multiplier = chart[defender] ?? 1;
      combined *= multiplier;
      breakdown.push(`${atkType.toUpperCase()} → ${defender.toUpperCase()}: ×${multiplier}`);
    });

    let verdict, cssClass;
    if (combined === 0) {
      verdict  = "IMMUNE — No effect!";
      cssClass = "immune";
    } else if (combined > 1) {
      verdict  = `SUPER EFFECTIVE ×${combined}`;
      cssClass = "super-effective";
    } else if (combined < 1) {
      verdict  = `NOT VERY EFFECTIVE ×${combined}`;
      cssClass = "not-effective";
    } else {
      verdict  = `NEUTRAL ×${combined}`;
      cssClass = "neutral";
    }

    battleResult.innerHTML   = `${breakdown.join("<br>")} <br><strong>${verdict}</strong>`;
    battleResult.className   = `battle-result ${cssClass}`;
  });

  // ── Power gauge mirror (manual sliding) ────────────────────
  powerGauge.addEventListener("input", () => {
    gaugeValue.textContent = powerGauge.value;
  });

  // ══════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════
  function showLoading(show) {
    loadingOverlay.classList.toggle("hidden", !show);
  }

  function setStatus(msg, isError) {
    statusText.textContent   = msg;
    statusLed.style.background  = isError ? "var(--neon-pink)" : "var(--neon-green)";
    statusLed.style.boxShadow   = isError
      ? "0 0 6px var(--neon-pink)"
      : "0 0 6px var(--neon-green)";
  }

  // ── Offline detection ──────────────────────────────────────
  function updateOnlineStatus() {
    offlineTag.classList.toggle("hidden", navigator.onLine);
    if (!navigator.onLine) setStatus("OFFLINE MODE", true);
  }
  window.addEventListener("online",  updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  // ── Keyboard shortcuts ─────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (document.activeElement === searchInput) return;  // don't hijack typing
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft")  goPrev();
    if (e.key === "r" || e.key === "R") goRandom();
  });

  // ── Bootstrap ──────────────────────────────────────────────
  loadPokemon(currentId);
})();
