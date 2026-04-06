---
name: WordPress Theme & Plugin Patterns
description: WordPress development patterns — theme structure, custom post types, ACF fields, WooCommerce integration, and plugin standards
---

# WordPress Theme & Plugin Skill

Patterns for building custom WordPress themes and plugins for client sites.

## Theme Structure

### Custom Theme
```
wp-content/themes/client-theme/
├── style.css              ← Theme metadata (required)
├── functions.php          ← Theme setup, enqueues, includes
├── index.php              ← Fallback template
├── header.php             ← Site header
├── footer.php             ← Site footer
├── front-page.php         ← Homepage template
├── page.php               ← Default page template
├── single.php             ← Single post template
├── archive.php            ← Archive/listing template
├── 404.php                ← Not found page
├── search.php             ← Search results
├── template-parts/        ← Reusable components
│   ├── content.php
│   ├── content-card.php
│   └── hero.php
├── inc/                   ← PHP includes
│   ├── custom-post-types.php
│   ├── shortcodes.php
│   ├── widgets.php
│   └── customizer.php
├── assets/
│   ├── css/
│   ├── js/
│   ├── images/
│   └── fonts/
└── page-templates/        ← Custom page templates
    ├── template-contact.php
    └── template-landing.php
```

### Child Theme
ALWAYS use a child theme when customizing an existing/purchased theme:
```
wp-content/themes/parent-theme-child/
├── style.css       ← Template: parent-theme-name
├── functions.php   ← Only overrides and additions
└── template-parts/ ← Only overridden templates
```

```css
/* style.css */
/*
Theme Name: Client Theme Child
Template: parent-theme-name
*/
```

## functions.php Patterns

### Theme Setup
```php
<?php
// Enqueue styles and scripts — NEVER hardcode in header.php
function client_theme_enqueue() {
    wp_enqueue_style('client-main', get_stylesheet_uri(), [], '1.0.0');
    wp_enqueue_style('client-custom', get_template_directory_uri() . '/assets/css/custom.css', ['client-main'], '1.0.0');
    wp_enqueue_script('client-main', get_template_directory_uri() . '/assets/js/main.js', [], '1.0.0', true);
}
add_action('wp_enqueue_scripts', 'client_theme_enqueue');

// Theme supports
function client_theme_setup() {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('custom-logo');
    add_theme_support('html5', ['search-form', 'comment-form', 'gallery', 'caption']);
    register_nav_menus([
        'primary' => 'Primary Navigation',
        'footer'  => 'Footer Navigation',
    ]);
}
add_action('after_setup_theme', 'client_theme_setup');

// Include custom post types
require_once get_template_directory() . '/inc/custom-post-types.php';
```

## Custom Post Types & Taxonomies

```php
// inc/custom-post-types.php
function register_project_post_type() {
    register_post_type('project', [
        'labels' => [
            'name' => 'Projects',
            'singular_name' => 'Project',
        ],
        'public' => true,
        'has_archive' => true,
        'rewrite' => ['slug' => 'projects'],
        'supports' => ['title', 'editor', 'thumbnail', 'excerpt'],
        'menu_icon' => 'dashicons-portfolio',
        'show_in_rest' => true, // Enable Gutenberg
    ]);

    register_taxonomy('project_type', 'project', [
        'labels' => ['name' => 'Project Types'],
        'hierarchical' => true,
        'rewrite' => ['slug' => 'project-type'],
        'show_in_rest' => true,
    ]);
}
add_action('init', 'register_project_post_type');
```

## ACF (Advanced Custom Fields)

### Field Group Registration
```php
// For portability, register fields in PHP (not just via ACF UI)
if (function_exists('acf_add_local_field_group')) {
    acf_add_local_field_group([
        'key' => 'group_project_details',
        'title' => 'Project Details',
        'fields' => [
            ['key' => 'field_client_name', 'label' => 'Client Name', 'name' => 'client_name', 'type' => 'text'],
            ['key' => 'field_completion_date', 'label' => 'Completion Date', 'name' => 'completion_date', 'type' => 'date_picker'],
            ['key' => 'field_gallery', 'label' => 'Project Gallery', 'name' => 'gallery', 'type' => 'gallery'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'project']]],
    ]);
}
```

### Displaying ACF Fields
```php
// In template files
$client_name = get_field('client_name');
if ($client_name) {
    echo '<p>' . esc_html($client_name) . '</p>';
}

// Repeater fields
if (have_rows('team_members')) {
    while (have_rows('team_members')) {
        the_row();
        echo esc_html(get_sub_field('name'));
    }
}
```

## Security

- `esc_html()` — for text content
- `esc_attr()` — for HTML attributes
- `esc_url()` — for URLs
- `wp_kses_post()` — for rich text with allowed HTML
- `sanitize_text_field()` — for input sanitization
- `absint()` — for integers
- `wp_nonce_field()` / `wp_verify_nonce()` — for form CSRF protection

**NEVER output unescaped user data.**

## WooCommerce Integration

When using WooCommerce:
- Override templates by copying from `wp-content/plugins/woocommerce/templates/`
  to your theme's `woocommerce/` directory
- Use hooks instead of template overrides whenever possible
- Test checkout flow thoroughly after any customization
- Be careful with cart/checkout template overrides — they break with WooCommerce updates

## Performance

- Use `wp_cache_set()` / `wp_cache_get()` for expensive queries
- Avoid querying in loops — use a single `WP_Query` with proper arguments
- Use `'update_post_meta_cache' => false` and `'update_post_term_cache' => false`
  on queries that don't need meta/term data
- Implement proper image sizes via `add_image_size()` instead of CSS scaling
