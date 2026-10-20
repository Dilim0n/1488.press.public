const toast = document.getElementById('toast');
const themeToggleBtn = document.getElementById('theme-toggle');
const themeText = document.getElementById('theme-text');
const langDropdown = document.getElementById('lang-dropdown');
const langDropdownBtn = document.getElementById('lang-dropdown-btn');
const currentLangText = document.getElementById('current-lang-text');
const langDropdownItems = document.querySelectorAll('.lang-dropdown-item');
const greetingEl = document.getElementById('greeting');
const contactLeadTextEl = document.getElementById('contact-lead-text');
const footerInfoEl = document.getElementById('footer-info');
const footerContactTextEl = document.getElementById('footer-contact-text');
const copyableEls = document.querySelectorAll('.copyable');

// Converter elements
const converterTitleEl = document.getElementById('converter-title');
const converterDescEl = document.getElementById('converter-desc');
const converterInput = document.getElementById('converter-input');
const converterBtn = document.getElementById('converter-btn');
const pasteBtnEl = document.getElementById('paste-btn');
const converterResult = document.getElementById('converter-result');
const converterResultUrl = document.getElementById('converter-result-url');
const converterCopyBtn = document.getElementById('converter-copy-btn');
const converterHintEl = document.getElementById('converter-hint');

let toastTimeout;

const translations = {
  en: {
    greeting: "Hi there! Im searching for people who can help me with creating this website.",
    contactLead: "Contact me:",
    footerInfo: "Info: This site does not collect any information about you.",
    footerContact: "Contact:",
    copyTitle: "Click to copy",
    toastCopied: "Mail Copied!",
    themeLight: "Light Mode",
    themeDark: "Dark Mode",
    langDisplay: "EN",
    langAria: "Current language: English. Click to choose language",
    converterTitle: "Twitter / X Embed Fixer",
    converterDesc: "Fix broken video & image embeds in Telegram, Discord, and chat apps.",
    converterPlaceholder: "Paste X / Twitter URL here...",
    converterBtn: "Fix Link",
    pasteBtn: "Paste",
    converterCopy: "Copy",
    converterCopied: "Link Copied!",
    converterHint: "Tip: Just replace <code>x.com</code> with <code>1488.press</code> in any tweet URL.",
    converterInvalid: "Please enter a valid Twitter / X URL or post ID"
  },
  ru: {
    greeting: "Привет! Я ищу людей, которые могут помочь мне с созданием этого сайта.",
    contactLead: "Связаться со мной:",
    footerInfo: "Инфо: Этот сайт не собирает никакой информации о вас.",
    footerContact: "Контакты:",
    copyTitle: "Нажмите, чтобы скопировать",
    toastCopied: "Почта скопирована!",
    themeLight: "Светлая тема",
    themeDark: "Тёмная тема",
    langDisplay: "RU",
    langAria: "Текущий язык: Русский. Нажмите для выбора языка",
    converterTitle: "Twitter / X Фиксер ссылок",
    converterDesc: "Воспроизведение видео и картинок прямо в Telegram, Discord и мессенджерах.",
    converterPlaceholder: "Вставьте ссылку на твит из X / Twitter...",
    converterBtn: "Исправить",
    pasteBtn: "Вставить",
    converterCopy: "Копировать",
    converterCopied: "Ссылка скопирована!",
    converterHint: "Подсказка: просто замените <code>x.com</code> на <code>1488.press</code> в ссылке на любой твит.",
    converterInvalid: "Пожалуйста, введите ссылку на твит или ID"
  }
};

// Default language is English
let currentLang = localStorage.getItem('lang');
if (currentLang !== 'ru' && currentLang !== 'en') {
  currentLang = 'en';
}

// Show Toast helper
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Copy logic helper
function copyToClipboard(text, successToastMsg) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successToastMsg || translations[currentLang].toastCopied);
  }).catch(err => {
    console.error('Error during copying', err);
  });
}

// Bind all copyable email elements
copyableEls.forEach(el => {
  el.addEventListener('click', () => {
    const text = el.textContent.trim();
    copyToClipboard(text);
  });
});

// Update theme button text to reflect CURRENT active theme
function updateThemeButtonText() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (themeText) {
    themeText.textContent = isLight 
      ? translations[currentLang].themeLight 
      : translations[currentLang].themeDark;
  }
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute(
      'aria-label',
      isLight ? 'Current theme: Light' : 'Current theme: Dark'
    );
  }
}

// Theme Switcher logic
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  updateThemeButtonText();
}

