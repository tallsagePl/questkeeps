export function createTripDraftKey(userId?: string) {
  return 'questkeeps:create-trip-draft:v1:' + (userId ?? 'guest');
}

export function resumeGuestTripDraft(userId: string) {
  try {
    const guestKey = createTripDraftKey();
    const draft = sessionStorage.getItem(guestKey);
    if (draft) {
      sessionStorage.setItem(createTripDraftKey(userId), draft);
      sessionStorage.removeItem(guestKey);
    }
  } catch {
    // Trip creation also works when browser storage is unavailable.
  }
}
