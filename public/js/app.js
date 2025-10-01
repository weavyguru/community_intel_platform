// Global application JavaScript

// Logout function
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
}

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/login';
    }
  } catch (error) {
    window.location.href = '/login';
  }
}

// Format date helper
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Show notification
function showNotification(message, variant = 'primary') {
  const alert = Object.assign(document.createElement('sl-alert'), {
    variant,
    closable: true,
    duration: 3000,
    innerHTML: `
      <sl-icon name="${variant === 'success' ? 'check-circle' : variant === 'danger' ? 'exclamation-octagon' : 'info-circle'}" slot="icon"></sl-icon>
      ${message}
    `
  });

  document.body.append(alert);
  alert.toast();
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard', 'success');
  } catch (error) {
    console.error('Copy error:', error);
    showNotification('Failed to copy', 'danger');
  }
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Add event listener for logout button
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});

// Export for use in other scripts
window.appHelpers = {
  logout,
  checkAuth,
  formatDate,
  showNotification,
  copyToClipboard,
  debounce
};
