(() => {
  const CONTENT_URL = "assets/data/site-content.json";
  const UI_URL = "assets/data/ui.json";
  const NAV_ITEMS = ["home", "about", "activities", "documents", "news", "analytics", "media", "contacts"];
  const WORLD_BANK = [
    { id: "EN.ATM.CO2E.PC", key: "co2", unit: "t" },
    { id: "EG.FEC.RNEW.ZS", key: "renew", unit: "%" },
    { id: "AG.LND.FRST.ZS", key: "forest", unit: "%" },
    { id: "EN.ATM.PM25.MC.M3", key: "pm25", unit: "µg/m³" }
  ];

  const state = {
    content: null,
    ui: null,
    lang: localStorage.getItem("nccc-lang") || "uz",
    theme: localStorage.getItem("nccc-theme") || systemTheme(),
    live: { air: null, weather: null, worldBank: [] },
    filters: { docType: "all", docYear: "all", newsTag: "all", newsQuery: "", searchQuery: "" },
    captcha: makeCaptcha()
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindEvents();
    applyTheme(state.theme);
    try {
      const [content, ui] = await Promise.all([fetchJson(CONTENT_URL), fetchJson(UI_URL)]);
      state.content = content;
      state.ui = ui;
    } catch (error) {
      showAlert(`Failed to load portal data: ${error.message}`);
      return;
    }
    setLanguage(state.lang);
    renderAll();
    observeSections();
    loadLiveData();
    registerServiceWorker();
  }

  function cacheDom() {
    [
      "homeContent",
      "aboutContent",
      "activitiesContent",
      "documentsContent",
      "newsContent",
      "analyticsContent",
      "mediaContent",
      "contactsContent",
      "footerContent",
      "siteNav",
      "mobileNav",
      "searchResults",
      "globalSearchInput",
      "searchDialog",
      "mobilePanel",
      "pageAlert",
      "toastStack",
      "brandTitle",
      "brandSubtitle",
      "searchToggleText",
      "searchEyebrow",
      "searchTitle",
      "searchLabel",
      "themeToggleGlyph"
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
    dom.searchToggle = document.getElementById("searchToggle");
    dom.menuToggle = document.getElementById("menuToggle");
  }

  function bindEvents() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("hashchange", syncActiveLinks);
  }

  function onClick(event) {
    const langButton = event.target.closest("[data-lang]");
    if (langButton) {
      setLanguage(langButton.dataset.lang);
      renderAll();
      return;
    }
    if (event.target.closest("#themeToggle")) {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("nccc-theme", state.theme);
      applyTheme(state.theme);
      return;
    }
    if (event.target.closest("#searchToggle")) {
      openSearch();
      return;
    }
    if (event.target.closest("[data-close-search]")) {
      closeSearch();
      return;
    }
    if (event.target.closest("#menuToggle")) {
      dom.mobilePanel.hidden = !dom.mobilePanel.hidden;
      dom.menuToggle.setAttribute("aria-expanded", String(!dom.mobilePanel.hidden));
      return;
    }
    const jump = event.target.closest("[data-search-target]");
    if (jump) {
      closeSearch();
      jumpTo(jump.dataset.searchTarget, jump.dataset.searchCard || "");
    }
  }

  function onChange(event) {
    if (event.target.id === "docTypeFilter") state.filters.docType = event.target.value;
    if (event.target.id === "docYearFilter") state.filters.docYear = event.target.value;
    if (event.target.id === "newsTagFilter") state.filters.newsTag = event.target.value;
    if (event.target.matches("#docTypeFilter, #docYearFilter")) renderDocuments();
    if (event.target.matches("#newsTagFilter")) renderNews();
  }

  function onInput(event) {
    if (event.target.id === "newsSearchInput") {
      state.filters.newsQuery = event.target.value.trim().toLowerCase();
      renderNews();
    }
    if (event.target.id === "globalSearchInput") {
      state.filters.searchQuery = event.target.value.trim().toLowerCase();
      renderSearchResults();
    }
  }

  function onSubmit(event) {
    if (event.target.id !== "contactForm") return;
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const topic = form.elements.topic.value.trim();
    const message = form.elements.message.value.trim();
    const captcha = form.elements.captcha.value.trim();
    if (!name || !email || !topic || !message) return toast(ui().formError, "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast(ui().formError, "error");
    if (captcha !== String(state.captcha.answer)) return toast(ui().formCaptchaError, "error");
    const subject = encodeURIComponent(`[NCCC] ${topic}`);
    const body = encodeURIComponent(`${name}\n${email}\n\n${message}`);
    window.location.href = `mailto:${state.content.organization.email}?subject=${subject}&body=${body}`;
    form.reset();
    state.captcha = makeCaptcha();
    renderContacts();
    toast(ui().formSuccess, "success");
  }

  function onKeydown(event) {
    if (event.key === "/" && document.activeElement !== dom.globalSearchInput) {
      event.preventDefault();
      openSearch();
    }
    if (event.key === "Escape") {
      closeSearch();
      dom.mobilePanel.hidden = true;
      dom.menuToggle.setAttribute("aria-expanded", "false");
    }
  }

  function setLanguage(lang) {
    state.lang = state.ui[lang] ? lang : "uz";
    localStorage.setItem("nccc-lang", state.lang);
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lang === state.lang);
    });
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#071514" : "#0b6b67");
    dom.themeToggleGlyph.textContent = theme === "dark" ? "☾" : "◐";
  }

  function renderAll() {
    renderChrome();
    renderHome();
    renderAbout();
    renderActivities();
    renderDocuments();
    renderNews();
    renderAnalytics();
    renderMedia();
    renderContacts();
    renderFooter();
    renderSearchResults();
    updateMeta();
    syncActiveLinks();
    reveal();
  }

  function renderChrome() {
    const org = state.content.organization;
    dom.brandTitle.textContent = pick(org.name);
    dom.brandSubtitle.textContent = pick(org.subtitle);
    dom.searchToggleText.textContent = ui().searchButton;
    dom.searchEyebrow.textContent = ui().searchEyebrow;
    dom.searchTitle.textContent = ui().searchTitle;
    dom.searchLabel.textContent = ui().searchTitle;
    dom.globalSearchInput.placeholder = ui().searchPlaceholder;
    const links = NAV_ITEMS.map((item) => `<a href="#${item}" data-nav-link="${item}">${escape(ui().nav[item])}</a>`).join("");
    dom.siteNav.innerHTML = links;
    dom.mobileNav.innerHTML = links;
  }

  function renderHome() {
    const hero = state.content.hero;
    dom.homeContent.innerHTML = `
      <div class="hero-shell reveal">
        <div class="hero-grid">
          <div class="hero-copy">
            <p class="section-kicker">${escape(pick(hero.kicker))}</p>
            <h1 class="hero-title">${escape(pick(hero.title))}</h1>
            <p class="hero-summary">${escape(pick(hero.summary))}</p>
            <div class="hero-actions">
              <a class="button button-primary" href="#documents">${escape(pick(hero.primaryCta))}</a>
              <a class="button button-secondary" href="#contacts">${escape(pick(hero.secondaryCta))}</a>
            </div>
            <ul class="status-strip">${hero.status.map((item) => `<li class="status-pill"><strong>${escape(item.value)}</strong><span>${escape(pick(item.label))}</span></li>`).join("")}</ul>
          </div>
          <div class="hero-sidebar">
            <div class="metric-grid">${hero.metrics.map((item) => `<article class="metric-card"><strong>${escape(item.value)}</strong><span>${escape(pick(item.label))}</span><span>${escape(pick(item.detail))}</span></article>`).join("")}</div>
            <article class="metric-card"><span>${escape(ui().lastUpdated)}</span><strong>${escape(formatDate(state.content.generatedAt))}</strong><span>${escape(pick(state.content.organization.mission))}</span></article>
          </div>
        </div>
      </div>
      <div class="photo-strip" aria-hidden="true">
        <div class="photo-strip__item"><img src="https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=900&q=75" alt="" loading="lazy"><span class="photo-strip__label">Arid Zones</span></div>
        <div class="photo-strip__item"><img src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=75" alt="" loading="lazy"><span class="photo-strip__label">Air Quality</span></div>
        <div class="photo-strip__item"><img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=75" alt="" loading="lazy"><span class="photo-strip__label">Satellite Data</span></div>
        <div class="photo-strip__item"><img src="https://images.unsplash.com/photo-1467803738586-46b7eb7b16a1?auto=format&fit=crop&w=900&q=75" alt="" loading="lazy"><span class="photo-strip__label">Halophytes</span></div>
        <div class="photo-strip__item"><img src="https://images.unsplash.com/photo-1611048268330-53de574cae3b?auto=format&fit=crop&w=900&q=75" alt="" loading="lazy"><span class="photo-strip__label">Renewables</span></div>
      </div>
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().homeKicker)}</p><h2 class="section-title">${escape(ui().homeTitle)}</h2><p class="section-summary">${escape(ui().homeSummary)}</p></div></div>
        <div class="card-grid card-grid--4">${state.content.programs.map(renderProgramCard).join("")}</div>
      </div>
      <div class="two-up">
        <div class="section-shell reveal">${renderStack(ui().latestDecisions, state.content.decisions.slice(0, 3), "decision")}</div>
        <div class="section-shell reveal">${renderStack(ui().latestDocuments, state.content.documents.slice(0, 3), "document")}</div>
      </div>
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().newsKicker)}</p><h2 class="section-title">${escape(ui().latestNews)}</h2></div></div>
        <div class="resource-grid">${state.content.news.slice(0, 3).map(renderNewsCard).join("")}</div>
      </div>
    `;
  }

  function renderAbout() {
    const org = state.content.organization;
    dom.aboutContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().aboutKicker)}</p><h2 class="section-title">${escape(ui().nav.about)}</h2><p class="section-summary">${escape(ui().aboutSummary)}</p></div></div>
        <div class="split-grid">
          <div class="prose"><p>${escape(pick(org.description))}</p><p>${escape(pick(org.mission))}</p></div>
          <ul class="timeline">${state.content.timeline.map((item) => `<li class="timeline__item"><time>${escape(formatDate(item.date))}</time><h3>${escape(pick(item.title))}</h3><p>${escape(pick(item.summary))}</p></li>`).join("")}</ul>
        </div>
      </div>
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().partners)}</p><h2 class="section-title">${escape(ui().partners)}</h2></div></div>
        <div class="partner-grid">${state.content.partners.map((item) => `<article class="partner-card"><h3>${escape(item.name)}</h3><p>${escape(pick(item.summary))}</p><a class="feature-card__link" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></article>`).join("")}</div>
      </div>
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().team)}</p><h2 class="section-title">${escape(ui().team)}</h2></div></div>
        <div class="team-grid">${state.content.team.map((person) => `<article class="team-card"><div class="team-card__media"><img src="${attr(person.photo)}" alt="${attr(pick(person.name))}" loading="lazy"></div><div class="team-card__body"><h3>${escape(pick(person.name))}</h3><div class="team-card__role">${escape(pick(person.role))}</div></div></article>`).join("")}</div>
      </div>
    `;
  }

  function renderActivities() {
    const ndc = ui().ndc;
    dom.activitiesContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().activitiesKicker)}</p><h2 class="section-title">${escape(ui().nav.activities)}</h2><p class="section-summary">${escape(ui().activitiesSummary)}</p></div></div>
        <div class="card-grid card-grid--4">${state.content.programs.map(renderProgramCard).join("")}</div>
      </div>
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(ui().ndcVersions)}</h2></div></div>
        <div class="card-grid card-grid--3">${ndc.versions.map((item) => `<article class="feature-card"><div class="feature-card__icon">◌</div><h3>${escape(item.name)}</h3><div class="list-card__meta"><span>${escape(formatDate(item.date))}</span><span>${escape(item.scope)}</span></div><p>${escape(item.target)}</p><a class="feature-card__link" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></article>`).join("")}</div>
      </div>
      <div class="two-up">
        <div class="section-shell reveal"><div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(ui().ndcTargets)}</h2></div></div><div class="card-grid card-grid--3">${ndc.targets.map((item) => `<article class="feature-card"><h3>${escape(item.value)}</h3><p>${escape(item.label)}</p></article>`).join("")}</div></div>
        <div class="section-shell reveal"><div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(ui().ndcSectors)}</h2></div></div><div class="stack-list">${ndc.sectors.map((item) => `<article class="list-card"><h3>${escape(item.title)}</h3><p>${escape(item.summary)}</p></article>`).join("")}</div></div>
      </div>
    `;
  }

  function renderDocuments() {
    const years = [...new Set(state.content.documents.map((item) => String(item.year)))].sort((a, b) => Number(b) - Number(a));
    const items = state.content.documents.filter((item) => {
      return (state.filters.docType === "all" || item.type === state.filters.docType) &&
        (state.filters.docYear === "all" || String(item.year) === state.filters.docYear);
    });
    dom.documentsContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().docKicker)}</p><h2 class="section-title">${escape(ui().nav.documents)}</h2><p class="section-summary">${escape(ui().docSummary)}</p></div></div>
        <div class="filter-bar">
          <label class="filter-field"><span class="field-label">${escape(ui().docType)}</span><select id="docTypeFilter"><option value="all">${escape(ui().allTypes)}</option>${Object.keys(ui().docTypeLabels).map((key) => `<option value="${key}"${state.filters.docType === key ? " selected" : ""}>${escape(ui().docTypeLabels[key])}</option>`).join("")}</select></label>
          <label class="filter-field"><span class="field-label">${escape(ui().docYear)}</span><select id="docYearFilter"><option value="all">${escape(ui().allYears)}</option>${years.map((year) => `<option value="${year}"${state.filters.docYear === year ? " selected" : ""}>${escape(year)}</option>`).join("")}</select></label>
        </div>
        <div class="resource-grid">${items.map(renderDocumentCard).join("")}</div>
      </div>
    `;
  }

  function renderNews() {
    const items = state.content.news.filter((item) => {
      const haystack = `${pick(item.title)} ${pick(item.summary)}`.toLowerCase();
      return (state.filters.newsTag === "all" || item.tag === state.filters.newsTag) &&
        (!state.filters.newsQuery || haystack.includes(state.filters.newsQuery));
    });
    dom.newsContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().newsKicker)}</p><h2 class="section-title">${escape(ui().nav.news)}</h2><p class="section-summary">${escape(ui().newsSummary)}</p></div></div>
        <div class="filter-bar">
          <label class="filter-field"><span class="field-label">${escape(ui().newsTag)}</span><select id="newsTagFilter"><option value="all">${escape(ui().allTags)}</option>${Object.keys(ui().newsTags).map((key) => `<option value="${key}"${state.filters.newsTag === key ? " selected" : ""}>${escape(ui().newsTags[key])}</option>`).join("")}</select></label>
          <label class="filter-field filter-field--search"><span class="field-label">${escape(ui().newsSearch)}</span><input id="newsSearchInput" type="search" value="${attr(state.filters.newsQuery)}"></label>
        </div>
        <div class="resource-grid">${items.map(renderNewsCard).join("")}</div>
      </div>
    `;
  }

  function renderAnalytics() {
    dom.analyticsContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().analyticsKicker)}</p><h2 class="section-title">${escape(ui().nav.analytics)}</h2><p class="section-summary">${escape(ui().analyticsSummary)}</p></div></div>
        <div class="dashboard-grid">${renderAirCard()}${renderWeatherCard()}</div>
      </div>
      <div class="two-up">
        <div class="section-shell reveal"><div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(ui().liveWorldBank)}</h2></div></div><div class="indicator-strip">${renderWorldBankCards()}</div></div>
        <div class="section-shell reveal"><div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(ui().sources)}</h2></div></div><ul class="source-list">${state.content.sources.map((item) => `<li class="source-item"><div><strong>${escape(item.title)}</strong><span class="meta">${escape(item.org)}</span></div><a href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></li>`).join("")}</ul></div>
      </div>
    `;
  }

  function renderMedia() {
    dom.mediaContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().mediaKicker)}</p><h2 class="section-title">${escape(ui().nav.media)}</h2><p class="section-summary">${escape(ui().mediaSummary)}</p></div></div>
        <div class="gallery-grid">${state.content.media.map((item) => `<article class="gallery-card"><div class="gallery-card__media gallery-card__media--theme-${attr(item.theme)}"><img src="${attr(item.image)}" alt="${attr(pick(item.title))}" loading="lazy"></div><h3>${escape(pick(item.title))}</h3><p>${escape(pick(item.summary))}</p></article>`).join("")}</div>
      </div>
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(ui().videos)}</h2></div></div>
        <div class="resource-grid">${state.content.videos.map((item) => `<article class="video-card"><div class="list-card__meta"><span>${escape(item.source)}</span></div><h3>${escape(pick(item.title))}</h3><p>${escape(pick(item.summary))}</p><a class="video-card__link" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></article>`).join("")}</div>
      </div>
    `;
  }

  function renderContacts() {
    const org = state.content.organization;
    dom.contactsContent.innerHTML = `
      <div class="section-shell reveal">
        <div class="section-header"><div class="section-copy"><p class="section-kicker">${escape(ui().contactsKicker)}</p><h2 class="section-title">${escape(ui().nav.contacts)}</h2><p class="section-summary">${escape(ui().contactsSummary)}</p></div></div>
        <div class="contact-grid">
          <div class="contact-stack">
            <article class="contact-card"><div class="contact-card__icon">⌂</div><h3>${escape(ui().office)}</h3><p>${escape(pick(org.address))}</p></article>
            <article class="contact-card"><div class="contact-card__icon">☎</div><h3>${escape(ui().phone)}</h3><p>${escape(org.phone)}</p></article>
            <article class="contact-card"><div class="contact-card__icon">✉</div><h3>${escape(ui().email)}</h3><p>${escape(org.email)}</p></article>
            <article class="contact-card"><div class="contact-card__icon">◷</div><h3>${escape(ui().hours)}</h3><p>${escape(pick(org.hours))}</p></article>
            <iframe class="map-frame" title="${attr(ui().map)}" src="${attr(org.mapEmbed)}"></iframe>
          </div>
          <div class="contact-stack">
            <article class="contact-card">
              <h3>${escape(ui().contactForm)}</h3>
              <p class="contact-note">${escape(ui().formNote)}</p>
              <form class="contact-form" id="contactForm">
                <div class="form-grid">
                  <label class="form-field"><span class="field-label">${escape(ui().formName)}</span><input name="name" type="text" required></label>
                  <label class="form-field"><span class="field-label">${escape(ui().formEmail)}</span><input name="email" type="email" required></label>
                  <label class="form-field"><span class="field-label">${escape(ui().formTopic)}</span><input name="topic" type="text" required></label>
                  <label class="form-field"><span class="field-label">${escape(ui().formCaptcha)}</span><input name="captcha" type="text" inputmode="numeric" placeholder="${attr(`${state.captcha.a} + ${state.captcha.b}`)}" required></label>
                  <label class="form-field form-field--full"><span class="field-label">${escape(ui().formMessage)}</span><textarea name="message" required></textarea></label>
                </div>
                <button class="button button-primary" type="submit">${escape(ui().formSubmit)}</button>
              </form>
            </article>
          </div>
        </div>
      </div>
    `;
  }

  function renderFooter() {
    const org = state.content.organization;
    const supportLinks = [
      { href: "site-map.html", label: ui().siteMap },
      { href: "privacy.html", label: ui().privacyPolicy },
      { href: "terms.html", label: ui().termsOfUse }
    ];
    dom.footerContent.innerHTML = `
      <div class="footer-shell">
        <div class="footer-grid">
          <div><h3 class="section-title" style="font-size:1.5rem">${escape(pick(org.name))}</h3><p class="section-summary">${escape(pick(org.description))}</p></div>
          <div><h3>${escape(ui().nav.home)}</h3><nav class="footer-nav">${NAV_ITEMS.map((item) => `<a href="#${item}">${escape(ui().nav[item])}</a>`).join("")}</nav></div>
          <div><h3>${escape(ui().supportLinks)}</h3><nav class="footer-nav">${supportLinks.map((item) => `<a href="${attr(item.href)}">${escape(item.label)}</a>`).join("")}</nav></div>
          <div><h3>${escape(ui().contactsKicker)}</h3><p class="meta">${escape(pick(org.address))}</p><p class="meta">${escape(org.phone)}</p><p class="meta">${escape(org.email)}</p></div>
        </div>
        <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${escape(pick(org.name))}</span><span>${escape(ui().footerNote)}</span></div>
      </div>
    `;
  }

  function renderSearchResults() {
    const query = state.filters.searchQuery;
    if (!query) {
      dom.searchResults.innerHTML = `<div class="search-empty">${escape(ui().searchHint)}</div>`;
      return;
    }
    const results = buildSearchIndex().filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(query));
    dom.searchResults.innerHTML = results.length
      ? results.map((item) => `<article class="search-result"><div><div class="list-card__meta"><span>${escape(ui().searchType[item.type])}</span></div><h3>${escape(item.title)}</h3><p class="search-result__summary">${escape(item.summary)}</p></div><button class="button button-secondary" type="button" data-search-target="${attr(item.section)}" data-search-card="${attr(item.cardId)}">${escape(ui().openSource)}</button></article>`).join("")
      : `<div class="search-empty">${escape(ui().searchEmpty)}</div>`;
  }

  function renderProgramCard(item) {
    return `<article class="feature-card"><div class="feature-card__icon">${icon(item.id)}</div><h3>${escape(pick(item.title))}</h3><p>${escape(pick(item.summary))}</p><a class="feature-card__link" href="${attr(item.url)}"${item.url.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escape(ui().openSource)}</a></article>`;
  }

  function renderStack(title, items, type) {
    return `<div class="section-header"><div class="section-copy"><h2 class="section-title">${escape(title)}</h2></div></div><div class="stack-list">${items.map((item) => `<article class="list-card" id="${attr(item.id)}"><div class="list-card__meta">${type === "decision" ? badge(ui().category[item.category], item.category) : badge(ui().docTypeLabels[item.type], item.type)}<span>${escape(type === "decision" ? formatDate(item.date) : String(item.year))}</span></div><h3>${escape(pick(item.title))}</h3><p>${escape(pick(item.summary))}</p><a href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></article>`).join("")}</div>`;
  }

  function renderDocumentCard(item) {
    return `<article class="resource-card" id="${attr(item.id)}"><div class="resource-card__meta">${badge(ui().docTypeLabels[item.type], item.type)}<span>${escape(String(item.year))}</span></div><h3>${escape(pick(item.title))}</h3><p class="resource-card__summary">${escape(pick(item.summary))}</p><a class="resource-card__link" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></article>`;
  }

  function renderNewsCard(item) {
    return `<article class="news-card" id="${attr(item.id)}"><div class="news-card__meta">${badge(ui().newsTags[item.tag], item.tag)}<span>${escape(formatDate(item.date))}</span></div><h3>${escape(pick(item.title))}</h3><p class="news-card__summary">${escape(pick(item.summary))}</p><a class="news-card__link" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">${escape(ui().openSource)}</a></article>`;
  }

  function renderAirCard() {
    if (!state.live.air) return `<article class="live-card"><h3>${escape(ui().liveAir)}</h3><p>${escape(ui().searchHint)}</p></article>`;
    return `<article class="live-card"><div class="live-card__icon">AQ</div><h3>${escape(ui().liveAir)}</h3><div class="live-value"><strong>${escape(String(state.live.air.aqi))}</strong><span>${escape(ui().aqi)}</span></div><div class="live-meta"><span>PM2.5: ${escape(String(state.live.air.pm25))}</span><span>PM10: ${escape(String(state.live.air.pm10))}</span></div><p>${escape(state.live.air.label)}</p></article>`;
  }

  function renderWeatherCard() {
    if (!state.live.weather) return `<article class="live-card"><h3>${escape(ui().liveWeather)}</h3><p>${escape(ui().searchHint)}</p></article>`;
    return `<article class="live-card"><div class="live-card__icon">${escape(state.live.weather.icon)}</div><h3>${escape(ui().liveWeather)}</h3><div class="live-value"><strong>${escape(String(state.live.weather.temp))}</strong><span>°C</span></div><div class="live-meta"><span>${escape(state.live.weather.label)}</span><span>${escape(ui().weatherMeta)}</span></div><div class="forecast-strip">${state.live.weather.forecast.map((item) => `<div class="forecast-card"><div>${escape(item.day)}</div><strong>${escape(String(item.max))}°</strong><div>${escape(item.icon)}</div></div>`).join("")}</div></article>`;
  }

  function renderWorldBankCards() {
    if (!state.live.worldBank.length) return `<div class="indicator-card"><strong>...</strong><span>${escape(ui().searchHint)}</span></div>`;
    return state.live.worldBank.map((item) => `<div class="indicator-card"><strong>${escape(item.value)}</strong><span>${escape(ui().worldBank[item.key])}</span><span class="meta">${escape(item.year)}</span></div>`).join("");
  }

  async function loadLiveData() {
    const [air, weather, world] = await Promise.allSettled([loadAir(), loadWeather(), loadWorldBank()]);
    if (air.status === "fulfilled") state.live.air = air.value;
    if (weather.status === "fulfilled") state.live.weather = weather.value;
    if (world.status === "fulfilled") state.live.worldBank = world.value;
    renderAnalytics();
    reveal();
  }

  async function loadAir() {
    const data = await fetchJson("https://api.waqi.info/feed/tashkent/?token=demo");
    if (data.status !== "ok") throw new Error("AQI");
    const aqi = Number(data.data.aqi) || 0;
    return { aqi, pm25: data.data.iaqi?.pm25?.v ?? "-", pm10: data.data.iaqi?.pm10?.v ?? "-", label: airLabel(aqi) };
  }

  async function loadWeather() {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=41.2995&longitude=69.2401&current=temperature_2m,weather_code&daily=temperature_2m_max,weather_code&timezone=Asia%2FTashkent&forecast_days=5";
    const data = await fetchJson(url);
    return {
      temp: Math.round(data.current.temperature_2m),
      icon: weatherIcon(data.current.weather_code),
      label: weatherLabel(data.current.weather_code),
      forecast: data.daily.time.map((date, index) => ({
        day: new Date(date).toLocaleDateString(locale(), { weekday: "short" }),
        max: Math.round(data.daily.temperature_2m_max[index]),
        icon: weatherIcon(data.daily.weather_code[index])
      }))
    };
  }

  async function loadWorldBank() {
    return Promise.all(WORLD_BANK.map(async (item) => {
      const data = await fetchJson(`https://api.worldbank.org/v2/country/UZB/indicator/${item.id}?format=json&per_page=8`);
      const latest = (data[1] || []).find((entry) => entry.value !== null);
      return { key: item.key, year: latest?.date || "", value: formatIndicator(latest?.value, item.unit) };
    }));
  }

  function buildSearchIndex() {
    return []
      .concat(state.content.programs.map((item) => ({ type: "program", title: pick(item.title), summary: pick(item.summary), section: item.url.startsWith("#") ? item.url.slice(1) : "activities", cardId: "" })))
      .concat(state.content.decisions.map((item) => ({ type: "decision", title: pick(item.title), summary: pick(item.summary), section: "home", cardId: item.id })))
      .concat(state.content.documents.map((item) => ({ type: "document", title: pick(item.title), summary: pick(item.summary), section: "documents", cardId: item.id })))
      .concat(state.content.news.map((item) => ({ type: "news", title: pick(item.title), summary: pick(item.summary), section: "news", cardId: item.id })))
      .concat(state.content.sources.map((item) => ({ type: "source", title: item.title, summary: item.org, section: "analytics", cardId: "" })));
  }

  function updateMeta() {
    document.title = `${pick(state.content.organization.name)} | ${ui().brandShort}`;
    document.querySelector('meta[name="description"]').setAttribute("content", pick(state.content.organization.description));
    document.getElementById("orgSchema").textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: pick(state.content.organization.name),
      url: "https://uznccc.uz/",
      email: state.content.organization.email,
      telephone: state.content.organization.phone,
      address: pick(state.content.organization.address)
    });
  }

  function openSearch() {
    dom.searchDialog.hidden = false;
    dom.globalSearchInput.focus();
    renderSearchResults();
  }

  function closeSearch() {
    dom.searchDialog.hidden = true;
  }

  function observeSections() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          document.querySelectorAll("[data-nav-link]").forEach((link) => {
            link.classList.toggle("is-active", link.dataset.navLink === entry.target.id);
          });
        }
      });
    }, { rootMargin: "-30% 0px -55% 0px", threshold: 0.1 });
    NAV_ITEMS.forEach((item) => observer.observe(document.getElementById(item)));
  }

  function syncActiveLinks() {
    const current = (location.hash || "#home").slice(1);
    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.navLink === current);
    });
    dom.mobilePanel.hidden = true;
    dom.menuToggle.setAttribute("aria-expanded", "false");
  }

  function jumpTo(sectionId, cardId) {
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!cardId) return;
    setTimeout(() => {
      const card = document.getElementById(cardId);
      if (!card) return;
      card.classList.add("is-highlighted");
      setTimeout(() => card.classList.remove("is-highlighted"), 1800);
    }, 240);
  }

  function reveal() {
    document.querySelectorAll(".hero-shell, .section-shell").forEach((element) => {
      element.classList.add("reveal", "is-visible");
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  function fetchJson(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
  }

  function showAlert(message) {
    dom.pageAlert.hidden = false;
    dom.pageAlert.textContent = message;
  }

  function toast(message, type) {
    const item = document.createElement("div");
    item.className = `toast toast--${type}`;
    item.textContent = message;
    dom.toastStack.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function ui() {
    return state.ui[state.lang] || state.ui.uz;
  }

  function pick(value) {
    return typeof value === "string" ? value : value?.[state.lang] || value?.uz || value?.ru || value?.en || "";
  }

  function badge(label, tone) {
    const toneClass = tone === "official" || tone === "national" ? "brand" : tone === "report" || tone === "monitoring" || tone === "institution" ? "blue" : tone === "publication" || tone === "policy" || tone === "leadership" ? "gold" : "red";
    return `<span class="badge badge--${toneClass}">${escape(label || "")}</span>`;
  }

  function icon(key) {
    return { policy: "◍", monitoring: "◴", documents: "▣", "green-cities": "◎" }[key] || "◌";
  }

  function formatDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString(locale(), { year: "numeric", month: "short", day: "2-digit" });
  }

  function locale() {
    return state.lang === "ru" ? "ru-RU" : state.lang === "en" ? "en-US" : "uz-UZ";
  }

  function formatIndicator(value, unit) {
    if (value == null) return "—";
    return `${Number(value).toFixed(1)} ${unit}`;
  }

  function airLabel(aqi) {
    if (state.lang === "ru") return aqi <= 50 ? "Хорошо" : aqi <= 100 ? "Умеренно" : "Вредно";
    if (state.lang === "en") return aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : "Unhealthy";
    return aqi <= 50 ? "Yaxshi" : aqi <= 100 ? "O'rtacha" : "Zararli";
  }

  function weatherIcon(code) {
    if (code === 0) return "☀";
    if (code <= 3) return "⛅";
    if (code <= 67) return "☂";
    return "☁";
  }

  function weatherLabel(code) {
    if (state.lang === "ru") return code === 0 ? "Ясно" : code <= 3 ? "Переменная облачность" : "Осадки";
    if (state.lang === "en") return code === 0 ? "Clear" : code <= 3 ? "Partly cloudy" : "Precipitation";
    return code === 0 ? "Ochiq" : code <= 3 ? "Qisman bulutli" : "Yog'ingarchilik";
  }

  function makeCaptcha() {
    const a = Math.floor(Math.random() * 7) + 2;
    const b = Math.floor(Math.random() * 7) + 2;
    return { a, b, answer: a + b };
  }

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function escape(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function attr(value) {
    return escape(value).replace(/`/g, "");
  }
})();
