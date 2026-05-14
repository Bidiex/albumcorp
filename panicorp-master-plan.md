# PaniniCorp — Plan Maestro de Desarrollo

> Documento vivo. Cada sección tiene un estado: `[ ]` Pendiente · `[~]` En progreso · `[x]` Completado y testeado

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Flip animation | StPageFlip (MIT, sin dependencias) |
| Backend / DB | Supabase (Auth + Postgres + Storage + RLS) |
| Deploy | Vercel |

---

## Estructura de archivos

```
panicorp/
├── index.html                  # Landing + login/registro
├── join.html                   # Onboarding por slug (/join/:slug)
├── album.html                  # Vista del álbum
├── exchange.html               # Mercado de intercambio
├── editor.html                 # Panel del Editor (admin de empresa)

├── css/
│   ├── base.css                # Reset, variables base, tipografía
│   ├── album.css               # Álbum, flip, páginas
│   ├── sticker.css             # Componente sticker (vacío / lleno)
│   ├── exchange.css            # UI de intercambios
│   └── editor.css              # Panel del Editor

├── js/
│   ├── core/
│   │   ├── supabase.js         # Cliente singleton
│   │   ├── auth.js             # Login, registro, logout, session guard
│   │   ├── theme.js            # applyTheme() → CSS custom properties en :root
│   │   └── router.js           # Guard de rutas por rol
│   ├── album/
│   │   ├── album.js            # Orquestador: carga páginas, monta flip
│   │   ├── stickers.js         # renderSticker(employee, isCollected) → HTMLElement
│   │   └── pack.js             # openPack() → llama RPC, anima sobre
│   ├── exchange/
│   │   ├── exchange.js         # Lista ofertas abiertas, filtros
│   │   └── trade.js            # Crear oferta, aceptar, cancelar
│   └── editor/
│       ├── employees.js        # CRUD empleados, subida de fotos
│       ├── sections.js         # CRUD secciones, reordenar
│       ├── layout.js           # Auto-asignación page/position, override manual
│       ├── packconfig.js       # Pack size, frecuencia, raridades, probabilidades
│       └── theme-editor.js     # Color pickers, preview en tiempo real, guardar

└── assets/
    └── placeholder.svg         # Silueta humana para stickers vacíos
```

---

## Base de datos — Schema completo

### Tablas en orden de dependencia

---

### `companies`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
name          text NOT NULL
slug          text UNIQUE NOT NULL   -- "acme-corp" generado desde name
created_at    timestamptz DEFAULT now()
```
> El slug se genera al registrarse el Editor. URL de onboarding: `/join/:slug`

---

### `user_profiles`
```sql
id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
role          text NOT NULL CHECK (role IN ('editor', 'employee'))
display_name  text
created_at    timestamptz DEFAULT now()
```
> Se crea automáticamente vía trigger en `auth.users` al registrarse.

---

### `album_theme`
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id            uuid UNIQUE REFERENCES companies(id) ON DELETE CASCADE
-- Páginas
page_bg_color         text DEFAULT '#F4EFE6'
page_border_color     text DEFAULT '#C8A96E'
page_border_width     int  DEFAULT 2
-- Stickers
sticker_empty_bg      text DEFAULT '#E8E2D9'
sticker_empty_border  text DEFAULT '#C0B8AD'
sticker_filled_border text DEFAULT '#C8A96E'
-- Tipografía y marca
font_family           text DEFAULT '''Playfair Display'', Georgia, serif'
primary_text_color    text DEFAULT '#2C2416'
secondary_text_color  text DEFAULT '#7A6E5F'
accent_color          text DEFAULT '#C8A96E'
spine_color           text DEFAULT '#2C2416'
company_name          text
logo_url              text
updated_at            timestamptz DEFAULT now()
```

---

### `pack_config`
```sql
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id       uuid UNIQUE REFERENCES companies(id) ON DELETE CASCADE
pack_size        int  DEFAULT 5          -- stickers por sobre
frequency_days   int  DEFAULT 1          -- cada cuántos días se gana 1 sobre
max_accumulated  int  DEFAULT 5          -- tope máximo acumulable
probabilities    jsonb DEFAULT '{"common": 0.70, "rare": 0.25, "legendary": 0.05}'
updated_at       timestamptz DEFAULT now()
```

---

### `album_sections`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
name          text NOT NULL               -- "Gerencia", "Tecnología"
order_index   int  NOT NULL               -- orden en el álbum
created_at    timestamptz DEFAULT now()

