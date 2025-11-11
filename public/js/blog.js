// Blog Creator Client-Side Logic

let currentTopicId = null;
let currentPostId = null;
let selectedTopicIndices = [];
let quillEditor = null;

// Socket.IO connection for real-time updates
const socket = io();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadPublishedBlogs();
});

function initializeEventListeners() {
    // Instructions editor
    document.getElementById('editInstructionsBtn').addEventListener('click', openInstructionsEditor);
    document.getElementById('saveInstructionsBtn').addEventListener('click', saveInstructions);
    document.getElementById('closeInstructionsBtn').addEventListener('click', () => {
        document.getElementById('instructionsModal').hide();
    });

    // Step 1: Generate Topics
    document.getElementById('generateTopicsBtn').addEventListener('click', generateTopics);

    // Step 2: Select Topics
    document.getElementById('generatePostsBtn').addEventListener('click', generateBlogPosts);
    document.getElementById('backToStep1Btn').addEventListener('click', () => showStep(1));

    // Step 3: Create More
    document.getElementById('createMoreBtn').addEventListener('click', () => {
        showStep(1);
        document.getElementById('blogQuery').value = '';
    });

    // Editor Modal
    document.getElementById('closeEditorBtn').addEventListener('click', () => {
        document.getElementById('blogEditorModal').hide();
    });
    document.getElementById('savePostBtn').addEventListener('click', savePost);
    document.getElementById('publishHubSpotBtn').addEventListener('click', publishToHubSpot);
    document.getElementById('deletePostBtn').addEventListener('click', deletePost);
    document.getElementById('regenerateImagesBtn').addEventListener('click', regenerateImages);

    // Socket.IO listeners
    socket.on('blog:status', handleSearchStatus);
    socket.on('blog:generation', handleGenerationStatus);
}

function initializeQuillEditor() {
    // Check if Highlight.js is loaded (required for syntax highlighting)
    if (typeof hljs === 'undefined') {
        console.error('Highlight.js library not loaded! Code syntax highlighting will be disabled.');
        // Initialize without syntax highlighting
        initializeQuillEditorBasic();
        return;
    }

    // Check if Quill is loaded
    if (typeof Quill === 'undefined') {
        console.error('Quill library not loaded!');
        return;
    }

    // Check if element exists
    const editorElement = document.getElementById('editBodyEditor');
    if (!editorElement) {
        console.error('Editor element #editBodyEditor not found!');
        return;
    }

    // Configure Quill with syntax highlighting
    const toolbarOptions = [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        ['blockquote', 'code-block'],
        ['link', 'image'],
        [{ 'align': [] }],
        ['clean']
    ];

    // Initialize Quill with syntax highlighting module
    quillEditor = new Quill('#editBodyEditor', {
        theme: 'snow',
        modules: {
            syntax: {
                highlight: text => hljs.highlightAuto(text).value
            },
            toolbar: toolbarOptions,
            clipboard: {
                matchVisual: false
            }
        },
        placeholder: 'Write your blog post content here...'
    });

    // Add custom clipboard matcher for <pre><code> blocks
    quillEditor.clipboard.addMatcher('PRE', (node, delta) => {
        const code = node.querySelector('code');
        if (code) {
            // Extract text content from code block
            const text = code.textContent;
            return new Quill.import('delta')([{
                insert: text,
                attributes: { 'code-block': true }
            }]);
        }
        return delta;
    });
}

function initializeQuillEditorBasic() {
    // Fallback initialization without syntax highlighting
    const toolbarOptions = [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        ['blockquote', 'code-block'],
        ['link', 'image'],
        [{ 'align': [] }],
        ['clean']
    ];

    quillEditor = new Quill('#editBodyEditor', {
        theme: 'snow',
        modules: {
            toolbar: toolbarOptions
        },
        placeholder: 'Write your blog post content here...'
    });
}

