// Browser fixture server never calls external providers.
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const value =
    typeof input === 'string' || input instanceof URL
      ? String(input)
      : input.url;
  const url = new URL(value);
  if (url.origin === 'http://127.0.0.1:3101') return original(input, options);
  throw new Error('External provider requests are disabled in this fixture.');
};
