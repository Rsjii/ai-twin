/**
 * Reusable Pagination Class
 * Provides consistent pagination UI and behavior across the application
 */
class Pagination {
  constructor(options = {}) {
    this.currentPage = options.currentPage || 1;
    this.totalPages = options.totalPages || 1;
    this.totalItems = options.totalItems || 0;
    this.itemsPerPage = options.itemsPerPage || 5;
    this.onPageChange = options.onPageChange || (() => {});
    this.container = options.container || null;
    this.maxVisiblePages = options.maxVisiblePages || 7;
    this.showInfo = options.showInfo !== false; // Show "Showing X-Y of Z" by default
    this.className = options.className || ''; // Additional CSS classes
    this.prevText = options.prevText || 'Previous';
    this.nextText = options.nextText || 'Next';
    this.firstText = options.firstText || 'First';
    this.lastText = options.lastText || 'Last';
    this.showFirstLast = options.showFirstLast !== false; // Show First/Last buttons by default
  }

  /**
   * Render pagination HTML
   */
  render() {
    if (!this.container) {
      console.error('Pagination container not specified');
      return '';
    }

    const html = this.generateHTML();
    this.container.innerHTML = html;
    this.attachEventListeners();
    return html;
  }

  /**
   * Generate pagination HTML
   */
  generateHTML() {
    let html = '<div class="flex flex-col sm:flex-row items-center justify-between gap-4 ' + this.className + '">';
    
    // Info text (left side)
    if (this.showInfo) {
      html += '<div class="text-sm text-gray-600 dark:text-gray-400">' + this.generateInfoHTML() + '</div>'; 
    }

    //will show 1 button if commented
    /*if (this.totalPages <= 1) {
      html+='</div>';
      return html;
    }*/
    
    // Pagination controls (right side)
    html += '<div class="flex items-center space-x-2">';
    
    // First button
    if (this.showFirstLast && this.currentPage > 1) {
      html += this.generateButton(1, this.firstText, 'first', false);
    }

    // Previous button
    if (this.currentPage > 1) {
      html += this.generateButton(this.currentPage - 1, this.prevText, 'prev', false);
    }

    // Page numbers
    html += this.generatePageNumbers();

    // Next button
    if (this.currentPage < this.totalPages) {
      html += this.generateButton(this.currentPage + 1, this.nextText, 'next', false);
    }

    // Last button
    if (this.showFirstLast && this.currentPage < this.totalPages) {
      html += this.generateButton(this.totalPages, this.lastText, 'last', false);
    }

    html += '</div></div>';
    return html;
  }

  /**
   * Generate page number buttons with ellipsis
   */
  generatePageNumbers() {
    let html = '';
    const pages = this.calculateVisiblePages();

    pages.forEach((page, index) => {
      if (page === 'ellipsis') {
        html += '<span class="px-2 text-gray-500 dark:text-gray-400">...</span>';
      } else {
        const isActive = page === this.currentPage;
        html += this.generateButton(page, page.toString(), `page-${page}`, isActive);
      }
    });

    return html;
  }

  /**
   * Calculate which page numbers to show
   */
  calculateVisiblePages() {
    const pages = [];
    const halfVisible = Math.floor(this.maxVisiblePages / 2);

    let startPage = Math.max(1, this.currentPage - halfVisible);
    let endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);

    // Adjust start if we're near the end
    if (endPage - startPage < this.maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
    }

    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push('ellipsis');
      }
    }

    // Add visible pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // Add ellipsis and last page if needed
    if (endPage < this.totalPages) {
      if (endPage < this.totalPages - 1) {
        pages.push('ellipsis');
      }
      pages.push(this.totalPages);
    }

    return pages;
  }

  /**
   * Generate button HTML
   */
  generateButton(page, text, className, isActive) {
    const baseClasses = 'px-4 py-2 rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';
    const activeClasses = 'bg-gradient-to-r from-primary to-accent text-white shadow-lg';
    const inactiveClasses = 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
    const disabledClasses = 'opacity-50 cursor-not-allowed';

    const classes = isActive 
      ? `${baseClasses} ${activeClasses}` 
      : `${baseClasses} ${inactiveClasses}`;

    return `<button 
      data-page="${page}" 
      class="${classes} ${className}"
      ${isActive ? 'aria-current="page"' : ''}
      aria-label="Go to page ${page}"
    >${text}</button>`;
  }

  /**
   * Generate info HTML (Showing X-Y of Z)
   */
  generateInfoHTML() {
    const start = ((this.currentPage - 1) * this.itemsPerPage) + 1;
    const end = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
    return `Showing ${start}-${end} of ${this.totalItems}`;
  }

  /**
   * Attach event listeners to pagination buttons
   */
  attachEventListeners() {
    if (!this.container) return;

    const buttons = this.container.querySelectorAll('[data-page]');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const page = parseInt(button.getAttribute('data-page'));
        if (page && page !== this.currentPage && page >= 1 && page <= this.totalPages) {
          this.goToPage(page);
        }
      });
    });
  }

  /**
   * Navigate to a specific page
   */
  goToPage(page) {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }

    this.currentPage = page;
    this.render();
    this.onPageChange(page);
  }

  /**
   * Update pagination data
   */
  update(options) {
    if (options.currentPage !== undefined) this.currentPage = options.currentPage;
    if (options.totalPages !== undefined) this.totalPages = options.totalPages;
    if (options.totalItems !== undefined) this.totalItems = options.totalItems;
    if (options.itemsPerPage !== undefined) this.itemsPerPage = options.itemsPerPage;
    this.render();
  }

  /**
   * Destroy pagination instance
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pagination;
} else {
  window.Pagination = Pagination;
}
