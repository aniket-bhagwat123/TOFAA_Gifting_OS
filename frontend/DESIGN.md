# TOFAA Global UI Design Guidelines

Version: 1.0  
Purpose: Shared visual standard for TOFAA Gifting OS  
Measurement convention: CSS pixels (px)

These are default desktop-first standards. Apply them consistently, while respecting responsive layouts, accessibility, and existing component constraints. Do not change application behaviour merely to meet a visual measurement.

## 1. Design direction
- Compact, professional, minimal, information-dense enterprise SaaS.
- Productivity-software interaction patterns similar to Outlook, Teams, and Gmail, while retaining TOFAA's visual identity.
- Reduce oversized controls and unnecessary whitespace without making the interface cramped.
- Prefer clear hierarchy, useful information density, and predictable interactions.

## 2. Font family
Primary font: `Inter`.

Fallback:
```css
font-family: Inter, "Segoe UI", Arial, sans-serif;
```
Use one font family throughout headings, body text, buttons, forms, tables, navigation, numbers, tooltips, and notifications. Confirm that Inter is loaded correctly; do not assume it is available locally.

## 3. Typography scale

| Element | Font size | Weight |
|---|---:|---:|
| Main dashboard KPI | 28–32 px | 600 |
| Page title | 20 px | 600 |
| Section heading | 16 px | 600 |
| Modal title | 17 px | 600 |
| Card heading | 14 px | 600 |
| Subsection heading | 13 px | 600 |
| Body text | 13 px | 400 |
| Table content | 13 px | 400 |
| Table header | 11 px | 600 |
| Button text | 13 px | 500 |
| Navigation text | 13 px | 500 |
| Form label | 12 px | 500 |
| Input text | 13 px | 400 |
| Placeholder | 12 px | 400 |
| Helper text | 11 px | 400 |
| Secondary information | 12 px | 400 |
| Badge/status | 11 px | 500 |
| Tooltip | 12 px | 400 |
| Date/timestamp | 11–12 px | 400 |
| Modal body | 13 px | 400 |
| Notification text | 13 px | 400 |

Font weights:
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700 (rare emphasis only)

Avoid using 700 everywhere. Avoid text below 11 px for important information. Maintain readable contrast and allow responsive adjustments where necessary.

## 4. Application layout

| Component | Standard |
|---|---:|
| Expanded sidebar | 216 px |
| Collapsed sidebar | 64 px |
| Top header | 58 px |
| Main content padding | 24 px |
| Page title area | 44–48 px |
| Standard section gap | 20–24 px |
| Card padding | 16 px |
| Compact card padding | 12 px |
| Content width | Fluid |

Responsive guidance:
- Desktop (1440 px and above): 216 px sidebar.
- Laptop (1024–1439 px): 200–216 px sidebar, depending on available space.
- Tablet: collapsible navigation.
- Mobile: drawer navigation and responsive content; tables may scroll horizontally when a usable compact alternative is not available.

## 5. Buttons

| Type | Height | Horizontal padding | Font |
|---|---:|---:|---:|
| Extra small | 28 px | 10 px | 11 px |
| Small | 32 px | 12 px | 12 px |
| Standard (default) | 36 px | 14 px | 13 px |
| Large / prominent action | 40 px | 16 px | 13 px |
| Icon-only | 32–36 px | — | 16–18 px icon |

Default button height: 36 px.

Button styles:
- Primary: TOFAA green background, white text.
- Secondary: surface background with subtle border.
- Tertiary: transparent, with a subtle hover state.
- Danger: restrained red text/background.
- Disabled: visibly disabled and not interactive.

Example:
```css
.btn {
  min-height: 36px;
  padding: 0 14px;
  font-family: Inter, "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
```
Use `min-height` where labels may wrap or accessibility requires a larger hit area. Compact visual size must not create inaccessible interaction targets.

## 6. Inputs and dropdowns

| Element | Standard |
|---|---:|
| Input height | 36–38 px |
| Dropdown height | 36–38 px |
| Search field height | 38 px |
| Textarea minimum height | 80 px |
| Form label | 12 px |
| Input text | 13 px |
| Placeholder | 12 px |
| Label-to-input gap | 6 px |
| Field-to-field gap | 14–16 px |
| Input radius | 6 px |
| Border | 1 px |

Keep validation, focus, disabled, read-only, and error states consistent.

## 7. Tables and data lists

| Element | Standard |
|---|---:|
| Table header height | 38 px |
| Table row height | 54–56 px |
| Table content | 13 px |
| Table header text | 11 px |
| Avatar | 32 px |
| Checkbox visual size | 16 px |
| Action icon | 16 px |
| Row horizontal padding | 12 px |
| Row separator | 1 px |
| Hover background | `#F5F8F7` |

Guidance:
- Use sticky headers for long tables where appropriate.
- Align columns consistently and keep row density comfortable.
- Use subtle separators rather than heavy borders.
- Truncate long text with an accessible tooltip or detail view.
- Support sorting, filtering, and bulk selection where the workflow requires them.
- Do not force every data list into cards.

## 8. Sidebar and navigation

