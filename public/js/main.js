/* ============================================================
   main.js — Renome site interactions
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {

  // ---- Mobile Nav ----
  var burgerBtn = document.getElementById('burgerBtn');
  var mobileNav = document.getElementById('mobileNav');
  var mobileNavClose = document.getElementById('mobileNavClose');

  function closeMobileNav() {
    if (mobileNav) mobileNav.classList.remove('open');
    if (burgerBtn) burgerBtn.classList.remove('open');
    document.body.style.overflow = '';
    var overlay = document.querySelector('.mobile-nav-overlay');
    if (overlay) overlay.remove();
  }

  function openMobileNav() {
    if (mobileNav) mobileNav.classList.add('open');
    if (burgerBtn) burgerBtn.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Create overlay behind nav
    var existingOverlay = document.querySelector('.mobile-nav-overlay');
    if (!existingOverlay) {
      var overlay = document.createElement('div');
      overlay.className = 'mobile-nav-overlay';
      overlay.addEventListener('click', closeMobileNav);
      document.body.appendChild(overlay);
      // Trigger reflow for animation
      overlay.offsetHeight;
      overlay.classList.add('open');
    }
  }

  if (burgerBtn && mobileNav) {
    burgerBtn.addEventListener('click', function () {
      if (mobileNav.classList.contains('open')) {
        closeMobileNav();
      } else {
        openMobileNav();
      }
    });
    if (mobileNavClose) {
      mobileNavClose.addEventListener('click', closeMobileNav);
    }
    mobileNav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        closeMobileNav();
      }
    });
  }

  // ---- Add to Cart buttons (menu cards, list items, preview) ----
  document.addEventListener('click', function (e) {
    var addBtn = e.target.closest('.menu-card__cart-btn, .menu-card__add-btn, .menu-list__add, .menu-preview__add');
    if (!addBtn || addBtn.disabled) return;

    e.preventDefault();
    e.stopPropagation();

    var id = parseInt(addBtn.dataset.id);
    var name = addBtn.dataset.name;
    var price = addBtn.dataset.price;
    var image = addBtn.dataset.image;
    var weight = addBtn.dataset.weight;

    Cart.addItem(id, name, price, image, weight);
    var addedMsg = (window.__t && window.__t.addedToCart) ? window.__t.addedToCart : 'added!';
    showToast(name + ' ' + addedMsg);

    // Button animation
    addBtn.style.transform = 'scale(1.2)';
    setTimeout(function () { addBtn.style.transform = ''; }, 200);
  });

  // ---- Toast ----
  var toastTimer;
  function showToast(text) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    var toastText = document.getElementById('toastText');
    if (toastText) { toastText.textContent = text; } else { toast.textContent = text; }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2500);
  }
  window.showToast = showToast;

  // ---- Category Tabs (menu page) ----
  var tabs = document.querySelectorAll('.category-tab');
  if (tabs.length > 0) {
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        var target = tab.dataset.target;
        if (!target) return;

        if (target === 'all') {
          e.preventDefault();
          // Show all categories
          document.querySelectorAll('.menu-category').forEach(function (cat) {
            cat.style.display = '';
          });
        } else {
          // Let hash navigation happen, but also filter
          document.querySelectorAll('.menu-category').forEach(function (cat) {
            cat.style.display = cat.dataset.category === target ? '' : 'none';
          });
        }

        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
      });
    });
  }

  // ---- Header scroll effect ----
  var header = document.getElementById('siteHeader');
  if (header) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 30) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // ---- Smooth scroll for hash links ----
  document.querySelectorAll('a[href^="/#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (window.location.pathname !== '/') return;
      var hash = link.getAttribute('href').replace('/', '');
      var target = document.querySelector(hash);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
