// Posts.js - Frontend logic for Post Creator

// State
let socket = null;
let currentGenerationId = null;
let currentPosts = [];
let allPlatforms = [];
let allPersonas = [];

// DOM Elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const postQuery = document.getElementById('postQuery');
const charLengthSelect = document.getElementById('charLengthSelect');
const generatePostsBtn = document.getElementById('generatePostsBtn');
const generationStatus = document.getElementById('generationStatus');
const statusMessage = document.getElementById('statusMessage');
const statusLog = document.getElementById('statusLog');
const postsContainer = document.getElementById('postsContainer');
const generatedImageContainer = document.getElementById('generatedImageContainer');
const generatedImage = document.getElementById('generatedImage');
const filterPlatform = document.getElementById('filterPlatform');
const filterPersona = document.getElementById('filterPersona');
const postsCount = document.getElementById('postsCount');
const createMoreBtn = document.getElementById('createMoreBtn');
const previousPostsContainer = document.getElementById('previousPostsContainer');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initEventListeners();
    loadPlatforms();
    loadPersonas();
    loadPreviousGenerations();
    initCheckboxListeners();
});

// Socket.IO
function initSocket() {
    socket = io();

    socket.on('postGenerationProgress', (data) => {
        updateStatus(data.message);
        addLogEntry(data.message, data.status);

        if (data.status === 'complete' && data.step === 'complete') {
            // Generation complete
            generationStatus.classList.add('hidden');
            generatePostsBtn.loading = false;
        }
    });

    socket.on('postSearchProgress', (data) => {
        addLogEntry(`Search: ${data.message}`, data.status);
    });

    socket.on('postImageProgress', (data) => {
        addLogEntry(`Image: ${data.message}`, data.status);
    });
}

// Event Listeners
function initEventListeners() {
    generatePostsBtn.addEventListener('click', generatePosts);
    createMoreBtn.addEventListener('click', () => {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
    });

    // Filters
    filterPlatform.addEventListener('sl-change', filterDisplayedPosts);
    filterPersona.addEventListener('sl-change', filterDisplayedPosts);

    // Modal buttons
    document.getElementById('managePlatformsBtn').addEventListener('click', () => {
        loadPlatformsList();
        document.getElementById('platformModal').show();
    });

    document.getElementById('managePersonasBtn').addEventListener('click', () => {
        loadPersonasList();
        document.getElementById('personaModal').show();
    });

    document.getElementById('closePlatformModalBtn').addEventListener('click', () => {
        document.getElementById('platformModal').hide();
    });

    document.getElementById('closePersonaModalBtn').addEventListener('click', () => {
        document.getElementById('personaModal').hide();
    });

    document.getElementById('createPlatformBtn').addEventListener('click', createPlatform);
    document.getElementById('createPersonaBtn').addEventListener('click', createPersona);

    document.getElementById('updatePlatformBtn').addEventListener('click', updatePlatform);
    document.getElementById('updatePersonaBtn').addEventListener('click', updatePersona);

    document.getElementById('closeEditPlatformBtn').addEventListener('click', () => {
        document.getElementById('editPlatformModal').hide();
    });

    document.getElementById('closeEditPersonaBtn').addEventListener('click', () => {
        document.getElementById('editPersonaModal').hide();
    });

    document.getElementById('closeViewGenerationBtn').addEventListener('click', () => {
        document.getElementById('viewGenerationModal').hide();
    });

    document.getElementById('deleteGenerationBtn').addEventListener('click', deleteCurrentGeneration);

    // View generation modal filters
    document.getElementById('viewFilterPlatform').addEventListener('sl-change', filterViewGenerationPosts);
    document.getElementById('viewFilterPersona').addEventListener('sl-change', filterViewGenerationPosts);

    // Event delegation for dynamic elements
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = target.dataset.id;

        switch (action) {
            case 'copy':
                await copyToClipboard(id);
                break;
            case 'delete':
                await deletePost(id);
                break;
            case 'edit-platform':
                await editPlatform(id);
                break;
            case 'delete-platform':
                await deletePlatform(id);
                break;
            case 'edit-persona':
                await editPersona(id);
                break;
            case 'delete-persona':
                await deletePersona(id);
                break;
            case 'view-generation':
                await viewGeneration(id);
                break;
            case 'delete-generation':
                await deleteGeneration(id);
                break;
            case 'copy-content':
                const item = target.closest('.post-item, .post-card');
                if (item && item.dataset.content) {
                    await copyContent(item.dataset.content);
                }
                break;
            case 'create-task':
                await createTaskFromPost(id);
                break;
        }
    });
}

