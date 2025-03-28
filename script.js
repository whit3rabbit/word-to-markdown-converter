document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const fileInput = document.getElementById('file-input');
    const fileInputLabel = document.querySelector('label[for="file-input"]');
    const dropZone = document.getElementById('drop-zone');
    const fileInfo = document.getElementById('file-info');
    const statusArea = document.getElementById('status-area');

    const markdownOutput = document.getElementById('markdown-output');
    const htmlPreview = document.getElementById('html-preview');
    const copyMarkdownButton = document.getElementById('copy-markdown-button');
    const downloadMarkdownButton = document.getElementById('download-markdown-button');
    const clearFileButton = document.getElementById('clear-file-button');

    const converterOutputDiv = document.getElementById('converter-output'); // Parent div for output areas
    const settingsButton = document.getElementById('settings-button');
    const closeSettingsButton = document.getElementById('close-settings-button');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsForm = settingsPanel.querySelector('form.modal-body'); // Reference the form inside the modal

    const saveSettingsButton = document.getElementById('save-settings-button'); // Save button
    const resetSettingsButton = document.getElementById('reset-settings-button'); // Reset button
    const themeButton = document.getElementById('theme-button');
    // Checkbox for preview setting is accessed via form query later

    const loader = document.getElementById('loader');
    const loaderMessage = document.getElementById('loader-message');

    // --- State ---
    let currentFileName = '';
    let currentMarkdown = ''; // Holds the final Markdown, potentially post-processed
    let mammothOutputMarkdown = ''; // Holds the direct output from Mammoth before post-processing
    let currentHtml = '';
    let sourceArrayBuffer = null; // Optionally store the last file buffer for reconversion

    const defaultSettings = { // Define defaults clearly
        imageHandling: 'base64',
        listStyle: '-',
        lineBreak: 'space',
        underlineHandling: 'ignore',
        disablePreview: false
    };

    // --- Initialization ---
    loadSettings(); // Load settings from localStorage FIRST
    applyTheme(getPreferredTheme()); // Apply theme on load
    setupEventListeners();
    configureMarked(); // Configure Markdown renderer
    updateClearButtonState(); // Initialize clear button state

    // --- Functions ---

    function setupEventListeners() {
        // File Input Change
        fileInput.addEventListener('change', handleFileSelect);

        // Drag and Drop
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);

        // This prevents double-triggers when clicking on children elements
        dropZone.addEventListener('click', (event) => {
            // Only trigger if the click was directly on the drop zone
            // or on an element that's not the "Select File" button/label
            if (event.target === dropZone || 
                (event.target.tagName !== 'LABEL' && 
                 !event.target.closest('label[for="file-input"]'))) {
                fileInput.click();
            }
        });

        // Button Clicks
        copyMarkdownButton.addEventListener('click', copyMarkdown);
        downloadMarkdownButton.addEventListener('click', downloadMarkdown);
        clearFileButton.addEventListener('click', clearFileMemory);
        themeButton.addEventListener('click', toggleTheme);

        // Settings Panel Interaction
        settingsButton.addEventListener('click', openSettings);
        closeSettingsButton.addEventListener('click', closeSettings);
        settingsPanel.addEventListener('click', (e) => { // Close modal if backdrop is clicked
            if (e.target === settingsPanel) {
                closeSettings();
            }
        });

        // Listeners for the settings buttons
        saveSettingsButton.addEventListener('click', saveSettingsHandler);
        resetSettingsButton.addEventListener('click', resetSettingsHandler);

        // Immediate UI feedback for preview toggle ONLY
        settingsForm.addEventListener('change', handlePreviewToggle);
    }

    // New handler JUST for toggling preview visibility immediately on checkbox change
    function handlePreviewToggle(event) {
        if (event.target.name === 'disable-preview') {
           const isPreviewDisabled = event.target.checked;
           // Apply visibility change immediately
           togglePreviewVisibility(!isPreviewDisabled);
           if (!isPreviewDisabled && currentMarkdown) {
                updatePreview(currentMarkdown); // Re-render if enabled
           } else if (isPreviewDisabled) {
                clearPreview(); // Clear if disabled
           }
           // DO NOT save to localStorage here - only Save button does that
        }
   }

    function configureMarked() {
        // Configure marked.js
         if (window.marked) {
            marked.setOptions({
                gfm: true, // Enable GitHub Flavored Markdown
                breaks: false, // Use GFM line breaks (false means need double space or <br>)
                pedantic: false,
                highlight: function (code, lang) {
                    if (window.hljs) {
                        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                        try {
                             // ignoreIllegals: true helps prevent errors on unusual code snippets
                             return hljs.highlight(code, { language, ignoreIllegals: true }).value;
                        } catch (e) {
                            console.error("Highlight.js error:", e);
                            // Fallback to plaintext on error
                            return hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value;
                        }
                    } else {
                        // Escape HTML if hljs is not available, prevents potential XSS
                        return code.replace(/</g, "<").replace(/>/g, ">");
                    }
                }
            });
         } else {
            console.error("marked.js library not found.");
            showStatus("Error: Markdown preview library failed to load.", "error");
         }
         if (!window.hljs) {
             console.error("highlight.js library not found.");
             // Preview will work, just without syntax highlighting
         }
    }

    function handleFileSelect(event) {
        const files = event.target.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
        fileInput.value = null; // Allow selecting the same file again
    }

    function handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add('drag-over');
    }

    function handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('drag-over');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            // Be strict about accepting only .docx initially
            if (files[0].type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || files[0].name.toLowerCase().endsWith('.docx')) {
                 processFile(files[0]);
            } else {
                showStatus('Error: Only .docx files are supported. Please select a valid Word document.', 'error', 5000);
                clearOutput(); // Clear any previous state
            }
        }
    }

    function processFile(file) {
        console.log('Processing file:', file.name);
        currentFileName = file.name.replace(/\.[^/.]+$/, "");
        fileInfo.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
        clearOutput(false); // Clear previous output but keep file info
        showLoader('Reading file...');
        sourceArrayBuffer = null; // Reset stored buffer

        // Memory management warnings
        const warnSize = 10 * 1024 * 1024; // 10MB warning threshold
        const largeSize = 25 * 1024 * 1024; // 25MB large file threshold
        const maxSize = 50 * 1024 * 1024;   // 50MB maximum size
        
        if (file.size > maxSize) {
            showStatus(`Error: File size (${formatBytes(file.size)}) exceeds the maximum limit (${formatBytes(maxSize)}).`, 'error', 6000);
            hideLoader();
            return;
        } else if (file.size > largeSize) {
            showStatus(`Warning: Processing a very large file (${formatBytes(file.size)}). Conversion may be slow and memory-intensive. Consider disabling preview in settings.`, 'warning', 8000);
            
            // Auto-disable preview for extremely large files
            if (!conversionSettings.disablePreview) {
                const tempDisablePreview = confirm("This file is very large. Would you like to temporarily disable the preview to save memory?");
                if (tempDisablePreview) {
                    // Temporarily disable preview without saving to settings
                    togglePreviewVisibility(false);
                    showStatus('Preview temporarily disabled for this file.', 'info', 3000);
                }
            }
        } else if (file.size > warnSize) {
            showStatus(`Note: Processing a large file (${formatBytes(file.size)}). This may take a moment.`, 'info', 4000);
        }

        const reader = new FileReader();

        reader.onload = function(event) {
            console.log('File read complete.');
            showLoader('Converting to Markdown...');
            const arrayBuffer = event.target.result;
            sourceArrayBuffer = arrayBuffer; // Store buffer for potential reconversion
            updateClearButtonState(); // Update clear button state after loading file

            // --- Use Web Worker for Mammoth in future? ---
            if (window.mammoth) {
                const mammothOptions = getMammothOptions(); // Get options based on CURRENT settings
                console.log("Options passed to Mammoth:", mammothOptions); // Log options for debugging
                mammoth.convertToMarkdown({ arrayBuffer: arrayBuffer }, mammothOptions)
                    .then(displayResult)
                    .catch(handleConversionError)
                    .finally(hideLoader);
            } else {
                handleConversionError(new Error("Mammoth.js library not found."));
            }
            // --- End Web Worker placeholder ---
        };

        reader.onerror = function(event) {
            console.error('File reading error:', event.target.error);
            showStatus(`Error reading file: ${event.target.error}`, 'error');
            hideLoader();
            clearOutput();
        };

        reader.readAsArrayBuffer(file);
    }

     // Function to potentially reconvert the stored ArrayBuffer with current settings
     function reconvertFile() {
        if (!sourceArrayBuffer) {
            showStatus("No file data available to reconvert. Please upload again.", "warning", 4000);
            return;
        }
         if (!window.mammoth) {
            handleConversionError(new Error("Mammoth.js library not found."));
            return;
         }

        console.log("Reconverting stored file data with current settings...");
        showLoader('Re-converting...');
        const mammothOptions = getMammothOptions();
        console.log("Options passed to Mammoth for reconversion:", mammothOptions);
        mammoth.convertToMarkdown({ arrayBuffer: sourceArrayBuffer }, mammothOptions)
                .then(displayResult) // Reuse the same display logic
                .catch(handleConversionError)
                .finally(hideLoader);
    }

    // Function to update clear button state based on memory contents
    function updateClearButtonState() {
        if (sourceArrayBuffer) {
            // Enable the button when file is in memory
            clearFileButton.disabled = false;
            clearFileButton.classList.remove('button-secondary');
            clearFileButton.classList.add('button'); // Use primary styling when active
            
            // Add helpful tooltip with file size
            const fileSizeText = formatBytes(sourceArrayBuffer.byteLength);
            clearFileButton.title = `Clear ${currentFileName || "file"} (${fileSizeText}) from memory`;
        } else {
            // Disable when no file in memory
            clearFileButton.disabled = true;
            clearFileButton.classList.remove('button');
            clearFileButton.classList.add('button-secondary'); // Use secondary styling when inactive
            clearFileButton.title = 'No file loaded in memory';
        }
    }

    // Memory clearing function
    function clearFileMemory() {
        if (!sourceArrayBuffer) {
            return; // Nothing to clear
        }
        
        // Clear all buffers and references
        sourceArrayBuffer = null;
        mammothOutputMarkdown = '';
        currentMarkdown = '';
        currentHtml = '';
        
        // Reset UI elements
        markdownOutput.value = '';
        htmlPreview.innerHTML = '<p><i>Preview will render here...</i></p>';
        
        // Update UI controls
        updateClearButtonState();
        copyMarkdownButton.disabled = true;
        downloadMarkdownButton.disabled = true;
        
        // Show status
        showStatus('File cleared from memory.', 'success', 2000);
    }

    function getMammothOptions() {
        // Ensure settings exist - create a merged object with defaults for any missing settings
        const settings = {...defaultSettings, ...conversionSettings};
        
        console.log("[getMammothOptions] Requesting options. Current image setting:", settings.imageHandling);
        
        const options = {};
        const styleMap = [];

        // Image Handling
        if (settings.imageHandling === 'ignore') {
            options.convertImage = mammoth.images.inline(element => {
                console.log("[Mammoth Option] Ignoring image element via convertImage"); // Debug log
                return { src: "" }; // Return empty src to ignore
            });
            // ignoreEmptyParagraphs might help clean up space left by ignored images
            options.ignoreEmptyParagraphs = false;
        }
        // Base64 (default): No option needed unless customizing data URI generation

        // Underline Handling
        // Ensure setting key matches the state object ('underlineHandling', not 'underline-handling')
        if (settings.underlineHandling === 'u') {
            styleMap.push("u => u");
        } else if (settings.underlineHandling === 'italic') {
            styleMap.push("u => em"); // Map underline to emphasis (italic)
        }
        // Ignore: Default Mammoth behavior, no style map needed

        if (styleMap.length > 0) {
            options.styleMap = styleMap;
        }

        return options;
    }

    function displayResult(result) {
        console.log('Conversion successful.');
        mammothOutputMarkdown = result.value; // Store raw Mammoth output
        // Apply post-processing based on settings THAT ARE CURRENTLY ACTIVE
        currentMarkdown = postProcessMarkdown(mammothOutputMarkdown);

        markdownOutput.value = currentMarkdown; // Display potentially post-processed MD
        showStatus('Conversion successful!', 'success', 3000);

        // Update Preview ONLY if enabled in settings
        if (!conversionSettings.disablePreview) {
            updatePreview(currentMarkdown);
        } else {
            clearPreview(); // Ensure preview is cleared/hidden if disabled
        }

        copyMarkdownButton.disabled = false;
        downloadMarkdownButton.disabled = false;
        updateClearButtonState(); // Update clear button state after successful conversion
    }

    function postProcessMarkdown(markdown) {
        let processed = markdown;

        // Adjust Bulleted List Markers (if not default '-')
        // Check if the setting exists and is not the default
        if (conversionSettings.listStyle && conversionSettings.listStyle !== '-') {
            try {
                // Regex to replace list markers at the beginning of lines, handling indentation
                const bulletRegex = /^(\s*)-\s+/gm;
                processed = processed.replace(bulletRegex, `$1${conversionSettings.listStyle} `);
            } catch (e) {
                console.error("Error during list style post-processing:", e);
                // Fallback: return original markdown if regex fails
            }
        }

        // Adjust Line Breaks (Handle <br> potentially generated by Mammoth or custom mappings)
        if (conversionSettings.lineBreak === 'space') {
             // Replace <br> tags (and variants) with double space + newline for Markdown line break
             processed = processed.replace(/<br\s*\/?>/gi, '  \n');
        }
        // If lineBreak is 'br', we assume <br> tags are desired if present (no replacement needed)

        return processed;
    }

    async function updatePreview(markdownToRender) {
        // Check if preview is globally disabled by settings
        if (conversionSettings.disablePreview) {
            clearPreview(); // Ensure it's cleared and hidden
            return;
        }

        // Ensure preview area is visually enabled
        togglePreviewVisibility(true);

        if (markdownToRender === null || markdownToRender === undefined) {
            htmlPreview.innerHTML = ''; // Clear content if markdown is null/undefined
            return;
        }

        try {
            // marked.parse is asynchronous now
            currentHtml = await marked.parse(markdownToRender);
            htmlPreview.innerHTML = currentHtml;
             // Re-apply syntax highlighting after content is updated
             htmlPreview.querySelectorAll('pre code').forEach((block) => {
                 if (window.hljs) {
                     try {
                        hljs.highlightElement(block);
                     } catch (e) {
                         console.error("Highlighting error on block:", e, block);
                     }
                 }
            });
        } catch (error) {
            console.error('Markdown Rendering Error:', error);
            htmlPreview.innerHTML = '<p style="color: var(--error-text);">Error rendering preview.</p>'; // Use CSS variable for color
            showStatus('Error rendering Markdown preview.', 'error');
        }
    }

    // Function to clear the preview area and ensure it's visually hidden if needed
    function clearPreview() {
         htmlPreview.innerHTML = '<p><i>Preview is disabled or no content.</i></p>'; // Placeholder text
         // Ensure the CSS class is applied if preview is disabled in settings
         togglePreviewVisibility(false); // This checks the setting internally
    }

    // Function to add/remove CSS class for hiding/showing preview pane
    function togglePreviewVisibility(show) {
        // Only show if 'show' is true AND the setting 'disablePreview' is false
        if (show && !conversionSettings.disablePreview) {
            converterOutputDiv.classList.remove('preview-disabled');
        } else { // Hide if 'show' is false OR if 'disablePreview' is true
            converterOutputDiv.classList.add('preview-disabled');
        }
    }

    function handleConversionError(err) {
        console.error('Conversion Error:', err);
        let userMessage = `Conversion failed: ${err.message || 'Unknown error'}`;
        
        // Provide more specific guidance if possible (e.g., common Mammoth errors)
        if (err.message && err.message.includes("expected 'word/document.xml'")) {
            userMessage += " - The file might be corrupted or not a valid .docx file.";
        } else if (err.message && err.message.includes("Cannot read properties of undefined")) {
            userMessage += " - An unexpected issue occurred during conversion. The document might have unsupported features."
        }
        
        // Add a retry option for certain errors
        if (err.message && (err.message.includes("unexpected") || err.message.includes("timeout"))) {
            // Show the basic error message first
            showStatus(userMessage + " Would you like to try again?", 'error');
            
            // Add a retry button to the status area
            const retryButton = document.createElement('button');
            retryButton.textContent = 'Retry Conversion';
            retryButton.className = 'button';
            retryButton.addEventListener('click', () => {
                if (sourceArrayBuffer) {
                    showStatus('Retrying conversion...', 'info');
                    reconvertFile(); // Call our reconvert function
                } else {
                    showStatus('Please select the file again to retry.', 'info', 3000);
                }
            });
            
            statusArea.appendChild(document.createElement('br'));
            statusArea.appendChild(retryButton);
        } else {
            // For non-retryable errors, just show the message
            showStatus(userMessage, 'error');
            // And now clear the buffer since we won't retry
            sourceArrayBuffer = null;
            updateClearButtonState(); // Update clear button state
        }
        
        clearOutput(false); // Keep file info
        hideLoader();
    }

    function copyMarkdown() {
        if (!currentMarkdown) {
            showStatus('Nothing to copy!', 'info', 2000);
            return;
        }
        navigator.clipboard.writeText(currentMarkdown)
            .then(() => {
                showStatus('Markdown copied to clipboard!', 'success', 2000);
            })
            .catch(err => {
                // Be more specific about error types
                if (err.name === 'NotAllowedError') {
                    showStatus('Clipboard access denied. Please check your browser permissions.', 'error', 4000);
                } else {
                    console.error('Clipboard Error:', err);
                    // Try fallback using execCommand (older, less secure, might be removed)
                    try {
                        const textArea = document.createElement("textarea");
                        textArea.value = currentMarkdown;
                        textArea.style.position = "fixed"; // Avoid scrolling
                        textArea.style.opacity = "0";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        const successful = document.execCommand('copy');
                        document.body.removeChild(textArea);
                        if (successful) {
                            showStatus('Markdown copied to clipboard! (using fallback)', 'success', 2000);
                        } else {
                             throw new Error('Fallback copy command failed');
                        }
                    } catch (fallbackErr) {
                        console.error('Fallback Clipboard Error:', fallbackErr);
                         showStatus('Failed to copy Markdown. Your browser might not support this feature or requires permission. Please copy manually.', 'error', 6000);
                    }
                }
            });
    }

    function downloadMarkdown() {
         if (!currentMarkdown) {
            showStatus('Nothing to download!', 'info', 2000);
            return;
        }
        try {
            const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
            // Use FileSaver.js if included, otherwise fallback
            if (window.saveAs) {
                window.saveAs(blob, `${currentFileName || 'converted'}.md`);
            } else {
                // Fallback method
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentFileName || 'converted'}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
            showStatus('Markdown download initiated.', 'success', 2000);
        } catch (e) {
             console.error('Download Error:', e);
             showStatus('Failed to initiate download.', 'error');
        }
    }

    // --- Settings ---

    // Helper function to apply a settings object to the form elements
    function applySettingsToForm(settingsToApply) {
        console.log("Applying settings to form:", settingsToApply);
        try {
            for (const key in settingsToApply) {
                 // Convert camelCase to kebab-case properly
                 const formName = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                 const value = settingsToApply[key];
                 // Find elements within the specific settings form
                 const elements = settingsForm.querySelectorAll(`[name="${formName}"]`);

                 if (elements.length > 0) {
                    if (elements[0].type === 'radio') {
                        // Check the radio button whose value matches the setting
                        elements.forEach(radio => {
                            radio.checked = (radio.value === String(value)); // Ensure comparison is robust
                        });
                    } else if (elements[0].type === 'checkbox') {
                        // Set the checked state for the checkbox
                        elements[0].checked = Boolean(value);
                    }
                 } else {
                     console.warn(`Form element not found for setting key: ${key} (name: ${formName})`);
                 }
            }
             // Explicitly update preview visibility based on the applied settings
             togglePreviewVisibility(!settingsToApply.disablePreview);

        } catch (e) {
            console.error("Error applying settings to form:", e);
            showStatus("Error applying preferences to the settings form.", "error", 4000);
        }
    }

    function loadSettings() {
        let savedSettingsJson = null;
        try {
             savedSettingsJson = localStorage.getItem('conversionSettings');
        } catch (e) {
            console.error("Error reading settings from localStorage:", e);
            showStatus('Could not load saved preferences due to storage error.', 'warning', 4000);
        }

        let loadedSettings = {};
        if (savedSettingsJson) {
            try {
                loadedSettings = JSON.parse(savedSettingsJson);
            } catch (e) {
                 console.error("Error parsing saved settings JSON:", e);
                 showStatus('Could not parse saved preferences. Using defaults.', 'warning', 4000);
            }
        }

        // Merge defaults with loaded settings to ensure all keys exist and handle new defaults
        conversionSettings = { ...defaultSettings, ...loadedSettings };
        console.log("Loaded and merged settings:", conversionSettings);

        // Apply these final settings TO THE FORM ELEMENTS
        applySettingsToForm(conversionSettings);
    }

    // Handler for the "Save Preferences" button
    function saveSettingsHandler() {
        console.log("Save Settings button clicked");
        const newSettings = {}; // Object to hold settings read from form

        try {
            // Iterate over the keys in defaultSettings
            for (const key in defaultSettings) {
                // Convert camelCase key to kebab-case form name
                const formName = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                const element = settingsForm.querySelector(`[name="${formName}"]`);

                if (!element) {
                    console.warn(`Form element [name="${formName}"] not found for setting key "${key}". Using default.`);
                    newSettings[key] = defaultSettings[key]; // Use default if element not found
                    continue;
                }

                // Read value based on element type
                if (element.type === 'checkbox') {
                    newSettings[key] = element.checked;
                } else if (element.type === 'radio') {
                    // Find the currently checked radio button within the group
                    const checkedRadio = settingsForm.querySelector(`[name="${formName}"]:checked`);
                    if (checkedRadio) {
                        newSettings[key] = checkedRadio.value;
                    } else {
                        // Fallback just in case
                        console.warn(`No radio button checked for name="${formName}". Using default.`);
                        newSettings[key] = defaultSettings[key];
                    }
                }
            }

            // Update the global state object with the settings read from the form
            conversionSettings = { ...newSettings };

            // Save the updated settings object to localStorage
            localStorage.setItem('conversionSettings', JSON.stringify(conversionSettings));
            console.log("Saved settings to localStorage:", conversionSettings);
            showStatus('Preferences saved!', 'success', 2000);

            // Optionally prompt user to re-process if necessary
            showStatus('Preferences saved. Re-process the file for all changes to fully apply.', 'info', 4000);

            closeSettings(); // Close modal after saving

        } catch (e) {
            console.error("Error saving settings:", e);
            showStatus('Could not save preferences due to an error.', 'error', 4000);
        }
    }

    // Handler for the "Reset to Default" button
    function resetSettingsHandler() {
        console.log("Reset Settings button clicked");
        if (confirm("Are you sure you want to reset all settings to their default values? Any saved preferences will be lost.")) {
            try {
                // Clear saved settings from storage
                localStorage.removeItem('conversionSettings');

                // Reset the global state object to the defaults (create a fresh copy)
                conversionSettings = { ...defaultSettings };

                // Apply these default settings TO THE FORM elements
                applySettingsToForm(defaultSettings);

                console.log("Settings reset to default:", conversionSettings);
                showStatus('Settings reset to default.', 'success', 3000);

                // Notify user to re-process if content exists
                 if (mammothOutputMarkdown) { // Check if there's content that might be affected
                     showStatus('Settings reset. Re-process the file for changes to apply.', 'info', 4000);
                 }

            } catch (e) {
                 console.error("Error resetting settings:", e);
                 showStatus('Could not reset preferences due to an error.', 'error', 4000);
            }
        }
    }

    function openSettings() {
        // Ensure form reflects the CURRENTLY ACTIVE settings state before opening
        applySettingsToForm(conversionSettings);
        settingsPanel.classList.add('visible');
        settingsPanel.setAttribute('aria-hidden', 'false');
        settingsButton.setAttribute('aria-expanded', 'true');
        // Focus management: focus the first interactive element or the close button
        closeSettingsButton.focus();
    }

    function closeSettings() {
        settingsPanel.classList.remove('visible');
        settingsPanel.setAttribute('aria-hidden', 'true');
        settingsButton.setAttribute('aria-expanded', 'false');
        settingsButton.focus(); // Return focus to the button that opened the modal
    }

    // --- Theme ---
    function getPreferredTheme() {
        let savedTheme = null;
        try {
            savedTheme = localStorage.getItem('theme');
        } catch(e) { console.error("Error reading theme from localStorage:", e); }

        if (savedTheme) return savedTheme;
        // Check OS preference using matchMedia
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        const newTheme = (theme === 'dark') ? 'dark' : 'light'; // Sanitize input
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark-mode');
            themeButton.textContent = '☀️'; // Sun icon
            themeButton.title = "Switch to Light Mode";
        } else {
            document.documentElement.classList.remove('dark-mode');
             themeButton.textContent = '🌙'; // Moon icon
             themeButton.title = "Switch to Dark Mode";
        }
        // Store the applied theme preference
        try {
            localStorage.setItem('theme', newTheme);
        } catch(e) {
            console.error("Error saving theme to localStorage:", e);
        }
        console.log(`Theme applied: ${newTheme}`);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }

// --- UI Helpers ---

function showLoader(message = 'Processing...') {
    loaderMessage.textContent = message;
    loader.classList.add('visible');
    loader.setAttribute('aria-hidden', 'false');
    // Disable key interactive elements during loading
    fileInput.disabled = true;
    dropZone.style.pointerEvents = 'none'; // Prevent drops
    dropZone.style.cursor = 'default';
    settingsButton.disabled = true;
    copyMarkdownButton.disabled = true; // Disable actions too
    downloadMarkdownButton.disabled = true;
    clearFileButton.disabled = true; // Disable clear button during processing
}

function hideLoader() {
    loader.classList.remove('visible');
    loader.setAttribute('aria-hidden', 'true');
    // Re-enable inputs, checking if content exists for action buttons
    fileInput.disabled = false;
    dropZone.style.pointerEvents = 'auto';
    dropZone.style.cursor = 'pointer';
    settingsButton.disabled = false;
    copyMarkdownButton.disabled = !currentMarkdown; // Enable only if content exists
    downloadMarkdownButton.disabled = !currentMarkdown;
    updateClearButtonState(); // Update clear button based on current state
}

let statusTimeout;
function showStatus(message, type = 'info', duration = 0) {
    clearTimeout(statusTimeout); // Clear previous timeout
    statusArea.textContent = message;
    // Explicitly set class based on type
    statusArea.className = 'status-area'; // Reset classes first
    if (['success', 'error', 'info', 'warning'].includes(type)) {
         statusArea.classList.add(type);
    }
    statusArea.style.display = 'block'; // Make visible

    // If duration is set > 0, schedule hiding
    if (duration > 0) {
        statusTimeout = setTimeout(() => {
            // Fade out effect? Optional. For now, just hide.
            statusArea.style.display = 'none';
        }, duration);
    }
}