| Element | Standard |
|---|---:|
| Sidebar width | 216 px |
| Collapsed sidebar | 64 px |
| Logo area height | 64 px |
| Navigation item height | 38 px |
| Navigation icon | 18 px |
| Navigation font | 13 px |
| Horizontal item padding | 12 px |
| Icon-to-label gap | 10 px |
| Item radius | 7 px |

Use a restrained light-green selected state rather than a large, visually heavy block.

## 9. Header

| Element | Standard |
|---|---:|
| Header height | 58 px |
| Logo height | 28–32 px |
| Company selector | 34–36 px |
| User avatar | 32 px |
| User name | 13 px |
| User role | 11 px |
| Horizontal padding | 20–24 px |

Keep the header focused on essential navigation, search, notifications, and account controls.

## 10. Modals, drawers, and forms

| Component | Width |
|---|---:|
| Small confirmation modal | 360–420 px |
| Standard modal | 480–560 px |
| Large modal | 640–760 px |
| Standard form drawer | 480–560 px |
| Multi-step form drawer | 700–800 px |
| Detail preview drawer | 420–480 px |

Other standards:
- Modal title: 17 px.
- Modal body: 13 px.
- Footer buttons: 36 px.
- Standard modal radius: 10 px.
- Keep drawer header and footer fixed while the body scrolls.
- Use full-page forms only when the workflow genuinely needs a dedicated page.

## 11. Spacing scale

| Token | Size | Typical use |
|---|---:|---|
| 1 | 4 px | Micro gap |
| 2 | 8 px | Compact spacing |
| 3 | 12 px | Small component gap |
| 4 | 16 px | Standard spacing |
| 5 | 20 px | Section spacing |
| 6 | 24 px | Main content spacing |
| 8 | 32 px | Major section separation |
| 10 | 40 px | Large separation |

Prefer these tokens over arbitrary one-off spacing values.

## 12. Colour palette

| Purpose | Value |
|---|---|
| Primary green | `#087A61` |
| Primary hover | `#06664F` |
| Main background | `#F5F7F8` |
| Surface/card | `#FFFFFF` |
| Primary text | `#26332F` |
| Secondary text | `#78847F` |
| Border | `#E6EBE8` |
| Selected background | `#E8F3EE` |
| Success | `#16A36A` |
| Warning | `#E9A23B` |
| Error | `#D94B4B` |
| Information | `#4386C6` |

Use semantic status colours only when they communicate meaning. Check text/background contrast before implementation.

## 13. Icons, badges, and surfaces

| Element | Standard |
|---|---:|
| Standard icons | 16–18 px |
| Sidebar icons | 18 px |
| Small inline icons | 14 px |
| Status dot | 7–8 px |
| Badge height | 22–24 px |
| Badge font | 11 px |
| Badge horizontal padding | 8 px |
| Avatar | 32 px |
| Tooltip delay | 300–500 ms |
| Card radius | 8 px |
| Card shadow | Minimal |

Prefer one consistent icon library (Lucide is the default recommendation). Avoid mixing filled and outlined icon styles without a clear design reason.

## 14. CSS design tokens

Use these as starting tokens and adapt names to the existing project's token convention rather than introducing a duplicate token system.

```css
:root {
  --font-family: Inter, "Segoe UI", Arial, sans-serif;

  --font-2xs: 11px;
  --font-xs: 12px;
  --font-sm: 13px;
  --font-base: 14px;
  --font-md: 16px;
  --font-lg: 17px;
  --font-xl: 20px;
  --font-2xl: 28px;
  --font-3xl: 32px;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --sidebar-width: 216px;
  --sidebar-collapsed: 64px;
  --header-height: 58px;
  --page-padding: 24px;

  --button-height: 36px;
  --input-height: 38px;
  --nav-item-height: 38px;
  --table-header-height: 38px;
  --table-row-height: 56px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  --color-primary: #087A61;
  --color-primary-hover: #06664F;
  --color-background: #F5F7F8;
  --color-surface: #FFFFFF;
  --color-text: #26332F;
  --color-text-secondary: #78847F;
  --color-border: #E6EBE8;
  --color-selected: #E8F3EE;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
}
```

## 15. Global implementation rules
1. Use one shared design system across all modules.
2. Reuse existing shared components; do not create parallel component systems.
3. Use design tokens instead of arbitrary hardcoded sizes.
4. Default to compact layouts with useful information density.
5. Keep hover, focus, selected, disabled, loading, empty, error, and success states consistent.
6. Maintain accessibility, keyboard support, readable contrast, and adequate hit areas.
7. Ensure responsive behaviour on desktop, laptop, tablet, and mobile.
8. A token change should propagate through shared components wherever practical.

## 16. Acceptance checklist
- No arbitrary or inconsistent typography and component dimensions.
- No unnecessarily oversized controls or excessive whitespace.
- Consistent header, navigation, tables, forms, and drawers.
- More useful information visible without unnecessary scrolling.
- Existing workflows, APIs, permissions, and data structures remain intact.
- All screens follow the same visual language.
- Relevant tests, type checks, lint, and build checks pass.

## Core principle
More useful information visible on screen, fewer unnecessary clicks, less scrolling, and compact controls without making the interface feel crowded.
