(() => {
  const copy = {
    uz: {
      supportPages: "Yordamchi sahifalar",
      home: "Bosh sahifa",
      backHome: "Portalga qaytish",
      theme: "Mavzuni almashtirish"
    },
    ru: {
      supportPages: "Служебные страницы",
      home: "Главная",
      backHome: "Вернуться на портал",
      theme: "Сменить тему"
    },
    en: {
      supportPages: "Support pages",
      home: "Home",
      backHome: "Back to portal",
      theme: "Toggle theme"
    }
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const state = {
      lang: localStorage.getItem("nccc-lang") || "uz",
      theme: localStorage.getItem("nccc-theme") || systemTheme()
    };

    const nodes = {
      langButtons: [...document.querySelectorAll("[data-lang]")],
      copyBlocks: [...document.querySelectorAll("[data-copy]")],
      translated: [...document.querySelectorAll("[data-i18n]")],
      themeToggle: document.getElementById("themeToggle"),
      themeToggleGlyph: document.getElementById("themeToggleGlyph"),
      themeToggleLabel: document.getElementById("themeToggleLabel"),
      metaTheme: document.querySelector('meta[name="theme-color"]'),
      metaDescription: document.querySelector('meta[name="description"]')
    };

    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      nodes.metaTheme?.setAttribute("content", theme === "dark" ? "#071514" : "#0b6b67");
      if (nodes.themeToggleGlyph) nodes.themeToggleGlyph.textContent = theme === "dark" ? "\u263D" : "\u25D0";
      if (nodes.themeToggle) nodes.themeToggle.setAttribute("aria-label", translate(state.lang).theme);
      if (nodes.themeToggleLabel) nodes.themeToggleLabel.textContent = translate(state.lang).theme;
    }

    function applyLang(lang) {
      state.lang = copy[lang] ? lang : "uz";
      localStorage.setItem("nccc-lang", state.lang);
      document.documentElement.lang = state.lang;
      nodes.langButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.lang === state.lang);
      });
      nodes.copyBlocks.forEach((block) => {
        block.hidden = block.dataset.copy !== state.lang;
      });
      nodes.translated.forEach((node) => {
        node.textContent = translate(state.lang)[node.dataset.i18n] || "";
      });
      const titleKey = `title${state.lang.charAt(0).toUpperCase()}${state.lang.slice(1)}`;
      const descriptionKey = `description${state.lang.charAt(0).toUpperCase()}${state.lang.slice(1)}`;
      if (document.body.dataset[titleKey]) document.title = document.body.dataset[titleKey];
      if (nodes.metaDescription && document.body.dataset[descriptionKey]) {
        nodes.metaDescription.setAttribute("content", document.body.dataset[descriptionKey]);
      }
      applyTheme(state.theme);
    }

    document.addEventListener("click", (event) => {
      const langButton = event.target.closest("[data-lang]");
      if (langButton) {
        applyLang(langButton.dataset.lang);
        return;
      }
      if (event.target.closest("#themeToggle")) {
        state.theme = state.theme === "dark" ? "light" : "dark";
        localStorage.setItem("nccc-theme", state.theme);
        applyTheme(state.theme);
      }
    });

    applyLang(state.lang);
  }

  function translate(lang) {
    return copy[lang] || copy.uz;
  }

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
})();
