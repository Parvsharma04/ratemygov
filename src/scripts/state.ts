// State page module: client interaction, local voting state, and submission
const d = document;
const o = (s: string): HTMLElement | null => d.querySelector(s);
const f = o('.vote-form') as HTMLFormElement | null;
const st = (f?.elements as any)?.state?.value;
const vK = st && `rmg_v_${st}`;

const ban = (i: string, c: string, t: string) => {
  let b = o('#' + i) || d.createElement('div');
  b.id = i;
  b.setAttribute('role', 'status');
  b.className = 'banner banner-' + c;
  b.textContent = t;
  return b;
};

function dis() {
  if (f) {
    for (const e of f.elements) (e as HTMLInputElement).disabled = true;
    f.prepend(ban('voted-notice', 'duplicate', 'You have already voted'));
  }
}

if (vK && localStorage.getItem(vK)) dis();

const sh = o('#share-link') as HTMLAnchorElement | null;
if (sh && navigator?.share) {
  sh.onclick = (e) => {
    e.preventDefault();
    navigator.share({ title: d.title, url: sh.href }).catch(() => {});
  };
}

let tl = false;
function lt() {
  if (tl) return;
  tl = true;
  const c = o('#turnstile-container');
  const k = c?.dataset.sitekey;
  if (c && k) {
    const s = d.createElement('script');
    s.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = s.defer = true;
    s.onload = () => (window as any).turnstile?.render(c, { sitekey: k });
    d.head.appendChild(s);
  }
}

if (f) {
  f.addEventListener('focusin', lt, { once: true });
  f.addEventListener('pointerdown', lt, { once: true });

  f.onsubmit = async (e) => {
    e.preventDefault();
    const ch = (f.elements as any).choice?.value;
    if (ch) {
      try {
        const res = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: st,
            choice: ch,
            token: (window as any).turnstile?.getResponse?.(),
          }),
        });
        const data = res.ok && ((await res.json()) as any);
        if (!data?.status) return f.submit();

        if (vK) localStorage.setItem(vK, '1');

        const ok = data.status === 'recorded';
        f.before(
          ban(
            'vote-status-banner',
            ok ? 'success' : 'duplicate',
            ok
              ? 'Thank you! Your response has been recorded.'
              : 'A response from this device or network has already been recorded for ' +
                  o('h1')?.textContent?.trim() +
                  '.'
          )
        );

        if (data.totals) {
          const { satisfied: sat, total: tot } = data.totals;
          const totEl = o('.total-responses strong');
          if (totEl) totEl.textContent = tot.toLocaleString('en-IN');

          const sPct = tot ? Math.round((sat / tot) * 100) : 0;
          const up = (k: string, l: string, v: number) => {
            let el = o('.metric-' + k);
            if (el) el.textContent = l + ': ' + v + '%';
            el = o('.bar-segment-' + k);
            if (el) el.style.width = v + '%';
          };
          up('sat', 'Satisfied', sPct);
          up('dis', 'Dissatisfied', tot ? 100 - sPct : 0);
        }

        dis();
      } catch {
        f.submit();
      }
    }
  };
}