UNIQUE (company_id, order_index)
```

---

### `employees`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
section_id    uuid REFERENCES album_sections(id) ON DELETE SET NULL
name          text NOT NULL
role          text
code          text NOT NULL               -- "EMP-042", único por empresa
photo_url     text                        -- Supabase Storage URL
rarity        text DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'legendary'))
page_number   int                         -- asignado al publicar layout
position      int  CHECK (position BETWEEN 1 AND 9)
is_active     boolean DEFAULT false       -- true = álbum publicado
created_at    timestamptz DEFAULT now()

UNIQUE (company_id, code)
```

---

### `user_collection`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE
obtained_at   timestamptz DEFAULT now()

UNIQUE (user_id, employee_id)   -- no duplicados en colección principal
```

---

### `user_duplicates`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE
company_id    uuid REFERENCES companies(id) ON DELETE CASCADE
employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE
quantity      int DEFAULT 1 CHECK (quantity > 0)
updated_at    timestamptz DEFAULT now()

UNIQUE (user_id, employee_id)
```

---

### `user_pack_status`
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
company_id        uuid REFERENCES companies(id) ON DELETE CASCADE
packs_available   int  DEFAULT 0
last_login_date   date DEFAULT CURRENT_DATE
updated_at        timestamptz DEFAULT now()
```

---

### `trade_offers`
```sql
id                   uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_id           uuid REFERENCES companies(id) ON DELETE CASCADE
from_user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
to_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL  -- null = oferta abierta
offered_emp_id       uuid REFERENCES employees(id) ON DELETE CASCADE
requested_emp_id     uuid REFERENCES employees(id) ON DELETE CASCADE
status               text DEFAULT 'open'
                     CHECK (status IN ('open', 'accepted', 'rejected', 'cancelled'))
created_at           timestamptz DEFAULT now()
updated_at           timestamptz DEFAULT now()
```

---

## RPCs en Postgres (lógica sensible que no va en cliente)

### `fn_login_pack_check(p_user_id, p_company_id)`
Se llama en cada login. Calcula paquetes ganados según días transcurridos y frecuencia configurada.

```
1. Leer user_pack_status del usuario
2. Leer pack_config.frequency_days y max_accumulated
3. dias = CURRENT_DATE - last_login_date
4. ganados = FLOOR(dias / frequency_days)
5. nuevo_total = LEAST(packs_available + ganados, max_accumulated)
6. UPDATE user_pack_status SET packs_available = nuevo_total, last_login_date = CURRENT_DATE
7. RETURN nuevo_total
```

---

### `fn_open_pack(p_user_id, p_company_id)`
Abre un sobre. Toda la lógica de RNG y anti-repetición ocurre aquí.

```
1. Verificar packs_available > 0, sino ERROR
2. Leer pack_config (pack_size, probabilities)
3. Obtener IDs de stickers que el usuario YA TIENE en user_collection
4. Obtener pool de stickers disponibles agrupados por rarity
5. Seleccionar pack_size stickers con weighted random SIN repetición entre sí
   - Priorizar stickers que el usuario no tiene
   - Si no hay suficientes nuevos, permitir duplicados (van a user_duplicates)
6. INSERT en user_collection (nuevos) o UPDATE quantity en user_duplicates (repetidos)
7. UPDATE packs_available = packs_available - 1
8. RETURN array de employee_ids obtenidos con flag is_new
```

---

### `fn_accept_trade(p_trade_id, p_acceptor_id)`
Acepta un intercambio. Transacción atómica.

```
1. Verificar trade_offer existe y status = 'open'
2. Verificar acceptor tiene el requested_emp en user_duplicates (quantity > 0)
3. Verificar from_user tiene el offered_emp en user_duplicates (quantity > 0)
4. Intercambiar: mover stickers entre user_collection / user_duplicates de ambos
5. UPDATE trade_offers SET status = 'accepted'
6. RETURN success
```

---

### `fn_compute_album_layout(p_company_id)`
El Editor llama esto al publicar. Asigna page_number y position a todos los empleados.

```
1. Obtener secciones ordenadas por order_index
2. Para cada sección, obtener empleados ordenados por created_at
3. Dentro de cada sección: page_offset = sección anterior termina en página X
4. Para cada empleado en la sección:
   - position = (index % 9) + 1
   - page_number = page_offset + FLOOR(index / 9) + 1
