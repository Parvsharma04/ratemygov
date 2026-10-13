// Home page module: fetches /api/geo on first focus of the state picker
const select = document.getElementById('state-select') as HTMLSelectElement | null;
const notice = document.getElementById('geo-notice');

if (select) {
  const onFirstFocus = async () => {
    select.removeEventListener('focus', onFirstFocus);
    try {
      const res = await fetch('/api/geo');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.state) {
        const option = select.querySelector<HTMLOptionElement>(
          `option[value="${data.state}"]`
        );
        if (option && !select.value) {
          select.value = data.state;
          if (notice) {
            notice.textContent = `Detected from your connection: ${option.text}. Change it if that is wrong.`;
            notice.hidden = false;
          }
        }
      }
    } catch {
      // Ignore network errors gracefully
    }
  };

  select.addEventListener('focus', onFirstFocus, { once: true });
}