// Checkbox listeners for selection styling
function initCheckboxListeners() {
    document.querySelectorAll('.platform-checkbox sl-checkbox').forEach(checkbox => {
        checkbox.addEventListener('sl-change', (e) => {
            const label = e.target.closest('.platform-checkbox');
            if (e.target.checked) {
                label.classList.add('selected');
            } else {
                label.classList.remove('selected');
            }
        });
    });

    document.querySelectorAll('.persona-checkbox sl-checkbox').forEach(checkbox => {
        checkbox.addEventListener('sl-change', (e) => {
            const label = e.target.closest('.persona-checkbox');
            if (e.target.checked) {
                label.classList.add('selected');
            } else {
                label.classList.remove('selected');
            }
        });
    });
}

// Get selected platforms
function getSelectedPlatforms() {
    const selected = [];
    document.querySelectorAll('.platform-checkbox sl-checkbox').forEach(checkbox => {
        if (checkbox.checked) {
            selected.push(checkbox.value);
        }
    });
    return selected;
}

// Get selected personas
function getSelectedPersonas() {
    const selected = [];
    document.querySelectorAll('.persona-checkbox sl-checkbox').forEach(checkbox => {
        if (checkbox.checked && checkbox.value) {
            selected.push(checkbox.value);
        }
    });
    return selected;
}

// Generate Posts
async function generatePosts() {
    const query = postQuery.value.trim();
    if (!query) {
        showToast('Please enter a topic for the posts', 'warning');
        return;
    }

    const platformIds = getSelectedPlatforms();
    if (platformIds.length === 0) {
        showToast('Please select at least one platform', 'warning');
        return;
    }

    const personaIds = getSelectedPersonas();
    const charLength = charLengthSelect.value;

    // Show status
    generationStatus.classList.remove('hidden');
    statusLog.innerHTML = '';
    updateStatus('Starting post generation...');
    generatePostsBtn.loading = true;

    try {
        const response = await fetch('/api/posts/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                platformIds,
                personaIds,
                charLength
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to generate posts');
        }

        // Store results
        currentGenerationId = data.generationId;
        currentPosts = data.posts;

        // Update UI
        displayGeneratedPosts(data.posts, data.imageUrl);
        populateFilters(data.posts);

        // Show step 2
        step1.classList.add('hidden');
        step2.classList.remove('hidden');

        // Refresh previous generations
        loadPreviousGenerations();

        showToast(`Generated ${data.posts.length} posts successfully`, 'success');

    } catch (error) {
        console.error('Error generating posts:', error);
        showToast(error.message, 'danger');
    } finally {
        generationStatus.classList.add('hidden');
        generatePostsBtn.loading = false;
    }
}

// Display generated posts
function displayGeneratedPosts(posts, imageUrl) {
    postsContainer.innerHTML = '';

    // Hide the separate image container - thumbnails are now shown on each post
    generatedImageContainer.classList.add('hidden');

    // If there's a shared imageUrl, add it to each post for thumbnail display
    posts.forEach(post => {
        if (imageUrl && !post.imageUrl) {
            post.imageUrl = imageUrl;
        }
        const item = createPostCard(post);
        postsContainer.appendChild(item);
    });

    updatePostsCount(posts.length, posts.length);
}

