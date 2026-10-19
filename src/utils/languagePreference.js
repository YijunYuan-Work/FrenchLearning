export function isSupportedLanguage(value) {
  return value === "en" || value === "zh";
}

// One account lifecycle owns one initial read and a serialized latest-choice save.
export function createLanguagePreferenceSync({ load, save, isCurrent, onLanguage, onStatus }) {
  let active = false;
  let reading = false;
  let hydrated = false;
  let writing = false;
  let selected = null;
  let acknowledged;
  let uncertain = false;
  let error = null;
  const current = () => active && isCurrent();
  const report = () => {
    if (current()) onStatus({ loading: reading, saving: writing, error });
  };

  async function flush() {
    if (!current() || !hydrated || writing || error || selected === null ||
      (!uncertain && selected === acknowledged)) return;
    const value = selected;
    writing = true;
    report();
    try {
      await save(value);
      acknowledged = value;
      uncertain = false;
    } catch {
      // A failed response may have followed a successful commit. Even returning
      // to the old choice must be saved on retry to establish the latest intent.
      uncertain = true;
      error = "save";
    } finally {
      writing = false;
      report();
      if (current()) void flush();
    }
  }

  async function hydrate() {
    if (!current() || reading || hydrated) return;
    reading = true;
    error = null;
    report();
    try {
      const saved = await load();
      if (!current()) return;
      acknowledged = isSupportedLanguage(saved) ? saved : "en";
      hydrated = true;
      if (selected === null) onLanguage(acknowledged);
    } catch {
      if (current()) error = "load";
    } finally {
      reading = false;
      report();
      if (current()) void flush();
    }
  }

  return {
    activate() {
      active = true;
      if (!hydrated) void hydrate();
      else { report(); void flush(); }
    },
    deactivate() { active = false; },
    select(value) {
      if (!current() || !isSupportedLanguage(value)) return;
      selected = value;
      onLanguage(value);
      void flush();
    },
    retry() {
      if (!current() || reading || writing) return;
      error = null;
      if (!hydrated) void hydrate();
      else { report(); void flush(); }
    },
  };
}
