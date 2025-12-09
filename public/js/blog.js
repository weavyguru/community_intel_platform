// Blog Creator Client-Side Logic

let currentTopicId = null;
let currentPostId = null;
let selectedTopicIndices = [];
let quillEditor = null;
let selectedPersonaId = null;
let editingPersonaId = null;
let currentSocialBlogPostId = null;
let editingPlatformId = null;
let allSocialPosts = []; // Store all social posts for filtering

// Socket.IO connection for real-time updates
const socket = io();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadPublishedBlogs();
    loadPersonas();
    loadSocialPlatforms();
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

    // Persona management
    document.getElementById('personaSelect').addEventListener('sl-change', (e) => {
        selectedPersonaId = e.target.value || null;
    });
    document.getElementById('managePersonasBtn').addEventListener('click', openPersonaManager);
    document.getElementById('createPersonaBtn').addEventListener('click', createPersona);
    document.getElementById('closePersonaModalBtn').addEventListener('click', () => {
        document.getElementById('personaModal').hide();
    });
    document.getElementById('updatePersonaBtn').addEventListener('click', updatePersona);
    document.getElementById('closeEditPersonaBtn').addEventListener('click', () => {
        document.getElementById('editPersonaModal').hide();
    });

    // Social posts modal
    document.getElementById('closeSocialPostsModalBtn').addEventListener('click', () => {
        document.getElementById('socialPostsModal').hide();
    });
    document.getElementById('generateSocialPostsBtn').addEventListener('click', generateSocialPosts);
    document.getElementById('socialPostsFilter').addEventListener('sl-change', filterSocialPosts);

    // Platform management
    document.getElementById('managePlatformsBtn').addEventListener('click', openPlatformManager);
    document.getElementById('createPlatformBtn').addEventListener('click', createPlatform);
    document.getElementById('closePlatformModalBtn').addEventListener('click', () => {
        document.getElementById('platformModal').hide();
    });
    document.getElementById('updatePlatformBtn').addEventListener('click', updatePlatform);
    document.getElementById('closeEditPlatformBtn').addEventListener('click', () => {
        document.getElementById('editPlatformModal').hide();
    });

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
                selectedTopicIndices,
                personaId: selectedPersonaId
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
                ${post.publishedToHubSpot ? `<sl-badge variant="success"><sl-icon name="check-circle"></sl-icon> ${window.blogPublisher === 'custom' ? 'Published' : 'HubSpot'}</sl-badge>` : ''}
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

    // Determine social posts icon based on whether blog has social posts
    const hasSocialPosts = post.socialPostCount && post.socialPostCount > 0;
    const socialIcon = hasSocialPosts ? 'chat-square-text-fill' : 'plus-circle';
    const socialTooltip = hasSocialPosts ? `${post.socialPostCount} social posts` : 'Generate social posts';

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
                ${post.publishedToHubSpot ? `<sl-badge variant="success"><sl-icon name="check-circle"></sl-icon> ${window.blogPublisher === 'custom' ? 'Published' : 'HubSpot'}</sl-badge>` : ''}
                ${post.hubSpotUrl ? `<a href="${post.hubSpotUrl}" target="_blank" class="text-xs text-blue-600 hover:underline">${window.blogPublisher === 'custom' ? 'View on Blog →' : 'View on HubSpot →'}</a>` : ''}
            </div>
        </div>
        <sl-tooltip content="${socialTooltip}">
            <sl-button variant="default" size="small" class="social-posts-btn" data-post-id="${post._id}">
                <sl-icon name="${socialIcon}"></sl-icon>
            </sl-button>
        </sl-tooltip>
        <sl-button variant="primary" size="small" class="edit-post-btn" data-post-id="${post._id}">
            <sl-icon name="pencil"></sl-icon>
        </sl-button>
    `;

    row.querySelector('.edit-post-btn').addEventListener('click', () => openPostEditor(post._id));
    row.querySelector('.social-posts-btn').addEventListener('click', () => openSocialPostsModal(post._id));

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

// Publish to Blog/HubSpot
async function publishToHubSpot() {
    const btn = document.getElementById('publishHubSpotBtn');
    btn.loading = true;

    const publisherName = window.blogPublisher === 'custom' ? 'Blog' : 'HubSpot';

    try {
        const response = await fetch(`/api/blog/posts/${currentPostId}/publish-hubspot`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Published to ${publisherName} successfully!`, 'success', 'check-circle');
            document.getElementById('blogEditorModal').hide();
            loadPublishedBlogs();
        } else {
            showToast(data.error || `Failed to publish to ${publisherName}`, 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error(`Error publishing to ${publisherName}:`, error);
        showToast(`Error publishing to ${publisherName}`, 'danger', 'exclamation-triangle');
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

// ============================================
// Persona Management Functions
// ============================================

// Load personas into the dropdown
async function loadPersonas() {
    try {
        const response = await fetch('/api/blog/personas');
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('personaSelect');
            // Clear existing options except default
            select.innerHTML = '<sl-option value="">Neutral (Default)</sl-option>';

            data.personas.forEach(persona => {
                if (!persona.isDefault) {
                    const option = document.createElement('sl-option');
                    option.value = persona._id;
                    option.textContent = persona.name;
                    select.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading personas:', error);
    }
}

// Open persona manager modal
async function openPersonaManager() {
    await loadPersonasList();
    document.getElementById('personaModal').show();
}

// Load personas list for management
async function loadPersonasList() {
    try {
        const response = await fetch('/api/blog/personas');
        const data = await response.json();

        const container = document.getElementById('personasList');

        if (!data.success || data.personas.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No personas created yet. Create one below!</p>';
            return;
        }

        container.innerHTML = data.personas.map(persona => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded border">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <strong class="text-gray-900">${escapeHtml(persona.name)}</strong>
                        ${persona.isDefault ? '<sl-badge variant="neutral" size="small">Default</sl-badge>' : ''}
                    </div>
                    <p class="text-sm text-gray-600 mt-1">${escapeHtml(persona.description) || 'No description'}</p>
                </div>
                ${!persona.isDefault ? `
                    <div class="flex gap-2 ml-4">
                        <sl-button size="small" variant="default" class="edit-persona-btn" data-persona-id="${persona._id}">
                            <sl-icon name="pencil"></sl-icon>
                        </sl-button>
                        <sl-button size="small" variant="danger" outline class="delete-persona-btn" data-persona-id="${persona._id}">
                            <sl-icon name="trash"></sl-icon>
                        </sl-button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Attach event listeners for edit/delete buttons
        container.querySelectorAll('.edit-persona-btn').forEach(btn => {
            btn.addEventListener('click', () => editPersona(btn.dataset.personaId));
        });
        container.querySelectorAll('.delete-persona-btn').forEach(btn => {
            btn.addEventListener('click', () => deletePersona(btn.dataset.personaId));
        });
    } catch (error) {
        console.error('Error loading personas list:', error);
        document.getElementById('personasList').innerHTML =
            '<p class="text-red-500 text-sm">Failed to load personas</p>';
    }
}

// Create new persona
async function createPersona() {
    const btn = document.getElementById('createPersonaBtn');
    btn.loading = true;

    try {
        const name = document.getElementById('newPersonaName').value.trim();
        const description = document.getElementById('newPersonaDescription').value.trim();
        const postModifier = document.getElementById('newPersonaPostModifier').value.trim();

        if (!name) {
            showToast('Persona name is required', 'warning', 'exclamation-triangle');
            btn.loading = false;
            return;
        }

        const response = await fetch('/api/blog/personas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, postModifier })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Persona "${name}" created!`, 'success', 'check-circle');
            // Clear form
            document.getElementById('newPersonaName').value = '';
            document.getElementById('newPersonaDescription').value = '';
            document.getElementById('newPersonaPostModifier').value = '';
            // Close the details
            document.getElementById('addPersonaDetails').removeAttribute('open');
            // Refresh lists
            await loadPersonas();
            await loadPersonasList();
        } else {
            showToast(data.error || 'Failed to create persona', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error creating persona:', error);
        showToast('Error creating persona', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Edit persona - open edit modal
async function editPersona(personaId) {
    try {
        const response = await fetch(`/api/blog/personas/${personaId}`);
        const data = await response.json();

        if (data.success) {
            editingPersonaId = personaId;
            document.getElementById('editPersonaName').value = data.persona.name || '';
            document.getElementById('editPersonaDescription').value = data.persona.description || '';
            document.getElementById('editPersonaPostModifier').value = data.persona.postModifier || '';
            document.getElementById('editPersonaModal').show();
        } else {
            showToast(data.error || 'Failed to load persona', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error loading persona:', error);
        showToast('Error loading persona', 'danger', 'exclamation-triangle');
    }
}

// Update persona
async function updatePersona() {
    if (!editingPersonaId) return;

    const btn = document.getElementById('updatePersonaBtn');
    btn.loading = true;

    try {
        const name = document.getElementById('editPersonaName').value.trim();
        const description = document.getElementById('editPersonaDescription').value.trim();
        const postModifier = document.getElementById('editPersonaPostModifier').value.trim();

        if (!name) {
            showToast('Persona name is required', 'warning', 'exclamation-triangle');
            btn.loading = false;
            return;
        }

        const response = await fetch(`/api/blog/personas/${editingPersonaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, postModifier })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Persona updated!', 'success', 'check-circle');
            document.getElementById('editPersonaModal').hide();
            editingPersonaId = null;
            // Refresh lists
            await loadPersonas();
            await loadPersonasList();
        } else {
            showToast(data.error || 'Failed to update persona', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error updating persona:', error);
        showToast('Error updating persona', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Delete persona
async function deletePersona(personaId) {
    if (!confirm('Are you sure you want to delete this persona?')) return;

    try {
        const response = await fetch(`/api/blog/personas/${personaId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Persona deleted', 'success', 'check-circle');
            // If this was the selected persona, reset selection
            if (selectedPersonaId === personaId) {
                selectedPersonaId = null;
                document.getElementById('personaSelect').value = '';
            }
            // Refresh lists
            await loadPersonas();
            await loadPersonasList();
        } else {
            showToast(data.error || 'Failed to delete persona', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error deleting persona:', error);
        showToast('Error deleting persona', 'danger', 'exclamation-triangle');
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Social Posts Management Functions
// ============================================

// Load social platforms into dropdowns
async function loadSocialPlatforms() {
    try {
        const response = await fetch('/api/blog/social-platforms');
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('socialPlatformSelect');
            select.innerHTML = '';

            if (data.platforms.length === 0) {
                const option = document.createElement('sl-option');
                option.value = '';
                option.textContent = 'No platforms - Create one first';
                option.disabled = true;
                select.appendChild(option);
            } else {
                data.platforms.forEach(platform => {
                    const option = document.createElement('sl-option');
                    option.value = platform._id;
                    option.textContent = platform.name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading social platforms:', error);
    }
}

// Load personas into social posts modal dropdown
async function loadSocialPersonas() {
    try {
        const response = await fetch('/api/blog/personas');
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('socialPersonaSelect');
            select.innerHTML = '<sl-option value="">Neutral (Default)</sl-option>';

            data.personas.forEach(persona => {
                if (!persona.isDefault) {
                    const option = document.createElement('sl-option');
                    option.value = persona._id;
                    option.textContent = persona.name;
                    select.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Error loading personas for social modal:', error);
    }
}

// Open social posts modal
async function openSocialPostsModal(blogPostId) {
    currentSocialBlogPostId = blogPostId;

    // Reset modal state
    document.getElementById('socialPostsContainer').innerHTML = '';
    document.getElementById('socialGenerationStatus').classList.add('hidden');
    document.getElementById('socialPlatformSelect').value = '';
    document.getElementById('socialPersonaSelect').value = '';
    document.getElementById('socialPostsFilter').value = '';
    document.getElementById('socialPostsFilterContainer').classList.add('hidden');
    allSocialPosts = [];

    // Load platforms and personas
    await loadSocialPlatforms();
    await loadSocialPersonas();

    // Load existing social posts for this blog
    await loadExistingSocialPosts(blogPostId);

    // Show modal
    document.getElementById('socialPostsModal').show();
}

// Load existing social posts for a blog
async function loadExistingSocialPosts(blogPostId) {
    try {
        const response = await fetch(`/api/blog/posts/${blogPostId}/social-posts`);
        const data = await response.json();

        if (data.success && data.posts.length > 0) {
            allSocialPosts = data.posts;
            populateSocialPostsFilter(data.posts);
            displaySocialPosts(data.posts);
            document.getElementById('socialPostsFilterContainer').classList.remove('hidden');
        } else {
            allSocialPosts = [];
            document.getElementById('socialPostsFilterContainer').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading existing social posts:', error);
    }
}

// Populate the platform filter dropdown based on existing posts
function populateSocialPostsFilter(posts) {
    const filter = document.getElementById('socialPostsFilter');
    const currentValue = filter.value;

    // Get unique platforms from posts
    const platforms = [...new Set(posts.map(p => p.platformName))].sort();

    filter.innerHTML = '<sl-option value="">All platforms</sl-option>';
    platforms.forEach(platform => {
        const count = posts.filter(p => p.platformName === platform).length;
        const option = document.createElement('sl-option');
        option.value = platform;
        option.textContent = `${platform} (${count})`;
        filter.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (currentValue && platforms.includes(currentValue)) {
        filter.value = currentValue;
    }

    updateSocialPostsCount(posts);
}

// Filter social posts by platform
function filterSocialPosts() {
    const filterValue = document.getElementById('socialPostsFilter').value;

    if (!filterValue) {
        displaySocialPosts(allSocialPosts);
        updateSocialPostsCount(allSocialPosts);
    } else {
        const filtered = allSocialPosts.filter(p => p.platformName === filterValue);
        displaySocialPosts(filtered);
        updateSocialPostsCount(filtered, allSocialPosts.length);
    }
}

// Update the posts count display
function updateSocialPostsCount(displayedPosts, totalPosts = null) {
    const countEl = document.getElementById('socialPostsCount');
    if (totalPosts !== null && totalPosts !== displayedPosts.length) {
        countEl.textContent = `Showing ${displayedPosts.length} of ${totalPosts} posts`;
    } else {
        countEl.textContent = `${displayedPosts.length} posts`;
    }
}

// Generate social posts
async function generateSocialPosts() {
    const platformId = document.getElementById('socialPlatformSelect').value;
    const personaId = document.getElementById('socialPersonaSelect').value || null;
    const charLength = document.getElementById('socialCharLengthSelect').value || '1200-1800';

    if (!platformId) {
        showToast('Please select a platform', 'warning', 'exclamation-triangle');
        return;
    }

    const btn = document.getElementById('generateSocialPostsBtn');
    btn.loading = true;
    document.getElementById('socialGenerationStatus').classList.remove('hidden');

    try {
        const response = await fetch(`/api/blog/posts/${currentSocialBlogPostId}/generate-social`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platformId, personaId, charLength })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Social post generated!', 'success', 'check-circle');
            // Add new posts to the stored array and update filter
            allSocialPosts = [...data.posts, ...allSocialPosts];
            populateSocialPostsFilter(allSocialPosts);
            // Re-apply current filter or show all
            filterSocialPosts();
            document.getElementById('socialPostsFilterContainer').classList.remove('hidden');
            // Refresh blog list to update icon
            loadPublishedBlogs();
        } else {
            showToast(data.error || 'Failed to generate social posts', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error generating social posts:', error);
        showToast('Error generating social posts', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
        document.getElementById('socialGenerationStatus').classList.add('hidden');
    }
}

// Display social posts in the modal
function displaySocialPosts(posts, prepend = false) {
    const container = document.getElementById('socialPostsContainer');

    const postsHtml = posts.map(post => `
        <sl-card class="social-post-card">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <sl-badge variant="primary">${escapeHtml(post.platformName)}</sl-badge>
                    <sl-badge variant="neutral">${escapeHtml(post.personaName)}</sl-badge>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">${post.characterCount || post.content.length} chars</span>
                    <sl-tooltip content="Copy to clipboard">
                        <sl-icon-button name="clipboard" label="Copy" class="copy-social-btn" data-content="${escapeHtml(post.content).replace(/"/g, '&quot;')}"></sl-icon-button>
                    </sl-tooltip>
                    <sl-tooltip content="Create Task">
                        <sl-icon-button name="clipboard-plus" label="Create Task" class="create-task-btn" data-post-id="${post._id}"></sl-icon-button>
                    </sl-tooltip>
                    <sl-tooltip content="Delete">
                        <sl-icon-button name="trash" label="Delete" class="delete-social-btn" data-post-id="${post._id}"></sl-icon-button>
                    </sl-tooltip>
                </div>
            </div>
            <div class="p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap">${escapeHtml(post.content)}</div>
        </sl-card>
    `).join('');

    if (prepend) {
        container.insertAdjacentHTML('afterbegin', postsHtml);
    } else {
        container.innerHTML = postsHtml;
    }

    // Attach event listeners
    container.querySelectorAll('.copy-social-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.dataset.content.replace(/&quot;/g, '"');
            copyToClipboard(content);
        });
    });

    container.querySelectorAll('.create-task-btn').forEach(btn => {
        btn.addEventListener('click', () => createTaskFromSocialPost(btn.dataset.postId));
    });

    container.querySelectorAll('.delete-social-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteSocialPost(btn.dataset.postId));
    });
}

// Copy content to clipboard
async function copyToClipboard(content) {
    try {
        await navigator.clipboard.writeText(content);
        showToast('Copied to clipboard!', 'success', 'check-circle');
    } catch (error) {
        console.error('Failed to copy:', error);
        showToast('Failed to copy to clipboard', 'danger', 'exclamation-triangle');
    }
}

// Delete social post
async function deleteSocialPost(postId) {
    if (!confirm('Delete this social post?')) return;

    try {
        const response = await fetch(`/api/blog/social-posts/${postId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Social post deleted', 'success', 'check-circle');
            // Remove from local array
            allSocialPosts = allSocialPosts.filter(p => p._id !== postId);
            // Update filter and display
            if (allSocialPosts.length > 0) {
                populateSocialPostsFilter(allSocialPosts);
                filterSocialPosts();
            } else {
                document.getElementById('socialPostsContainer').innerHTML = '';
                document.getElementById('socialPostsFilterContainer').classList.add('hidden');
            }
            // Refresh blog list to update icon
            loadPublishedBlogs();
        } else {
            showToast(data.error || 'Failed to delete social post', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error deleting social post:', error);
        showToast('Error deleting social post', 'danger', 'exclamation-triangle');
    }
}

// ============================================
// Platform Management Functions
// ============================================

// Open platform manager modal
async function openPlatformManager() {
    await loadPlatformsList();
    document.getElementById('platformModal').show();
}

// Load platforms list for management
async function loadPlatformsList() {
    try {
        const response = await fetch('/api/blog/social-platforms');
        const data = await response.json();

        const container = document.getElementById('platformsList');

        if (!data.success || data.platforms.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No platforms created yet. Create one below!</p>';
            return;
        }

        container.innerHTML = data.platforms.map(platform => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded border">
                <div class="flex-1">
                    <strong class="text-gray-900">${escapeHtml(platform.name)}</strong>
                    <p class="text-sm text-gray-600 mt-1 line-clamp-2">${escapeHtml(platform.instructions)}</p>
                </div>
                <div class="flex gap-2 ml-4">
                    <sl-button size="small" variant="default" class="edit-platform-btn" data-platform-id="${platform._id}">
                        <sl-icon name="pencil"></sl-icon>
                    </sl-button>
                    <sl-button size="small" variant="danger" outline class="delete-platform-btn" data-platform-id="${platform._id}">
                        <sl-icon name="trash"></sl-icon>
                    </sl-button>
                </div>
            </div>
        `).join('');

        // Attach event listeners
        container.querySelectorAll('.edit-platform-btn').forEach(btn => {
            btn.addEventListener('click', () => editPlatform(btn.dataset.platformId));
        });
        container.querySelectorAll('.delete-platform-btn').forEach(btn => {
            btn.addEventListener('click', () => deletePlatform(btn.dataset.platformId));
        });
    } catch (error) {
        console.error('Error loading platforms list:', error);
        document.getElementById('platformsList').innerHTML =
            '<p class="text-red-500 text-sm">Failed to load platforms</p>';
    }
}

// Create new platform
async function createPlatform() {
    const btn = document.getElementById('createPlatformBtn');
    btn.loading = true;

    try {
        const name = document.getElementById('newPlatformName').value.trim();
        const instructions = document.getElementById('newPlatformInstructions').value.trim();
        const url = document.getElementById('newPlatformUrl').value.trim();

        if (!name) {
            showToast('Platform name is required', 'warning', 'exclamation-triangle');
            btn.loading = false;
            return;
        }

        if (!instructions) {
            showToast('Platform instructions are required', 'warning', 'exclamation-triangle');
            btn.loading = false;
            return;
        }

        const response = await fetch('/api/blog/social-platforms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, instructions, url })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Platform "${name}" created!`, 'success', 'check-circle');
            // Clear form
            document.getElementById('newPlatformName').value = '';
            document.getElementById('newPlatformInstructions').value = '';
            document.getElementById('newPlatformUrl').value = '';
            // Close the details
            document.getElementById('addPlatformDetails').removeAttribute('open');
            // Refresh lists
            await loadSocialPlatforms();
            await loadPlatformsList();
        } else {
            showToast(data.error || 'Failed to create platform', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error creating platform:', error);
        showToast('Error creating platform', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Edit platform - open edit modal
async function editPlatform(platformId) {
    try {
        const response = await fetch(`/api/blog/social-platforms/${platformId}`);
        const data = await response.json();

        if (data.success) {
            editingPlatformId = platformId;
            document.getElementById('editPlatformName').value = data.platform.name || '';
            document.getElementById('editPlatformInstructions').value = data.platform.instructions || '';
            document.getElementById('editPlatformUrl').value = data.platform.url || '';
            document.getElementById('editPlatformModal').show();
        } else {
            showToast(data.error || 'Failed to load platform', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error loading platform:', error);
        showToast('Error loading platform', 'danger', 'exclamation-triangle');
    }
}

// Update platform
async function updatePlatform() {
    if (!editingPlatformId) return;

    const btn = document.getElementById('updatePlatformBtn');
    btn.loading = true;

    try {
        const name = document.getElementById('editPlatformName').value.trim();
        const instructions = document.getElementById('editPlatformInstructions').value.trim();
        const url = document.getElementById('editPlatformUrl').value.trim();

        if (!name) {
            showToast('Platform name is required', 'warning', 'exclamation-triangle');
            btn.loading = false;
            return;
        }

        const response = await fetch(`/api/blog/social-platforms/${editingPlatformId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, instructions, url })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Platform updated!', 'success', 'check-circle');
            document.getElementById('editPlatformModal').hide();
            editingPlatformId = null;
            // Refresh lists
            await loadSocialPlatforms();
            await loadPlatformsList();
        } else {
            showToast(data.error || 'Failed to update platform', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error updating platform:', error);
        showToast('Error updating platform', 'danger', 'exclamation-triangle');
    } finally {
        btn.loading = false;
    }
}

// Delete platform
async function deletePlatform(platformId) {
    if (!confirm('Are you sure you want to delete this platform?')) return;

    try {
        const response = await fetch(`/api/blog/social-platforms/${platformId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Platform deleted', 'success', 'check-circle');
            // Refresh lists
            await loadSocialPlatforms();
            await loadPlatformsList();
        } else {
            showToast(data.error || 'Failed to delete platform', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error deleting platform:', error);
        showToast('Error deleting platform', 'danger', 'exclamation-triangle');
    }
}

// ============================================
// Task Creation Functions
// ============================================

// Create task from social post (no delegation - that happens in task view)
async function createTaskFromSocialPost(postId) {
    try {
        const response = await fetch(`/api/blog/social-posts/${postId}/create-task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            showToast('Task created', 'success', 'check-circle');
        } else {
            showToast(data.error || 'Failed to create task', 'danger', 'exclamation-triangle');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        showToast('Error creating task', 'danger', 'exclamation-triangle');
    }
}
