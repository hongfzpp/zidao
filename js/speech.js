/* Microphone wrapper around the Web Speech API.

   Everything here fails soft. Recognition is unavailable on plain HTTP, can be
   denied, can time out, and is unreliable on young voices at the best of times
   (DESIGN.md §16). None of that may ever block a child from turning the page,
   so every failure resolves with no transcripts rather than throwing. */

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

let factory = null;      // tests inject a fake recogniser here
let active = null;

export function setRecognizerFactory (fn) { factory = fn; }

export function isSupported () {
  if (factory) return true;
  return Boolean(Recognition) && Boolean(globalThis.isSecureContext);
}

/** Why it cannot listen, for the parent — never shown to the child. */
export function unsupportedReason () {
  if (isSupported()) return null;
  if (!globalThis.isSecureContext) {
    return '需要 HTTPS：语音识别在普通 http 下无法使用（见 README）';
  }
  return '这个浏览器不支持语音识别';
}

/**
 * Listen once. Always resolves:
 *   { transcripts: string[], error: string|null }
 */
export function listen ({ lang = 'zh-CN', timeoutMs = 6000, maxAlternatives = 6 } = {}) {
  stop();
  if (!isSupported()) return Promise.resolve({ transcripts: [], error: 'unsupported' });

  return new Promise(resolve => {
    let done = false;
    const finish = (transcripts, error = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active = null;
      resolve({ transcripts, error });
    };

    let rec;
    try {
      rec = factory ? factory() : new Recognition();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = maxAlternatives;
    } catch (e) {
      return finish([], 'init');
    }

    rec.onresult = ev => {
      const out = [];
      for (const result of ev.results) {
        for (let i = 0; i < result.length; i++) out.push(result[i].transcript);
      }
      finish(out);
    };
    rec.onerror = ev => finish([], ev?.error || 'error');
    rec.onend = () => finish([], null);

    const timer = setTimeout(() => { try { rec.stop(); } catch {} finish([], 'timeout'); },
                             timeoutMs);
    active = rec;
    try { rec.start(); } catch (e) { finish([], 'start'); }
  });
}

export function stop () {
  if (!active) return;
  try { active.abort ? active.abort() : active.stop(); } catch {}
  active = null;
}
