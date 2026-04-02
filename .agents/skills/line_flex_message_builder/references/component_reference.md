# Flex Message Component Reference

Complete reference for LINE Flex Message components and properties.

## Layout Components

### Box
Container for organizing child components.

```json
{
  "type": "box",
  "layout": "vertical",
  "spacing": "md",
  "paddingAll": "lg",
  "backgroundColor": "#f5f5f5",
  "contents": [...]
}
```

| Property | Type | Values |
|----------|------|--------|
| layout | string | `vertical`, `horizontal`, `baseline` |
| spacing | string | `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` |
| paddingAll | string | `none`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl` |
| backgroundColor | string | Hex color code |
| flex | number | 0-10, proportional space allocation |

### Bubble
Single card container with optional sections.

```json
{
  "type": "bubble",
  "size": "kilo",
  "header": { ... },
  "hero": { ... },
  "body": { ... },
  "footer": { ... }
}
```

**Sizes**: `nano` (120px), `micro` (140px), `kilo` (210px), `mega` (300px), `giga` (500px)

### Carousel
Horizontal scroll of multiple bubbles.

```json
{
  "type": "carousel",
  "contents": [
    { "type": "bubble", ... },
    { "type": "bubble", ... }
  ]
}
```

## Content Components

### Text
Display text with styling options.

```json
{
  "type": "text",
  "text": "Hello World",
  "size": "md",
  "weight": "bold",
  "color": "#333333",
  "wrap": true,
  "align": "center",
  "decoration": "none"
}
```

| Property | Type | Values |
|----------|------|--------|
| size | string | `xs`(11px), `sm`(13px), `md`(14px), `lg`(16px), `xl`(19px), `xxl`(22px), `3xl`(36px) |
| weight | string | `regular`, `bold` |
| color | string | Hex color code |
| wrap | boolean | true/false |
| align | string | `start`, `center`, `end` |
| decoration | string | `none`, `underline`, `line-through` |

### Image
Display images with aspect ratio control.

```json
{
  "type": "image",
  "url": "https://example.com/image.jpg",
  "size": "full",
  "aspectRatio": "16:9",
  "aspectMode": "cover",
  "action": { ... }
}
```

| Property | Type | Values |
|----------|------|--------|
| size | string | `xxs`, `xs`, `sm`, `md`, `lg`, `xl`, `xxl`, `3xl`, `4xl`, `5xl`, `full` |
| aspectRatio | string | `1:1`, `1.51:1`, `1.91:1`, `4:3`, `16:9`, `20:13`, `2:1`, `3:1`, `3:4`, `9:16`, `1:2`, `1:3` |
| aspectMode | string | `cover`, `fit` |

### Button
Interactive button component.

```json
{
  "type": "button",
  "style": "primary",
  "height": "md",
  "action": {
    "type": "uri",
    "label": "Click Me",
    "uri": "https://example.com"
  }
}
```

| Property | Type | Values |
|----------|------|--------|
| style | string | `primary` (green), `secondary` (white), `link` (text only) |
| height | string | `sm`, `md` |

### Separator
Visual divider between components.

```json
{
  "type": "separator",
  "color": "#eeeeee",
  "margin": "md"
}
```

### Spacer
Empty space for layout adjustment.

```json
{
  "type": "spacer",
  "size": "md"
}
```

**Sizes**: `xs`, `sm`, `md`, `lg`, `xl`, `xxl`

## Actions

Buttons and images can trigger actions:

### URI Action
Open external URL.

```json
{
  "type": "uri",
  "label": "Visit Site",
  "uri": "https://example.com"
}
```

### Message Action
Send message to chat.

```json
{
  "type": "message",
  "label": "Say Hello",
  "text": "Hello!"
}
```

### Postback Action
Send data to webhook.

```json
{
  "type": "postback",
  "label": "Select",
  "data": "action=select&id=123",
  "displayText": "Selected item"
}
```

## Spacing & Sizing Reference

| Token | Value |
|-------|-------|
| none | 0px |
| xs | 4px |
| sm | 8px |
| md | 12px |
| lg | 16px |
| xl | 20px |
| xxl | 24px |

## Flex Property

Controls space distribution in horizontal layouts:

```json
{
  "type": "box",
  "layout": "horizontal",
  "contents": [
    { "type": "text", "text": "Label", "flex": 1 },
    { "type": "text", "text": "Value", "flex": 3 }
  ]
}
```

Total flex = 4, so Label gets 25%, Value gets 75%.
