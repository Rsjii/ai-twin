// Form Dirty State Tracker
// Tracks form changes and enables/disables save buttons with visual feedback
// Works with both <form> elements and container divs

export function initDirtyForm(containerSelector, saveBtnSelector, resetBtnSelector = null) {
    const container = typeof containerSelector === 'string' 
      ? document.querySelector(containerSelector) 
      : containerSelector;
    const saveBtn = typeof saveBtnSelector === 'string'
      ? document.querySelector(saveBtnSelector)
      : saveBtnSelector;
    
    if (!container || !saveBtn) {
      console.warn('Container or save button not found:', { containerSelector, saveBtnSelector });
      return null;
    }
    
    // Snapshot initial state
    const getFormData = () => {
      const data = {};
      
      // Get all input fields (text, email, number, etc.)
      container.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input[type="date"], input[type="url"]').forEach(input => {
        const key = input.id || input.name;
        if (key) data[key] = input.value;
      });
      
      // Handle checkboxes/radios
      container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
        const key = input.id || input.name;
        if (key) data[key] = input.checked;
      });
      
      // Handle range sliders
      container.querySelectorAll('input[type="range"]').forEach(slider => {
        const key = slider.id || slider.name;
        if (key) data[key] = slider.value;
      });
      
      // Handle select dropdowns
      container.querySelectorAll('select').forEach(select => {
        const key = select.id || select.name;
        if (key) data[key] = select.value;
      });
      
      // Handle textareas
      container.querySelectorAll('textarea').forEach(textarea => {
        const key = textarea.id || textarea.name;
        if (key) data[key] = textarea.value;
      });
      
      return JSON.stringify(data);
    };
    
    let initialData = getFormData();
    
    const updateButtonState = () => {
      const currentData = getFormData();
      const isDirty = currentData !== initialData;
      
      // Update button state
      saveBtn.disabled = !isDirty;
      
      if (isDirty) {
        // Enable: Green gradient, clickable
        saveBtn.classList.remove('bg-gray-400', 'bg-gray-500', 'cursor-not-allowed', 'opacity-50');
        saveBtn.classList.add('bg-gradient-to-r', 'from-green-500', 'to-emerald-600', 'hover:from-green-600', 'hover:to-emerald-700', 'cursor-pointer', 'shadow-lg', 'hover:shadow-xl', 'transform', 'hover:scale-105');
      } else {
        // Disable: Gray, not clickable
        saveBtn.classList.remove('bg-gradient-to-r', 'from-green-500', 'to-emerald-600', 'hover:from-green-600', 'hover:to-emerald-700', 'cursor-pointer', 'shadow-lg', 'hover:shadow-xl', 'transform', 'hover:scale-105');
        saveBtn.classList.add('bg-gray-400', 'cursor-not-allowed', 'opacity-50');
      }
    };
    
    // Listen to all form changes (use event delegation on container)
    const events = ['input', 'change', 'paste'];
    events.forEach(eventType => {
      container.addEventListener(eventType, (e) => {
        // Only track if event is from an input/select/textarea
        if (e.target.matches('input, select, textarea')) {
          updateButtonState();
        }
      }, true); // Use capture phase to catch all events
    });
    
    // Reset handler
    if (resetBtnSelector) {
      const resetBtn = typeof resetBtnSelector === 'string'
        ? document.querySelector(resetBtnSelector)
        : resetBtnSelector;
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          setTimeout(() => {
            initialData = getFormData();
            updateButtonState();
          }, 100); // Wait for reset to complete
        });
      }
    }
    
    // Initial state (button should be disabled)
    updateButtonState();
    
    // Expose reset function for manual resets after save
    return {
      reset: () => {
        initialData = getFormData();
        updateButtonState();
      },
      update: updateButtonState
    };
  }