// Create post list item element
function createPostCard(post) {
    const div = document.createElement('div');
    div.className = 'post-item';
    div.dataset.platform = post.platformName;
    div.dataset.persona = post.personaName;

    div.innerHTML = `
        <div class="flex gap-4">
            ${post.imageUrl ? `<img src="${post.imageUrl}" class="post-thumbnail flex-shrink-0" alt="Post image" />` : ''}
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-2">
                    <span class="badge badge-platform">${escapeHtml(post.platformName)}</span>
                    <span class="badge badge-persona">${escapeHtml(post.personaName)}</span>
                    <span class="text-xs text-gray-500 ml-auto">${post.characterCount || post.content.length} chars</span>
                </div>
                <div class="post-content mb-3">${escapeHtml(post.content)}</div>
                <div class="flex gap-2">
                    <sl-button size="small" variant="primary" data-action="copy" data-id="${post._id}">
                        <sl-icon slot="prefix" name="clipboard"></sl-icon>
                        Copy
                    </sl-button>
                    <sl-button size="small" variant="success" data-action="create-task" data-id="${post._id}">
                        <sl-icon slot="prefix" name="clipboard-plus"></sl-icon>
                        Task
                    </sl-button>
                    <sl-button size="small" variant="danger" outline data-action="delete" data-id="${post._id}">
                        <sl-icon slot="prefix" name="trash"></sl-icon>
                    </sl-button>
                </div>
            </div>
        </div>
    `;

    // Store content for clipboard and task creation
    div.dataset.content = post.content;
    div.dataset.postId = post._id;
    div.dataset.personaName = post.personaName;
    div.dataset.platformId = post.platformId || '';
    div.dataset.imageUrl = post.imageUrl || '';

    return div;
}

// Populate filter dropdowns
function populateFilters(posts) {
    const platforms = [...new Set(posts.map(p => p.platformName).filter(Boolean))];
    const personas = [...new Set(posts.map(p => p.personaName).filter(Boolean))];

    filterPlatform.innerHTML = '<sl-option value="">All Platforms</sl-option>';
    platforms.forEach(p => {
        const option = document.createElement('sl-option');
        option.value = p;
        option.textContent = p;
        filterPlatform.appendChild(option);
    });

    filterPersona.innerHTML = '<sl-option value="">All Personas</sl-option>';
    personas.forEach(p => {
        const option = document.createElement('sl-option');
        option.value = p;
        option.textContent = p;
        filterPersona.appendChild(option);
    });
}

