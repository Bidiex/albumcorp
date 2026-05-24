# Plan de Implementación: Exclusión de Legendarias de Completitud del Álbum

## Descripción del problema

Las laminitas legendarias son especiales y no forman parte de las páginas principales del álbum. Sin embargo, actualmente se están incluyendo en el progreso del álbum, lo cual altera el porcentaje de cumplimiento y los hitos (medallas). Específicamente:

1. El progreso calcula el total de stickers recolectados (incluyendo legendarias) sobre el total de empleados (excluyendo legendarias), o en "Mi Baúl" cuenta todas las laminitas (incluyendo legendarias) como meta (14 en lugar de 12).
2. Las legendarias aparecen como duplicados en el Baúl y en el Centro de Intercambio, lo cual no es correcto porque son laminitas exclusivas y no intercambiables.

---

## Cambios Propuestos

### 1. Modificación en Álbum Frontend

#### [MODIFY] [album.js](file:///c:/Users/ALVARO%20DE%20ALBA/corp-album/js/album/album.js)

- **initAlbum()**:
  - Filtrar la lista de `collectedIds` recibida de la base de datos para obtener un set limpio `regularCollectedIds` conteniendo únicamente IDs de empleados comunes y míticos (es decir, regular).
  - Pasar `regularCollectedIds` a todas las inicializaciones secundarias de interfaz (`initMilestones`, `renderProgressBar`, `renderPackButton`, `renderDuplicatesTray`, `renderExchangeModal`, `renderUserMenu`, `renderRanking`).
- **renderDuplicatesTray()**:
  - En la plantilla HTML, remover el botón de filtro de rareza legendaria (`<button class="baul-filter-btn" data-rarity="legendary">Legendarios</button>`).
  - En `loadBaul()`, filtrar en memoria la lista `rawDuplicates` para ignorar los duplicados cuya rareza sea `'legendary'`.
  - En la lógica de pegado del sticker del baúl, corregir la consulta para obtener el total (`count`) agregando la cláusula `.neq('rarity', 'legendary')`.

### 2. Modificación en Centro de Intercambio

#### [MODIFY] [exchange.js](file:///c:/Users/ALVARO%20DE%20ALBA/corp-album/js/album/exchange.js)

- **renderCreateForm()**:
  - En la plantilla HTML de creación, remover el botón de filtro de rareza legendaria (`<button class="baul-filter-btn" data-rarity="legendary">Legendarios</button>`).
  - Al cargar los duplicados (`myDups`), filtrar en memoria para excluir los que tengan rareza `'legendary'`.

### 3. Base de Datos (Supabase)

- **fn_get_ranking**:
  - Actualizar la función para contar únicamente las laminitas cuya rareza sea diferente de `'legendary'`. Se realizará mediante un LEFT JOIN adicional con la tabla `employees` filtrando por rareza.

---

## Plan de Verificación

### Pruebas de Base de Datos
- Ejecutar la función de migración SQL para recrear `fn_get_ranking` y validar que retorne la cantidad correcta de stickers excluyendo legendarias.

### Pruebas Manuales
1. **Comprobar Contador**:
   - Abrir el álbum de un usuario que posea laminitas legendarias y regular.
   - Verificar que el progreso indica exactamente `<pegadas regular> / 12` y que el porcentaje concuerda.
2. **Filtros en Baúl e Intercambio**:
   - Abrir "Mi Baúl" y el modal de "Intercambiar" (Crear oferta).
   - Verificar que el botón de filtro "Legendarios" ya no aparece.
   - Confirmar que las laminitas legendarias repetidas no se muestran en el listado del baúl ni están disponibles para ofrecer en intercambios.
