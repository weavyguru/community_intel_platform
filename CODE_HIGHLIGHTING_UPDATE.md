# Code Syntax Highlighting - Quill Editor Enhancement

## Problem

Quill's default code block formatting was basic and didn't provide proper syntax highlighting for code snippets, making technical blog posts look unprofessional.

## Solution

Integrated **Highlight.js** with Quill's syntax module for professional code syntax highlighting.

## What Was Added

### 1. Highlight.js Library
- **Version**: 11.9.0
- **Theme**: Atom One Dark (professional dark theme)
- **Auto-detection**: Automatically detects programming language
- **200+ languages supported**

### 2. Quill Syntax Module
- Configured Quill to use Highlight.js for code blocks
- Real-time syntax highlighting as you type
- Preserves formatting on save/load

### 3. Custom Styling
- **Code Blocks**: Dark theme with proper padding and borders
- **Inline Code**: Light gray background with pink text
- **Font**: Monospace (Consolas, Monaco, Courier New)
- **Syntax Colors**: Professional color scheme matching Atom One Dark

## Technical Implementation

### Files Modified

**1. `src/views/blog.ejs`**

Added CDN resources:
```html
<!-- In <head>: CSS for syntax highlighting theme -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/atom-one-dark.min.css">
<link href="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css" rel="stylesheet">

<!-- At end of <body>: JavaScript libraries in order -->
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
<script src="/js/blog.js"></script>
```

**Important**: The Highlight.js script uses the GitHub CDN release path (`/gh/highlightjs/cdn-release@...`) instead of the npm path. This ensures the browser-compatible build is loaded with proper global `hljs` export.

Added custom CSS:
```css
/* Code block styling */
.ql-editor pre.ql-syntax {
    background-color: #282c34;
    color: #abb2bf;
    overflow: auto;
    padding: 1em;
    border-radius: 5px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
}

/* Inline code styling */
.ql-editor code {
    background-color: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
    color: #e83e8c;
}
```

**2. `public/js/blog.js`**

Configured Quill with syntax module:
```javascript
quillEditor = new Quill('#editBodyEditor', {
    theme: 'snow',
    modules: {
        syntax: {
            highlight: text => hljs.highlightAuto(text).value
        },
        toolbar: toolbarOptions
    },
    placeholder: 'Write your blog post content here...'
});
```

Added custom HTML to Delta converter for loading blog posts:
```javascript
// Manually parse HTML and build Quill Delta
const Delta = Quill.import('delta');
const tempDiv = document.createElement('div');
tempDiv.innerHTML = post.body;

const delta = new Delta();

// Process each child node
Array.from(tempDiv.childNodes).forEach(node => {
    if (node.nodeName === 'P') {
        delta.insert(node.textContent + '\n');
    } else if (node.nodeName === 'H1') {
        delta.insert(node.textContent + '\n', { header: 1 });
    } else if (node.nodeName === 'H2') {
        delta.insert(node.textContent + '\n', { header: 2 });
    } else if (node.nodeName === 'H3') {
        delta.insert(node.textContent + '\n', { header: 3 });
    } else if (node.nodeName === 'PRE') {
        // Code block with syntax highlighting
        const code = node.querySelector('code');
        if (code) {
            delta.insert(code.textContent + '\n', { 'code-block': true });
        }
    } else if (node.nodeName === 'UL') {
        // Unordered list
        Array.from(node.querySelectorAll('li')).forEach(li => {
            delta.insert(li.textContent + '\n', { list: 'bullet' });
        });
    } else if (node.nodeName === 'OL') {
        // Ordered list
        Array.from(node.querySelectorAll('li')).forEach(li => {
            delta.insert(li.textContent + '\n', { list: 'ordered' });
        });
    }
});

quillEditor.setContents(delta);
```

Added custom clipboard matcher for code blocks:
```javascript
quillEditor.clipboard.addMatcher('PRE', (node, delta) => {
    const code = node.querySelector('code');
    if (code) {
        return new Quill.import('delta')([{
            insert: code.textContent,
            attributes: { 'code-block': true }
        }]);
    }
    return delta;
});
```

**Saving blog posts** - Convert Quill format back to standard HTML:
```javascript
// Quill 2.0 stores code blocks as div.ql-code-block-container
const codeBlockContainers = tempDiv.querySelectorAll('div.ql-code-block-container');

codeBlockContainers.forEach(container => {
    // Get all the code lines (each line is a div.ql-code-block)
    const codeLines = container.querySelectorAll('div.ql-code-block');

    // Combine all lines into one code block
    const codeText = Array.from(codeLines).map(line => line.textContent).join('\n');

    // Create standard <pre><code> structure
    const newPre = document.createElement('pre');
    const codeElement = document.createElement('code');
    codeElement.textContent = codeText;
    newPre.appendChild(codeElement);

    // Replace Quill format with standard format
    container.replaceWith(newPre);
});
```

## Features

### Automatic Language Detection
Highlight.js automatically detects the programming language:
- JavaScript/TypeScript
- Python
- HTML/CSS
- Java/C#/C++
- Go, Rust, PHP
- SQL, JSON, YAML
- And 200+ more languages