// Language logic
function applyLanguage(lang) {
  if (!translations[lang]) lang = 'en';
  currentLang = lang;
  document.documentElement.setAttribute('lang', lang);

  const t = translations[lang];
  if (greetingEl) greetingEl.textContent = t.greeting;
  if (contactLeadTextEl) contactLeadTextEl.textContent = t.contactLead;
  if (footerInfoEl) footerInfoEl.textContent = t.footerInfo;
  if (footerContactTextEl) footerContactTextEl.textContent = t.footerContact;
  if (toast) toast.textContent = t.toastCopied;

  // Converter strings
  if (converterTitleEl) converterTitleEl.textContent = t.converterTitle;
  if (converterDescEl) converterDescEl.textContent = t.converterDesc;
  if (converterInput) converterInput.placeholder = t.converterPlaceholder;
  if (converterBtn) converterBtn.textContent = t.converterBtn;
  if (pasteBtnEl) pasteBtnEl.textContent = t.pasteBtn;
  if (converterCopyBtn) converterCopyBtn.textContent = t.converterCopy;
  if (converterHintEl) converterHintEl.innerHTML = t.converterHint;

  copyableEls.forEach(el => {
    el.setAttribute('title', t.copyTitle);
  });

  if (currentLangText) {
    currentLangText.textContent = t.langDisplay;
  }
  if (langDropdownBtn) {
    langDropdownBtn.setAttribute('aria-label', t.langAria);
  }

  langDropdownItems.forEach(item => {
    const isActive = item.getAttribute('data-lang') === lang;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  updateThemeButtonText();
}

// Dropdown controls
function closeDropdown() {
  if (langDropdown) {
    langDropdown.classList.remove('open');
    if (langDropdownBtn) {
      langDropdownBtn.setAttribute('aria-expanded', 'false');
    }
  }
}

function toggleDropdown(e) {
  e.stopPropagation();
  const isOpen = langDropdown.classList.toggle('open');
  langDropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

if (langDropdownBtn) {
  langDropdownBtn.addEventListener('click', toggleDropdown);
}

langDropdownItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const chosenLang = item.getAttribute('data-lang');
    if (chosenLang && chosenLang !== currentLang) {
      applyLanguage(chosenLang);
      localStorage.setItem('lang', chosenLang);
    }
    closeDropdown();
  });
});

// Close dropdown on outside click or Escape key
document.addEventListener('click', (e) => {
  if (langDropdown && !langDropdown.contains(e.target)) {
    closeDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDropdown();
  }
});

// Check saved preference for theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  applyTheme(savedTheme);
} else {
  updateThemeButtonText();
}

// Apply default/saved language
applyLanguage(currentLang);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const nextTheme = isLight ? 'dark' : 'light';
    
    applyTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  });
}

// Converter logic
function convertTwitterUrl(rawInput) {
  if (!rawInput) return null;
  const input = rawInput.split('?')[0].split('#')[0].trim();
  if (!input) return null;

  let path = '';
  if (/^\d+$/.test(input)) {
    path = 'i/status/' + input;
  } else {
    let clean = input.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    clean = clean.replace(/^(?:twitter\.com|x\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|1488x\.com|1488\.press)\/?/i, '');
    path = clean.replace(/^\/+/, '');
  }

  if (/^\d+$/.test(path)) {
    path = 'i/status/' + path;
  }

  if (!path || !path.includes('status/')) {
    return null;
  }

  return 'https://1488.press/' + path;
}

function handleConvert() {
  if (!converterInput) return;
  const raw = converterInput.value.trim();
  const fixed = convertTwitterUrl(raw);

  if (!fixed) {
    showToast(translations[currentLang].converterInvalid);
    return;
  }

  converterResultUrl.textContent = fixed;
  converterResult.style.display = 'flex';
  if (converterCopyBtn) {
    converterCopyBtn.textContent = translations[currentLang].converterCopy;
  }
}

if (converterBtn) {
  converterBtn.addEventListener('click', handleConvert);
}

if (pasteBtnEl) {
  pasteBtnEl.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (converterInput && text) {
        converterInput.value = text;
        handleConvert();
      }
    } catch (err) {
      console.error('Clipboard read failed', err);
    }
  });
}

if (converterInput) {
  converterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConvert();
    }
  });
}

if (converterCopyBtn) {
  converterCopyBtn.addEventListener('click', () => {
    const text = converterResultUrl.textContent;
    if (text) {
      copyToClipboard(text, translations[currentLang].converterCopied);
      converterCopyBtn.textContent = translations[currentLang].converterCopied;
      setTimeout(() => {
        if (converterCopyBtn) {
          converterCopyBtn.textContent = translations[currentLang].converterCopy;
        }
      }, 2000);
    }
  });
}
