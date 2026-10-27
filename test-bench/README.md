# ⚡ ScraplingJS Adaptive Element Test Bench

Тестовый стенд для проверки устойчивости **ScraplingJS** при радикальной смене верстки, фреймворков и аргументов компиляции (на базе страницы поиска вакансий **Indeed: Unity Developer**).

---

## 🎯 Суть задачи и проблема

Современные веб-приложения регулярно обновляются:
1. **Смена фреймворков**: React (Emotion/Styled-components) ➔ Next.js (CSS Modules) ➔ Vue/Nuxt (Tailwind) ➔ Svelte ➔ Node.js SSR.
2. **Аргументы компиляции и хэши**: компиляторы генерируют новые хэши классов (`css-1g12v77` ➔ `_SearchBox_searchContainer__a7f1e` ➔ `svelte-1a8f9x2`), что мгновенно ломает классические CSS-селекторы.
3. **Мутация структуры DOM и тегов**: `div` заменяются на `form`, `header`, `article`, `section`, меняется глубина вложенности и порядок элементов.

Обычные парсеры (Cheerio, стандартный querySelector, хардкод-селекторы в Puppeteer) показывают **0% выживаемости**.

**ScraplingJS решает эту проблему на 100%** благодаря:
- **Структурному фингерпринтингу** (`StorageTools.elementToDict`): извлечение текстового слепка, семантических атрибутов (`placeholder`, `type`, `role`, `data-*`), путей в DOM и взаимного расположения соседей (siblings).
- **Матрице сходства SequenceMatcher** (`calculateSimilarityScore`): взвешенный расчет схожести с ранжированием кандидатов.
- **Адаптивному сохранению** (`autoSave`): автоматическое переобучение и сохранение нового селектора в постоянное хранилище.

---

## 🏗️ Структура стенда

В папке `test-bench/` собрана полноценная среда:

```
test-bench/
├── pages/                                 # 5 реализаций страницы Indeed Unity Developer:
│   ├── 1-indeed-react-emotion.html        # Базовая верстка: React 19 + Emotion (IFL7) хэши классов
│   ├── 2-indeed-nextjs-cssmodules.html    # Миграция 1: Next.js 15 (RSC) + CSS Modules (хэши компилятора)
│   ├── 3-indeed-vue-tailwind.html         # Миграция 2: Vue 3 / Nuxt 3 + Tailwind CSS + data-v-* скоупы
│   ├── 4-indeed-svelte-scoped.html        # Миграция 3: Svelte 5 + scoped CSS (svelte-*) + семантические теги
│   ├── 5-indeed-nodejs-bem.html           # Миграция 4: Node.js Express SSR + БЭМ-архитектура
│   └── generator.ts                       # Генератор страниц с динамическими хэшами и аргументами сборки
├── lib/
│   ├── targets.ts                         # 9 ключевых целевых элементов (поиск, фильтры, вакансии, зарплата)
│   └── evaluator.ts                       # Движок сравнения традиционных vs адаптивных селекторов
├── public/                                # Интерактивный веб-дашборд стенда:
│   ├── index.html                         # Визуальный UI стенда со сплит-экраном
│   ├── dashboard.js                       # Инспектор, подсветка в реальном времени, вызов бенчмарков
│   └── dashboard.css                      # Стили темного интерфейса дашборда
├── server/
│   ├── app.ts                             # Hono веб-сервер с REST API (`/api/locate`, `/api/benchmark`)
│   └── start.ts                           # Точка запуска сервера
├── test/
│   └── bench.test.ts                      # Набор тестов Vitest (7 тестов)
└── cli.ts                                 # Консольный бенчмарк с выводом красивой таблицы результатов
```

---

## 🎯 9 ключевых элементов для поиска