// Filter displayed posts
function filterDisplayedPosts() {
    const platformFilter = filterPlatform.value;
    const personaFilter = filterPersona.value;

    let visibleCount = 0;
    document.querySelectorAll('#postsContainer .post-item').forEach(item => {
        const matchesPlatform = !platformFilter || item.dataset.platform === platformFilter;
        const matchesPersona = !personaFilter || item.dataset.persona === personaFilter;

        if (matchesPlatform && matchesPersona) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    updatePostsCount(visibleCount, currentPosts.length);
}

// Update posts count display
function updatePostsCount(visible, total) {
    if (visible === total) {
        postsCount.textContent = `${total} posts`;
    } else {
        postsCount.textContent = `${visible} of ${total} posts`;
    }
}

// Copy to clipboard
async function copyToClipboard(postId) {
    const card = document.querySelector(`[data-post-id="${postId}"]`);
    if (!card) return;

    const content = card.dataset.content;

    try {
        await navigator.clipboard.writeText(content);
        showToast('Copied to clipboard', 'success');
    } catch (error) {
        console.error('Failed to copy:', error);
        showToast('Failed to copy to clipboard', 'danger');
    }
}

// Delete single post
async function deletePost(postId) {
    if (!confirm('Delete this post?')) return;

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        // Remove from UI
        const card = document.querySelector(`[data-post-id="${postId}"]`);
        if (card) {
            card.remove();
        }

        // Update count
        currentPosts = currentPosts.filter(p => p._id !== postId);
        filterDisplayedPosts();

        showToast('Post deleted', 'success');

    } catch (error) {
        console.error('Error deleting post:', error);
        showToast(error.message, 'danger');
    }
}

// Load platforms
async function loadPlatforms() {
    try {
        const response = await fetch('/api/blog/social-platforms');
        const data = await response.json();
        if (data.success) {
            allPlatforms = data.platforms;
        }
    } catch (error) {
        console.error('Error loading platforms:', error);
    }
}

// Load personas
async function loadPersonas() {
    try {
        const response = await fetch('/api/blog/personas');
        const data = await response.json();
        if (data.success) {
            allPersonas = data.personas;
        }
    } catch (error) {
        console.error('Error loading personas:', error);
    }
}

// Load platforms list in modal
async function loadPlatformsList() {
    const container = document.getElementById('platformsList');

    try {
        const response = await fetch('/api/blog/social-platforms');
        const data = await response.json();

        if (!data.success || data.platforms.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No platforms configured yet.</p>';
            return;
        }

        container.innerHTML = data.platforms.map(platform => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                    <strong>${escapeHtml(platform.name)}</strong>
                    <p class="text-sm text-gray-600 truncate max-w-md">${escapeHtml(platform.instructions || '').substring(0, 100)}...</p>
                </div>
                <div class="flex gap-2">
                    <sl-icon-button name="pencil" label="Edit" data-action="edit-platform" data-id="${platform._id}"></sl-icon-button>
                    <sl-icon-button name="trash" label="Delete" data-action="delete-platform" data-id="${platform._id}"></sl-icon-button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading platforms:', error);
        container.innerHTML = '<p class="text-red-500 text-sm">Failed to load platforms.</p>';
    }
}

// Load personas list in modal
async function loadPersonasList() {
    const container = document.getElementById('personasList');

    try {
        const response = await fetch('/api/blog/personas');
        const data = await response.json();

        if (!data.success || data.personas.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No personas configured yet.</p>';
            return;
        }

        container.innerHTML = data.personas.map(persona => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                    <strong>${escapeHtml(persona.name)}</strong>
                    <p class="text-sm text-gray-600">${escapeHtml(persona.description || '')}</p>
                </div>
                <div class="flex gap-2">
                    <sl-icon-button name="pencil" label="Edit" data-action="edit-persona" data-id="${persona._id}"></sl-icon-button>
                    <sl-icon-button name="trash" label="Delete" data-action="delete-persona" data-id="${persona._id}"></sl-icon-button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading personas:', error);
        container.innerHTML = '<p class="text-red-500 text-sm">Failed to load personas.</p>';
    }
}

// Create platform
async function createPlatform() {
    const name = document.getElementById('newPlatformName').value.trim();
    const instructions = document.getElementById('newPlatformInstructions').value.trim();
    const url = document.getElementById('newPlatformUrl').value.trim();

    if (!name) {
        showToast('Platform name is required', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/blog/social-platforms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, instructions, url })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        // Clear form and refresh
        document.getElementById('newPlatformName').value = '';
        document.getElementById('newPlatformInstructions').value = '';
        document.getElementById('newPlatformUrl').value = '';
        document.getElementById('addPlatformDetails').open = false;

        loadPlatformsList();
        refreshPlatformCheckboxes();
        showToast('Platform created', 'success');

    } catch (error) {
        console.error('Error creating platform:', error);
        showToast(error.message, 'danger');
    }
}

// Create persona
async function createPersona() {
    const name = document.getElementById('newPersonaName').value.trim();
    const description = document.getElementById('newPersonaDescription').value.trim();
    const postModifier = document.getElementById('newPersonaPostModifier').value.trim();

    if (!name) {
        showToast('Persona name is required', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/blog/personas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, postModifier })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        // Clear form and refresh
        document.getElementById('newPersonaName').value = '';
        document.getElementById('newPersonaDescription').value = '';
        document.getElementById('newPersonaPostModifier').value = '';
        document.getElementById('addPersonaDetails').open = false;

        loadPersonasList();
        refreshPersonaCheckboxes();
        showToast('Persona created', 'success');

    } catch (error) {
        console.error('Error creating persona:', error);
        showToast(error.message, 'danger');
    }
}

// Refresh platform checkboxes after adding/editing
async function refreshPlatformCheckboxes() {
    try {
        const response = await fetch('/api/blog/social-platforms');
        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('platformCheckboxes');
            container.innerHTML = data.platforms.map(platform => `
                <label class="platform-checkbox" data-platform-id="${platform._id}">
                    <sl-checkbox value="${platform._id}"></sl-checkbox>
                    <span class="ml-2">${escapeHtml(platform.name)}</span>
                </label>
            `).join('');

            initCheckboxListeners();
        }
    } catch (error) {
        console.error('Error refreshing platforms:', error);
    }
}

