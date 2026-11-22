// Progressive enhancement only: every page works without this file.
// Compiled by tsconfig.client.json to public/app.js and loaded as an external script (no inline
// scripts, so the CSP stays strict). Browser code: it has the DOM types and no imports.
document.addEventListener('DOMContentLoaded', () => {
  // Role selects in the Members panel submit as soon as they change.
  for (const select of document.querySelectorAll<HTMLSelectElement>('select[data-autosubmit]')) {
    select.addEventListener('change', () => select.form?.requestSubmit());
  }
  document.documentElement.classList.add('js');

  // Header dropdowns (<details data-dropdown>): one open at a time, close on outside click / Escape.
  const dropdowns = [...document.querySelectorAll<HTMLDetailsElement>('details[data-dropdown]')];
  for (const d of dropdowns) {
    d.addEventListener('toggle', () => {
      if (d.open) for (const other of dropdowns) if (other !== d) other.open = false;
    });
  }
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Node ? event.target : null;
    for (const d of dropdowns) if (d.open && !d.contains(target)) d.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const d of dropdowns) {
      if (d.open) {
        d.open = false;
        d.querySelector('summary')?.focus();
      }
    }
  });

  // Destructive buttons ask once before submitting.
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-confirm]')) {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  }

  // "Copy" next to a freshly created invite link.
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-target]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const input = document.getElementById(button.dataset.copyTarget ?? '');
      if (!(input instanceof HTMLInputElement)) return;
      input.select();
      try {
        await navigator.clipboard.writeText(input.value);
        const label = button.querySelector('[data-label]');
        if (label) label.textContent = 'Copied';
      } catch {
        document.execCommand('copy'); // older browsers without the async clipboard API
      }
    });
  }
});