| # | Элемент | Исходный CSS-селектор | Ожидаемое значение |
|---|---|---|---|
| 1 | **Поле поиска ("What")** | `input.css-1rtikjh` | placeholder: *"Job title, keywords, or company"* |
| 2 | **Поле локации ("Where")** | `input.css-1lonhz0` | placeholder: *"City, state, zip code..."* |
| 3 | **Кнопка "Find jobs"** | `button.css-17qy6hn` | текст: *"Find jobs"* |
| 4 | **Фильтр "Remote"** | `button.css-1k63ypn.active` | текст: *"Remote"* |
| 5 | **Заголовок вакансии 1** | `h2.css-job-title-heading a` | текст: *"Unity Developer"* |
| 6 | **Компания вакансии 1** | `div.css-company-name` | текст: *"Unity Technologies"* |
| 7 | **Зарплатный бейдж** | `div.css-salary-badge` | текст: *"$140,000 - $185,000 a year"* |
| 8 | **Кнопка "Easily apply"** | `button.css-apply-button` | текст: *"Easily apply"* |
| 9 | **Пагинация "Next"** | `button.serp-page-next` | текст: *"Next >"* |

---

## 🚀 Как запускать

### 1. Консольный бенчмарк (CLI)
Быстрый прогон всей матрицы (36 сценариев) с цветной таблицей:

```bash
pnpm bench
```

**Результат:**
```
========================================================================================
⚡  SCRAPLINGJS ADAPTIVE ELEMENT RELOCATION TEST BENCH  ⚡
    Testing element resilience across Framework Migrations & Compiler Hash Churn
========================================================================================

📌 Target Framework: Next.js 15 (CSS Modules)
----------------------------------------------------------------------------------------------------------------
Target Element                   | Trad CSS | ScraplingJS | Score  | Time   | Relocated Element Preview
----------------------------------------------------------------------------------------------------------------
Search Keyword Input ("What")    | FAIL     | RECOVERED   | 54.5%  | 4.7ms  | "Job title, keywords, or company"
Location Input ("Where")         | FAIL     | RECOVERED   | 54.8%  | 2.1ms  | "City, state, zip code, or "remote""
Submit Button ("Find jobs")      | FAIL     | RECOVERED   | 59.1%  | 3.3ms  | "Find jobs"
Remote Filter Pill               | FAIL     | RECOVERED   | 71.9%  | 2.7ms  | "Remote"
Job 1 Title Link                 | FAIL     | RECOVERED   | 60.9%  | 3.0ms  | "Unity Developer"
Job 1 Company Name               | FAIL     | RECOVERED   | 59.6%  | 2.4ms  | "Unity Technologies"
Job 1 Salary Badge               | FAIL     | RECOVERED   | 58.8%  | 3.2ms  | "$140,000 - $185,000 a year"
Job 1 Apply Button               | FAIL     | RECOVERED   | 56.5%  | 2.1ms  | "Easily apply"
Pagination "Next" Button         | FAIL     | RECOVERED   | 63.8%  | 2.2ms  | "Next >"
----------------------------------------------------------------------------------------------------------------

[... Vue 3, Svelte 5, Node.js SSR ...]

========================================================================================
📊 BENCHMARK SUMMARY & RELOCATION RESILIENCE:
   • Total Scenarios Evaluated:       36
   • Traditional CSS Selector Rate:   0.0% (0/36 passed)
   • ScraplingJS Adaptive Rate:       100.0% (36/36 passed)
   • Average Similarity Confidence:   59.5%
========================================================================================
```

---

### 2. Запуск интерактивного веб-стенда (UI Dashboard)

```bash
pnpm bench:serve
```

Сервер запустится на `http://localhost:4100` (или порту из `PORT`).

