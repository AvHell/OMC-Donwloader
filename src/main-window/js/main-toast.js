/**
 * main-toast.js
 * Sistema de notificaciones con SweetAlert2 (estilo mejorado)
 * - Botones con contraste y hover
 * - Z-index alto para toasts
 */

const Toast = (() => {
  function show(message, type = 'info', duration = 3000) {
    const icons = {
      success: 'success',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };
    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: icons[type] || 'info',
      title: message,
      showConfirmButton: false,
      timer: duration,
      timerProgressBar: true,
      background: 'var(--color-background)',
      color: 'var(--color-text)',
      iconColor: type === 'success' ? 'var(--color-success)' :
                 type === 'error' ? 'var(--color-error)' :
                 type === 'warning' ? 'var(--color-warning)' : 'var(--color-accent)',
      customClass: { popup: 'swal2-toast' },
    });
  }

  function confirm(title, text, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    return Swal.fire({
      title,
      text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#00FF7B',
      cancelButtonColor: 'rgba(255,255,255,0.2)',
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      background: 'var(--color-background)',
      color: 'var(--color-text)',
      // Estilos adicionales para botones
      customClass: {
        confirmButton: 'swal2-confirm',
        cancelButton: 'swal2-cancel',
      },
    });
  }

  function error(title, text) {
    return Swal.fire({
      icon: 'error',
      title,
      text,
      confirmButtonColor: '#00FF7B',
      background: 'var(--color-background)',
      color: 'var(--color-text)',
      confirmButtonText: 'OK',
      customClass: { confirmButton: 'swal2-confirm' },
    });
  }

  function success(title, text) {
    return Swal.fire({
      icon: 'success',
      title,
      text,
      timer: 2000,
      showConfirmButton: false,
      background: 'var(--color-background)',
      color: 'var(--color-text)',
    });
  }

  function warning(title, text) {
    return Swal.fire({
      icon: 'warning',
      title,
      text,
      confirmButtonColor: '#FFB74D',
      background: 'var(--color-background)',
      color: 'var(--color-text)',
      confirmButtonText: 'OK',
      customClass: { confirmButton: 'swal2-confirm' },
    });
  }

  return {
    show,
    confirm,
    error,
    success,
    warning,
  };
})();

window.OMC = window.OMC || {};
window.OMC.toast = Toast;