// Refresh persona checkboxes after adding/editing
async function refreshPersonaCheckboxes() {
    try {
        const response = await fetch('/api/blog/personas');
        const data = await response.json();

        if (data.success) {
            const container = document.getElementById('personaCheckboxes');
            container.innerHTML = data.personas.map(persona => `
                <label class="persona-checkbox" data-persona-id="${persona._id}">
                    <sl-checkbox value="${persona._id}"></sl-checkbox>
                    <span class="ml-2">${escapeHtml(persona.name)}</span>
                </label>
            `).join('');

            initCheckboxListeners();
        }
    } catch (error) {
        console.error('Error refreshing personas:', error);
    }
}

// Edit platform
let editingPlatformId = null;
async function editPlatform(id) {
    editingPlatformId = id;

    try {
        const response = await fetch(`/api/blog/social-platforms/${id}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        document.getElementById('editPlatformName').value = data.platform.name;
        document.getElementById('editPlatformInstructions').value = data.platform.instructions || '';
        document.getElementById('editPlatformUrl').value = data.platform.url || '';
        document.getElementById('editPlatformModal').show();

    } catch (error) {
        console.error('Error loading platform:', error);
        showToast(error.message, 'danger');
    }
}

// Update platform
async function updatePlatform() {
    if (!editingPlatformId) return;

    const name = document.getElementById('editPlatformName').value.trim();
    const instructions = document.getElementById('editPlatformInstructions').value.trim();
    const url = document.getElementById('editPlatformUrl').value.trim();

    try {
        const response = await fetch(`/api/blog/social-platforms/${editingPlatformId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, instructions, url })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        document.getElementById('editPlatformModal').hide();
        loadPlatformsList();
        refreshPlatformCheckboxes();
        showToast('Platform updated', 'success');

    } catch (error) {
        console.error('Error updating platform:', error);
        showToast(error.message, 'danger');
    }
}

