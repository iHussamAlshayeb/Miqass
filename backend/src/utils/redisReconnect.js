const MAX_DELAY_MS = 30000;

/** تأخير إعادة اتصال Redis: يتزايد حتى 30 ثانية مع عشوائية بسيطة، بلا حد أقصى للمحاولات */
const reconnectDelay = (retries) => {
  const base = Math.min(500 * 2 ** Math.min(retries, 6), MAX_DELAY_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4));
};

module.exports = { reconnectDelay, MAX_DELAY_MS };
