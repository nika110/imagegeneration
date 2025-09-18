document.addEventListener('DOMContentLoaded', function() {
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

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Hide previous results and errors
        hideElement(error);
        hideElement(results);
        
        // Show loading state
        showElement(loading);
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

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
            // Hide loading state
            hideElement(loading);
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Generate Images';
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
                downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
                downloadBtn.addEventListener('click', () => downloadImage(image.url, `generated-image-${index + 1}.jpg`));
                
                const imageInfo = document.createElement('div');
                imageInfo.className = 'image-info';
                imageInfo.innerHTML = `
                    <small>Size: ${image.size || 'Unknown'}</small>
                `;
                
                imageContainer.appendChild(img);
                imageContainer.appendChild(downloadBtn);
                imageContainer.appendChild(imageInfo);
                imageGrid.appendChild(imageContainer);
            });
            
            // Display usage information
            if (apiResponse.usage) {
                const usage = apiResponse.usage;
                usageText.innerHTML = `
                    <strong>Generation Stats:</strong> 
                    ${usage.generated_images} image(s) created • 
                    ${usage.total_tokens} tokens used
                `;
            }
            
            showElement(results);
            
            // Smooth scroll to results
            results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            showError('No images were generated. Please try a different prompt.');
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        showElement(error);
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

    // Add some example prompts for better UX
    const examplePrompts = [
        "A futuristic cityscape at sunset with flying cars",
        "A magical forest with glowing mushrooms and fairy lights",
        "A steampunk robot playing chess in a Victorian library",
        "A serene mountain lake reflecting aurora borealis",
        "An underwater palace with colorful coral gardens"
    ];

    const promptTextarea = document.getElementById('prompt');
    
    // Add placeholder cycling
    let currentExampleIndex = 0;
    setInterval(() => {
        if (promptTextarea.value === '') {
            promptTextarea.placeholder = `Describe the image you want to generate... (e.g., '${examplePrompts[currentExampleIndex]}')`;
            currentExampleIndex = (currentExampleIndex + 1) % examplePrompts.length;
        }
    }, 3000);

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
});