// Delete platform
async function deletePlatform(id) {
    if (!confirm('Delete this platform?')) return;

    try {
        const response = await fetch(`/api/blog/social-platforms/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        loadPlatformsList();
        refreshPlatformCheckboxes();
        showToast('Platform deleted', 'success');

    } catch (error) {
        console.error('Error deleting platform:', error);
        showToast(error.message, 'danger');
    }
}

// Edit persona
let editingPersonaId = null;
async function editPersona(id) {
    editingPersonaId = id;

    try {
        const response = await fetch(`/api/blog/personas/${id}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        document.getElementById('editPersonaName').value = data.persona.name;
        document.getElementById('editPersonaDescription').value = data.persona.description || '';
        document.getElementById('editPersonaPostModifier').value = data.persona.postModifier || '';
        document.getElementById('editPersonaModal').show();

    } catch (error) {
        console.error('Error loading persona:', error);
        showToast(error.message, 'danger');
    }
}

// Update persona
async function updatePersona() {
    if (!editingPersonaId) return;

    const name = document.getElementById('editPersonaName').value.trim();
    const description = document.getElementById('editPersonaDescription').value.trim();
    const postModifier = document.getElementById('editPersonaPostModifier').value.trim();

    try {
        const response = await fetch(`/api/blog/personas/${editingPersonaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, postModifier })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        document.getElementById('editPersonaModal').hide();
        loadPersonasList();
        refreshPersonaCheckboxes();
        showToast('Persona updated', 'success');

    } catch (error) {
        console.error('Error updating persona:', error);
        showToast(error.message, 'danger');
    }
}

// Delete persona
async function deletePersona(id) {
    if (!confirm('Delete this persona?')) return;

    try {
        const response = await fetch(`/api/blog/personas/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        loadPersonasList();
        refreshPersonaCheckboxes();
        showToast('Persona deleted', 'success');

    } catch (error) {
        console.error('Error deleting persona:', error);
        showToast(error.message, 'danger');
    }
}

// Load previous generations
async function loadPreviousGenerations() {
    try {
        const response = await fetch('/api/posts/generations?limit=20');
        const data = await response.json();

        if (!data.success || data.generations.length === 0) {
            previousPostsContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No previous generations yet.</p>';
            return;
        }

        previousPostsContainer.innerHTML = data.generations.map(gen => `
            <div class="generation-group">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <h3 class="font-semibold text-gray-900">${escapeHtml(gen.userQuery)}</h3>
                        <div class="flex items-center gap-2 mt-2 text-sm text-gray-600">
                            <span>${gen.postCount} posts</span>
                            <span>•</span>
                            <span>${gen.platforms.join(', ')}</span>
                            <span>•</span>
                            <span>${new Date(gen.generatedAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    ${gen.imageUrl ? `<img src="${gen.imageUrl}" class="w-24 h-16 object-cover rounded" />` : ''}
                </div>
                <div class="mt-3 flex gap-2">
                    <sl-button size="small" data-action="view-generation" data-id="${gen._id}">
                        <sl-icon slot="prefix" name="eye"></sl-icon>
                        View
                    </sl-button>
                    <sl-button size="small" variant="danger" outline data-action="delete-generation" data-id="${gen._id}">
                        <sl-icon slot="prefix" name="trash"></sl-icon>
                        Delete
                    </sl-button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading generations:', error);
        previousPostsContainer.innerHTML = '<p class="text-red-500 text-center py-8">Failed to load previous generations.</p>';
    }
}

// View generation in modal
let viewingGenerationId = null;
let viewingGenerationPosts = [];

async function viewGeneration(generationId) {
    viewingGenerationId = generationId;

    try {
        const response = await fetch(`/api/posts?generationId=${generationId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        viewingGenerationPosts = data.posts;

        // Hide the separate image container - thumbnails are shown on each post
        const imageContainer = document.getElementById('viewGenerationImage');
        imageContainer.classList.add('hidden');

        // Populate filters
        const platforms = [...new Set(data.posts.map(p => p.platformName).filter(Boolean))];
        const personas = [...new Set(data.posts.map(p => p.personaName).filter(Boolean))];

        const viewFilterPlatform = document.getElementById('viewFilterPlatform');
        const viewFilterPersona = document.getElementById('viewFilterPersona');

        viewFilterPlatform.innerHTML = '<sl-option value="">All Platforms</sl-option>';
        platforms.forEach(p => {
            const option = document.createElement('sl-option');
            option.value = p;
            option.textContent = p;
            viewFilterPlatform.appendChild(option);
        });

        viewFilterPersona.innerHTML = '<sl-option value="">All Personas</sl-option>';
        personas.forEach(p => {
            const option = document.createElement('sl-option');
            option.value = p;
            option.textContent = p;
            viewFilterPersona.appendChild(option);
        });

        // Display posts
        displayViewGenerationPosts(data.posts);

        document.getElementById('viewGenerationModal').show();

    } catch (error) {
        console.error('Error loading generation:', error);
        showToast(error.message, 'danger');
    }
}

// Display posts in view generation modal
function displayViewGenerationPosts(posts) {
    const container = document.getElementById('viewGenerationPosts');
    container.innerHTML = posts.map(post => `
        <div class="post-item" data-platform="${escapeHtml(post.platformName)}" data-persona="${escapeHtml(post.personaName)}" data-content="${escapeHtml(post.content).replace(/"/g, '&quot;')}">
            <div class="flex gap-3">
                ${post.imageUrl ? `<img src="${post.imageUrl}" class="post-thumbnail flex-shrink-0" alt="Post image" />` : ''}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="badge badge-platform">${escapeHtml(post.platformName)}</span>
                        <span class="badge badge-persona">${escapeHtml(post.personaName)}</span>
                    </div>
                    <div class="post-content text-sm">${escapeHtml(post.content)}</div>
                    <div class="mt-2 flex gap-2">
                        <sl-button size="small" variant="primary" data-action="copy-content">
                            <sl-icon slot="prefix" name="clipboard"></sl-icon>
                            Copy
                        </sl-button>
                        <sl-button size="small" variant="success" data-action="create-task" data-id="${post._id}">
                            <sl-icon slot="prefix" name="clipboard-plus"></sl-icon>
                            Task
                        </sl-button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Filter posts in view generation modal
function filterViewGenerationPosts() {
    const platformFilter = document.getElementById('viewFilterPlatform').value;
    const personaFilter = document.getElementById('viewFilterPersona').value;

    const filtered = viewingGenerationPosts.filter(post => {
        const matchesPlatform = !platformFilter || post.platformName === platformFilter;
        const matchesPersona = !personaFilter || post.personaName === personaFilter;
        return matchesPlatform && matchesPersona;
    });

    displayViewGenerationPosts(filtered);
}

// Copy content directly
async function copyContent(content) {
    try {
        await navigator.clipboard.writeText(content);
        showToast('Copied to clipboard', 'success');
    } catch (error) {
        console.error('Failed to copy:', error);
        showToast('Failed to copy', 'danger');
    }
}

// Delete generation
async function deleteGeneration(generationId) {
    if (!confirm('Delete all posts from this generation?')) return;

    try {
        const response = await fetch(`/api/posts/generation/${generationId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        loadPreviousGenerations();
        showToast(`Deleted ${data.deletedCount} posts`, 'success');

    } catch (error) {
        console.error('Error deleting generation:', error);
        showToast(error.message, 'danger');
    }
}

// Delete current generation from modal
async function deleteCurrentGeneration() {
    if (!viewingGenerationId) return;
    await deleteGeneration(viewingGenerationId);
    document.getElementById('viewGenerationModal').hide();
}

// Update status message
function updateStatus(message) {
    statusMessage.textContent = message;
}

// Add log entry
function addLogEntry(message, status) {
    const entry = document.createElement('div');
    entry.className = 'flex items-center gap-2';

    let icon = '';
    if (status === 'complete' || status === 'iteration_complete') {
        icon = '<sl-icon name="check-circle" class="text-green-500"></sl-icon>';
    } else if (status === 'failed' || status === 'error') {
        icon = '<sl-icon name="x-circle" class="text-red-500"></sl-icon>';
    } else {
        icon = '<sl-icon name="arrow-right" class="text-blue-500"></sl-icon>';
    }

    entry.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    statusLog.appendChild(entry);
    statusLog.scrollTop = statusLog.scrollHeight;
}

// Show toast notification
function showToast(message, variant = 'primary') {
    const toast = document.createElement('sl-alert');
    toast.variant = variant;
    toast.closable = true;
    toast.duration = 3000;
    toast.innerHTML = `
        <sl-icon slot="icon" name="${variant === 'success' ? 'check-circle' : variant === 'danger' ? 'x-circle' : 'info-circle'}"></sl-icon>
        ${escapeHtml(message)}
    `;
    document.body.appendChild(toast);
    toast.toast();
}

// Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Task creation from post (no delegation - that happens in task view)
async function createTaskFromPost(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/create-task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error);
        }

        showToast('Task created', 'success');
    } catch (error) {
        console.error('Error creating task:', error);
        showToast(error.message || 'Failed to create task', 'danger');
    }
}