// Step Navigation
function showStep(step) {
    document.getElementById('step1').classList.toggle('hidden', step !== 1);
    document.getElementById('step2').classList.toggle('hidden', step !== 2);
    document.getElementById('step3').classList.toggle('hidden', step !== 3);

    // Reset states
    if (step === 1) {
        currentTopicId = null;
        selectedTopicIndices = [];
        document.getElementById('searchStatus').classList.add('hidden');
        document.getElementById('searchLog').innerHTML = '';
    }
}

// Step 1: Generate Topics
async function generateTopics() {
    const query = document.getElementById('blogQuery').value.trim();

    if (!query) {
        showToast('Please enter a blog topic query', 'warning', 'exclamation-triangle');
        return;
    }

    const btn = document.getElementById('generateTopicsBtn');
    btn.loading = true;

    document.getElementById('searchStatus').classList.remove('hidden');
    document.getElementById('searchLog').innerHTML = '';

    try {
        const response = await fetch('/api/blog/search-and-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (data.success) {
            currentTopicId = data.topicId;
            displayTopics(data.topics);
            showStep(2);
            showToast(`Generated ${data.topics.length} blog topic suggestions!`, 'success', 'check-circle');
        } else {
            showToast(data.error || 'Failed to generate topics', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error generating topics:', error);
        showToast('Error generating topics', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

function handleSearchStatus(data) {
    const statusMessage = document.getElementById('searchStatusMessage');
    const log = document.getElementById('searchLog');

    statusMessage.textContent = data.message || data.step;

    // Add to log
    const logEntry = document.createElement('div');
    logEntry.className = 'flex items-start gap-2';

    const statusIcon = data.status === 'complete' ? '✓' :
                       data.status === 'error' ? '✗' :
                       data.status === 'warning' ? '⚠' : '•';

    logEntry.innerHTML = `
        <span class="font-bold ${
            data.status === 'complete' ? 'text-green-600' :
            data.status === 'error' ? 'text-red-600' :
            data.status === 'warning' ? 'text-yellow-600' : 'text-blue-600'
        }">${statusIcon}</span>
        <span>${data.message}</span>
    `;

    log.appendChild(logEntry);
    log.scrollTop = log.scrollHeight;
}

// Step 2: Display Topics
function displayTopics(topics) {
    const container = document.getElementById('topicsContainer');
    container.innerHTML = '';

    topics.forEach((topic, index) => {
        const topicCard = document.createElement('div');
        topicCard.innerHTML = `
            <sl-card class="topic-card">
                <div class="flex items-start gap-3">
                    <sl-checkbox
                        class="topic-checkbox"
                        data-index="${index}"
                    ></sl-checkbox>
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 mb-2">${topic.title}</h3>
                        <p class="text-sm text-gray-600 mb-2">${topic.synopsis}</p>
                        <div class="flex items-start gap-2 text-xs text-gray-500">
                            <sl-icon name="lightbulb" class="text-yellow-500"></sl-icon>
                            <span><strong>Why:</strong> ${topic.relevanceReason}</span>
                        </div>
                    </div>
                </div>
            </sl-card>
        `;

        const checkbox = topicCard.querySelector('.topic-checkbox');
        checkbox.addEventListener('sl-change', (e) => {
            if (e.target.checked) {
                selectedTopicIndices.push(index);
            } else {
                selectedTopicIndices = selectedTopicIndices.filter(i => i !== index);
            }
            updateGenerateButton();
        });

        container.appendChild(topicCard);
    });
}

function updateGenerateButton() {
    const btn = document.getElementById('generatePostsBtn');
    btn.disabled = selectedTopicIndices.length === 0;
}

// Step 2: Generate Blog Posts
async function generateBlogPosts() {
    if (selectedTopicIndices.length === 0) {
        showToast('Please select at least one topic', 'warning', 'exclamation-triangle');
        return;
    }

    const btn = document.getElementById('generatePostsBtn');
    btn.loading = true;

    document.getElementById('generationStatus').classList.remove('hidden');
    document.getElementById('generationLog').innerHTML = '';

    try {
        const response = await fetch('/api/blog/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topicId: currentTopicId,
                selectedTopicIndices
            })
        });

        const data = await response.json();

        if (data.success) {
            displayGeneratedPosts(data.posts);
            showStep(3);
            showToast(`Generated ${data.posts.length} blog post(s)!`, 'success', 'check-circle');
            loadPublishedBlogs(); // Refresh the published list
        } else {
            showToast(data.error || 'Failed to generate blog posts', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error generating blog posts:', error);
        showToast('Error generating blog posts', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

function handleGenerationStatus(data) {
    const statusMessage = document.getElementById('generationStatusMessage');
    const log = document.getElementById('generationLog');

    statusMessage.textContent = data.message || data.step;

    // Add to log
    const logEntry = document.createElement('div');
    logEntry.className = 'flex items-start gap-2';

    const statusIcon = data.status === 'complete' ? '✓' :
                       data.status === 'error' ? '✗' : '•';

    logEntry.innerHTML = `
        <span class="font-bold ${
            data.status === 'complete' ? 'text-green-600' :
            data.status === 'error' ? 'text-red-600' : 'text-blue-600'
        }">${statusIcon}</span>
        <span>${data.message}</span>
    `;

    log.appendChild(logEntry);
    log.scrollTop = log.scrollHeight;
}

// Step 3: Display Generated Posts
function displayGeneratedPosts(posts) {
    const container = document.getElementById('generatedPostsContainer');
    container.innerHTML = '';

    posts.forEach(post => {
        const postCard = createPostCard(post, true);
        container.appendChild(postCard);
    });
}

function createPostCard(post, isNew = false) {
    const card = document.createElement('div');
    const coverImage = post.coverImages && post.coverImages.length > 0
        ? post.coverImages.find(img => img.isSelected) || post.coverImages[0]
        : { url: '/uploads/blog-images/placeholder.png' };

    card.innerHTML = `
        <sl-card class="blog-post-card">
            <img
                src="${coverImage.url}"
                alt="${post.title}"
                class="w-full h-48 object-cover rounded mb-3"
            />
            <h3 class="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">${post.title}</h3>
            <p class="text-sm text-gray-600 mb-3 line-clamp-2">${post.subtitle || ''}</p>

            <div class="flex items-center gap-2 mb-3">
                <sl-badge variant="${
                    post.status === 'published' ? 'success' :
                    post.status === 'ready' ? 'primary' : 'neutral'
                }">
                    ${post.status}
                </sl-badge>
                ${post.publishedToHubSpot ? '<sl-badge variant="success"><sl-icon name="check-circle"></sl-icon> HubSpot</sl-badge>' : ''}
            </div>

            <sl-button variant="primary" size="small" class="edit-post-btn" data-post-id="${post.id}">
                <sl-icon slot="prefix" name="pencil"></sl-icon>
                Edit & Publish
            </sl-button>
        </sl-card>
    `;

    card.querySelector('.edit-post-btn').addEventListener('click', () => openPostEditor(post.id));

    return card;
}

// Load Published Blogs
async function loadPublishedBlogs() {
    const container = document.getElementById('publishedPostsContainer');

    try {
        const response = await fetch('/api/blog/posts?limit=20');
        const data = await response.json();

        if (data.success && data.posts.length > 0) {
            container.innerHTML = '';
            data.posts.forEach(post => {
                const postRow = createPublishedPostRow(post);
                container.appendChild(postRow);
            });
        } else {
            container.innerHTML = '<p class="text-gray-500 text-center py-8">No published blogs yet</p>';
        }
    } catch (error) {
        console.error('Error loading published blogs:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-8">Error loading blogs</p>';
    }
}

function createPublishedPostRow(post) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-4 p-4 border rounded hover:bg-gray-50';

    const coverImage = post.selectedCoverImage
        ? post.selectedCoverImage.url
        : '/uploads/blog-images/placeholder.png';

    row.innerHTML = `
        <img src="${coverImage}" alt="${post.title}" class="w-24 h-24 object-cover rounded" />
        <div class="flex-1">
            <h4 class="text-lg font-semibold text-gray-900">${post.title}</h4>
            <p class="text-sm text-gray-600">${post.subtitle || ''}</p>
            <div class="flex items-center gap-2 mt-2">
                <sl-badge variant="${
                    post.status === 'published' ? 'success' :
                    post.status === 'ready' ? 'primary' : 'neutral'
                }">
                    ${post.status}
                </sl-badge>
                ${post.publishedToHubSpot ? `<sl-badge variant="success"><sl-icon name="check-circle"></sl-icon> HubSpot</sl-badge>` : ''}
                ${post.hubSpotUrl ? `<a href="${post.hubSpotUrl}" target="_blank" class="text-xs text-blue-600 hover:underline">View on HubSpot →</a>` : ''}
            </div>
        </div>
        <sl-button variant="primary" size="small" class="edit-post-btn" data-post-id="${post._id}">
            <sl-icon name="pencil"></sl-icon>
        </sl-button>
    `;

    row.querySelector('.edit-post-btn').addEventListener('click', () => openPostEditor(post._id));

    return row;
}

// Open Post Editor Modal
async function openPostEditor(postId) {
    currentPostId = postId;

    try {
        const response = await fetch(`/api/blog/posts/${postId}`);
        const data = await response.json();

        if (data.success) {
            const post = data.post;

            // Show modal first so elements are visible
            const modal = document.getElementById('blogEditorModal');
            modal.show();

            // Wait a moment for modal to render
            await new Promise(resolve => setTimeout(resolve, 200));

            // Initialize Quill editor if not already initialized
            if (!quillEditor) {
                initializeQuillEditor();
            }

            // Populate cover images
            const coverImagesGrid = document.getElementById('coverImagesGrid');
            coverImagesGrid.innerHTML = '';

            post.coverImages.forEach((img, index) => {
                const imgContainer = document.createElement('div');
                imgContainer.className = `cover-image-option rounded ${img.isSelected ? 'selected' : ''}`;
                imgContainer.innerHTML = `<img src="${img.url}" alt="Cover ${index + 1}" class="w-full h-auto rounded" />`;
                imgContainer.addEventListener('click', () => selectCoverImage(index));
                coverImagesGrid.appendChild(imgContainer);
            });

            // Populate form fields
            document.getElementById('editTitle').value = post.title;
            document.getElementById('editSubtitle').value = post.subtitle || '';
            document.getElementById('editMetaDescription').value = post.metaDescription || '';
            document.getElementById('editSlug').value = post.slug || '';

            // Load HTML content into Quill editor
            if (quillEditor) {
                // Parse HTML and manually build Delta
                const Delta = Quill.import('delta');
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = post.body;

                const delta = new Delta();

                // Process each child node
                Array.from(tempDiv.childNodes).forEach(node => {
                    if (node.nodeName === 'P') {
                        // Regular paragraph
                        delta.insert(node.textContent + '\n');
                    } else if (node.nodeName === 'H1') {
                        delta.insert(node.textContent + '\n', { header: 1 });
                    } else if (node.nodeName === 'H2') {
                        delta.insert(node.textContent + '\n', { header: 2 });
                    } else if (node.nodeName === 'H3') {
                        delta.insert(node.textContent + '\n', { header: 3 });
                    } else if (node.nodeName === 'PRE') {
                        // Code block
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
                    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                        delta.insert(node.textContent);
                    }
                });

                quillEditor.setContents(delta);
            }
        } else {
            showToast('Failed to load blog post', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error loading blog post:', error);
        showToast('Error loading blog post', 'danger', 'exclamation-triangle');
    }
}

function selectCoverImage(index) {
    const images = document.querySelectorAll('.cover-image-option');
    images.forEach((img, i) => {
        img.classList.toggle('selected', i === index);
    });
}

// Save Post
async function savePost() {
    const btn = document.getElementById('savePostBtn');
    btn.loading = true;

    try {
        const selectedCoverImageIndex = Array.from(document.querySelectorAll('.cover-image-option'))
            .findIndex(img => img.classList.contains('selected'));

        // Get HTML content from Quill editor and convert back to standard HTML
        let bodyHtml = '';
        if (quillEditor) {
            bodyHtml = quillEditor.root.innerHTML;

            // Convert Quill's code blocks back to standard <pre><code> format
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = bodyHtml;

            // Quill 2.0 uses div.ql-code-block-container for code blocks
            const codeBlockContainers = tempDiv.querySelectorAll('div.ql-code-block-container');

            codeBlockContainers.forEach(container => {
                // Get all the code lines inside the container
                const codeLines = container.querySelectorAll('div.ql-code-block');

                // Combine all lines into one code block
                const codeText = Array.from(codeLines).map(line => line.textContent).join('\n');

                // Create standard <pre><code> structure
                const newPre = document.createElement('pre');
                const codeElement = document.createElement('code');
                codeElement.textContent = codeText;
                newPre.appendChild(codeElement);

                // Replace the Quill container with standard format
                container.replaceWith(newPre);
            });

            bodyHtml = tempDiv.innerHTML;
        }

        const response = await fetch(`/api/blog/posts/${currentPostId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: document.getElementById('editTitle').value,
                subtitle: document.getElementById('editSubtitle').value,
                metaDescription: document.getElementById('editMetaDescription').value,
                slug: document.getElementById('editSlug').value,
                body: bodyHtml,
                selectedCoverImageIndex
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Blog post saved successfully!', 'success', 'check-circle');
            loadPublishedBlogs();
        } else {
            showToast(data.error || 'Failed to save blog post', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error saving blog post:', error);
        showToast('Error saving blog post', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Publish to HubSpot
async function publishToHubSpot() {
    const btn = document.getElementById('publishHubSpotBtn');
    btn.loading = true;

    try {
        const response = await fetch(`/api/blog/posts/${currentPostId}/publish-hubspot`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Published to HubSpot successfully!', 'success', 'check-circle');
            document.getElementById('blogEditorModal').hide();
            loadPublishedBlogs();
        } else {
            showToast(data.error || 'Failed to publish to HubSpot', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error publishing to HubSpot:', error);
        showToast('Error publishing to HubSpot', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Delete Post
async function deletePost() {
    const confirmed = confirm('Are you sure you want to delete this blog post? This action cannot be undone.');
    if (!confirmed) return;

    const btn = document.getElementById('deletePostBtn');
    btn.loading = true;

    try {
        const response = await fetch(`/api/blog/posts/${currentPostId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Blog post deleted successfully', 'success', 'check-circle');
            document.getElementById('blogEditorModal').hide();
            loadPublishedBlogs();
        } else {
            showToast(data.error || 'Failed to delete blog post', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error deleting blog post:', error);
        showToast('Error deleting blog post', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Regenerate Cover Images
async function regenerateImages() {
    const btn = document.getElementById('regenerateImagesBtn');
    btn.loading = true;

    try {
        const response = await fetch(`/api/blog/posts/${currentPostId}/regenerate-images`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // Update cover images grid
            const coverImagesGrid = document.getElementById('coverImagesGrid');
            coverImagesGrid.innerHTML = '';

            data.coverImages.forEach((img, index) => {
                const imgContainer = document.createElement('div');
                imgContainer.className = `cover-image-option rounded ${img.isSelected ? 'selected' : ''}`;
                imgContainer.innerHTML = `<img src="${img.url}" alt="Cover ${index + 1}" class="w-full h-auto rounded" />`;
                imgContainer.addEventListener('click', () => selectCoverImage(index));
                coverImagesGrid.appendChild(imgContainer);
            });

            showToast('Cover images regenerated!', 'success', 'check-circle');
        } else {
            showToast(data.error || 'Failed to regenerate images', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error regenerating images:', error);
        showToast('Error regenerating images', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Convert standard HTML to Quill-compatible format
function convertHtmlForQuill(html) {
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Convert <pre><code> to <pre class="ql-syntax"> with highlighting
    tempDiv.querySelectorAll('pre code').forEach(codeBlock => {
        const pre = codeBlock.parentElement;
        const code = codeBlock.textContent;

        // Replace pre>code with just pre.ql-syntax
        const newPre = document.createElement('pre');
        newPre.className = 'ql-syntax';

        // Apply syntax highlighting if hljs is available
        if (typeof hljs !== 'undefined') {
            const result = hljs.highlightAuto(code);
            newPre.innerHTML = result.value;
        } else {
            newPre.textContent = code;
        }

        pre.replaceWith(newPre);
    });

    // Convert standalone <pre> without <code> to ql-syntax
    tempDiv.querySelectorAll('pre:not(.ql-syntax)').forEach(pre => {
        if (!pre.querySelector('code')) {
            const code = pre.textContent;
            pre.className = 'ql-syntax';

            // Apply syntax highlighting if hljs is available
            if (typeof hljs !== 'undefined') {
                const result = hljs.highlightAuto(code);
                pre.innerHTML = result.value;
            }
        }
    });

    return tempDiv.innerHTML;
}

// ==================== Instructions Editor ====================

async function openInstructionsEditor() {
    try {
        // Load active instructions
        const response = await fetch('/api/blog/instructions');
        const data = await response.json();

        if (data.success && data.instructions) {
            const parsed = JSON.parse(data.instructions.instructions);
            document.getElementById('topicInstructions').value = parsed.topicGeneration || '';
            document.getElementById('postInstructions').value = parsed.postGeneration || '';
        }

        // Load versions
        await loadInstructionVersions();

        // Show modal
        document.getElementById('instructionsModal').show();
    } catch (error) {
        console.error('Error loading instructions:', error);
        showToast('Failed to load instructions', 'danger', 'exclamation-triangle');
    }
}

async function loadInstructionVersions() {
    try {
        const response = await fetch('/api/blog/instructions/versions');
        const data = await response.json();

        if (data.success) {
            const versionsList = document.getElementById('versionsList');
            if (data.versions.length === 0) {
                versionsList.innerHTML = '<p class="text-gray-500 text-sm">No previous versions</p>';
                return;
            }

            versionsList.innerHTML = data.versions.map(version => {
                const activeBadge = version.isActive ? '<sl-badge variant="success">Active</sl-badge>' : '';
                const activateButton = !version.isActive ? `<sl-button size="small" onclick="activateVersion('${version._id}')">Activate</sl-button>` : '';

                return `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <strong>Version ${version.version}</strong>
                            ${activeBadge}
                        </div>
                        <p class="text-sm text-gray-600">${version.notes || 'No notes'}</p>
                        <p class="text-xs text-gray-400">${new Date(version.createdAt).toLocaleString()}</p>
                    </div>
                    ${activateButton}
                </div>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading versions:', error);
    }
}

async function saveInstructions() {
    const btn = document.getElementById('saveInstructionsBtn');
    btn.loading = true;

    try {
        const topicInstructions = document.getElementById('topicInstructions').value;
        const postInstructions = document.getElementById('postInstructions').value;
        const notes = document.getElementById('versionNotes').value;

        if (!topicInstructions || !postInstructions) {
            showToast('Both instruction fields are required', 'warning', 'exclamation-triangle');
            btn.loading = false;
            return;
        }

        const instructions = JSON.stringify({
            topicGeneration: topicInstructions,
            postGeneration: postInstructions
        }, null, 2);

        const response = await fetch('/api/blog/instructions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instructions, notes })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Instructions saved as Version ${data.instructions.version}`, 'success', 'check-circle');
            await loadInstructionVersions();
            document.getElementById('versionNotes').value = '';
        } else {
            showToast(data.error || 'Failed to save instructions', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error saving instructions:', error);
        showToast('Error saving instructions', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

async function activateVersion(versionId) {
    try {
        const response = await fetch(`/api/blog/instructions/${versionId}/activate`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Version ${data.instructions.version} activated`, 'success', 'check-circle');
            await loadInstructionVersions();

            // Reload the instructions in the form
            const parsed = JSON.parse(data.instructions.instructions);
            document.getElementById('topicInstructions').value = parsed.topicGeneration || '';
            document.getElementById('postInstructions').value = parsed.postGeneration || '';
        } else {
            showToast(data.error || 'Failed to activate version', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error activating version:', error);
        showToast('Error activating version', 'danger', 'exclamation-triangle');
    }
}
