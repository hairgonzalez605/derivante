// Derivante — shared settings module. sessionStorage-backed; swap loadSettings/saveSettings
// to localStorage later without touching anything that calls this module.
const SETTINGS_KEY = 'derivante.settings.v1';
const DEFAULT_SETTINGS = {
  theme: 'dark',
  showLatex: true,
  detailLevel: 'normal',
  autoShowSteps: false,
  oneStepDefault: false,
  maxVisibleSteps: 12,
  graphGridDefault: true,
  graphAxesDefault: true,
  graphAnimations: true,
  graphQuality: 'alta',
  graphColorScheme: 'mono',
  autoScrollResult: true,
  confirmClearHistory: true,
  rememberSettings: true,
  uiAnimations: true,
  reduceAnimations: false,
  simplifiedRendering: false,
  lowResourceMode: false,
};

function loadSettings() {
  try {
    const raw = sessionStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch (_) { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  try {
    if (s.rememberSettings) sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SETTINGS_KEY);
  } catch (_) { /* storage unavailable — settings just won't persist */ }
}

let settings = loadSettings();
let systemThemeQuery = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(prefers-color-scheme: light)') : null;

function resolveTheme() {
  if (settings.theme === 'system') return (systemThemeQuery && systemThemeQuery.matches) ? 'light' : 'dark';
  return settings.theme;
}
function applySettings() {
  document.documentElement.classList.toggle('theme-light', resolveTheme() === 'light');
  const noAnim = !settings.uiAnimations || settings.reduceAnimations || settings.lowResourceMode;
  document.documentElement.classList.toggle('perf-no-anim', noAnim);
  document.documentElement.classList.toggle('no-spotlight', settings.simplifiedRendering || settings.lowResourceMode);
  const spline = document.getElementById('spline-viewer');
  if (spline) spline.style.display = settings.lowResourceMode ? 'none' : '';
  if (typeof window.onSettingsApplied === 'function') window.onSettingsApplied();
}
if (systemThemeQuery) systemThemeQuery.addEventListener('change', () => { if (settings.theme === 'system') applySettings(); });

// ---------- UI builders ----------
function settingsToggleRow(id, label, checked) {
  return `<label class="flex items-center justify-between gap-md py-2 cursor-pointer select-none">
    <span class="font-body-md text-on-surface">${label}</span>
    <span class="relative inline-block w-10 h-6 shrink-0">
      <input type="checkbox" id="${id}" class="settings-toggle peer sr-only" ${checked ? 'checked' : ''}>
      <span class="absolute inset-0 rounded-full bg-surface-high peer-checked:bg-primary transition-colors"></span>
      <span class="absolute left-1 top-1 w-4 h-4 rounded-full bg-on-surface-variant peer-checked:bg-on-primary peer-checked:translate-x-4 transition-transform"></span>
    </span>
  </label>`;
}
function settingsSelectRow(id, label, options, selected) {
  const opts = options.map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`).join('');
  return `<label class="flex items-center justify-between gap-md py-2">
    <span class="font-body-md text-on-surface">${label}</span>
    <select id="${id}" class="settings-select key rounded-md h-9 px-sm font-body-md bg-surface-low">${opts}</select>
  </label>`;
}
function settingsNumberRow(id, label, value, min, max) {
  return `<label class="flex items-center justify-between gap-md py-2">
    <span class="font-body-md text-on-surface">${label}</span>
    <input type="number" id="${id}" min="${min}" max="${max}" value="${value}" class="settings-number key rounded-md h-9 px-sm w-20 text-center font-body-md bg-surface-low">
  </label>`;
}
function settingsSection(title, rowsHTML) {
  return `<div class="rule-card space-y-1">
    <h3 class="font-sans text-body-lg font-semibold text-on-surface mb-1">${title}</h3>
    ${rowsHTML}
  </div>`;
}
function buildSettingsHTML() {
  return [
    settingsSection('Apariencia', settingsSelectRow('setting-theme', 'Tema', [['dark', 'Oscuro'], ['light', 'Claro'], ['system', 'Seguir el sistema']], settings.theme)),
    settingsSection('Matemáticas', [
      settingsToggleRow('setting-showLatex', 'Mostrar resultados en LaTeX', settings.showLatex),
      settingsSelectRow('setting-detailLevel', 'Nivel de detalle del procedimiento', [['basico', 'Básico'], ['normal', 'Normal'], ['detallado', 'Detallado']], settings.detailLevel),
      settingsToggleRow('setting-autoShowSteps', 'Mostrar automáticamente el paso a paso', settings.autoShowSteps),
      settingsToggleRow('setting-oneStepDefault', 'Modo "un paso a la vez" por defecto', settings.oneStepDefault),
      settingsNumberRow('setting-maxVisibleSteps', 'Número máximo de pasos visibles', settings.maxVisibleSteps, 3, 30),
    ].join('')),
    settingsSection('Gráficas', [
      settingsToggleRow('setting-graphGridDefault', 'Mostrar cuadrícula por defecto', settings.graphGridDefault),
      settingsToggleRow('setting-graphAxesDefault', 'Mostrar ejes por defecto', settings.graphAxesDefault),
      settingsToggleRow('setting-graphAnimations', 'Activar animaciones', settings.graphAnimations),
      settingsSelectRow('setting-graphQuality', 'Calidad de renderizado', [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']], settings.graphQuality),
      settingsSelectRow('setting-graphColorScheme', 'Colores predeterminados', [['mono', 'Monocromo'], ['accent', "Acento (f' en color)"]], settings.graphColorScheme),
    ].join('')),
    settingsSection('Experiencia de usuario', [
      settingsToggleRow('setting-autoScrollResult', 'Desplazamiento automático al resultado', settings.autoScrollResult),
      settingsToggleRow('setting-confirmClearHistory', 'Confirmación antes de borrar el historial', settings.confirmClearHistory),
      settingsToggleRow('setting-rememberSettings', 'Recordar configuraciones durante la sesión', settings.rememberSettings),
      settingsToggleRow('setting-uiAnimations', 'Animaciones de la interfaz', settings.uiAnimations),
    ].join('')),
    settingsSection('Rendimiento', [
      settingsToggleRow('setting-reduceAnimations', 'Reducir animaciones', settings.reduceAnimations),
      settingsToggleRow('setting-simplifiedRendering', 'Renderizado simplificado', settings.simplifiedRendering),
      settingsToggleRow('setting-lowResourceMode', 'Optimización para equipos de bajos recursos', settings.lowResourceMode),
    ].join('')),
    '<div class="flex justify-end"><button type="button" id="settings-reset-btn" class="btn-ghost font-label-md uppercase tracking-widest px-2 py-1 rounded">Restablecer valores predeterminados</button></div>',
  ].join('');
}
function wireSettingsControls(container, onChange) {
  const notify = () => { if (typeof onChange === 'function') onChange(); };
  container.querySelectorAll('.settings-toggle').forEach(el => {
    el.addEventListener('change', () => {
      settings[el.id.replace('setting-', '')] = el.checked;
      saveSettings(settings); applySettings(); notify();
    });
  });
  container.querySelectorAll('.settings-select').forEach(el => {
    el.addEventListener('change', () => {
      settings[el.id.replace('setting-', '')] = el.value;
      saveSettings(settings); applySettings(); notify();
    });
  });
  container.querySelectorAll('.settings-number').forEach(el => {
    el.addEventListener('change', () => {
      const min = parseInt(el.min, 10), max = parseInt(el.max, 10);
      const v = Math.max(min, Math.min(max, parseInt(el.value, 10) || min));
      el.value = v;
      settings[el.id.replace('setting-', '')] = v;
      saveSettings(settings); applySettings(); notify();
    });
  });
  const resetBtn = container.querySelector('#settings-reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings(settings); applySettings(); notify();
    container.innerHTML = buildSettingsHTML();
    if (typeof renderMath === 'function') renderMath(container);
    wireSettingsControls(container, onChange);
  });
}