5. UPDATE employees SET page_number, position, is_active = true
```

---

## RLS — Políticas clave

| Tabla | Política |
|---|---|
| `employees` | SELECT solo si `company_id` = empresa del usuario logueado |
| `user_collection` | SELECT/INSERT solo si `user_id` = auth.uid() |
| `user_duplicates` | SELECT/INSERT/UPDATE solo si `user_id` = auth.uid() |
| `trade_offers` | SELECT si `from_user_id` = auth.uid() OR `to_user_id` = auth.uid() OR `status = 'open'` (misma empresa) |
| `album_theme` | SELECT público para empresa, UPDATE solo si rol = 'editor' |
| `pack_config` | SELECT público para empresa, UPDATE solo si rol = 'editor' |
| `album_sections` | SELECT público para empresa, INSERT/UPDATE/DELETE solo editor |
| `employees` (write) | INSERT/UPDATE/DELETE solo si rol = 'editor' |

---

## Fases de desarrollo

### FASE 1 — Fundación [ ]
**Objetivo:** Supabase configurado, auth funcionando, rutas protegidas.

- [ ] Schema SQL completo ejecutado en Supabase
- [ ] RLS policies aplicadas en todas las tablas
- [ ] RPCs creadas y testeadas en SQL editor
- [ ] `index.html` — pantalla login/registro para Editores (self-service)
- [ ] `join.html` — onboarding empleado por slug (`/join/:slug`)
- [ ] `js/core/supabase.js` — cliente singleton
- [ ] `js/core/auth.js` — login, registro, logout, session guard, detección de rol
- [ ] `js/core/router.js` — redirección según rol al entrar
- [ ] Trigger en `auth.users` que crea `user_profiles` + `user_pack_status` automáticamente
- [ ] Trigger/función que genera slug único desde company name

---

### FASE 2 — Panel del Editor [ ]
**Objetivo:** El Editor puede configurar todo antes de que lleguen empleados.

- [ ] `editor.html` — layout base con navegación por secciones
- [ ] `editor/sections.js` — crear, renombrar, reordenar secciones
- [ ] `editor/employees.js` — subir foto a Storage, crear empleado, asignar sección y rareza
- [ ] `editor/layout.js` — vista previa del layout (grid de páginas), botón "Publicar álbum" que llama `fn_compute_album_layout`
- [ ] `editor/packconfig.js` — configurar pack_size, frequency_days, max_accumulated, sliders de probabilidad por rareza (deben sumar 100%)
- [ ] `editor/theme-editor.js` — color pickers para todos los tokens, preview en tiempo real, guardar en `album_theme`
- [ ] `js/core/theme.js` — `applyTheme()` inyecta CSS custom properties en `:root`

---

### FASE 3 — Álbum visual [ ]
**Objetivo:** El empleado ve su álbum completo con stickers llenos y vacíos.

- [ ] `css/base.css` — reset, variables base, tipografía (Google Fonts: Playfair Display + DM Sans)
- [ ] `css/sticker.css` — componente sticker, estados empty/filled, badges de rareza
- [ ] `css/album.css` — layout spread, spine, page, section title, sticker grid 3×3
- [ ] `js/album/stickers.js` — `renderSticker(employee, isCollected)` con placeholder SVG de iniciales
- [ ] `js/album/album.js` — carga páginas desde Supabase, monta estructura HTML
- [ ] Integración StPageFlip — animación de pasar página
- [ ] Indicador de progreso (X/Total stickers colectados)
- [ ] `album.html` — monta todo, carga tema de empresa

---

### FASE 4 — Mecánica de sobres [ ]
**Objetivo:** El empleado puede abrir sobres y ver sus stickers nuevos.

- [ ] `js/album/pack.js` — `openPack()` llama `fn_open_pack`, recibe resultado
- [ ] Animación de apertura de sobre (CSS + JS)
- [ ] Pantalla de reveal — muestra los stickers obtenidos uno a uno
- [ ] Indicador de sobres disponibles en UI del álbum
- [ ] Lógica de login que llama `fn_login_pack_check` y actualiza UI
- [ ] Separación visual en UI: stickers "nuevos" vs "repetidos" al abrir sobre

---

### FASE 5 — Intercambios [ ]
**Objetivo:** Los empleados pueden intercambiar stickers repetidos.

- [ ] `exchange.html` — layout base
- [ ] `js/exchange/exchange.js` — listar ofertas abiertas de la misma empresa, filtrar por sticker buscado
- [ ] `js/exchange/trade.js` — crear oferta (seleccionar ofrezco / pido), cancelar oferta propia
- [ ] Aceptar intercambio — llama `fn_accept_trade`
- [ ] Notificación en UI cuando alguien acepta tu oferta (Supabase Realtime)
- [ ] Vista "Mis repetidos" — lista de user_duplicates con quantity

---

## Glosario de términos usados en el código

| Término en código | Significado |
|---|---|
| `editor` | El administrador de la empresa (quien configura el álbum) |
| `employee` | El usuario final que colecciona stickers |
| `slug` | Identificador URL de la empresa (ej: `acme-corp`) |
| `spread` | Las dos páginas visibles a la vez en el álbum |
| `slot` | Posición 1-9 dentro de una página |
| `pack` | Sobre de stickers |
| `duplicate` | Sticker que el usuario ya tenía (va a user_duplicates) |
| `layout` | El mapa fijo de qué empleado va en qué página y posición |
| `rarity` | Rareza del sticker: common, rare, legendary |
