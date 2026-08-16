// Auth guard for admin pages — redirects to /admin/login if not signed in.
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { auth } = await initFirebase();
    if (!auth) throw new Error('Firebase auth SDK not loaded');
    auth.onAuthStateChanged(user => {
      if (!user) window.location.href = '/admin/login';
    });
  } catch (error) {
    console.error('Auth error:', error);
    window.location.href = '/admin/login';
  }
});

async function doSignOut() {
  try {
    const { auth } = await initFirebase();
    if (!auth) throw new Error('Firebase auth SDK not loaded');
    await auth.signOut();
  } finally {
    window.location.href = '/admin/login';
  }
}

// Sign out with a confirmation modal.
window.adminLogout = function () {
  if (typeof confirmModal === 'function') {
    confirmModal({
      title: 'Sign out?',
      message: "You'll need to sign back in to manage the store.",
      confirmText: 'Sign out',
      cancelText: 'Stay',
      danger: true,
      onConfirm: doSignOut,
    });
  } else if (confirm('Sign out?')) {
    doSignOut();
  }
};