В браузере откроется интерактивный стенд:
- **Переключатель фреймворков**: кликайте между версиями (React 19, Next.js, Vue 3, Svelte 5, Node.js).
- **Живой предпросмотр (Live Iframe)**: отображает страницу Indeed в выбранном фреймворке.
- **Инспектор элементов**: выберите любой элемент (например, "Find jobs Button" или "Salary Badge") и нажмите **"Run Adaptive Locator"**:
  - ScraplingJS находит элемент за миллисекунды;
  - В iframe элемент подсвечивается зеленой неоновой анимированной рамкой с бейджем схожести `[🎯 88.5% Match]`;
  - В панели отображается разница фингерпринтов (изменение тегов, хэшей, совпадение текста).
- **Full Matrix Benchmark Modal**: открывает сводную сравнительную таблицу по всем 36 сценариям.

---

### 3. Автоматизированные тесты Vitest

```bash
pnpm test
```

Запускает 30 тестов (включая 7 интеграционных тестов тестового стенда в Chromium Playwright):
- Проверка базовой страницы;
- Доказательство отказа традиционных селекторов (0%);
- Успешная релокация на Next.js, Vue 3, Svelte 5, Node.js;
- Устойчивость к динамической мутации аргументов компиляции (генерация страниц со случайным salt/seed хэшей).

---

## 🔥 Hard Mode – Real Migration Patterns

Обычные тесты (`bench.test.ts`) проверяют только смену CSS-хэшей при почти идентичной разметке.
**Hard-набор** моделирует реальные миграции, которые ломают адаптивные локаторы в продакшене.

### Новые страницы (`pages/hard/`)

| # | Файл | Что меняется (реальные паттерны 2023–2026) |
|---|------|---------------------------------------------|
| 6 | `6-structural-refactor.html` | Глубокая перестройка DOM, semantic tags (`form`/`article`/`header`/`footer`), новый BEM, +2–4 уровня вложенности |
| 7 | `7-text-drift-and-decoys.html` | Изменение copy (`Find jobs`→`Search jobs`, `Easily apply`→`1-click apply`, `$140,000`→`$140k`), **decoy-карточки** почти идентичные целевой |
| 8 | `8-semantic-overhaul.html` | Полный переход на HTML5 + ARIA (`<search>`, `role=listbox`, `role=option`), `<button>` → `<a role="button">`, schema.org |
| 9 | `9-extreme-layout-shift.html` | Sidebar-layout, поиск уехал в aside, CTA урезан до `Search`/`Apply`, пагинация → `Load more`, sparse text |

### Жёсткие проверки (`test/hard-bench.test.ts`)

1. **Structural** – все 9 целей должны находиться с корректным текстом (threshold 40%).
2. **Text-drift + decoys** – обязан выбрать *правильную* карточку Unity Developer @ Unity Technologies, а не «Unity UI Designer» / «Unity Developer (Contract)» / «Lead Unity Developer».
3. **Semantic overhaul** – выдерживает смену тега (button→a) и role-based контролы.
4. **Extreme layout** – выживание core-элементов при радикальной смене layout + sparse copy (допускается падение части targets).
5. **Negative** – при отсутствии job-карточек adaptive **не** должен возвращать false-positive apply/salary с высоким confidence.
6. **Matrix summary** – сводный survival rate по 4 hard-страницам.

### Как запускать hard-тесты

```bash
# только hard-набор
pnpm test test/hard-bench.test.ts

# весь стенд (обычные + hard)
pnpm test
```

### Ожидаемые результаты (честные)

| Сценарий              | Traditional CSS | ScraplingJS (ожидание) |
|-----------------------|-----------------|------------------------|
| Structural refactor   | 0%              | 80–100%                |
| Text drift + decoys   | 0%              | 55–90% (зависит от precision) |
| Semantic overhaul     | 0%              | 70–100%                |
| Extreme layout shift  | 0%              | 30–70%                 |
| Negative (element gone)| —              | 0 false positives @ ≥50% |

Если hard-матрица показывает 100% на всех сценариях — либо тесты всё ещё слишком мягкие, либо adaptive действительно очень сильный. Цель hard-набора — **найти границы**, а не гарантировать зелёный CI.
