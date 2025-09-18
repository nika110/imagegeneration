document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const form = document.getElementById('imageForm');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const results = document.getElementById('results');
    const imageGrid = document.getElementById('imageGrid');
    const generateBtn = document.getElementById('generateBtn');
    const usageText = document.getElementById('usageText');
    const errorMessage = document.getElementById('errorMessage');
    const referenceImageUrl = document.getElementById('reference_image_url');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const removeImageBtn = document.getElementById('removeImage');
    const navStatus = document.getElementById('navStatus');
    const maxImagesSelect = document.getElementById('max_images');
    const imageCountHint = document.getElementById('imageCountHint');

    // Image count guidance messages
    const hintMessages = {
        1: "Perfect for single, focused results",
        2: "⚠️ IMPORTANT: Must specify 'two variations'  in your prompt to generate 2 images!", 
        3: "⚠️ IMPORTANT: Must include 'three variations',  in your prompt to get 3 images!",
        4: "⚠️ IMPORTANT: Must specify 'four variations', in your prompt to generate 4 images!"
    };

    // localStorage key for saved images
    const STORAGE_KEY = 'imageGen_savedResults';
    const MAX_STORED_SESSIONS = 5; // Keep last 5 generation sessions

    // Update navigation status
    function updateNavStatus(status, color = 'var(--success-500)') {
        const statusDot = navStatus.querySelector('.status-dot');
        const statusText = navStatus.lastChild;
        
        statusDot.style.backgroundColor = color;
        statusText.textContent = ` ${status}`;
    }

    // Health monitoring
    let healthCheckInterval;
    let isServerHealthy = true;
    let consecutiveFailures = 0;

    async function checkServerHealth() {
        try {
            const response = await fetch('/health', {
                method: 'GET',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                const healthData = await response.json();
                
                if (consecutiveFailures > 0) {
                    consecutiveFailures = 0;
                    updateNavStatus('Active', 'var(--success-500)');
                    isServerHealthy = true;
                } else if (isServerHealthy) {
                    updateNavStatus('Active', 'var(--success-500)');
                }
                
            } else {
                throw new Error(`Health check failed: ${response.status}`);
            }
        } catch (error) {
            consecutiveFailures++;
            
            if (consecutiveFailures === 1) {
                updateNavStatus('Checking...', 'var(--warning-500)');
            } else if (consecutiveFailures >= 2) {
                updateNavStatus('Inactive', 'var(--error-500)');
                isServerHealthy = false;
                
                // Show reconnection message after 3 consecutive failures
                if (consecutiveFailures === 3) {
                    showReconnectionDialog();
                }
            }
        }
    }

    function showReconnectionDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <h3 style="color: var(--error-500); margin-bottom: 1rem;">
                    🔌 Connection Lost
                </h3>
                <p style="margin-bottom: 1.5rem; color: var(--gray-600);">
                    Unable to connect to the server. The page will automatically refresh in 30 seconds, 
                    or you can refresh manually now.
                </p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button onclick="location.reload()" class="btn btn-primary">
                        Refresh Now
                    </button>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn btn-secondary">
                        Wait
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-refresh after 30 seconds
        setTimeout(() => {
            location.reload();
        }, 30000);
    }

    function startHealthMonitoring() {
        // Initial health check
        checkServerHealth();
        
        // Check every 30 seconds
        healthCheckInterval = setInterval(checkServerHealth, 30000);
    }

    function stopHealthMonitoring() {
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
        }
    }

    // localStorage functions for image persistence
    function saveImageSession(prompt, images, maxImages, size, referenceImage) {
        try {
            let savedSessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            
            const newSession = {
                id: Date.now(),
                timestamp: new Date().toISOString(),
                prompt: prompt,
                images: images,
                settings: {
                    maxImages: maxImages,
                    size: size,
                    referenceImage: referenceImage
                }
            };
            
            // Add new session at the beginning
            savedSessions.unshift(newSession);
            
            // Keep only the latest sessions
            savedSessions = savedSessions.slice(0, MAX_STORED_SESSIONS);
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSessions));
            
            // Update nav status to show save confirmation
            updateNavStatus('Saved ✓', 'var(--success-500)');
            setTimeout(() => {
                updateNavStatus('Active', 'var(--success-500)');
            }, 2000);
            
        } catch (e) {
            console.warn('Failed to save images to localStorage:', e);
        }
    }

    function loadSavedSessions() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            console.warn('Failed to load saved sessions:', e);
            return [];
        }
    }

    function restoreLastSession() {
        const savedSessions = loadSavedSessions();
        if (savedSessions.length > 0) {
            const lastSession = savedSessions[0];
            displaySavedResults(lastSession);
            
            // Show restore notification
            showRestoreNotification(savedSessions.length);
        }
    }

    function displaySavedResults(session) {
        // Clear current results
        imageGrid.innerHTML = '';
        
        // Display the saved images
        if (session.images && session.images.length > 0) {
            session.images.forEach((imageUrl, index) => {
                const imageContainer = document.createElement('div');
                imageContainer.className = 'image-container';
                
                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = `Generated image ${index + 1}`;
                img.className = 'generated-image';
                img.loading = 'lazy';
                
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-btn';
                downloadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2"/>
                        <polyline points="7,10 12,15 17,10" stroke="currentColor" stroke-width="2"/>
                        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    Download
                `;
                
                img.addEventListener('click', () => openImageModal(imageUrl));
                
                downloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const filename = `image-${session.id}-${index + 1}.jpg`;
                    downloadImage(imageUrl, filename);
                });
                
                imageContainer.appendChild(img);
                imageContainer.appendChild(downloadBtn);
                imageGrid.appendChild(imageContainer);
            });
            
            // Update usage info
            usageText.innerHTML = `${session.images.length} images restored • Generated: ${new Date(session.timestamp).toLocaleString()}`;
            
            // Show results section
            showElement(results);
        }
    }

    function showRestoreNotification(sessionCount) {
        const notification = document.createElement('div');
        notification.className = 'restore-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span>🔄 Restored your last generation (${sessionCount} saved sessions)</span>
                <button onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Hide previous results and errors
        hideElement(error);
        hideElement(results);
        
        // Show loading state and update nav
        showElement(loading);
        updateNavStatus('Generating...', 'var(--warning-500)');
        
        // Update button state
        generateBtn.disabled = true;
        const originalContent = generateBtn.innerHTML;
        generateBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="animate-spin">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-opacity="0.25"/>
                <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor"/>
            </svg>
            Generating...
        `;

        // Get form data
        const formData = new FormData(form);
        
        try {
            const response = await fetch('/generate', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success && data.data) {
                displayResults(data.data);
            } else {
                showError(data.error || 'An unknown error occurred');
            }
        } catch (err) {
            showError('Network error: Unable to connect to the server');
            console.error('Error:', err);
        } finally {
            // Hide loading state and reset UI
            hideElement(loading);
            generateBtn.disabled = false;
            generateBtn.innerHTML = originalContent;
            updateNavStatus('Ready');
        }
    });

    function displayResults(apiResponse) {
        // Clear previous images
        imageGrid.innerHTML = '';
        
        if (apiResponse.data && apiResponse.data.length > 0) {
            apiResponse.data.forEach((image, index) => {
                const imageContainer = document.createElement('div');
                imageContainer.className = 'image-container';
                
                const img = document.createElement('img');
                img.src = image.url;
                img.alt = `Generated image ${index + 1}`;
                img.loading = 'lazy';
                
                // Add click to view full size
                img.addEventListener('click', () => openImageModal(image.url));
                
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-btn';
                downloadBtn.innerHTML = '↓';
                downloadBtn.title = 'Download image';
                downloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    downloadImage(image.url, `generated-image-${index + 1}.jpg`);
                });
                
                imageContainer.appendChild(img);
                imageContainer.appendChild(downloadBtn);
                imageGrid.appendChild(imageContainer);
            });
            
            // Display usage information
            if (apiResponse.usage) {
                const usage = apiResponse.usage;
                usageText.innerHTML = `${usage.generated_images} images • ${usage.total_tokens} tokens`;
            }
            
            showElement(results);
            
            // Save to localStorage for persistence
            const imageUrls = apiResponse.data.map(img => img.url);
            const currentForm = new FormData(form);
            saveImageSession(
                currentForm.get('prompt'),
                imageUrls,
                parseInt(currentForm.get('max_images')),
                currentForm.get('size'),
                currentForm.get('reference_image_url')
            );
            
            // Smooth scroll to results
            results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            showError('No images were generated. Please try a different prompt.');
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        showElement(error);
        updateNavStatus('Error', 'var(--error-500)');
    }

    function showElement(element) {
        element.classList.remove('hidden');
    }

    function hideElement(element) {
        element.classList.add('hidden');
    }

    function downloadImage(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function openImageModal(imageUrl) {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <img src="${imageUrl}" alt="Full size image" class="modal-image">
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal
        modal.style.display = 'block';
        
        // Close modal events
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }

    // Enhanced UX features
    const promptTextarea = document.getElementById('prompt');
    
    // Auto-resize textarea
    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
    
    promptTextarea.addEventListener('input', () => autoResize(promptTextarea));
    
    // Enhanced placeholder examples
    const examplePrompts = [
        "A minimal logo design with geometric shapes",
        "Modern architecture with clean lines and glass",
        "Abstract digital art with vibrant colors",
        "Professional headshot with soft lighting",
        "Product photography on white background"
    ];

    let currentExampleIndex = 0;
    const cyclePlaceholder = () => {
        if (promptTextarea.value === '' && !promptTextarea.matches(':focus')) {
            promptTextarea.placeholder = examplePrompts[currentExampleIndex];
            currentExampleIndex = (currentExampleIndex + 1) % examplePrompts.length;
        }
    };
    
    setInterval(cyclePlaceholder, 4000);
    cyclePlaceholder(); // Set initial placeholder

    // Handle reference image URL input
    referenceImageUrl.addEventListener('input', function() {
        const url = this.value.trim();
        if (url && isValidImageUrl(url)) {
            showImagePreview(url);
        } else {
            hideImagePreview();
        }
    });

    // Remove reference image
    removeImageBtn.addEventListener('click', function() {
        referenceImageUrl.value = '';
        hideImagePreview();
    });

    // Handle image count selection changes
    maxImagesSelect.addEventListener('change', function() {
        updateImageCountHint(parseInt(this.value));
    });

    function updateImageCountHint(count) {
        const hintSpan = imageCountHint.querySelector('span');
        const message = hintMessages[count];
        
        if (count > 1 && message) {
            hintSpan.textContent = `💡 ${message}`;
            imageCountHint.classList.add('show');
        } else {
            imageCountHint.classList.remove('show');
        }
    }

    function isValidImageUrl(url) {
        try {
            new URL(url);
            return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url) || url.includes('blob:') || url.includes('data:image');
        } catch {
            return false;
        }
    }

    function showImagePreview(url) {
        previewImg.onload = function() {
            imagePreview.classList.remove('hidden');
        };
        
        previewImg.onerror = function() {
            hideImagePreview();
            // Optionally show a subtle error message
            console.warn('Failed to load reference image');
        };
        
        previewImg.src = url;
    }

    function hideImagePreview() {
        imagePreview.classList.add('hidden');
        previewImg.src = '';
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter to generate
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!generateBtn.disabled && promptTextarea.value.trim()) {
                form.dispatchEvent(new Event('submit'));
            }
        }
        
        // Escape to close modal
        if (e.key === 'Escape') {
            const modal = document.querySelector('.modal');
            if (modal && modal.style.display === 'block') {
                document.body.removeChild(modal);
            }
        }
    });

    // Form validation
    const validateForm = () => {
        const prompt = promptTextarea.value.trim();
        const isValid = prompt.length >= 3;
        
        generateBtn.disabled = !isValid;
        
        if (!isValid && prompt.length > 0) {
            generateBtn.title = 'Please enter at least 3 characters';
        } else {
            generateBtn.title = '';
        }
        
        return isValid;
    };

    promptTextarea.addEventListener('input', validateForm);
    validateForm(); // Initial validation
    
    // Initialize
    updateNavStatus('Starting...', 'var(--warning-500)');
    startHealthMonitoring();
    
    // Initialize image count hint
    updateImageCountHint(parseInt(maxImagesSelect.value));
    
    // Restore last session if available (after a short delay)
    setTimeout(() => {
        restoreLastSession();
    }, 1000);
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', stopHealthMonitoring);
});