// Modified clearOutput to optionally keep file info displayed
function clearOutput(clearFileInfo = true) {
    markdownOutput.value = '';
    htmlPreview.innerHTML = '<p><i>Preview will render here...</i></p>'; // Reset preview placeholder
    currentMarkdown = '';
    mammothOutputMarkdown = ''; // Clear raw mammoth output too
    currentHtml = '';
    
    // Properly release memory
    if (clearFileInfo) {
        fileInfo.textContent = '';
        currentFileName = '';
        sourceArrayBuffer = null; // Clear stored buffer
        updateClearButtonState(); // Update clear button state
    }

    statusArea.style.display = 'none'; // Hide status messages
    copyMarkdownButton.disabled = true; // Disable actions
    downloadMarkdownButton.disabled = true;

    // Ensure preview visibility respects setting after clearing
    togglePreviewVisibility(!conversionSettings.disablePreview);
}

// Function to check memory usage (optional, browser-dependent)
function checkMemoryUsage() {
    // Only works in environments that support performance.memory
    if (window.performance && performance.memory) {
        const memoryInfo = performance.memory;
        const usedHeapSizeMB = Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024));
        const totalHeapSizeMB = Math.round(memoryInfo.totalJSHeapSize / (1024 * 1024));
        const heapLimitMB = Math.round(memoryInfo.jsHeapSizeLimit / (1024 * 1024));
        
        console.log(`Memory usage: ${usedHeapSizeMB}MB / ${totalHeapSizeMB}MB (Limit: ${heapLimitMB}MB)`);
        
        // Show warning if approaching limit (e.g., 80% of heap limit)
        if (usedHeapSizeMB > heapLimitMB * 0.8) {
            showStatus(`Warning: High memory usage (${usedHeapSizeMB}MB). Consider clearing the file when done.`, 'warning', 5000);
        }
        
        return usedHeapSizeMB;
    }
    return null;
}

// Utility to format file sizes
function formatBytes(bytes, decimals = 2) {
    if (!+bytes || bytes === 0) return '0 Bytes'; // Check if bytes is zero or not a valid number
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']; // Added more sizes
    // Calculate the index, ensuring it's within the bounds of the sizes array
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1));
    // Format the number with specified decimals and append the correct unit
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

}); // End DOMContentLoaded