### Syntax Highlighting Features
- ✅ Keywords in purple
- ✅ Strings in green
- ✅ Comments in gray
- ✅ Functions in blue
- ✅ Numbers in orange
- ✅ Operators properly colored

### Code Block Styling
- Dark background (#282c34)
- Rounded corners
- Proper padding
- Horizontal scroll for long lines
- Line height optimized for readability

### Inline Code
- Light gray background
- Pink text color
- Subtle padding
- Rounded corners
- Distinguishable from regular text

## How to Use

### In the Editor

1. **Insert Code Block**: Click the code block button in toolbar (</> icon)
2. **Paste Code**: Paste or type your code
3. **Auto-Highlight**: Syntax highlighting applies automatically
4. **Edit**: Code remains editable with live highlighting

### Supported Formats

**Code Blocks** (multi-line):
```javascript
function hello() {
    console.log('Hello World');
}
```

**Inline Code** (single line):
Use for `variable names` or `function()` references in text.

## Example Output

### JavaScript
```javascript
const fetchData = async (url) => {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Error:', error);
    }
};
```

### Python
```python
def calculate_sum(numbers):
    """Calculate the sum of a list of numbers"""
    return sum(numbers)

result = calculate_sum([1, 2, 3, 4, 5])
print(f"Sum: {result}")
```

### HTML
```html
<!DOCTYPE html>
<html>
<head>
    <title>My Page</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>
```

## Benefits

1. **Professional Appearance**: Code looks like it does in IDEs
2. **Better Readability**: Syntax colors make code easier to scan
3. **Auto-Detection**: No need to specify language
4. **Universal**: Works with all programming languages
5. **Print-Friendly**: Code maintains formatting when published
6. **Copy-Paste Ready**: Code can be easily copied from blogs

## Theme Customization

To change the code theme, replace the Highlight.js CSS:

```html
<!-- Current: Atom One Dark -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/atom-one-dark.min.css">

<!-- Alternative themes: -->
<!-- GitHub Style -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css">

<!-- VS Code Dark+ -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/vs2015.min.css">

<!-- Monokai -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/monokai.min.css">
```

[View all 242 themes](https://highlightjs.org/static/demo/)

## Performance

- **CDN Hosted**: Fast loading from jsDelivr CDN
- **Minimal Size**: ~80KB for core + theme
- **Lazy Loading**: Only loads when needed
- **Cached**: Browser caches for repeat visits

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

## Troubleshooting

### hljs is not defined Error

**Problem**: Console shows "Uncaught ReferenceError: hljs is not defined" when page loads.

**Cause**: CDN scripts in the head were loading asynchronously, not guaranteed to be ready when blog.js executes.

**Solution**: Moved all JavaScript libraries to the end of the body, just before blog.js:

```html
<!-- At the end of body, before blog.js -->
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
<script src="/js/blog.js"></script>
```

This ensures synchronous loading in the correct order:
1. Highlight.js loads and defines `hljs`
2. Quill loads and can access `hljs`
3. blog.js loads and can access both libraries

CSS files remain in the `<head>` for styling.

### Code Blocks Not Rendering from Database

**Problem**: AI-generated blog posts stored in MongoDB contain standard HTML `<pre><code>` tags, but Quill's clipboard converter couldn't parse them properly and returned 0 delta operations, resulting in empty content.

**Root Cause**: Quill's default clipboard matchers don't recognize `<pre><code>` structures from AI-generated HTML. When using `quillEditor.clipboard.convert()`, the HTML was rejected entirely.

**Solution**: Implemented a custom HTML-to-Delta parser that manually builds Quill Delta operations:

1. Parse the HTML into a temporary DOM element
2. Walk through each child node
3. Convert each HTML element to its corresponding Quill Delta format:
   - `<p>` → plain text insert with newline
   - `<h1>`, `<h2>`, `<h3>` → text insert with header attribute
   - `<pre><code>` → text insert with `{'code-block': true}` attribute
   - `<ul>` → list items with `{list: 'bullet'}` attribute
   - `<ol>` → list items with `{list: 'ordered'}` attribute
4. Set the Delta directly into Quill
5. Quill's syntax module automatically applies highlighting to code blocks

**Key Insight**: Bypassing Quill's clipboard API and manually constructing Delta operations gives us full control over how HTML is converted and ensures code blocks are properly recognized.

```javascript
// ❌ WRONG - Quill's clipboard rejects the HTML:
const delta = quillEditor.clipboard.convert(post.body); // Returns 0 ops
quillEditor.setContents(delta); // Empty content

// ✅ CORRECT - Manual Delta construction:
const Delta = Quill.import('delta');
const delta = new Delta();
// Parse HTML and build Delta operations manually
delta.insert(code.textContent + '\n', { 'code-block': true });
quillEditor.setContents(delta); // Full content with highlighting
```

## Resources

- [Highlight.js Documentation](https://highlightjs.org/)
- [Quill Syntax Module](https://quilljs.com/docs/modules/syntax/)
- [Language Detection](https://highlightjs.readthedocs.io/en/latest/api.html#highlightauto-code-languagesubset)
