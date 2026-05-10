export function createAppShell(): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'page'
  wrapper.innerHTML = `
    <header class="page__header header">
      <div class="header__brand">
        <div class="header__title">Шахматы онлайн</div>
        <div class="header__subtitle">Комнаты, чат и игра в браузере</div>
      </div>

      <div class="header__actions">
        <button class="button button--ghost" data-action="reset">Новая партия</button>
        <button class="button button--primary" data-action="copy-link">Скопировать ссылку комнаты</button>
      </div>
    </header>

    <main class="page__main layout">
      <section class="layout__left panel panel--lobby" aria-label="Лобби">
        <h2 class="panel__title">Лобби</h2>

        <div class="panel__section form">
          <label class="form__field">
            <span class="form__label">Ваше имя</span>
            <input class="input" data-field="playerName" placeholder="Например: Student" maxlength="24" />
          </label>

          <label class="form__field">
            <span class="form__label">Комната</span>
            <div class="form__row">
              <input class="input" data-field="roomId" placeholder="Например: ab12cd34" maxlength="32" />
              <button class="button" data-action="create-room" type="button">Создать</button>
              <button class="button" data-action="join-room" type="button">Войти</button>
            </div>
          </label>

          <div class="panel__hint">
            “Онлайн” работает между вкладками/окнами браузера через <code>BroadcastChannel</code>.
          </div>
        </div>

        <div class="panel__section status" aria-label="Статус комнаты">
          <div class="status__row">
            <div class="status__key">Статус</div>
            <div class="status__value" data-view="roomStatus">не подключено</div>
          </div>
          <div class="status__row">
            <div class="status__key">Вы играете</div>
            <div class="status__value" data-view="myColor">—</div>
          </div>
          <div class="status__row">
            <div class="status__key">Ход</div>
            <div class="status__value" data-view="turn">—</div>
          </div>
        </div>

        <div class="panel__section">
          <h3 class="panel__subtitle">Чат (локальный лог)</h3>
          <div class="chat" data-view="chat">
            <div class="chat__list" data-view="chatList" aria-live="polite"></div>
            <form class="chat__form" data-action="send-chat">
              <input class="input chat__input" data-field="chatText" placeholder="Сообщение..." maxlength="140" />
              <button class="button button--primary" type="submit">Отправить</button>
            </form>
          </div>
        </div>
      </section>

      <section class="layout__center game" aria-label="Игра">
        <div class="game__top clocks" aria-label="Часы">
          <div class="clock clock--black">
            <div class="clock__label">Черные</div>
            <div class="clock__value" data-view="clockBlack">05:00</div>
          </div>
          <div class="clocks__spacer"></div>
          <div class="clock clock--white">
            <div class="clock__label">Белые</div>
            <div class="clock__value" data-view="clockWhite">05:00</div>
          </div>
        </div>

        <div class="game__board board" data-view="board" aria-label="Шахматная доска"></div>

        <div class="game__bottom">
          <div class="notice" data-view="notice" aria-live="polite"></div>
        </div>
      </section>

      <aside class="layout__right panel panel--moves" aria-label="Ходы">
        <h2 class="panel__title">Протокол</h2>
        <div class="moves" data-view="moves">
          <ol class="moves__list" data-view="movesList"></ol>
        </div>
        <div class="panel__hint">
          Поддерживается: шах, рокировка, взятие на проходе, превращение (в ферзя).
        </div>
      </aside>
    </main>

    <footer class="page__footer footer">
      <div class="footer__text">
        Курсовой пример: БЭМ + ООП + SOLID. Запуск: <code>npm i</code> → <code>npm run dev</code>.
      </div>
    </footer>
  `
  return wrapper
}

