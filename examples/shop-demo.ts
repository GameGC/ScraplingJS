import {
  fromHtml,
  setStorage,
  onRelocated,
  findPredicates,
  findAllPredicates,
  findByText,
  findAllByRegex,
  findSimilar,
  getParent,
  findAncestor,
  reFirst,
  searchAttributes,
  type ElementFingerprint,
} from '../src'

async function main() {
  // 1. Подключаем хранилище отпечатков (JSON, SQLite, Redis или localStorage).
  // loadAll вызывается при создании страницы, save — при каждом обновлении отпечатка.
  const memoryDb: Record<string, Record<string, ElementFingerprint>> = {}
  setStorage({
    loadAll: (url) => memoryDb[url] ?? {},
    save: (url, key, fp) => {
      memoryDb[url] ??= {}
      memoryDb[url][key] = fp
    },
  })

  // 2. Подписываемся на аналитику релокации: срабатывает только когда прямой селектор
  // вернул 0 элементов и включился адаптивный поиск по отпечатку.
  onRelocated((foundSuccessfully, info) => {
    if (foundSuccessfully) {
      console.log(
        `[RELOCATED] key="${info.key}" selector="${info.selector}" score=${info.score.toFixed(1)}% count=${info.elements.length}`,
      )
    } else {
      console.warn(`[FAILED] key="${info.key}" selector="${info.selector}" не найден на ${info.url}`)
    }
  })

  const v1Html = `
    <div id="catalog" data-section="electronics">
      <button id="buy-btn" class="btn-primary" data-sku="sku-1">Buy Now $99</button>
      <ul class="items">
        <li class="item-card" data-price="$1299">Laptop Pro</li>
        <li class="item-card" data-price="$149">Mechanical Keyboard</li>
        <li class="item-card" data-price="$79">Wireless Mouse</li>
      </ul>
    </div>
  `

  // 3. Создаём адаптивную страницу (URL задаёт скоуп хранения отпечатков)
  const pageV1 = await fromHtml(v1Html, { url: 'https://shop.example.com/catalog/' })

  // Базовые адаптивные методы: сохраняют отпечатки при первом проходе
  const buyBtn = await pageV1.find('#buy-btn')
  const cards = await pageV1.findAll('li.item-card')

  // Поиск по предикатам: комбинация тегов, атрибутов, RegExp и функции-фильтра
  const promoBtn = findPredicates(
    pageV1,
    'button',
    { class_: 'btn-primary', 'data-sku': 'sku-1' },
    /\$\d+/,
    (el) => !el.hasAttribute('disabled'),
  )

  const expensiveItems = findAllPredicates(
    pageV1,
    ['li', 'article'],
    (el) => Number(reFirst(el.getAttribute('data-price') ?? '', /\d+/, '0')) >= 100,
  )

  // Текстовый поиск, RegExp-поиск и поиск похожих элементов на той же глубине (AutoScraper)
  const keyboard = findByText(pageV1, 'Mechanical Keyboard', { partial: false })
  const regexMatched = findAllByRegex(pageV1, /Laptop|Mouse/i)
  const peerItems = findSimilar(cards[0], { similarityThreshold: 0.2 })

  // Обход DOM, извлечение подстроки по RegExp и фильтр по значениям атрибутов
  const catalogSection = findAncestor(cards[0], (anc) => anc.hasAttribute('data-section'))
  const parentList = getParent(cards[0])
  const price = reFirst(buyBtn!, /\$(\d+)/, '0')
  const skuAttrs = searchAttributes(buyBtn!, 'sku', true)

  console.log({
    promoBtn: promoBtn?.id,
    expensiveCount: expensiveItems.length,
    keyboard: keyboard?.textContent,
    regexCount: regexMatched.length,
    peersCount: peerItems.length,
    section: catalogSection?.getAttribute('data-section'),
    parentTag: parentList?.tagName,
    price,
    skuAttrs,
  })

  // 4. Редизайн сайта: старые классы и id полностью изменились
  const v2Html = `
    <section class="storefront">
      <button id="checkout-action" class="cta-new" data-sku="sku-1">Buy Now $99</button>
      <ul class="grid-list">
        <li class="grid-entry">Laptop Pro</li>
        <li class="grid-entry">Mechanical Keyboard</li>
        <li class="grid-entry">Wireless Mouse</li>
      </ul>
    </section>
  `

  const pageV2 = await fromHtml(v2Html, { url: 'https://shop.example.com/catalog/' })

  // Оба вызова автоматически восстановят элементы по сохранённым отпечаткам и вызовут onRelocated(true, info)
  const healedBtn = await pageV2.find('#buy-btn')
  const healedCards = await pageV2.findAll('li.item-card')
  console.log('Восстановленная кнопка:', healedBtn?.id)
  console.log('Восстановленные карточки:', healedCards.map((c) => c.textContent))
}

main()
