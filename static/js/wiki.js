document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.wiki-folder-toggle').forEach(function (btn) {
    var target = document.getElementById(btn.getAttribute('aria-controls'));
    if (!target) return;

    btn.addEventListener('click', function () {
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      target.classList.toggle('open', !isOpen);
    });
  });
});
