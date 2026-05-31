import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

/**
 * Módulo para gestionar el tour guiado del panel del editor.
 */
export function initTour() {
  // Auto-iniciar la primera vez
  const tourSeen = localStorage.getItem('editor_tour_seen');
  if (tourSeen) return;

  // Configuración de Driver.js
  const driverObj = driver({
    showProgress: true,
    nextBtnText: 'Siguiente &rarr;',
    prevBtnText: '&larr; Anterior',
    doneBtnText: 'Entendido',
    steps: [
      {
        popover: {
          title: '¡Bienvenido a tu Panel de Editor! 🏢',
          description: 'Aquí es donde configurarás y gestionarás tu álbum corporativo. Vamos a guiarte en los pasos fundamentales para dejarlo listo y compartirlo con tus colaboradores.',
          side: 'center',
          align: 'center'
        }
      },
      {
        element: '.sidebar-nav button[data-section="secciones"]',
        popover: {
          title: '1. Define las Secciones 📘',
          description: 'El primer paso es estructurar el álbum. Aquí puedes crear departamentos, áreas o equipos (ej. Tecnología, Finanzas, Ventas) para agrupar y organizar a tus colaboradores.',
          side: 'right',
          align: 'start'
        },
        onHighlightStarted: () => {
          const btn = document.querySelector('.sidebar-nav-item[data-section="secciones"]');
          if (btn) btn.click();
        }
      },
      {
        element: '.sidebar-nav button[data-section="empleados"]',
        popover: {
          title: '2. Gestiona a los Empleados 👥',
          description: 'Aquí administras a las personas que formarán parte de la colección. Cada una de ellas tendrá su propia laminita/sticker coleccionable.',
          side: 'right',
          align: 'start'
        },
        onHighlightStarted: () => {
          const btn = document.querySelector('.sidebar-nav-item[data-section="empleados"]');
          if (btn) btn.click();
        }
      },
      {
        element: '#form-employee-container',
        popover: {
          title: '3. Agrega las Laminitas ➕',
          description: 'Sube la foto del colaborador y su silueta (la imagen que se muestra antes de pegar el sticker), escribe su nombre, selecciona su sección y define su nivel de rareza (Común, Mítica o Legendaria).',
          side: 'top',
          align: 'center'
        }
      },
      {
        element: '.sidebar-nav button[data-section="layout"]',
        popover: {
          title: '4. Revisa la Distribución 📐',
          description: 'En esta pestaña podrás previsualizar cómo se organizan las páginas y posiciones del álbum de forma automática según los empleados activos que tengas registrados.',
          side: 'right',
          align: 'start'
        },
        onHighlightStarted: () => {
          const btn = document.querySelector('.sidebar-nav-item[data-section="layout"]');
          if (btn) btn.click();
        }
      },
      {
        element: '#btn-publish',
        popover: {
          title: '5. ¡Publica el Álbum! 🚀',
          description: '<strong>¡Paso crítico!</strong> Antes de que cualquier colaborador pueda empezar a jugar y pegar stickers, debes hacer clic aquí para generar el álbum oficialmente. Si agregas nuevos empleados en el futuro, recuerda volver a publicar el layout.',
          side: 'bottom',
          align: 'center'
        }
      },
      {
        element: '.sidebar-nav button[data-section="accesos"]',
        popover: {
          title: '6. Autoriza los Accesos 🔐',
          description: 'Para que tus colaboradores puedan entrar a coleccionar, debes autorizar sus correos electrónicos aquí. Puedes añadirlos individualmente o cargarlos de forma masiva desde un archivo Excel.',
          side: 'right',
          align: 'start'
        },
        onHighlightStarted: () => {
          const btn = document.querySelector('.sidebar-nav-item[data-section="accesos"]');
          if (btn) btn.click();
        }
      },
      {
        element: '#join-link',
        popover: {
          title: '7. ¡Comparte el Enlace! 🔗',
          description: '¡Excelente! Una vez publicado el álbum y autorizados los accesos, copia este link de invitación y compártelo con tus colaboradores por correo o chat institucional. ¡Ya pueden empezar a abrir sus sobres!',
          side: 'bottom',
          align: 'center'
        },
        onHighlightStarted: () => {
          const btn = document.querySelector('.sidebar-nav-item[data-section="empresa"]');
          if (btn) btn.click();
        }
      }
    ]
  });

  localStorage.setItem('editor_tour_seen', 'true');
  // Pequeño retardo para asegurar que la UI y animaciones de carga terminen
  setTimeout(() => {
    driverObj.drive();
  }, 1200);
}
