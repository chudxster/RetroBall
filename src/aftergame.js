// After a career game: three buttons under the final score, Main menu (left), Next game (middle) and Upgrades
// (right). Next game shows the next game's three challenges in their place (picking one tips off), or starts the
// next season once this one is over. Arrow keys move between the buttons. main.js shows it once the buzzer has
// settled and hides it whenever a game starts.
const AfterGame = (() => {
  const box = document.getElementById('after-game');
  let game = null; // from main.js: { rules(), home(), upgrades(), startCareer(choice) }
  let picking = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(cls, text, id, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.dataset.focus = id;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const items = [];
    if (picking) {
      const row = el('div', 'after-challenges');
      Career.offer(game.rules()).forEach((ch, i) => {
        const tier = CAREER.tiers[ch.tier];
        const b = button(`challenge tier-${ch.tier}`, '', `after-challenge-${i}`, () => {
          hide();
          game.startCareer(i);
        });
        b.append(el('span', 'mode-name', tier.name), el('span', '', Career.challengeText(ch)), el('span', 'mult', `x${tier.mult}`));
        b.setAttribute('aria-label', `${tier.name} challenge: ${Career.challengeText(ch)}, tokens x${tier.mult}`);
        row.append(b);
      });
      items.push(el('p', 'after-note', 'Pick a challenge to tip off:'), row, button('btn btn-quiet', 'Back', 'after-back', () => {
        picking = false;
        render();
        box.querySelector('[data-focus="after-next"]').focus();
      }));
    } else {
      const row = el('div', 'after-row');
      row.append(
        button('btn btn-quiet', 'Main menu', 'after-home', () => {
          hide();
          game.home();
        }),
        button('btn', Career.next() ? 'Next game' : 'Next season', 'after-next', () => {
          if (!Career.next()) Career.nextSeason();
          picking = true;
          render();
          box.querySelector('.challenge').focus();
        }),
        button('btn btn-quiet', 'Upgrades', 'after-upgrades', () => {
          hide();
          game.upgrades();
        }),
      );
      items.push(row);
    }
    box.classList.toggle('picking', picking);
    box.replaceChildren(...items);
  }

  // Left and right step through the buttons (wrapping), like the main menu's rows.
  function onKey(e) {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const buttons = [...box.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    const step = e.code === 'ArrowRight' ? 1 : -1;
    buttons[(i + step + buttons.length) % buttons.length].focus();
    e.preventDefault();
    e.stopPropagation();
  }

  function init(target) {
    game = target;
    box.addEventListener('keydown', onKey);
  }

  function show() {
    if (!box.hidden) return;
    picking = false;
    render();
    box.hidden = false;
    box.querySelector('[data-focus="after-next"]').focus();
  }

  function hide() {
    box.hidden = true;
    picking = false;
  }

  return { init, show, hide, isOpen: () => !box.hidden };
})();
